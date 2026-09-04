import assert from "node:assert/strict";
import test from "node:test";
import { createRestartScheduler, restartSafety, waitForRestartSafety } from "../src/host/restart.js";
import { isTrustedRequest } from "../src/host/routes.js";

function fakeRuntime(overrides) {
  const spawns = [];
  const timers = [];
  return {
    spawns,
    timers,
    ...overrides,
    spawn: (...args) => {
      spawns.push(args);
      return { unref() {} };
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return { unref() {} };
    },
  };
}

test("restart scheduler exits non-zero without a helper under systemd", () => {
  let exitCode = null;
  const fake = fakeRuntime({ env: { INVOCATION_ID: "a6925276-3fc1-43d1-bc63-4310302f526e" } });
  const scheduler = createRestartScheduler((code) => { exitCode = code; }, fake);
  assert.equal(scheduler.available, true);
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(fake.spawns.length, 0, "managed restarts must not spawn a relaunch helper");
  assert.equal(fake.timers.length, 1);
  assert.equal(fake.timers[0].ms, 150);
  fake.timers[0].fn();
  assert.equal(exitCode, 75, "managed restarts must exit non-zero for Restart=on-failure");
});

test("restart scheduler also honours NOTIFY_SOCKET service managers", () => {
  let exitCode = null;
  const fake = fakeRuntime({ env: { NOTIFY_SOCKET: "/run/systemd/notify" } });
  createRestartScheduler((code) => { exitCode = code; }, fake).schedule();
  assert.equal(fake.spawns.length, 0);
  fake.timers[0].fn();
  assert.equal(exitCode, 75);
});

test("restart scheduler keeps the relaunch helper outside service managers", () => {
  let exitCode = null;
  const fake = fakeRuntime({
    env: {},
    execPath: "/usr/bin/node",
    argv: ["/usr/bin/node", "dsh", "web"],
    cwd: "/home/ubuntu/.dsh",
    pid: 4321,
  });
  createRestartScheduler((code) => { exitCode = code; }, fake).schedule();
  assert.equal(fake.spawns.length, 1, "unmanaged restarts still spawn the helper");
  assert.equal(fake.spawns[0][0], "/usr/bin/node");
  assert.match(fake.spawns[0][1].join(" "), /4321/);
  assert.equal(fake.timers.length, 1);
  fake.timers[0].fn();
  assert.equal(exitCode, 0, "unmanaged restarts keep the historical clean exit");
});

test("browser-trust fence accepts only loopback or configured authorities", () => {
  assert.equal(isTrustedRequest({ headers: { host: "127.0.0.1:3080" } }), true);
  assert.equal(isTrustedRequest({ headers: { origin: "http://127.0.0.1:3080", host: "127.0.0.1:3080", "sec-fetch-site": "same-origin" } }), true);
  assert.equal(isTrustedRequest({ headers: { origin: "http://127.0.0.1", host: "127.0.0.1:3080" } }), false);
  assert.equal(isTrustedRequest({ headers: { origin: "https://evil.test", host: "127.0.0.1:3080" } }), false);
  assert.equal(isTrustedRequest({ headers: { origin: "http://attacker.test:3080", host: "attacker.test:3080" } }), false);
  assert.equal(isTrustedRequest({ headers: { origin: "https://example.test", host: "example.test" } }, ["example.test"]), true);
  assert.equal(isTrustedRequest({ headers: { origin: "https://example.test", host: "127.0.0.1:3080", "x-forwarded-host": "example.test" } }, ["example.test"]), false);
  assert.equal(isTrustedRequest({ headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" } }), false);
});

test("restart safety blocks running Agents", async () => {
  const agents = { list: () => [{ status: "running", whenIdle: async () => {} }] };
  assert.deepEqual(restartSafety(agents), { state: "blocked", running: 1 });
  await assert.rejects(() => waitForRestartSafety(agents), /1 个 Agent/);
});

test("restart safety waits for idle Agents and rechecks", async () => {
  let waited = false;
  const agent = { status: "idle", whenIdle: async () => { waited = true; } };
  const agents = { list: () => [agent] };
  assert.deepEqual(await waitForRestartSafety(agents), { state: "safe", running: 0 });
  assert.equal(waited, true);
});

test("unknown Agent state requires explicit confirmation", async () => {
  assert.deepEqual(restartSafety(null), { state: "unknown", running: null });
  await assert.rejects(() => waitForRestartSafety(null), (error) => error.code === "RESTART_SAFETY_UNKNOWN");
  assert.deepEqual(await waitForRestartSafety(null, true), { state: "unknown", running: null });
});
