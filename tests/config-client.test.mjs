import assert from "node:assert/strict";
import test from "node:test";
import { createConfigClient } from "../src/client/personalization/config-client.js";

/** Minimal Response stand-in (Node 22 has Response, but keep it explicit). */
function jsonResponse(status, value) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return value; },
    async arrayBuffer() { return new ArrayBuffer(0); },
  };
}

function snapshotBody(overrides = {}) {
  return jsonResponse(200, {
    configVersion: 1,
    revision: 7,
    mode: "normal",
    skins: {},
    library: [],
    references: {},
    quota: { count: 0, totalBytes: 0 },
    ...overrides,
  });
}

function makeFetch(handler) {
  const calls = [];
  const impl = (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(calls.length, String(url), init);
  };
  impl.calls = calls;
  return impl;
}

function flushingClient(fetchImpl) {
  // Explicit-save model: no debounce timer exists; save === flushNow().
  return createConfigClient({ fetchImpl, timeoutMs: 50 });
}

test("boot transitions loading → synced and exposes the snapshot", async () => {
  const fetchImpl = makeFetch(() => snapshotBody({ skins: { tgcf: { blur: 5 } } }));
  const client = flushingClient(fetchImpl);
  assert.equal(client.getState().status, "loading");
  await client.boot();
  assert.equal(client.getState().status, "synced");
  assert.equal(client.getState().revision, 7);
  assert.deepEqual(client.getState().skins.tgcf, { blur: 5 });
  assert.equal(client.writeBlocked(), null);
  client.dispose();
});

test("a same-status refetch still notifies subscribers (field report: stale library grid)", async () => {
  const libraries = [
    [{ id: "u_a", displayName: "a.png", extension: "png" }],
    [
      { id: "u_a", displayName: "a.png", extension: "png" },
      { id: "u_b", displayName: "b.png", extension: "png" },
    ],
  ];
  const fetchImpl = makeFetch((n) => snapshotBody({ revision: 6 + n, library: libraries[n - 1] }));
  const client = flushingClient(fetchImpl);
  const seen = [];
  client.onStateChange((state) => seen.push({ revision: state.revision, count: state.library.length }));
  await client.boot();
  assert.deepEqual(seen.at(-1), { revision: 7, count: 1 }, "boot lands the first snapshot");
  const emissionsAfterBoot = seen.length;
  await client.refetch();
  assert.equal(client.getState().status, "synced", "precondition: the status never changed");
  assert.equal(seen.length, emissionsAfterBoot + 1, "exactly one notification for the same-status swap");
  assert.deepEqual(seen.at(-1), { revision: 8, count: 2 });
  client.dispose();
});

test("deleteImage: subscribers see the shrunken library after a successful DELETE", async () => {
  const remaining = [{ id: "u_a", displayName: "a.png", extension: "png" }];
  const deleted = { id: "u_b", displayName: "b.png", extension: "png" };
  const fetchImpl = makeFetch((n, url) => {
    if (n === 1) return snapshotBody({ library: [remaining[0], deleted] });
    if (url.includes("/library/u_b")) return jsonResponse(200, { affectedSkins: [], revision: 8 });
    return snapshotBody({ revision: 8, library: remaining });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const seen = [];
  client.onStateChange((state) => seen.push(state.library.map((a) => a.id)));
  const result = await client.deleteImage("u_b");
  assert.equal(result.error, undefined, "DELETE succeeded");
  assert.deepEqual(client.getState().library.map((a) => a.id), ["u_a"], "snapshot lost the asset");
  assert.ok(seen.some((ids) => !ids.includes("u_b")), "subscribers were told — the grid must follow");
  client.dispose();
});

test("failed boot lands in offline-failed and writes are gated", async () => {
  const fetchImpl = makeFetch(() => { throw new Error("network down"); });
  const client = flushingClient(fetchImpl);
  await client.boot();
  assert.equal(client.getState().status, "offline-failed");
  assert.equal(client.writeBlocked(), "offline");
  client.preview("tgcf", "panelOpacity",3);
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 0, blocked: "offline" });
  assert.equal(fetchImpl.calls.length, 1, "no PATCH was attempted while offline");
  client.dispose();
});

test("unsupported configVersion becomes read-only", async () => {
  const fetchImpl = makeFetch(() => snapshotBody({ mode: "unsupported" }));
  const client = flushingClient(fetchImpl);
  await client.boot();
  assert.equal(client.getState().status, "unsupported-readonly");
  assert.equal(client.writeBlocked(), "unsupported");
  client.dispose();
});

