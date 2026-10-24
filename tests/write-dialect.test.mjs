/**
 * Cross-seam write-dialect integration (ADR-0015 acceptance ①②⑤): the REAL
 * store, the REAL mounted routes and the REAL config client, wired together
 * by a fetch bridge. This is the coverage the mock-per-side suites cannot
 * give — the delete → conflict → retry → dangling-excision chain only exists
 * when both halves of the seam run the same protocol.
 *
 *   acceptance ②  dangling preview: another tab deletes the asset under a
 *                 dirty preview; the flush hits 409 → refetch → retry → 400
 *                 MISSING_ASSET → named excision; the next edit saves clean.
 *   acceptance ①  client half: an external revision bump forces the delete
 *                 through 409 → refetch → one retry → success.
 *   acceptance ⑤  riders: upload merges locally (no GET between POST and the
 *                 next op) and the upload-armed preview flushes at once; the
 *                 flush success resync (GET /config) is preserved behavior.
 *   recovery pin   ADR-0018: recovery mode crosses the seam as a snapshot
 *                 that KEEPS the rebuilt library, and the client's write gate
 *                 holds locally (zero PATCH). The mid-race named dispatch
 *                 (409 STORE_RECOVERY_REQUIRED on the wire) is pinned at the
 *                 unit seam (config-client.test.mjs): a single store instance
 *                 cannot flip mid-flight without a host restart — the
 *                 production race IS a restarted host against a stale tab.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersonalizationStore } from "../src/host/personalization/store.js";
import { mountPersonalizationRoutes } from "../src/host/personalization-routes.js";
import { createConfigClient } from "../src/client/personalization/config-client.js";

const TRUSTED = {
  host: "127.0.0.1:3080",
  "sec-fetch-site": "same-origin",
  origin: "http://127.0.0.1:3080",
};

function pngBytes(width = 10, height = 10) {
  const header = Buffer.alloc(24);
  header.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

const pngFile = () => ({
  type: "image/png",
  name: "w.png",
  arrayBuffer: async () => pngBytes().buffer.slice(0),
});

function makeResponse() {
  const state = { status: 0, headers: {}, body: Buffer.alloc(0), ended: false };
  return {
    state,
    writeHead(status, headers = {}) {
      state.status = status;
      state.headers = headers;
      return this;
    },
    end(chunk) {
      if (chunk !== undefined) state.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      state.ended = true;
      return this;
    },
  };
}

function makeHarness() {
  const dir = mkdtempSync(join(tmpdir(), "dsh-skins-xseam-"));
  const store = createPersonalizationStore({ dataDir: dir });
  const routes = [];
  const host = { webServer: { register(route) { routes.push(route); return () => {}; } } };
  mountPersonalizationRoutes(host, { store, trustedHosts: [] });
  const resolveRoute = (url) => {
    const path = String(url).split("?")[0];
    return routes.find((r) => r.kind === "exact" && r.path === path)
      ?? routes.find((r) => r.kind === "prefix" && path.startsWith(r.path));
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${String(url).split("?")[0]}`);
    const request = {
      method: init.method ?? "GET",
      url: String(url),
      headers: { ...TRUSTED, ...(init.headers ?? {}) },
      body: init.body ?? null,
      async *[Symbol.asyncIterator]() {
        if (this.body !== null) {
          yield Buffer.isBuffer(this.body) ? this.body : Buffer.from(this.body);
        }
      },
    };
    const response = makeResponse();
    await resolveRoute(url).handler(request, response);
    return {
      status: response.state.status,
      ok: response.state.status >= 200 && response.state.status < 300,
      async json() { return JSON.parse(response.state.body.toString("utf8")); },
    };
  };
  /** Another "tab": raw route access that bypasses the client entirely. */
  const direct = async ({ method, url, body }) => {
    const request = {
      method,
      url,
      headers: { ...TRUSTED, ...(method === "PATCH" ? { "content-type": "application/json" } : {}) },
      body: body ?? null,
      async *[Symbol.asyncIterator]() {
        if (this.body !== null) {
          yield Buffer.isBuffer(this.body) ? this.body : Buffer.from(JSON.stringify(this.body));
        }
      },
    };
    const response = makeResponse();
    await resolveRoute(url).handler(request, response);
    return response.state;
  };
  const makeClient = () => createConfigClient({ fetchImpl, timeoutMs: 50 });
  return { store, fetchImpl, calls, direct, makeClient, dir };
}

