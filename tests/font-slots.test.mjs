/**
 * 字体槽位守卫（ADR-0025）——字体关注点独立测试文件（decoration-family 先例）。
 *
 * 两件套（槽键集语义由 REQUIRED(fonts) + define-skin.test.mjs 校验矩阵构造
 * 保证，不在此重复——共识第 7 条「三件套」的落地等价式，评审归档）：
 *   层级守卫（强形式）  三皮 tokenOverrides 中 font 系键 ⊆ Object.values(FONT_TOKENS)
 *                     ——皮肤永不直打 alias（--dsw-font-family /
 *                     --ds-font-family-code）：alias 直写以 body 内联恒胜样式表，
 *                     压制宿主用户字体偏好链（--dsh-font-family-text/code，
 *                     取证与裁定史见 docs/adr/0025-font-slots-and-host-tracking.md）。
 *   发射门 golden      三皮出厂态 fonts 全 null ⇒ 每皮 font 系键集合为空集
 *                     （逐皮断言，非交集/并集形态——交集对「单皮发射、他皮零」
 *                     假绿，评审 R-15）。宿主跟随证明。
 *
 * FONT_TOKENS 从 define-skin.js import 单源（BUBBLE_HOOKS 先例）；ANCHORS 与
 * translucency-contract 的 GOLD.anchor 同源照抄（跨测试文件不 import 测试件）。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FONT_TOKENS } from "../src/client/skins/define-skin.js";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";

const FACTORIES = {
  openbmc: () => createOpenBmcHarness({ jsx: () => null }),
  uefi: () => createUefiHarness({ jsx: () => null }),
  meirenzhi: () => createMeirenzhiSkin({ jsx: () => null }),
};
const ANCHORS = { openbmc: 55, uefi: 55, meirenzhi: 35 };

const projectAnchor = (id) => {
  const skin = FACTORIES[id]();
  return skin.project({ panelOpacity: ANCHORS[id], slogan: { zh: "t", en: "t" } }, null);
};
const fontKeysOf = (fx) => Object.keys(fx.tokenOverrides).filter((key) => /font/i.test(key));

for (const id of Object.keys(FACTORIES)) {
  test(`layer guard (strong form): ${id} font emission keys are default-layer tokens only (ADR-0025)`, () => {
    const allowed = Object.values(FONT_TOKENS);
    for (const key of fontKeysOf(projectAnchor(id))) {
      assert.ok(allowed.includes(key), `${id}: ${key} is not a default-layer font token — alias-level emission is forbidden (ADR-0025)`);
    }
  });

  test(`emission golden: ${id} factory state (fonts all null) emits zero font keys`, () => {
    assert.deepEqual(fontKeysOf(projectAnchor(id)), [], `${id}: host-tracking skins must emit zero font tokens`);
  });
}
