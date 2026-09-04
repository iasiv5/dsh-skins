import assert from "node:assert/strict";
import test from "node:test";
import { apply, name } from "../lib/index.js";

test("generated Host bundle mounts and disposes updater routes through DSH services", () => {
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
    agents: { list: () => [] },
    webRuntime: { trustedHosts: ["example.test"] },
    effect(setup, label) {
      assert.equal(label, "dsh-skins: self-update routes");
      pluginDispose = setup();
    },
  };
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ["webServer", "agents", "webRuntime"]);
      callback(host);
    },
    get(service) {
      assert.equal(service, "appExit");
      return () => {};
    },
  };

  assert.equal(name, "@iasiv5/dsh-skins");
  apply(ctx);
  assert.deepEqual(routes.map((route) => route.path), [
    "/dsh-skins/update",
    "/dsh-skins/restart",
    "/dsh-skins/config",
    "/dsh-skins/recovery",
    "/dsh-skins/library",
    "/dsh-skins/library",
    "/dsh-skins/assets",
  ]);
  assert.deepEqual(routes.map((route) => route.kind), [
    "exact", "exact", "exact", "exact", "exact", "prefix", "prefix",
  ]);
  assert.equal(typeof pluginDispose, "function");
  pluginDispose();
  assert.equal(routeDisposals, 7);
});