test("acceptance ②: dangling preview self-heals end to end (409 → refetch → retry → named excision)", async () => {
  const h = makeHarness();
  const client = h.makeClient();
  await client.boot();

  const upload = await client.uploadImage(pngFile());
  assert.equal(upload.error, undefined);
  client.preview("openbmc", "wallpaper", upload.asset.id);

  // Another tab deletes the asset while the preview is still dirty — the
  // client cannot know (its snapshot merged the upload locally).
  const removed = await h.direct({
    method: "PATCH",
    url: "/dsh-skins/config",
    body: { baseRevision: h.store.snapshot().revision, operations: [{ op: "deleteAsset", assetId: upload.asset.id }] },
  });
  assert.equal(removed.status, 200);

  const flushed = await client.flushNow();
  assert.deepEqual(flushed, { flushed: 0, blocked: null, selfHealed: true },
    "dangling-only: self-healed, not blocked");
  const state = client.getState();
  assert.deepEqual((state.notices.find((n) => n.kind === "reverted")?.fields ?? []), [{ skinId: "openbmc", key: "wallpaper" }],
    "the poison is named, not silenced");
  assert.equal(state.notices.some((n) => n.kind === "error"), false, "dangling-only: no generic failure strip");
  assert.equal(state.dirtyCount, 0, "the doomed preview is gone");
  assert.equal(h.store.snapshot().skins.openbmc, undefined, "nothing was persisted for it");

  // The next, unrelated edit saves clean — the dead-end is healed.
  client.preview("meirenzhi", "slogan", { zh: "甲", en: "A" });
  const healed = await client.flushNow();
  assert.equal(healed.flushed, 1);
  assert.deepEqual((client.getState().notices.find((n) => n.kind === "reverted")?.fields ?? []), [], "a healthy flush retires the notice");
  assert.deepEqual(h.store.snapshot().skins.meirenzhi, { slogan: { zh: "甲", en: "A" } });
  client.dispose();
});

test("acceptance ①: an external revision bump pushes deleteImage through 409 → refetch → retry → success", async () => {
  const h = makeHarness();
  const client = h.makeClient();
  await client.boot();

  const upload = await client.uploadImage(pngFile());
  client.preview("openbmc", "wallpaper", upload.asset.id);
  assert.equal((await client.flushNow()).flushed, 1);

  // An external write moves the revision out from under the client.
  const bumped = await h.direct({
    method: "PATCH",
    url: "/dsh-skins/config",
    body: {
      baseRevision: h.store.snapshot().revision,
      operations: [{ op: "set", skinId: "meirenzhi", key: "slogan", value: { zh: "他", en: "Tab" } }],
    },
  });
  assert.equal(bumped.status, 200);

  const result = await client.deleteImage(upload.asset.id);
  assert.equal(result.error, undefined, "one retry healed the conflict");
  assert.deepEqual(result.affectedSkins, [{ skinId: "openbmc", key: "wallpaper" }]);
  const snap = h.store.snapshot();
  assert.equal(snap.library.length, 0, "the asset is gone");
  assert.equal(snap.skins.openbmc, undefined, "the referencing field fell back");
  assert.deepEqual(snap.skins.meirenzhi, { slogan: { zh: "他", en: "Tab" } }, "the other tab's write survived");
  client.dispose();
});

test("acceptance ⑤: upload merges locally; the armed preview flushes at once; the resync GET survives", async () => {
  const h = makeHarness();
  const client = h.makeClient();
  await client.boot();
  const before = h.calls.length; // boot GET

  const upload = await client.uploadImage(pngFile());
  assert.equal(upload.error, undefined);
  assert.equal(h.calls.length, before + 1, "exactly one POST — concludeUpload itself fetches nothing");
  assert.equal(h.calls.at(-1), "POST /dsh-skins/library");

  client.preview("openbmc", "wallpaper", upload.asset.id);
  assert.equal((await client.flushNow()).flushed, 1);
  assert.deepEqual(h.calls.slice(before), [
    "POST /dsh-skins/library",
    "PATCH /dsh-skins/config",
    "GET /dsh-skins/config", // flush-success resync (config-client §write): preserved behavior
  ]);
  assert.equal(h.store.snapshot().skins.openbmc.wallpaper, upload.asset.id);
  client.dispose();
});

test("recovery across the seam: candidates survive, the library empties, and the client gate holds with zero PATCH (ADR-0018)", async () => {
  const h = makeHarness();

  // Seed one real asset with a throwaway writer-store, then corrupt the state
  // file BEFORE the harness store's lazy init — the next touch boots it into
  // Recovery branch A (candidates rebuilt from the blob on disk).
  const setupStore = createPersonalizationStore({ dataDir: h.dir });
  const { asset } = await setupStore.uploadAsset(pngBytes(), { displayName: "w.png", declaredMime: "image/png" });
  writeFileSync(join(h.dir, "state.json"), "{corrupt: not json", "utf8");

  const client = h.makeClient();
  await client.boot();
  const state = client.getState();
  assert.equal(state.mode, "recovery");
  // The REAL recovery protocol shape: the library EMPTIES and the rebuilt
  // candidates ride under recovery.candidateLibrary (store.js snapshot()) —
  // the exact shape under which the pre-ADR-0018 goalAchieved short-circuit
  // faked success (ADR-0018 Amendment, 2026-10-24).
  assert.equal(state.library.length, 0, "the recovery snapshot empties the library");
  assert.ok(state.recovery?.candidateLibrary?.[asset.id],
    "the rebuilt candidate survives across the seam");

  // The write gate holds LOCALLY: a gallery delete never leaves the client
  // while recovery is pending (ADR-0003 amendment: canWrite absorbs the gate).
  const result = await client.deleteImage(asset.id);
  assert.deepEqual(result, { error: "recovery" });
  assert.equal(h.calls.filter((call) => call.startsWith("PATCH")).length, 0,
    "no PATCH may cross the seam while recovery is pending");
  client.dispose();
});
