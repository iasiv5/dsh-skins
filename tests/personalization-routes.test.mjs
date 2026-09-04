import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountPersonalizationRoutes } from "../src/host/personalization-routes.js";
import { createPersonalizationStore } from "../src/host/personalization/store.js";

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

function makeRequest({ method = "GET", url = "/", headers = {}, body = null }) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== null) yield Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    },
  };
}

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
      if (chunk !== undefined) state.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      state.ended = true;
    },
  };
}

function makeHarness() {
  const routes = [];
  const host = {
    webServer: {
      register(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    },
  };
  const dir = mkdtempSync(join(tmpdir(), "dsh-skins-routes-"));
  const store = createPersonalizationStore({ dataDir: dir });
  const dispose = mountPersonalizationRoutes(host, { store, trustedHosts: [] });
  async function call(request) {
    const response = makeResponse();
    // Mirror the DSH webserver: exact registrations win over prefix ones.
    const path = request.url.split("?")[0];
    const route = routes.find((candidate) => candidate.kind === "exact" && candidate.path === path)
      ?? routes.find((candidate) => candidate.kind === "prefix" && path.startsWith(candidate.path));
    if (route === undefined) throw new Error(`no route for ${path}`);
    await route.handler(request, response);
    return response.state;
  }
  return { store, call, dispose, dir };
}

test("untrusted requests are fenced out on every personalization route", async () => {
  const { call } = makeHarness();
  const bad = { host: "evil.example", "sec-fetch-site": "cross-site" };
  for (const url of ["/dsh-skins/config", "/dsh-skins/library", "/dsh-skins/assets/u_x.png"]) {
    const state = await call(makeRequest({ url, headers: bad }));
    assert.equal(state.status, 403, url);
  }
});

test("GET config returns the snapshot; PATCH applies field operations", async () => {
  const { call } = makeHarness();
  const snapshot = await call(makeRequest({ url: "/dsh-skins/config", headers: TRUSTED }));
  assert.equal(snapshot.status, 200);
  assert.equal(JSON.parse(snapshot.body).mode, "normal");

  const patch = await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { baseRevision: 0, operations: [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 55 }] },
  }));
  assert.equal(patch.status, 200);
  assert.equal(JSON.parse(patch.body).revision, 1);
});

test("PATCH rejects invalid operations with INVALID_CONFIG and no partial writes", async () => {
  const { call } = makeHarness();
  const state = await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { baseRevision: 0, operations: [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 999 }] },
  }));
  assert.equal(state.status, 400);
  assert.equal(JSON.parse(state.body).code, "INVALID_CONFIG");
});

test("PATCH maps stale revisions to 409 and leaves the store retryable", async () => {
  const { call, store } = makeHarness();
  const operations = [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 55 }];
  const stale = await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { baseRevision: 999, operations },
  }));
  assert.equal(stale.status, 409);
  assert.equal(JSON.parse(stale.body).code, "REVISION_CONFLICT");
  assert.equal(store.snapshot().revision, 0);

  const retry = await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { baseRevision: store.snapshot().revision, operations },
  }));
  assert.equal(retry.status, 200);
  assert.equal(JSON.parse(retry.body).revision, 1);
});

test("PATCH maps a missing baseRevision to REVISION_CONFLICT 409", async () => {
  const { call } = makeHarness();
  const state = await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { operations: [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 55 }] },
  }));
  assert.equal(state.status, 409);
  assert.equal(JSON.parse(state.body).code, "REVISION_CONFLICT");
});

test("PATCH maps negative and fractional baseRevision values to REVISION_CONFLICT 409", async () => {
  for (const baseRevision of [-1, 7.5]) {
    const { call } = makeHarness();
    const state = await call(makeRequest({
      method: "PATCH",
      url: "/dsh-skins/config",
      headers: { ...TRUSTED, "content-type": "application/json" },
      body: {
        baseRevision,
        operations: [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 55 }],
      },
    }));
    assert.equal(state.status, 409);
    assert.equal(JSON.parse(state.body).code, "REVISION_CONFLICT");
  }
});

