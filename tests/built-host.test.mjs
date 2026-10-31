import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, name } from "../lib/index.js";

test("generated Host bundle mounts and disposes personalization routes through DSH services", () => {
  const routes = [];
  let routeDisposals = 0;
  let pluginDispose;
  const host = {
    webServer: {
      register(route) {
        routes.push(route);
        return () => { routeDisposals += 1; };
      },
    },
    effect(setup, label) {
      assert.equal(label, "dsh-skins: personalization routes");
      pluginDispose = setup();
    },
  };
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ["webServer"]);
      callback(host);
    },
    get(service) {
      // Trust resolution is lazy (per request), non-throwing via
      // resolveTrustedHosts; anything else looking services up here is a
      // contract violation caught by this guard.
      if (service === "webStartup") return { trustedHosts: ["example.test"] };
      throw new Error(`unexpected service lookup: ${service}`);
    },
  };

  assert.equal(name, "@iasiv5/dsh-skins");
  apply(ctx);
  assert.deepEqual(routes.map((route) => route.path), [
    "/dsh-skins/config",
    "/dsh-skins/recovery",
    "/dsh-skins/library",
    "/dsh-skins/library",
    "/dsh-skins/assets",
  ]);
  assert.deepEqual(routes.map((route) => route.kind), [
    "exact", "exact", "exact", "prefix", "prefix",
  ]);
  assert.equal(typeof pluginDispose, "function");
  pluginDispose();
  assert.equal(routeDisposals, 5);
});

test("built Host bundle serves builtin assets from the shipped manifest (ADR-0023)", async () => {
  // Isolate the store (its boot creates directories/state) in a temp DSH_HOME,
  // while the builtin asset path resolves module-relative to the package's
  // real assets/ — proving the SHIPPED manifest+bytes serve end-to-end.
  const home = mkdtempSync(join(tmpdir(), "dsh-skins-built-host-"));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const trustedHost = "127.0.0.1:3080";
  const routes = [];
  let pluginDispose = () => {};
  const host = {
    webServer: {
      register(route) {
        routes.push(route);
        return () => {};
      },
    },
    effect(setup) {
      pluginDispose = setup();
    },
  };
  const ctx = {
    inject(_services, callback) {
      callback(host);
    },
    get(service) {
      if (service === "webStartup") return { trustedHosts: [trustedHost] };
      throw new Error(`unexpected service lookup: ${service}`);
    },
  };
  try {
    apply(ctx);
    const assetsRoute = routes.find((route) => route.path === "/dsh-skins/assets" && route.kind === "prefix");
    assert.ok(assetsRoute, "assets prefix route must be mounted by the built bundle");
    const responseState = { status: 0, headers: {}, body: Buffer.alloc(0) };
    const response = {
      writeHead(status, headers = {}) {
        responseState.status = status;
        responseState.headers = headers;
        return this;
      },
      end(chunk) {
        if (chunk !== undefined) responseState.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      },
    };
    await assetsRoute.handler(
      { method: "GET", url: "/dsh-skins/assets/b_meirenzhi_yuntai.webp?v=1.5.22", headers: { host: trustedHost } },
      response,
    );
    const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url), "utf8"));
    const yuntai = manifest.entries.find((entry) => entry.skinId === "meirenzhi" && entry.assetKey === "yuntai");
    assert.ok(yuntai, "manifest must carry the meirenzhi:yuntai entry");
    assert.equal(responseState.status, 200);
    assert.equal(responseState.headers["content-type"], "image/webp");
    assert.equal(responseState.headers.etag, `"${yuntai.sha256}"`);
    assert.equal(responseState.headers["cache-control"], "private, max-age=31536000, immutable");
    assert.equal(responseState.body.length, yuntai.bytes);
  } finally {
    process.env.DSH_HOME = previousHome;
    pluginDispose();
  }
});
