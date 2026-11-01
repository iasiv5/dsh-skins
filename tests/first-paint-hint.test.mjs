import assert from "node:assert/strict";
import test from "node:test";
import { createConfigClient } from "../src/client/personalization/config-client.js";

// First-paint hint (cold-load wallpaper flash fix): the last synced snapshot's
// skin overrides and library metadata, cached client-side so the first mount
// after a cold load uses what the user actually chose instead of the catalog
// default. The server snapshot stays authoritative once it lands.
const HINT_KEY = "dsh-skins:first-paint-hint";
const YINYUE = "builtin:meirenzhi:yinyue";
const YUNTAI = "builtin:meirenzhi:yuntai";
const USER_ASSET = `u_${"a".repeat(32)}`;

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
  return (url, init) => handler(String(url), init);
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    raw: (key) => data.get(key) ?? null,
  };
}

function hintJson(skins, library = []) {
  return JSON.stringify({ v: 1, skins, library });
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test("before the first sync, overrides come from the first-paint hint (no default flash on cold load)", async () => {
  const storage = memoryStorage({ [HINT_KEY]: hintJson({ meirenzhi: { wallpaper: YINYUE } }) });
  const gate = deferred();
  const client = createConfigClient({ fetchImpl: makeFetch(() => gate.promise), timeoutMs: 5000, storage });
  const booting = client.boot();
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), { wallpaper: YINYUE });
  gate.resolve(snapshotBody({ skins: { meirenzhi: { wallpaper: YINYUE } } }));
  await booting;
});

test("once the server snapshot lands it wins, and the hint is refreshed from it", async () => {
  const storage = memoryStorage({ [HINT_KEY]: hintJson({ meirenzhi: { wallpaper: YINYUE } }) });
  const client = createConfigClient({
    fetchImpl: makeFetch(() => snapshotBody({ skins: { meirenzhi: { wallpaper: YUNTAI } } })),
    timeoutMs: 50,
    storage,
  });
  await client.boot();
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), { wallpaper: YUNTAI });
  const written = JSON.parse(storage.raw(HINT_KEY));
  assert.equal(written.v, 1);
  assert.equal(written.skins.meirenzhi.wallpaper, YUNTAI);
});

test("a cold load with no hint keeps the catalog default until the snapshot syncs", async () => {
  const storage = memoryStorage();
  const gate = deferred();
  const client = createConfigClient({ fetchImpl: makeFetch(() => gate.promise), timeoutMs: 5000, storage });
  const booting = client.boot();
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), {});
  gate.resolve(snapshotBody({ skins: { meirenzhi: { wallpaper: YINYUE } } }));
  await booting;
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), { wallpaper: YINYUE });
  assert.equal(JSON.parse(storage.raw(HINT_KEY)).skins.meirenzhi.wallpaper, YINYUE);
});

test("a corrupt or foreign-shaped hint is ignored without breaking boot", async () => {
  const bad = [
    "{not json",
    JSON.stringify({ v: 2, skins: {} }),
    JSON.stringify({ v: 1, skins: [] }),
    JSON.stringify({ v: 1, skins: { meirenzhi: "x" }, library: {} }),
  ];
  for (const raw of bad) {
    const storage = memoryStorage({ [HINT_KEY]: raw });
    const gate = deferred();
    const client = createConfigClient({ fetchImpl: makeFetch(() => gate.promise), timeoutMs: 5000, storage });
    const booting = client.boot();
    assert.deepEqual(client.effectiveOverrides("meirenzhi"), {}, raw);
    gate.resolve(snapshotBody());
    await booting;
  }
});

test("hint library entries resolve user assets before the first sync; the server library wins after", async () => {
  const meta = {
    id: USER_ASSET,
    extension: "webp",
    mime: "image/webp",
    byteLength: 10,
    sha256: "f".repeat(64),
    displayName: "wall.webp",
    width: 2,
    height: 2,
  };
  const storage = memoryStorage({ [HINT_KEY]: hintJson({ meirenzhi: { wallpaper: USER_ASSET } }, [meta]) });
  const gate = deferred();
  const client = createConfigClient({ fetchImpl: makeFetch(() => gate.promise), timeoutMs: 5000, storage });
  const booting = client.boot();
  assert.deepEqual(client.findLibraryEntry(USER_ASSET), meta);
  assert.equal(client.findLibraryEntry(`u_${"b".repeat(32)}`), null);
  gate.resolve(snapshotBody({ skins: { meirenzhi: { wallpaper: YINYUE } }, library: [] }));
  await booting;
  assert.equal(client.findLibraryEntry(USER_ASSET), null);
});

test("recovery and unsupported snapshots never rewrite the hint", async () => {
  for (const mode of ["recovery", "unsupported"]) {
    const before = hintJson({ meirenzhi: { wallpaper: YINYUE } });
    const storage = memoryStorage({ [HINT_KEY]: before });
    const client = createConfigClient({
      fetchImpl: makeFetch(() => snapshotBody({ mode, skins: { meirenzhi: { wallpaper: YUNTAI } } })),
      timeoutMs: 50,
      storage,
    });
    await client.boot();
    assert.equal(storage.raw(HINT_KEY), before, mode);
  }
});

test("a synced client ignores the hint even after the network drops", async () => {
  const storage = memoryStorage({ [HINT_KEY]: hintJson({ meirenzhi: { wallpaper: YINYUE } }) });
  let calls = 0;
  const client = createConfigClient({
    fetchImpl: makeFetch(() => {
      calls += 1;
      return calls === 1
        ? snapshotBody({ skins: { meirenzhi: { wallpaper: YUNTAI } } })
        : Promise.reject(new Error("offline"));
    }),
    timeoutMs: 50,
    storage,
  });
  await client.boot();
  await client.refetch();
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), { wallpaper: YUNTAI });
});

test("a storage that throws never breaks boot", async () => {
  const storage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
  };
  const client = createConfigClient({
    fetchImpl: makeFetch(() => snapshotBody({ skins: { meirenzhi: { wallpaper: YINYUE } } })),
    timeoutMs: 50,
    storage,
  });
  await client.boot();
  assert.deepEqual(client.effectiveOverrides("meirenzhi"), { wallpaper: YINYUE });
});
