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
  assert.equal(lines.length, 5, "comment + light column + light sheet + dark column + dark sheet");
  assert.ok(lines[0].endsWith("Fullscreen sheet root rides z-index:2 above the sidebar paint-order guard (ADR-0021) */"));
  assert.equal(lines[1], 'body[data-dsh-openbmc-skin] [data-rightbar-fullscreen] [class*="_rightbarCol"]{background-color:rgb(238, 246, 251)!important}');
  assert.equal(lines[2], 'body[data-dsh-openbmc-skin] [data-sidebar-right-panel="fullscreen"]:not(:has([class*="_paneBody"] > [class*="_empty"])),body[data-dsh-openbmc-skin] [data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]:not(:has([class*="_paneBody"] > [class*="_empty"])){z-index:2;background-color:rgb(238, 246, 251)!important}');
  assert.equal(lines[3], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-rightbar-fullscreen] [class*="_rightbarCol"]{background-color:rgb(13, 30, 44)!important}');
  assert.equal(lines[4], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-sidebar-right-panel="fullscreen"]:not(:has([class*="_paneBody"] > [class*="_empty"])),body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]:not(:has([class*="_paneBody"] > [class*="_empty"])){z-index:2;background-color:rgb(13, 30, 44)!important}');
});


test("fullscreen base: state-scoped — every rule sits under data-rightbar-fullscreen", () => {
  const css = buildFullscreenBaseCss("dshXSkin", {
    light: "rgb(250, 249, 246)",
    dark: "rgb(18, 18, 26)",
  });
  const rules = css.split("\n").slice(1);
  assert.equal(rules.length, 4, "light column + light sheet + dark column + dark sheet");
  assert.ok(rules[0].includes("[data-rightbar-fullscreen]") && rules[2].includes("[data-rightbar-fullscreen]"), "column rules must be rightbar-fullscreen scoped");
  assert.ok(rules[1].includes('[data-sidebar-right-panel="fullscreen"]') && rules[3].includes('[data-sidebar-right-panel="fullscreen"]'), "the dockkit fullscreen sheet must be covered (DOM-dump fix, ADR-0020 amendment 2)");
  assert.ok(rules[1].includes("z-index:2") && rules[3].includes("z-index:2"), "the sheet root must ride z-index:2 above the sidebar paint-order guard (ADR-0021)");
  assert.equal(rules[0].split("[data-ds-dark-theme]").length - 1, 0, "light column rule must not carry the dark attribute");
  assert.equal(rules[1].split("[data-ds-dark-theme]").length - 1, 0, "light sheet rule must not carry the dark attribute");
  assert.equal(rules[2].split("[data-ds-dark-theme]").length - 1, 1, "dark column rule carries the dark attribute once");
  assert.equal(rules[3].split("[data-ds-dark-theme]").length - 1, 2, "dark sheet rule carries the dark attribute exactly once per grouped selector (panel + pane)");
});

test("fullscreen base: skins without a ridden sidebar-fill ship nothing", () => {
  assert.equal(buildFullscreenBaseCss("dshOpenbmcSkin", null), "");
});
