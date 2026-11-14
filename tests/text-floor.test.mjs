/**
 * 文字地板钳制语义 + riding 三元形状契约（ADR-0027 Task 4）。
 * 独立重实现 mini 期望推导（判据四律④：期望值手推，被测对象 = src 真函数）；
 * 头注纪律同 translucency-contract GOLD 先例。
 * ⑤ official 豁免：单元层只断言「无 riding 条目即无钳制面」；official 态的注册
 * 序/释放行为由 smoke-test.cjs 的 official 切换断言（:428-431 区段）集成覆盖，
 * 本文件不重复造注册序断言（计划 Task 4 步骤 1⑤）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjection } from "../src/client/skins/translucency.js";
import { defineSkin } from "../src/client/skins/define-skin.js";

// mini 独立重实现：期望 alpha 百分点推导（两位小数格式规则 ADR-0004:16）
const miniPt = (P, anchor, baked) => Math.min(100, Math.max(0, P + baked - anchor));
const miniAlpha = (rgb, P, anchor, baked, floor = 0) =>
  `rgba(${rgb}, ${(Math.max(miniPt(P, anchor, baked), floor) / 100).toFixed(2)})`;

function tableWith(riding, anchor = 35) {
  return {
    anchor,
    riding,
    bodyAttribute: "dshTestSkin",
    scrim: { kind: "overlay", coefficient: 30, light: "252, 250, 246", dark: "16, 16, 26" },
    blur: { max: 12 },
    glassVar: "--test-glass",
    desktopBlur: { rate: 55, dark: "boost" },
    wallpaper: { kind: "assets" },
  };
}
const projectAt = (riding, P, anchor = 35) => {
  const project = createProjection(tableWith(riding, anchor));
  return project({ panelOpacity: P }, null).tokenOverrides;
};

const BASE = { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 52] };
const KEY = "--dsw-specific-sidebar-fill";

test("① floor 缺省（二元）行为与 mini 重实现逐字节一致", () => {
  for (const P of [0, 5, 35, 66, 100]) {
    const overrides = projectAt({ [KEY]: BASE }, P);
    assert.equal(overrides[KEY].light, miniAlpha("250, 249, 246", P, 35, 40));
    assert.equal(overrides[KEY].dark, miniAlpha("18, 18, 26", P, 35, 52));
  }
});

test("①b floor 显式 0 与二元输出逐字节相等（缺省 = 现行为不变）", () => {
  const two = projectAt({ [KEY]: BASE }, 0)[KEY].light;
  const three = projectAt({ [KEY]: { light: [...BASE.light, 0], dark: BASE.dark } }, 0)[KEY].light;
  assert.equal(three, two);
});

test("② P=0 时 floor 生效（0.05 被抬到 floor）", () => {
  const overrides = projectAt({ [KEY]: { light: ["250, 249, 246", 40, 60], dark: BASE.dark } }, 0);
  assert.equal(overrides[KEY].light, miniAlpha("250, 249, 246", 0, 35, 40, 60));
  assert.equal(overrides[KEY].light, "rgba(250, 249, 246, 0.60)");
});

test("③ 锚点处 floor>baked 时输出 = floor", () => {
  const overrides = projectAt({ [KEY]: { light: ["250, 249, 246", 40, 60], dark: BASE.dark } }, 35);
  assert.equal(overrides[KEY].light, "rgba(250, 249, 246, 0.60)");
});

test("④ P=100 恒 1.00，不被 floor 削也不被 floor 外推", () => {
  const overrides = projectAt({ [KEY]: { light: ["250, 249, 246", 40, 60], dark: BASE.dark } }, 100);
  assert.equal(overrides[KEY].light, "rgba(250, 249, 246, 1.00)");
});

test("⑤ 无 riding 条目即无钳制面（official 态由构造豁免的单元面）", () => {
  const overrides = projectAt({}, 0);
  assert.equal(Object.keys(overrides).length, 0);
  // 集成层：official 切换/释放行为由 smoke-test.cjs official 断言覆盖（头注）。
});

test("⑥ 形状矩阵：floor 非数值/负数/>100/小数 → throw；二元合法不变", () => {
  const cases = [
    ["250, 249, 246", 40, "60"], // 非数值
    ["250, 249, 246", 40, -5], // 负数
    ["250, 249, 246", 40, 120], // >100
    ["250, 249, 246", 40, 60.5], // 小数
  ];
  for (const entry of cases) {
    assert.throws(
      () => defineSkin(minSpecWith({ [KEY]: { light: entry, dark: BASE.dark } })),
      /floor must be an integer 0-100/,
      `case ${JSON.stringify(entry)}`,
    );
  }
  // 二元仍合法
  assert.doesNotThrow(() => defineSkin(minSpecWith({ [KEY]: BASE })));
});

test("⑦ 通道禁令：第三元仅允许 sidebar-fill / input-major 两键", () => {
  assert.throws(
    () => defineSkin(minSpecWith({ "--dsw-alias-bg-base": { light: ["250, 249, 246", 35, 50], dark: ["18, 18, 26", 35] } })),
    /floor \(third element\) is only allowed/,
  );
  assert.throws(
    () => defineSkin(minSpecWith({ "--dsw-specific-login-input": { light: ["255, 255, 255", 60, 70], dark: ["18, 42, 60", 65] } })),
    /floor \(third element\) is only allowed/,
  );
});

test("⑦b 增量帽：sidebar-fill floor > baked+25 → throw；= baked+25 合法", () => {
  assert.throws(
    () => defineSkin(minSpecWith({ [KEY]: { light: ["250, 249, 246", 40, 66], dark: BASE.dark } })),
    /exceeds baked\+25 cap/,
  );
  assert.doesNotThrow(() => defineSkin(minSpecWith({ [KEY]: { light: ["250, 249, 246", 40, 65], dark: BASE.dark } })));
});

test("⑦c input-major 豁免帽：floor 至 100 合法", () => {
  assert.doesNotThrow(() => defineSkin(minSpecWith({
    "--dsw-specific-input-major": { light: ["250, 249, 246", 40, 100], dark: ["18, 18, 26", 45] },
  })));
});

// —— minSpec 组装（与 tests/define-skin.test.mjs 同形，本文件自持）——
function minSpecWith(riding) {
  return {
    id: "testskin",
    label: "Test Skin",
    description: { zh: "测试皮", en: "Test Skin" },
    titleBrand: "Test Studio",
    favicon: { href: "data:image/svg+xml,%3Csvg%3E", mime: "image/svg+xml" },
    anchor: 35,
    bodyAttribute: "dshTestSkin",
    riding,
    constantTokens: null,
    fonts: { text: null, code: null },
    scrim: { kind: "overlay", coefficient: 30, light: "252, 250, 246", dark: "16, 16, 26" },
    blur: { max: 12 },
    glassVar: "--dsh-test-glass-blur",
    desktopBlur: { dark: "boost" },
    wallpaper: { kind: "assets" },
    builtinAssets: {},
    decoration: { light: "184, 67, 63", dark: "229, 138, 128" },
    streaming: { decay: "217, 180, 92" },
    badge: null,
    tints: {
      frost: { light: "250, 249, 246", dark: "18, 18, 26" },
      menu: { light: "250, 249, 246", dark: "18, 18, 26" },
    },
    cssSegments: ["decoration", "streaming", "rootclear", "frost"],
    Mark: function TestMark() { return null; },
    Name: function TestName() { return null; },
  };
}
