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
  assert.equal(lines.length, 5, "comment + light column + light panel/pane + dark column + dark panel/pane");
  assert.equal(lines[0], "/* dsh-skins fullscreen base (ADR-0020): solid skin-tone base while data-rightbar-fullscreen is set — the fullscreen dockkit PANE paints a translucent bg token where the official theme paints opaque white (DOM-dump evidence), so the pane is the bleed surface; solid matches the official look. Docked column untouched. Layer-pinned per ADR-0021 amendment (stale-paint workaround; panel/pane isolate-only — position:relative would break the fullscreen sheet's own position:fixed) */");
  assert.equal(lines[1], 'body[data-dsh-openbmc-skin] [data-rightbar-fullscreen] [class*="_rightbarCol"]{position:relative;z-index:0;background-color:rgb(238, 246, 251)!important}');
  assert.equal(lines[2], 'body[data-dsh-openbmc-skin] [data-sidebar-right-panel="fullscreen"],body[data-dsh-openbmc-skin] [data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]{isolation:isolate;background-color:rgb(238, 246, 251)!important}');
  assert.equal(lines[3], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-rightbar-fullscreen] [class*="_rightbarCol"]{position:relative;z-index:0;background-color:rgb(13, 30, 44)!important}');
  assert.equal(lines[4], 'body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-sidebar-right-panel="fullscreen"],body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-sidebar-right-panel="fullscreen"] [data-dockkit-pane]{isolation:isolate;background-color:rgb(13, 30, 44)!important}');
});

test("fullscreen base: state-scoped — every rule sits under data-rightbar-fullscreen", () => {
  const css = buildFullscreenBaseCss("dshXSkin", {
    light: "rgb(250, 249, 246)",
    dark: "rgb(18, 18, 26)",
  });
  const rules = css.split("\n").slice(1);
  assert.equal(rules.length, 4, "light column + light panel/pane + dark column + dark panel/pane");
  for (const [index, line] of rules.entries()) {
    assert.ok(line.includes("[data-rightbar-fullscreen]") || line.includes('[data-sidebar-right-panel="fullscreen"]'), "rule must be state-scoped");
    if (index % 2 === 1) {
      assert.ok(line.includes('[data-sidebar-right-panel="fullscreen"]'), "the dockkit fullscreen panel (cards carrier, full-window) must be covered (DOM-dump fix, ADR-0020 amendment 2)");
    } else {
      assert.ok(line.includes('[data-rightbar-fullscreen]'), "the rightbar column rule must be rightbar-fullscreen scoped");
    }
  }
  assert.equal(rules[0].split("[data-ds-dark-theme]").length - 1, 0, "light column rule must not carry the dark attribute");
  assert.equal(rules[1].split("[data-ds-dark-theme]").length - 1, 0, "light panel/pane rule must not carry the dark attribute");
  assert.equal(rules[2].split("[data-ds-dark-theme]").length - 1, 1, "dark column rule carries the dark attribute once");
  assert.equal(rules[3].split("[data-ds-dark-theme]").length - 1, 2, "dark panel/pane rule carries the dark attribute exactly once per grouped selector (panel + pane)");
});

test("fullscreen base: skins without a ridden sidebar-fill ship nothing", () => {
  assert.equal(buildFullscreenBaseCss("dshOpenbmcSkin", null), "");
});
