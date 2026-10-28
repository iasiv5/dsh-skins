/**
 * Fullscreen frost base contract (ADR-0020): the fullscreen right sidebar
 * column gets a 94% skin-tone base + frost blur, state-scoped by
 * data-rightbar-fullscreen; the docked column must never match. Byte-level
 * pins on the openbmc fixture mirror the shell-tag discipline in
 * runtime-effects.test.mjs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildFullscreenBaseCss } from "../src/client/runtime.js";

test("fullscreen base: selector shape, 94% frost recipe, light+dark, byte-pinned", () => {
  const css = buildFullscreenBaseCss("dshOpenbmcSkin", {
    light: "rgb(238, 246, 251)",
    dark: "rgb(13, 30, 44)",
  });
  const lines = css.split("\n");
  assert.equal(lines.length, 3, "comment + light rule + dark rule");
  assert.equal(lines[0], "/* dsh-skins fullscreen frost base (ADR-0020): 94% skin-tone column base + frost blur while data-rightbar-fullscreen is set — chat bleed becomes unreadable soft glow; the docked column is untouched */");
  assert.equal(lines[1], 'body[data-dsh-openbmc-skin] [data-rightbar-fullscreen] [class*="_rightbarCol"],body[data-dsh-openbmc-skin] [data-sidebar-right-panel="fullscreen"]{background-color:color-mix(in srgb, rgb(238, 246, 251) 94%, transparent)!important;backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3)}');
  assert.equal(lines[2], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-rightbar-fullscreen] [class*="_rightbarCol"],body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-sidebar-right-panel="fullscreen"]{background-color:color-mix(in srgb, rgb(13, 30, 44) 94%, transparent)!important}');
});

test("fullscreen base: state-scoped — every rule sits under data-rightbar-fullscreen", () => {
  const css = buildFullscreenBaseCss("dshXSkin", {
    light: "rgb(250, 249, 246)",
    dark: "rgb(18, 18, 26)",
  });
  const rules = css.split("\n").slice(1);
  assert.equal(rules.length, 2);
  for (const line of rules) {
    assert.ok(line.includes("[data-rightbar-fullscreen]"), "rule must be state-scoped");
    assert.ok(line.includes('[data-sidebar-right-panel="fullscreen"]'), "the dockkit fullscreen panel (cards carrier, full-window) must be covered (DOM-dump fix, ADR-0020 amendment 2)");
  }
  assert.equal(rules[0].split("[data-ds-dark-theme]").length - 1, 0, "light rule must not carry the dark attribute");
  assert.equal(rules[1].split("[data-ds-dark-theme]").length - 1, 2, "dark rule carries the dark attribute exactly once per grouped selector (column + occupant)");
});

test("fullscreen base: skins without a ridden sidebar-fill ship nothing", () => {
  assert.equal(buildFullscreenBaseCss("dshOpenbmcSkin", null), "");
});