test("clicking the factory-default value on a pristine skin is a no-op (v1.0.0 ruling)", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") return jsonResponse(200, { revision: 8 });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  // tgcf wallpaper factory default is builtin:tgcf:moonlit
  client.preview("tgcf", "wallpaper", "builtin:tgcf:moonlit");
  assert.deepEqual(client.effectiveOverrides("tgcf"), {}, "no override armed by a default click");
  assert.equal(client.getState().dirtyCount, 0, "nothing marked dirty");
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 0 });
  assert.equal(fetchImpl.calls.filter((c) => c.init.method === "PATCH").length, 0, "no PATCH issued");
  client.dispose();
});

test("on a modified field, clicking the default value arms a delete op (v1.0.0 ruling)", async () => {
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      return jsonResponse(200, { revision: 8 });
    }
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "wallpaper", "builtin:tgcf:crimson"); // real override
  client.preview("tgcf", "wallpaper", "builtin:tgcf:moonlit"); // back to factory → delete
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 1 });
  assert.deepEqual(patches[0].operations, [{ op: "delete", skinId: "tgcf", key: "wallpaper" }]);
  client.dispose();
});

test("a locale value equal to the factory default arms a delete op too (v1.0.0 ruling, structural)", async () => {
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      return jsonResponse(200, { revision: 8 });
    }
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  // tgcf factory slogan is 百无禁忌 / No Taboos. A freshly built {zh, en}
  // object can never be reference-equal to the catalog default — the
  // default-equal check must be structural, or this arms a set op and the
  // store keeps a default-equal "override" forever.
  client.preview("tgcf", "slogan", { zh: "实验标语", en: "Custom slogan" }); // real override
  client.preview("tgcf", "slogan", { zh: "百无禁忌", en: "No Taboos" }); // back to factory → delete
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 1 });
  assert.deepEqual(patches[0].operations, [{ op: "delete", skinId: "tgcf", key: "slogan" }]);
  client.dispose();
});

test("re-clicking the effective value is idempotent and does not re-arm a flush", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") return jsonResponse(200, { revision: 8 });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "wallpaper", "builtin:tgcf:crimson");
  client.preview("tgcf", "wallpaper", "builtin:tgcf:crimson");
  assert.equal(client.getState().dirtyCount, 1, "one preview entry");
  client.dispose();
});

test("previews gate writes until flushed; effective overrides layer previews over the snapshot", async () => {
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      return jsonResponse(200, { revision: 8 });
    }
    return snapshotBody({ skins: { tgcf: { blur: 5, panelOpacity: 70 } } });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",9);
  assert.equal(client.getState().dirtyCount, 1);
  // Preview layers over the synced snapshot without touching it.
  assert.deepEqual(client.effectiveOverrides("tgcf"), { blur: 5, panelOpacity: 9 });
  // Pending gate: status is synced so writes are allowed — flush explicitly.
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 1 });
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0].operations, [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 9 }]);
  client.dispose();
});

test("a preview edited again mid-flight survives the flush of the older value", async () => {
  let releasePatch;
  const gate = new Promise((resolve) => { releasePatch = resolve; });
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      if (patches.length === 1) return gate.then(() => jsonResponse(200, { revision: 8 }));
      return jsonResponse(200, { revision: 9 });
    }
    return snapshotBody({ revision: patches.length === 0 ? 7 : 8 });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",5);
  const flushing = client.flushNow();
  // The user keeps dragging the slider while the first value is in flight.
  client.preview("tgcf", "panelOpacity",12);
  releasePatch();
  await flushing;
  assert.equal(client.getState().dirtyCount, 1, "newer preview survives");
  assert.deepEqual(client.effectiveOverrides("tgcf"), { panelOpacity: 12 });
  await client.flushNow();
  assert.deepEqual(patches[1].operations, [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 12 }]);
  client.dispose();
});

