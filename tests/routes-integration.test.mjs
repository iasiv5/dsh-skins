import assert from "node:assert/strict";
import test from "node:test";
import { mountUpdateRoutes } from "../src/host/routes.js";

function responseCapture() {
  return {
    status: null,
    headers: null,
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body);
    },
    json() {
      return this.body === "" ? null : JSON.parse(this.body);
    },
  };
}

function request({ method = "GET", url = "/dsh-skins/update", host = "127.0.0.1:3080", origin, site = "same-origin", body = "" } = {}) {
  return {
    method,
    url,
    headers: {
      host,
      ...(origin === undefined ? {} : { origin }),
      ...(site === undefined ? {} : { "sec-fetch-site": site }),
      ...(body === "" ? {} : { "content-type": "application/json" }),
    },
    async *[Symbol.asyncIterator]() {
      if (body !== "") yield Buffer.from(body);
    },
  };
}

function harness(overrides = {}) {
  const routes = new Map();
  let forced = null;
  let updates = 0;
  let restarts = 0;
  const updater = {
    restartRequired: false,
    async status(force) {
      forced = force;
      return { currentVersion: "0.4.0", source: { kind: "github" }, latest: { version: "0.4.0" }, updateAvailable: false, canUpdate: false };
    },
    currentOperation: () => null,
    startUpdate() {
      updates += 1;
      return { id: "op", phase: "queued" };
    },
    ...overrides.updater,
  };
  const host = {
    webServer: {
      register(route) {
        routes.set(route.path, route.handler);
        return () => routes.delete(route.path);
      },
    },
  };
  const dispose = mountUpdateRoutes(host, {
    updater,
    restart: { available: true, schedule: () => { restarts += 1; }, ...overrides.restart },
    agents: overrides.agents ?? { list: () => [] },
    trustedHosts: overrides.trustedHosts ?? [],
  });
  return { routes, updater, dispose, facts: () => ({ forced, updates, restarts }) };
}

test("update route enforces trust before status and mutation handling", async () => {
  const app = harness();
  const handler = app.routes.get("/dsh-skins/update");

  const trusted = responseCapture();
  await handler(request(), trusted);
  assert.equal(trusted.status, 200);
  assert.equal(trusted.json().currentVersion, "0.4.0");

  const rebound = responseCapture();
  await handler(request({ host: "attacker.test:3080", origin: "http://attacker.test:3080" }), rebound);
  assert.equal(rebound.status, 403);

  const crossSite = responseCapture();
  await handler(request({ site: "cross-site" }), crossSite);
  assert.equal(crossSite.status, 403);

  const mutation = responseCapture();
  await handler(request({ method: "POST", origin: "http://127.0.0.1:3080", body: "{}" }), mutation);
  assert.equal(mutation.status, 202);
  assert.equal(app.facts().updates, 1);
  app.dispose();
});

test("forced checks require the non-simple force header", async () => {
  const app = harness();
  const handler = app.routes.get("/dsh-skins/update");
  const ordinary = responseCapture();
  await handler(request({ url: "/dsh-skins/update?force=1" }), ordinary);
  assert.equal(app.facts().forced, false);

  const forced = responseCapture();
  const forcedRequest = request({ url: "/dsh-skins/update?force=1" });
  forcedRequest.headers["x-dsh-skins-force"] = "1";
  await handler(forcedRequest, forced);
  assert.equal(app.facts().forced, true);
  app.dispose();
});

test("restart route blocks running Agents and schedules only a safe restart", async () => {
  const blocked = harness({
    updater: { restartRequired: true },
    agents: { list: () => [{ status: "running", whenIdle: async () => {} }] },
  });
  const blockedResponse = responseCapture();
  await blocked.routes.get("/dsh-skins/restart")(request({ method: "POST", origin: "http://127.0.0.1:3080", url: "/dsh-skins/restart", body: "{}" }), blockedResponse);
  assert.equal(blockedResponse.status, 409);
  assert.equal(blockedResponse.json().code, "AGENTS_RUNNING");
  assert.equal(blockedResponse.json().params.count, 1);
  assert.equal(blocked.facts().restarts, 0);

  const unavailable = harness({
    updater: { restartRequired: true },
    restart: { available: false },
  });
  const unavailableResponse = responseCapture();
  await unavailable.routes.get("/dsh-skins/restart")(request({ method: "POST", origin: "http://127.0.0.1:3080", url: "/dsh-skins/restart", body: "{}" }), unavailableResponse);
  assert.equal(unavailableResponse.status, 501);
  assert.equal(unavailableResponse.json().code, "RESTART_UNAVAILABLE");

  const noPending = harness({
    updater: { restartRequired: false },
  });
  const noPendingResponse = responseCapture();
  await noPending.routes.get("/dsh-skins/restart")(request({ method: "POST", origin: "http://127.0.0.1:3080", url: "/dsh-skins/restart", body: "{}" }), noPendingResponse);
  assert.equal(noPendingResponse.status, 409);
  assert.equal(noPendingResponse.json().code, "NO_PENDING_UPDATE");

  const safe = harness({ updater: { restartRequired: true } });
  const safeResponse = responseCapture();
  await safe.routes.get("/dsh-skins/restart")(request({ method: "POST", origin: "http://127.0.0.1:3080", url: "/dsh-skins/restart", body: "{}" }), safeResponse);
  assert.equal(safeResponse.status, 202);
  assert.equal(safe.facts().restarts, 1);
});
