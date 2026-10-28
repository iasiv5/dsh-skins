/**
 * Repo-side pins for the bubble-decoration hook (ADR-0006) and the shell-frame
 * alignment (ADR-0009). The bubble unions' WIRING truth is runtime-evaluated
 * (ADR-0016 amendment, B-1 ruling ①): each skin factory's
 * project(factory-anchor).staticCss must ship both unions exactly twice —
 * counting the built lib's static bytes can no longer see the generated rules,
 * because the union strings live only as interpolated fragments inside
 * src/client/skins/decoration.js. The hashes themselves are imported from
 * BUBBLE_HOOKS (single source, shared with the guard). The shell-frame,
 * scope-marker and dead-hash tests below still pin the built lib/client.js
 * bytes. Runtime-side hook drift is covered by
 * scripts/verify-upstream-hooks.mjs; this file pins the repo side.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BUBBLE_HOOKS } from "../src/client/skins/decoration.js";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";
import { jsx } from "./fake-react.mjs";

const client = readFileSync("lib/client.js", "utf8");
const UNION = `:is([class*="${BUBBLE_HOOKS.chat.exact}"], [class*="${BUBBLE_HOOKS.chat.container}"] > [class*="${BUBBLE_HOOKS.bubbleLocal}"])`;
const GOAL_UNION = `:is([class*="${BUBBLE_HOOKS.goal.exact}"], [class*="${BUBBLE_HOOKS.goal.container}"] > [class*="${BUBBLE_HOOKS.bubbleLocal}"])`;

test("bubble decoration: both unions ship twice per skin (light + dark) — wiring truth, runtime-evaluated", () => {
	// 2 rules per skin × 3 skins, per surface (chat user bubble + goal-panel
	// bubble, v1.0.4) — the exact-hash and structural branches always ship
	// together; a skin missing a union (or forgetting to call decorationCss)
	// is a fix regression. (v1.4.0 removed the tgcf skin: 8 → 6 occurrences.)
	const skins = [
		["openbmc", createOpenBmcHarness({ jsx }), 55],
		["uefi-harness", createUefiHarness({ jsx }), 55],
		["meirenzhi", createMeirenzhiSkin({ jsx }), 35],
	];
	for (const [id, skin, anchor] of skins) {
		const css = skin.project({ panelOpacity: anchor }).staticCss;
		assert.equal(css.split(UNION).length - 1, 2, `${id} chat user-bubble union`);
		assert.equal(css.split(GOAL_UNION).length - 1, 2, `${id} goal-panel bubble union`);
	}
});

test("Desktop backdrop bundle carries the public marker and all stable skin scopes", () => {
  assert.ok(client.includes("html[data-windows-titlebar]"), "Desktop override must be gated by the public Windows marker");
  for (const attribute of ["data-dsh-openbmc-skin", "data-dsh-uefi-harness", "data-dsh-meirenzhi-skin"]) {
    assert.ok(client.includes(attribute), `built client is missing skin scope ${attribute}`);
  }
  assert.ok(!client.includes(".centerCol"), "Desktop styling must not depend on a Host CSS Modules class");
});

test("shell-frame alignment ships exactly once, marker-gated, structural local names only (ADR-0009)", () => {
  const STRIP = 'html[data-windows-titlebar] [class*="_frame"]:has(> [class*="_sidebarCol"])::before{background:0 0}';
  const COLUMN = 'html[data-windows-titlebar] [class*="_frame"] > [class*="_sidebarCol"]{background:0 0}';
  const ROOT = 'html[data-windows-titlebar] [class*="_sidebarCol"] > [class*="_root"]{background:0 0}';
  // Runtime-level emission: one copy for all skins, mounted per skin at runtime.
  assert.equal(client.split(STRIP).length - 1, 1, "caption-strip single-paint rule");
  assert.equal(client.split(COLUMN).length - 1, 1, "sidebar-column single-paint rule");
  assert.equal(client.split(ROOT).length - 1, 1, "sidebar-root single-paint rule (v2: the ui-sidebar root paints the fill again inside the column)");
  // v4/v6: the opaque shell-fill token override and the wallpaper-in-content
  // rules are template literals around ${scoped} — esbuild keeps that
  // interpolation, so pin the template fragments, not a contiguous string.
  assert.ok(client.includes("${scoped}{--dsw-specific-sidebar-fill:"), "opaque token override template ships");
  assert.ok(client.includes("${scoped}[data-ds-dark-theme]{--dsw-specific-sidebar-fill:"), "dark variant of the opaque token override ships");
  assert.ok(client.includes('!important}'), "the token override must stay !important (beats the theme's published value)");
  assert.ok(client.includes('[class*="_centerCol"]'), "wallpaper-in-content rules ship (v6)");
  assert.ok(client.includes('[data-rightbar-col] > *{background-color:'), "right-panel solid backing ships (v7)");
  assert.ok(client.includes('[class*="_pane_"]'), "dockkit pane rules ship (v7)");
  assert.ok(!client.includes("caption.css"), "the caption sampler machinery is gone (superseded by the opaque token)");
  // ADR-0006 doctrine: exact hashed pins are banned; structural local names
  // ([class*="_local"]) are allowed and pinned by scripts/verify-upstream-hooks.mjs.
  assert.ok(!/[A-Za-z0-9]{2,}_(frame|sidebarCol|root)/.test(client), "a hashed host class got pinned — that is the ADR-0006 failure mode");
});

test("bubble decoration: the dead rc.2 hash gdEzaW must never return", () => {
	assert.ok(!client.includes("gdEzaW"), "gdEzaW is the 0.1.1-rc.2 hash that rc.1 rebuilt away — pinning it again re-arms the ADR-0006 failure mode");
});

test("fullscreen frost base hooks ship in the built client (ADR-0020)", () => {
	assert.ok(client.includes("[data-rightbar-fullscreen]"), "fullscreen-state marker ships");
	assert.ok(client.includes('[class*="_rightbarCol"]'), "rightbar column structural hook ships");
});