test("previewReset schedules a delete op; failed writes keep previews dirty for retry", async () => {
  let fail = false;
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      if (fail) return jsonResponse(500, { error: "boom" });
      return jsonResponse(200, { revision: 8 });
    }
    return snapshotBody({ skins: { tgcf: { panelOpacity: 70 } } });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.previewReset("tgcf", "panelOpacity");
  fail = true;
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "error", errorMessage: "boom" });
  assert.equal(client.getState().dirtyCount, 1, "preview kept dirty after failure");
  assert.deepEqual(client.effectiveOverrides("tgcf"), {}, "reset preview removes the override");

  fail = false;
  assert.deepEqual(await client.flushNow(), { flushed: 1 });
  assert.deepEqual(patches[0].operations, [{ op: "delete", skinId: "tgcf", key: "panelOpacity" }]);
  client.dispose();
});

test("late responses after dispose are dropped", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = makeFetch(() => gate.then(() => snapshotBody()));
  const client = flushingClient(fetchImpl);
  const booting = client.boot();
  client.dispose();
  release();
  await booting;
  assert.equal(client.getState().status, "loading");
});

test("409 STORE_READONLY downgrades the client to read-only WITHOUT a refetch", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") return jsonResponse(409, { code: "STORE_READONLY", error: "readonly" });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const callsAfterBoot = fetchImpl.calls.length;
  client.preview("tgcf", "panelOpacity",3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "conflict", errorMessage: "readonly" });
  assert.equal(client.getState().status, "unsupported-readonly");
  assert.equal(client.getState().dirtyCount, 1, "dirty state retained for the UI");
  assert.equal(fetchImpl.calls.length, callsAfterBoot + 1, "readonly downgrade performs no extra GET");
  client.dispose();
});

test("409 revision conflict auto-refetches and retries once (ADR-0003)", async () => {
  const patches = [];
  let revision = 7;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(JSON.parse(init.body));
      if (patches.length === 1) return jsonResponse(409, { code: "REVISION_CONFLICT", error: "stale" });
      return jsonResponse(200, { revision: 9 });
    }
    // Every GET after the conflict reports the moved-forward revision.
    if (fetchImpl.calls.filter((call) => call.init.method !== "PATCH").length > 1) revision = 8;
    return snapshotBody({ revision });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",3);
  const result = await client.flushNow();
  assert.deepEqual(result, { flushed: 1 }, "the conflict auto-retry lands the preview");
  assert.equal(patches.length, 2, "exactly one automatic retry — no user action");
  assert.equal(patches[0].baseRevision, 7, "first attempt rode the stale revision");
  assert.equal(patches[1].baseRevision, 8, "retry rides the fresh baseRevision");
  assert.equal(client.getState().dirtyCount, 0);
  client.dispose();
});

test("exhausted revision-conflict retry surfaces a machine-readable failure until the next edit", async () => {
  let revision = 7;
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "REVISION_CONFLICT", error: "stale" });
    }
    if (patchCount > 0) revision = 8;
    return snapshotBody({ revision });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "conflict" });
  assert.equal(patchCount, 2);
  assert.equal(client.getState().lastFlushCode, "REVISION_CONFLICT");
  assert.equal(client.getState().lastFlushError, null);
  assert.equal(client.getState().dirtyCount, 1);
  client.preview("tgcf", "panelOpacity", 4);
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, null);
  client.dispose();
});

test("STORE_RECOVERY_REQUIRED refetches recovery state without retrying PATCH", async () => {
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "STORE_RECOVERY_REQUIRED", error: "recover" });
    }
    if (patchCount > 0) return snapshotBody({ mode: "recovery", revision: 8, recovery: { configLost: true } });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "recovery" });
  assert.equal(patchCount, 1);
  assert.equal(client.getState().mode, "recovery");
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, null);
  client.dispose();
});

test("STORE_RECOVERY_REQUIRED surfaces its error when recovery refetch fails", async () => {
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "STORE_RECOVERY_REQUIRED", error: "recover first" });
    }
    return patchCount === 0 ? snapshotBody() : jsonResponse(500, { error: "offline" });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), {
    flushed: 0,
    blocked: "error",
    errorMessage: "recover first",
  });
  assert.equal(patchCount, 1);
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, "recover first");
  client.dispose();
});

test("unknown 409 codes fail loudly without retry", async () => {
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "SOMETHING_ELSE", error: "boom" });
    }
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "error", errorMessage: "boom" });
  assert.equal(patchCount, 1);
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, "boom");
  client.dispose();
});