test("upload round-trips through the store and reports 201", async () => {
  const { call } = makeHarness();
  const state = await call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "x-filename": encodeURIComponent("壁纸 一.png") },
    body: pngBytes(),
  }));
  assert.equal(state.status, 201);
  const { asset } = JSON.parse(state.body);
  assert.match(asset.id, /^u_[0-9a-f]{32}$/);
  assert.equal(asset.displayName, "壁纸 一.png");

  const served = await call(makeRequest({ url: `/dsh-skins/assets/${asset.id}.png`, headers: TRUSTED }));
  assert.equal(served.status, 200);
  assert.equal(served.headers["content-type"], "image/png");
  assert.equal(served.headers["cache-control"], "private, max-age=31536000, immutable");
  assert.equal(served.headers["x-content-type-options"], "nosniff");
  assert.equal(served.headers["cross-origin-resource-policy"], "same-origin");
  assert.match(served.headers.etag, /^"[0-9a-f]{64}"$/);
});

test("upload rejects animated WebP (415) and inflated content-length (413)", async () => {
  const { call } = makeHarness();
  const animated = Buffer.alloc(34);
  animated.write("RIFF", 0, "latin1");
  animated.writeUInt32LE(22, 4);
  animated.write("WEBP", 8, "latin1");
  animated.write("VP8X", 12, "latin1");
  animated.writeUInt32LE(10, 16);
  animated[20] = 0x12;
  const rejected = await call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/webp" },
    body: animated,
  }));
  assert.equal(rejected.status, 415);
  assert.equal(JSON.parse(rejected.body).code, "ANIMATION_UNSUPPORTED");

  const huge = await call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "content-length": String(30 * 1024 * 1024) },
    body: pngBytes(),
  }));
  assert.equal(huge.status, 413);
  assert.equal(JSON.parse(huge.body).code, "UPLOAD_TOO_LARGE");
});

test("malformed x-filename encoding is rejected with FILENAME_INVALID", async () => {
  const { call } = makeHarness();
  const state = await call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "x-filename": "%E4%BD%" },
    body: pngBytes(),
  }));
  assert.equal(state.status, 400);
  assert.equal(JSON.parse(state.body).code, "FILENAME_INVALID");
});

test("DELETE validates the suffix, deletes and reports affected skins", async () => {
  const { call, store } = makeHarness();
  const upload = await call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "x-filename": "w.png" },
    body: pngBytes(),
  }));
  const { asset } = JSON.parse(upload.body);
  await call(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: {
      baseRevision: store.snapshot().revision,
      operations: [{ op: "set", skinId: "tgcf", key: "wallpaper", value: asset.id }],
    },
  }));

  const bad = await call(makeRequest({ method: "DELETE", url: "/dsh-skins/library/../etc/passwd", headers: TRUSTED }));
  assert.equal(bad.status, 400);
  const gone = await call(makeRequest({ method: "DELETE", url: `/dsh-skins/library/${asset.id}`, headers: TRUSTED }));
  assert.equal(gone.status, 200);
  assert.deepEqual(JSON.parse(gone.body).affectedSkins, [{ skinId: "tgcf", key: "wallpaper" }]);
  const missing = await call(makeRequest({ method: "DELETE", url: `/dsh-skins/library/${asset.id}`, headers: TRUSTED }));
  assert.equal(missing.status, 404);
});

test("asset serving rejects unknown ids, wrong extensions and traversal shapes", async () => {
  const { call } = makeHarness();
  for (const url of [
    "/dsh-skins/assets/u_ffffffffffffffffffffffffffffffff.png",
    "/dsh-skins/assets/%2e%2e%2fstate.json",
    "/dsh-skins/assets/nope.png",
  ]) {
    const state = await call(makeRequest({ url, headers: TRUSTED }));
    assert.equal(state.status, 404, url);
  }
});

