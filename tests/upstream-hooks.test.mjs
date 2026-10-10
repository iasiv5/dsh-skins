/**
 * Repo-side static pins for the bubble-decoration hook (ADR-0006): the built
 * client must carry the union selector in all shipped skins (light + dark) and
 * must never re-pin the dead rc.2 hash. Runtime-side hook drift is covered by
 * scripts/verify-upstream-hooks.mjs; this file pins the repo side.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const client = readFileSync("lib/client.js", "utf8");
const UNION = ':is([class*="Sixlwa_bubble"], [class*="userStack"] > [class*="_bubble"])';
const GOAL_UNION = ':is([class*="oRe1gG_bubble"], [class*="_stack"] > [class*="_bubble"])';

test("bubble decoration: union selector ships in all three skins (light + dark)", () => {
	// 2 rules per skin × 3 skins, per surface (chat user bubble + goal-panel
	// bubble, v1.0.4) — the exact-hash and structural branches always ship
	// together; a skin missing a union is a fix regression. (v1.4.0 removed
	// the tgcf skin: 8 → 6 occurrences.)
	assert.equal(client.split(UNION).length - 1, 6, "chat user-bubble union");
	assert.equal(client.split(GOAL_UNION).length - 1, 6, "goal-panel bubble union");
});

test("Desktop backdrop bundle carries the public marker and all stable skin scopes", () => {
  assert.ok(client.includes("html[data-windows-titlebar]"), "Desktop override must be gated by the public Windows marker");
  for (const attribute of ["data-dsh-openbmc-skin", "data-dsh-uefi-harness", "data-dsh-meirenzhi-skin"]) {
    assert.ok(client.includes(attribute), `built client is missing skin scope ${attribute}`);
  }
  assert.ok(!client.includes(".centerCol"), "Desktop styling must not depend on a Host CSS Modules class");
});

test("bubble decoration: the dead rc.2 hash gdEzaW must never return", () => {
	assert.ok(!client.includes("gdEzaW"), "gdEzaW is the 0.1.1-rc.2 hash that rc.1 rebuilt away — pinning it again re-arms the ADR-0006 failure mode");
});