test("queued flush failures overwrite conflict state without breaking failure-field exclusivity", async () => {
  let releaseFirstPatch;
  const firstPatchGate = new Promise((resolve) => { releaseFirstPatch = resolve; });
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      if (patchCount === 1) return firstPatchGate.then(() => jsonResponse(409, { code: "REVISION_CONFLICT" }));
      if (patchCount === 2) return jsonResponse(409, { code: "REVISION_CONFLICT" });
      return jsonResponse(500, { error: "HTTP 500" });
    }
    return snapshotBody({ revision: patchCount === 0 ? 7 : 8 });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  const firstFlush = client.flushNow();
  await Promise.resolve();
  client.preview("tgcf", "panelOpacity", 4);
  const secondFlush = client.flushNow();
  releaseFirstPatch();
  assert.deepEqual(await firstFlush, { flushed: 0, blocked: "conflict" });
  assert.deepEqual(await secondFlush, { flushed: 0, blocked: "error", errorMessage: "HTTP 500" });
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, "HTTP 500");
  client.dispose();
});

test("revision-conflict refetch failure does not send a blind retry", async () => {
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "REVISION_CONFLICT", error: "stale" });
    }
    return patchCount === 0 ? snapshotBody() : jsonResponse(500, { error: "offline" });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "offline" });
  assert.equal(patchCount, 1);
  assert.equal(client.getState().status, "offline-failed");
  assert.equal(client.getState().dirtyCount, 1);
  assert.equal(client.getState().lastFlushCode, null);
  assert.equal(client.getState().lastFlushError, null);
  client.dispose();
});

test("revision-conflict refetch with the same revision does not retry", async () => {
  let patchCount = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patchCount += 1;
      return jsonResponse(409, { code: "REVISION_CONFLICT", error: "stale" });
    }
    return snapshotBody({ revision: 7 });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity", 3);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "conflict" });
  assert.equal(patchCount, 1);
  assert.equal(client.getState().dirtyCount, 1);
  assert.equal(client.getState().lastFlushCode, "REVISION_CONFLICT");
  assert.equal(client.getState().lastFlushError, null);
  client.dispose();
});

test("auto-save: the debounce window merges into ONE PATCH (ADR-0003)", async () => {
  const fetchImpl = makeFetch(() => snapshotBody());
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",3);
  client.preview("tgcf", "wallpaper", "builtin:tgcf:pale");
  client.previewReset("tgcf", "slogan");
  assert.equal(client.getState().dirtyCount, 3);
  await new Promise((resolve) => setTimeout(resolve, 520)); // > 400ms debounce
  const patchCalls = fetchImpl.calls.filter((c) => c.init.method === "PATCH");
  assert.equal(patchCalls.length, 1, "the whole quiet window merges into one PATCH");
  const patchBody = JSON.parse(patchCalls[0].init.body);
  assert.deepEqual(patchBody.operations.map((o) => o.key), ["panelOpacity", "wallpaper", "slogan"]);
  assert.equal(client.getState().dirtyCount, 0, "auto-save cleared the preview layer");
  client.dispose();
});

test("lastFlushError: a failed auto-save surfaces, the next edit clears it (ADR-0003)", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") return jsonResponse(400, { error: "tgcf.panelOpacity 校验失败（BAD_VALUE）" });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",9);
  await new Promise((resolve) => setTimeout(resolve, 520));
  assert.equal(client.getState().lastFlushError, "tgcf.panelOpacity 校验失败（BAD_VALUE）", "failure surfaced for the panel strip");
  client.preview("tgcf", "panelOpacity",10); // a fresh edit always clears the strip
  assert.equal(client.getState().lastFlushError, null);
  client.dispose();
});

test("restore is gone from the client API (ADR-0003)", () => {
  const client = flushingClient(makeFetch(() => snapshotBody()));
  assert.equal("restore" in client, false, "no revert concept in the auto-save model");
  client.dispose();
});

test("theme package methods no longer exist on the client", () => {
  const client = flushingClient(makeFetch(() => snapshotBody()));
  assert.equal(typeof client.exportTheme, "undefined");
  assert.equal(typeof client.prepareThemeImport, "undefined");
  assert.equal(typeof client.commitThemeImport, "undefined");
  client.dispose();
});

test("recovery snapshots surface mode and recovery metadata while staying synced", async () => {
  const fetchImpl = makeFetch(() => snapshotBody({
    mode: "recovery",
    skins: {},
    library: [],
    recovery: { configLost: true, quarantine: ["stray.png"], candidateLibrary: {} },
  }));
  const client = flushingClient(fetchImpl);
  await client.boot();
  const state = client.getState();
  assert.equal(state.status, "synced");
  assert.equal(state.mode, "recovery");
  assert.equal(state.recovery.configLost, true);
  client.dispose();
});

