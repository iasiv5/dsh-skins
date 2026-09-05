/**
 * Repo-side static pins for the bubble-decoration hook (ADR-0006): the built
 * client must carry the union selector in all four skins (light + dark) and
 * must never re-pin the dead rc.2 hash. Runtime-side hook drift is covered by
 * scripts/verify-upstream-hooks.mjs; this file pins the repo side.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const client = readFileSync("lib/client.js", "utf8");
const UNION = ':is([class*="Sixlwa_bubble"], [class*="userStack"] > [class*="_bubble"])';
const GOAL_UNION = ':is([class*="oRe1gG_bubble"], [class*="_stack"] > [class*="_bubble"])';

test("bubble decoration: union selector ships in all four skins (light + dark)", () => {
	// 2 rules per skin × 4 skins, per surface (chat user bubble + goal-panel
	// bubble, v1.0.4) — the exact-hash and structural branches always ship
	// together; a skin missing a union is a fix regression.
	assert.equal(client.split(UNION).length - 1, 8, "chat user-bubble union");
	assert.equal(client.split(GOAL_UNION).length - 1, 8, "goal-panel bubble union");
});

test("bubble decoration: the dead rc.2 hash gdEzaW must never return", () => {
	assert.ok(!client.includes("gdEzaW"), "gdEzaW is the 0.1.1-rc.2 hash that rc.1 rebuilt away — pinning it again re-arms the ADR-0006 failure mode");
});
