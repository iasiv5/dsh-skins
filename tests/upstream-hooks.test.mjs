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

test("bubble decoration: union selector ships in all four skins (light + dark)", () => {
	// 2 rules per skin × 4 skins — the exact-hash and structural branches
	// always ship together; a skin missing the union is a fix regressions.
	assert.equal(client.split(UNION).length - 1, 8);
});

test("bubble decoration: the dead rc.2 hash gdEzaW must never return", () => {
	assert.ok(!client.includes("gdEzaW"), "gdEzaW is the 0.1.1-rc.2 hash that rc.1 rebuilt away — pinning it again re-arms the ADR-0006 failure mode");
});