test("recovery route confirms a corrupted store after a host restart", async () => {
  const harness = makeHarness();
  const upload = await harness.call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "x-filename": "w.png" },
    body: pngBytes(),
  }));
  assert.equal(upload.status, 201);
  writeFileSync(join(harness.dir, "state.json"), "broken");
  // Simulate a DSH Web restart: the same data dir, a fresh store instance.
  harness.dispose();
  const routes = [];
  const host = { webServer: { register(route) { routes.push(route); return () => {}; } } };
  const store = createPersonalizationStore({ dataDir: harness.dir });
  mountPersonalizationRoutes(host, { store, trustedHosts: [] });
  const call = async (request) => {
    const response = makeResponse();
    const path = request.url.split("?")[0];
    const route = routes.find((candidate) => candidate.kind === "exact" && candidate.path === path);
    await route.handler(request, response);
    return response.state;
  };

  const snapshot = await call(makeRequest({ url: "/dsh-skins/config", headers: TRUSTED }));
  assert.equal(JSON.parse(snapshot.body).mode, "recovery");

  const confirmed = await call(makeRequest({ method: "POST", url: "/dsh-skins/recovery", headers: TRUSTED }));
  assert.equal(confirmed.status, 200);
  const after = await call(makeRequest({ url: "/dsh-skins/config", headers: TRUSTED }));
  assert.equal(JSON.parse(after.body).mode, "normal");
  assert.equal(JSON.parse(after.body).library.length, 1);
});

test("readonly stores surface STORE_READONLY as 409", async () => {
  const harness = makeHarness();
  const upload = await harness.call(makeRequest({
    method: "POST",
    url: "/dsh-skins/library",
    headers: { ...TRUSTED, "content-type": "image/png", "x-filename": "w.png" },
    body: pngBytes(),
  }));
  assert.equal(upload.status, 201);
  // Hand-craft a future-version state on disk, then reboot the store view.
  writeFileSync(join(harness.dir, "state.json"), JSON.stringify({
    configVersion: 99, revision: 5, skins: {}, library: {},
  }));
  harness.dispose();
  const routes = new Map();
  const host = { webServer: { register(route) { routes.set(route.path, route); return () => {}; } } };
  const store = createPersonalizationStore({ dataDir: harness.dir });
  mountPersonalizationRoutes(host, { store, trustedHosts: [] });
  const response = makeResponse();
  await routes.get("/dsh-skins/config").handler(makeRequest({
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    body: { baseRevision: 5, operations: [{ op: "set", skinId: "tgcf", key: "panelOpacity", value: 1 }] },
  }), response);
  assert.equal(response.state.status, 409);
  assert.equal(JSON.parse(response.state.body).code, "STORE_READONLY");
});

// ---- trust fence hardening + codec error mapping (review round) -----------

test("a spoofed loopback Host from a non-loopback socket is rejected", async () => {
  const { call } = makeHarness();
  const spoofed = await call({
    ...makeRequest({ url: "/dsh-skins/config", headers: { ...TRUSTED } }),
    socket: { remoteAddress: "192.168.1.50" },
  });
  assert.equal(spoofed.status, 403);
  const genuine = await call({
    ...makeRequest({ url: "/dsh-skins/config", headers: { ...TRUSTED } }),
    socket: { remoteAddress: "127.0.0.1" },
  });
  assert.equal(genuine.status, 200);
});

test("malformed JSON bodies map to INVALID_CONFIG 400, not 500", async () => {
  const { call } = makeHarness();
  const chunks = [Buffer.from("{not json")];
  const request = {
    method: "PATCH",
    url: "/dsh-skins/config",
    headers: { ...TRUSTED, "content-type": "application/json" },
    async *[Symbol.asyncIterator]() { yield* chunks; },
  };
  const state = await call(request);
  assert.equal(state.status, 400);
  assert.equal(JSON.parse(state.body).code, "INVALID_CONFIG");
});
