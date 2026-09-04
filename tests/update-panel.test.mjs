import assert from "node:assert/strict";
import test from "node:test";
import { createOperationPoller, UPDATE_CSS } from "../src/client/update-panel.js";

function scheduler() {
  let next = 1;
  const pending = new Map();
  const cancelled = [];
  return {
    schedule(callback) {
      const id = next++;
      pending.set(id, callback);
      return id;
    },
    cancel(id) {
      cancelled.push(id);
      pending.delete(id);
    },
    async runNext() {
      const [id, callback] = pending.entries().next().value ?? [];
      if (id === undefined) return false;
      pending.delete(id);
      await callback();
      return true;
    },
    get size() { return pending.size; },
    cancelled,
  };
}

test("operation poller continues while running and cancels on close", async () => {
  const timers = scheduler();
  let loads = 0;
  const poller = createOperationPoller({
    schedule: timers.schedule,
    cancel: timers.cancel,
    delay: 1,
    loadStatus: async () => {
      loads += 1;
      return { operation: { phase: "installing" } };
    },
  });
  poller.start();
  assert.equal(timers.size, 1);
  await timers.runNext();
  assert.equal(loads, 1);
  assert.equal(timers.size, 1);
  poller.stop();
  assert.equal(timers.size, 0);
  assert.equal(timers.cancelled.length, 1);
});

test("operation poller stops scheduling after a terminal state", async () => {
  const timers = scheduler();
  const poller = createOperationPoller({
    schedule: timers.schedule,
    cancel: timers.cancel,
    delay: 1,
    loadStatus: async () => ({ operation: { phase: "done" } }),
  });
  poller.start();
  await timers.runNext();
  assert.equal(timers.size, 0);
  poller.stop();
});

test("a newly mounted panel can resume polling an existing operation", async () => {
  const timers = scheduler();
  let phase = "installing";
  const mount = () => createOperationPoller({
    schedule: timers.schedule,
    cancel: timers.cancel,
    delay: 1,
    loadStatus: async () => ({ operation: { phase } }),
  });
  const first = mount();
  first.start();
  first.stop();
  const reopened = mount();
  reopened.start();
  phase = "failed";
  await timers.runNext();
  assert.equal(timers.size, 0);
});

test("UPDATE_CSS owns the update panel visual interface", () => {
  // Ownership partition ratchet (45 shell + 51 panel + 11 update = 107).
  assert.equal(UPDATE_CSS.split("\n").length, 11,
    "UPDATE_CSS freezes at 11 rules — moving one out (or in) must be deliberate");
  // All eleven update-family rules moved verbatim from the switcher's CSS
  // array with the style-ownership refactor.
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-row{box-sizing"), "update row layout");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-row-muted{display:block"), "muted meta line");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-copy{display:flex"), "copy column");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-copy strong{"), "version headline");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-copy a{color"), "release-notes link");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-copy a:hover{"), "link hover");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-actions{display:flex"), "action cluster");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-actions button,.dsh-skins-update-error>button{height:30px"), "shared button chrome");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-actions button:hover,.dsh-skins-update-error>button:hover{"), "button hover");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-actions button:disabled{"), "button disabled");
  assert.ok(UPDATE_CSS.includes(".dsh-skins-update-error,.dsh-skins-update-error-text{"), "error tint");
  // The busy spinner is a shared atom (also rendered by the personalization
  // panel's delete badge) — it stays in the shell's CSS, not here.
  assert.ok(!UPDATE_CSS.includes(".dsh-skins-update-spinner"),
    "shared spinner atom belongs to the shell's CSS");
});