test("a stale GET response cannot roll back a newer snapshot", async () => {
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  let requestIndex = 0;
  const fetchImpl = makeFetch(() => {
    requestIndex += 1;
    if (requestIndex === 1) return gate.then(() => snapshotBody({ revision: 1 }));
    return snapshotBody({ revision: 2 });
  });
  const client = flushingClient(fetchImpl);
  const first = client.boot();       // will resolve LATE with revision 1
  await client.refetch();            // resolves first with revision 2
  assert.equal(client.getState().revision, 2);
  releaseFirst();
  await first;                       // stale response arrives now — dropped
  assert.equal(client.getState().revision, 2, "stale snapshot must not win");
  client.dispose();
});

test("a context switch (skin change) drops the in-flight snapshot", async () => {
  let active = "openbmc";
  const fetchImpl = makeFetch(() => snapshotBody({ revision: 9 }));
  const contextClient = createConfigClient({
    fetchImpl,
    timeoutMs: 50,
    contextActive: () => active,
  });
  const booting = contextClient.boot();
  active = "tgcf"; // user switched skins while the fetch was in flight
  await booting;
  assert.equal(contextClient.getState().revision, 0, "response after a context switch is dropped");
  await contextClient.refetch(); // stable context applies
  assert.equal(contextClient.getState().revision, 9);
  contextClient.dispose();
});

test("HTTP 500 responses land in offline-failed, never synced", async () => {
  const fetchImpl = makeFetch(() => jsonResponse(500, { error: "boom" }));
  const client = flushingClient(fetchImpl);
  await client.boot();
  assert.equal(client.getState().status, "offline-failed");
  assert.equal(client.writeBlocked(), "offline");
  client.dispose();
});

test("a non-ok PATCH carries the server error message to the caller (field report)", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") return jsonResponse(400, { error: "tgcf.blur 校验失败（UNKNOWN_FIELD）", code: "INVALID_CONFIG" });
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "blur", 0); // a RETIRED field key — the server, not the client, rejects it
  const result = await client.flushNow();
  assert.equal(result.blocked, "error");
  assert.equal(result.errorMessage, "tgcf.blur 校验失败（UNKNOWN_FIELD）");
  assert.equal(client.getState().dirtyCount, 1, "previews stay dirty for retry");
  client.dispose();
});

test("a rejected PATCH never poisons the write chain — the next flush retries", async () => {
  let failNetwork = true;
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(init.body);
      if (failNetwork) return Promise.reject(new Error("network down"));
      return jsonResponse(200, { revision: 8 });
    }
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",4);
  assert.deepEqual(await client.flushNow(), { flushed: 0, blocked: "error" });
  client.preview("tgcf", "panelOpacity",6);
  failNetwork = false;
  assert.deepEqual(await client.flushNow(), { flushed: 1 });
  assert.equal(patches.length, 2, "the retry actually reached the wire");
  client.dispose();
});

test("queued writes are skipped after dispose (no post-dispose PATCH)", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const patches = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method === "PATCH") {
      patches.push(init.body);
      return gate.then(() => jsonResponse(200, { revision: 8 }));
    }
    return snapshotBody();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  client.preview("tgcf", "panelOpacity",4);
  const flushing = client.flushNow();
  client.dispose(); // the queued task must observe this before sending
  release();
  await flushing;
  assert.equal(patches.length, 0, "disposed client must not send writes");
});

// -- uploadImage timeouts (field report: "稍微大一点的图片就上传不上来") -----
// The config-fetch window (3s in production) must never govern POST /library:
// a multi-MB body over a WAN upstream needs the extended upload window, and a
// rejected fetch must land in the panel as a mapped error, not an unhandled
// rejection. These fakes RESPECT init.signal like a real fetch would.

/** Fake fetch that aborts like a real one: honors init.signal, never resolves otherwise. */
function hangingUploadFetch() {
  return makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted.", init.signal?.reason?.name ?? "AbortError"));
      if (init.signal?.aborted) return abort();
      init.signal?.addEventListener("abort", abort, { once: true });
    });
  });
}

