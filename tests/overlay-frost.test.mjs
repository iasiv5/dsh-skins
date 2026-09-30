/**
 * Overlay-frost union tests (ADR-0007): every skin must carry the v1 dialog
 * recipe AND the v2 gap-closing selectors (dockkit float shell, structural
 * dialog fallback, dsh-m filter pop / modal box, plugin mask blur), in both
 * light and dark tints. The hooks themselves are pinned against the live
 * runtime by scripts/verify-upstream-hooks.mjs; this suite pins the CSS side.
 * All matching runs against whitespace-stripped CSS — openbmc/uefi author
 * multi-line template strings, tgcf/meirenzhi single-line array entries.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createTgcfSkin } from "../src/client/skins/tgcf/index.js";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";

const jsx = (component, props) => ({ component, props });
const skins = [
  { id: "tgcf", css: createTgcfSkin({ jsx }).css.replaceAll(/\s+/g, "") },
  { id: "openbmc", css: createOpenBmcHarness({ jsx }).css.replaceAll(/\s+/g, "") },
  { id: "meirenzhi", css: createMeirenzhiSkin({ jsx }).css.replaceAll(/\s+/g, "") },
  { id: "uefi", css: createUefiHarness({ jsx }).css.replaceAll(/\s+/g, "") },
];

test("v1 dialog recipe survives in all four skins", () => {
  for (const { id, css } of skins) {
    assert.ok(css.includes('[role="dialog"][aria-modal="true"]'), `${id}: v1 role/aria hook missing`);
    assert.ok(css.includes(".dshm-panel") && css.includes(".dshm-compat-dialog") && css.includes(".dshm-dshchip-tip"), `${id}: v1 dshm union missing`);
    assert.ok(css.includes(".dsh-skins-pop"), `${id}: v1 skins-pop missing`);
    assert.ok(css.includes("--dsw-mask-blur:blur(10px)"), `${id}: --dsw-mask-blur token light-up missing`);
    assert.ok(css.includes("86%,transparent)"), `${id}: 86% color-mix tint missing`);
    assert.ok(css.includes("backdrop-filter:blur(14px)saturate(1.3)"), `${id}: blur14 saturate1.3 missing`);
    assert.ok(css.includes("-webkit-backdrop-filter:blur(14px)saturate(1.3)"), `${id}: -webkit spelling missing`);
  }
});

test("v2 overlay-frost union present in all four skins (ADR-0007)", () => {
  for (const { id, css } of skins) {
    // a. dockkit float-window shell + b. structural dialog fallback, with the
    // frost declaration in the SAME rule block
    for (const hook of ['[class*="_float_"]', '[class*="_dialog_"]']) {
      assert.ok(
        new RegExp(`${hook.replaceAll(/[[\]*"]/g, "\\$&")}[^{}]*\\{[^{}]*backdrop-filter:blur\\(14px\\)saturate\\(1\\.3\\)`).test(css),
        `${id}: frost rule missing for ${hook}`,
      );
    }
    // c. dsh-m 0.7.x floating surfaces
    assert.ok(css.includes(".dsvm-filterpop"), `${id}: .dsvm-filterpop missing`);
    assert.ok(css.includes(".dsvm-modalbox"), `${id}: .dsvm-modalbox missing`);
    // d. plugin mask blur (no tint — masks keep their own fill)
    assert.ok(/\.dshm-overlay[^{}]*\{backdrop-filter:var\(--dsw-mask-blur/.test(css), `${id}: .dshm-overlay mask blur missing`);
    assert.ok(/\.dsvm-overlay[^{}]*\{backdrop-filter:var\(--dsw-mask-blur/.test(css), `${id}: .dsvm-overlay mask blur missing`);
  }
});

test("v2 union carries a dark-theme variant per skin", () => {
  const darkAnchors = {
    tgcf: "rgb(24,16,16)86%",
    openbmc: "rgb(12,26,38)86%",
    meirenzhi: "rgb(18,18,26)86%",
    uefi: "rgb(23,18,45)86%",
  };
  for (const { id, css } of skins) {
    assert.ok(
      new RegExp(`data-ds-dark-theme\\][^{]*\\[class\\*="_float_"\\][^{]*\\{[^{}]*color-mix\\(insrgb,${darkAnchors[id].replaceAll(/([()])/g, "\\$&")}`).test(css),
      `${id}: dark frost tint for the float shell missing`,
    );
  }
});

test("float selector cannot sweep floatTitle/floatBody/floatResize", () => {
  // The structural hook keys on the trailing underscore; the guard enforces
  // the live inventory, this pins the reasoning.
  const dangerous = ["_floatTitle_6nhg2_409", "_floatBody_6nhg2_795", "_floatResize_6nhg2_805", "_floatingCell_6nhg2_1"];
  for (const cls of dangerous) assert.ok(!cls.includes("_float_"), `${cls} unexpectedly contains "_float_"`);
  assert.ok("_float_6nhg2_156".includes("_float_"));
});

test("menu surface fill is skin-owned and 较实 in all four skins (ADR-0007 amendment)", () => {
  // Official --dsw-menu-surface-fill is 45–58% alpha over a full-surface
  // blur(40px): crisp over the official opaque shell, but in the skins it
  // samples the wallpaper and the dropdown turns to mush. Every skin owns the
  // fill with its own tint family at 0.94 (same family as --dsw-specific-menu).
  const menuTints = {
    tgcf: ["rgba(255,252,246,0.94)", "rgba(24,16,16,0.94)"],
    openbmc: ["rgba(242,247,251,0.94)", "rgba(14,33,48,0.94)"],
    meirenzhi: ["rgba(250,249,246,0.94)", "rgba(18,18,26,0.94)"],
    uefi: ["rgba(248,247,255,0.94)", "rgba(28,22,55,0.94)"],
  };
  for (const { id, css } of skins) {
    const [light, dark] = menuTints[id];
    for (const token of ["--dsw-menu-surface-fill:", "--dsw-alias-menu-group-header-fill:", "--dsw-specific-menu:"]) {
      assert.ok(css.includes(token + light), `${id}: ${token} light tint missing`);
      assert.ok(css.includes(token + dark), `${id}: ${token} dark tint missing`);
    }
  }
});
