import assert from "node:assert/strict";
import test from "node:test";
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