test("uploadImage uses the extended upload window, not the config-fetch timeout", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("aborted", "TimeoutError"));
      if (init.signal?.aborted) return abort();
      init.signal?.addEventListener("abort", abort, { once: true });
      setTimeout(() => resolve(jsonResponse(201, { asset: { id: "u_slow" } })), 150);
    });
  });
  // 150ms response: past the 50ms config window, inside the 500ms upload window.
  const client = createConfigClient({ fetchImpl, timeoutMs: 50, uploadTimeoutMs: 500 });
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.equal(result.error, undefined, "the short fetch window must not abort the upload");
  assert.equal(result.asset.id, "u_slow");
  client.dispose();
});

test("a timed-out upload resolves to UPLOAD_TIMEOUT instead of throwing", async () => {
  const fetchImpl = hangingUploadFetch();
  const client = createConfigClient({ fetchImpl, timeoutMs: 50, uploadTimeoutMs: 100 });
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.deepEqual(result, { error: "UPLOAD_TIMEOUT" });
  assert.equal(client.getState().status, "synced", "a failed upload never degrades the session state");
  client.dispose();
});

test("a network-rejected upload resolves to UPLOAD_FAILED instead of throwing", async () => {
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    return Promise.reject(new TypeError("fetch failed"));
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.deepEqual(result, { error: "UPLOAD_FAILED" });
  client.dispose();
});

test("an edge-proxy HTML 413 normalizes to UPLOAD_TOO_LARGE (named cause, not generic)", async () => {
  // nginx client_max_body_size rejects with an HTML body — response.json()
  // throws, so there is no Host code; the status alone must still map to
  // the size-limit copy (field report: a >25MB batch outlier showed the
  // generic upload-failed copy).
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    return {
      status: 413,
      ok: false,
      async json() { throw new SyntaxError("Unexpected token '<'"); },
    };
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.deepEqual(result, { error: "UPLOAD_TOO_LARGE" });
  client.dispose();
});

// -- connection-level upload failures retry once (field report: 010南宫婉) ---
// The harness webserver answers a broken request stream (stale keep-alive
// socket between the proxy chain and node) with a bare empty 400 — no code,
// no log line. Two of 12 sequential batch uploads died this way while their
// siblings succeeded. The client must treat a rejected fetch and a bare 400
// alike: reconcile the library (dedupe) and re-POST exactly once.

/** A bare empty 400 exactly like dsh-host-webserver's stream-error reply. */
function bare400() {
  return { status: 400, ok: false, async json() { throw new SyntaxError("Unexpected end of JSON input"); } };
}

test("a bare 400 (stream-error reply) retries once and lands the upload", async () => {
  const posts = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    posts.push(index);
    return posts.length === 1 ? bare400() : jsonResponse(201, { asset: { id: "u_retried" } });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.equal(result.asset.id, "u_retried", "the retry lands the upload");
  assert.equal(posts.length, 2, "exactly one re-POST after the connection-level failure");
  client.dispose();
});

test("a bare 400 on both attempts resolves to UPLOAD_FAILED with exactly two POSTs", async () => {
  const posts = [];
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    posts.push(index);
    return bare400();
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.deepEqual(result, { error: "UPLOAD_FAILED" });
  assert.equal(posts.length, 2, "no third attempt");
  client.dispose();
});

test("a lost response after a landed upload reconciles by sha256 instead of re-POSTing", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const digestHex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const stored = { id: "u_already", displayName: "wallpaper", byteLength: 8, sha256: digestHex };
  let posts = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") {
      // boot sees an empty library; the post-failure refetch sees the landed asset.
      return snapshotBody({ library: index >= 2 ? [stored] : [] });
    }
    posts += 1;
    return Promise.reject(new TypeError("fetch failed")); // response lost mid-flight
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(bytes);
  assert.equal(result.asset.id, "u_already", "the stored asset is returned, not duplicated");
  assert.equal(posts, 1, "the retry never re-POSTs when the first attempt already landed");
  client.dispose();
});

test("a Host-coded 400 is a concluded answer and never retried", async () => {
  let posts = 0;
  const fetchImpl = makeFetch((index, url, init) => {
    if (init.method !== "POST") return snapshotBody();
    posts += 1;
    return jsonResponse(400, { error: "文件展示名无效", code: "FILENAME_INVALID" });
  });
  const client = flushingClient(fetchImpl);
  await client.boot();
  const result = await client.uploadImage(new Uint8Array(8));
  assert.deepEqual(result, { error: "FILENAME_INVALID" });
  assert.equal(posts, 1, "coded errors reached the store logic — retrying cannot help");
  client.dispose();
});
