/**
 * defineSkin 工厂 schema 钉（ADR-0019 Task 2）：fail-closed 校验（未知规格键 /
 * 缺必填 / 未知段名 / 段参数缺失 / 非数组与非字符串段项）、三类派生（SCOPE /
 * artLayer+sentinel / builtinAssets 合成）、desktopBlur.rate 默认 55、恰好七字段
 * 返回面与 label 原样过缝。规格三层语义见 ADR-0019 Decision 2–4 与实施计划
 * 「架构快照」。末节为跨皮一致性钉（产物评审 Q3 主人裁量落地）：各皮
 * cssSegments 裸串段内嵌的作用域字面量须与 bodyAttribute 派生值一致——
 * 测试侧独立重推 kebab（对齐 translucency-contract 的独立基线风格）。
 * 字体槽位派生钉组（ADR-0025）：default 层发射、三态值、fail-closed 校验。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { defineSkin, FONT_TOKENS } from "../src/client/skins/define-skin.js";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";

/** 最小合法规格（overlay 分支、无 backgroundArt——MRZ 形态）。 */
function minSpec(overrides = {}) {
  return {
    id: "testskin",
    label: "Test Skin",
    description: { zh: "测试皮", en: "Test Skin" },
    titleBrand: "Test Studio",
    favicon: { href: "data:image/svg+xml,%3Csvg%3E", mime: "image/svg+xml" },
    anchor: 35,
    bodyAttribute: "dshTestSkin",
    riding: {
      "--dsw-alias-bg-base": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 35] },
    },
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
    ...overrides,
  };
}

// ===== 字体槽位派生（ADR-0025）：default 层发射、三态值、fail-closed 校验 =====

const project35 = (skin) => skin.project({ panelOpacity: 35, slogan: { zh: "t", en: "t" } }, null);
const fontKeysOf = (fx) => Object.keys(fx.tokenOverrides).filter((key) => /font/i.test(key));

test("fonts: null slots emit no font tokens (host-tracking)", () => {
  const fx = project35(defineSkin(minSpec()));
  assert.deepEqual(fontKeysOf(fx), [], "null slots = host-tracking, zero emission");
});

test("fonts: string value fans out to { light, dark } at the default-layer token", () => {
  const fx = project35(defineSkin(minSpec({ fonts: { text: '"LXGW WenKai", sans-serif', code: null } })));
  assert.deepEqual(fx.tokenOverrides[FONT_TOKENS.text], { light: '"LXGW WenKai", sans-serif', dark: '"LXGW WenKai", sans-serif' });
});

test("fonts: { light, dark } object is emitted verbatim", () => {
  const fx = project35(defineSkin(minSpec({ fonts: { text: null, code: { light: "Mono A", dark: "Mono B" } } })));
  assert.deepEqual(fx.tokenOverrides[FONT_TOKENS.code], { light: "Mono A", dark: "Mono B" });
});

test("fonts: derivation merges with constantTokens; the spec's own object is not mutated", () => {
  const constantTokens = { "--dsw-alias-brand-primary": { light: "#111111", dark: "#222222" } };
  const spec = minSpec({ constantTokens, fonts: { text: '"X", sans-serif', code: null } });
  const fx = project35(defineSkin(spec));
  assert.deepEqual(fx.tokenOverrides[FONT_TOKENS.text], { light: '"X", sans-serif', dark: '"X", sans-serif' });
  assert.deepEqual(fx.tokenOverrides["--dsw-alias-brand-primary"], { light: "#111111", dark: "#222222" });
  assert.deepEqual(Object.keys(constantTokens), ["--dsw-alias-brand-primary"], "spec.constantTokens untouched");
});

test("fonts: fail-closed matrix (ADR-0025 deriveFonts contract)", () => {
  const valueCases = [
    [{ text: "" }, /value must be null/],
    [{ brand: null }, /Unknown font slot/],
    [{ text: { light: "a" } }, /value must be null/],
    [{ text: { light: "a", dark: "b", extra: "c" } }, /value must be null/],
    [{ text: 42 }, /value must be null/],
    [{ text: ["a"] }, /value must be null/],
  ];
  for (const [fonts, pattern] of valueCases) {
    assert.throws(() => defineSkin(minSpec({ fonts })), pattern, `case ${JSON.stringify(fonts)}`);
  }
  assert.throws(() => defineSkin(minSpec({ fonts: null })), /must be an object/);
  assert.throws(() => defineSkin(minSpec({ fonts: "text" })), /must be an object/);
  assert.throws(() => defineSkin(minSpec({ fonts: ["text"] })), /must be an object/);
});

test("unknown top-level spec key throws (fail-closed)", () => {
  assert.throws(() => defineSkin(minSpec({ stray: 1 })), /Unknown spec key/);
});

test("missing required spec fields throw", () => {
  // 产物评审 Q5-①：REQUIRED 全键逐个参数化（数组漂移即有钉可拦）。
  const required = [
    "id", "label", "description", "titleBrand", "favicon", "anchor", "bodyAttribute",
    "riding", "fonts", "scrim", "blur", "glassVar", "desktopBlur", "wallpaper", "tints",
    "cssSegments", "Mark", "Name",
  ];
  for (const key of required) {
    const spec = minSpec();
    delete spec[key];
    assert.throws(() => defineSkin(spec), new RegExp(`Missing required.*${key}|${key}.*Missing required`), `missing ${key}`);
  }
});

test("cssSegments rejects non-array and non-string items (fail-closed)", () => {
  assert.throws(() => defineSkin(minSpec({ cssSegments: "frost" })), /cssSegments must be an array/);
  assert.throws(() => defineSkin(minSpec({ cssSegments: ["decoration", null] })), /Invalid segment item/);
  assert.throws(() => defineSkin(minSpec({ cssSegments: ["decoration", 42] })), /Invalid segment item/);
});

test("unknown cssSegments name throws", () => {
  assert.throws(() => defineSkin(minSpec({ cssSegments: ["decoration", "nonsense"] })), /Unknown segment/);
});

test("named segment without its spec param throws", () => {
  assert.throws(() => defineSkin(minSpec({ cssSegments: ["badge"] })), /Missing segment param/);
  const noDecoration = minSpec();
  delete noDecoration.decoration;
  assert.throws(() => defineSkin(noDecoration), /Missing segment param/);
});

test("SCOPE derived from bodyAttribute (camelCase → data-kebab)", () => {
  const skin = defineSkin(minSpec({ bodyAttribute: "dshOpenbmcSkin", cssSegments: ["rootclear"] }));
  const css = skin.project({ panelOpacity: 35, slogan: { zh: "t", en: "t" } }, null).staticCss;
  assert.ok(css.includes("body[data-dsh-openbmc-skin]"), "expanded segment targets the derived scope");
});

test("backgroundArt derives artLayer + builtinAssets.art + sentinel (legacy-baked)", () => {
  const spec = minSpec({
    scrim: {
      kind: "baked-gradient",
      stops: { light: [["250, 249, 246", 15], ["240, 246, 250", 28]], dark: [["7, 14, 22", 10], ["4, 9, 14", 24]] },
    },
    wallpaper: { kind: "legacy-baked", placeholder: null },
    backgroundArt: { mime: "image/webp", url: "data:image/webp;base64,QUFB" },
  });
  const skin = defineSkin(spec);
  assert.deepEqual(skin.builtinAssets.art, { mime: "image/webp", url: "data:image/webp;base64,QUFB" });
  const fx = skin.project({ panelOpacity: 55, slogan: { zh: "t", en: "t" } }, null);
  assert.ok(fx.backdrop.imageLight.endsWith(", url(data:image/webp;base64,QUFB)"), "artLayer rides the scrim image");
});

test("assets-kind wallpaper derives no sentinel and no art key (MRZ semantics)", () => {
  const skin = defineSkin(minSpec());
  assert.equal("art" in skin.builtinAssets, false);
  const fx = skin.project({ panelOpacity: 35, slogan: { zh: "t", en: "t" } }, null);
  // 口径注（产物评审 Q4）：sentinel 派生（builtin:<id>:art）不可经公共缝行为
  // 观测——resolveImageRef 对一切 builtin: 形串恒判 kind="builtin"
  // （catalog.js:226–229），translucency.js:70–71 的自定义图判定被
  // kind==="user" 短路，故本钉只守「不泄漏进 effects」；派生正确性由
  // 源码人工核证（产物评审 R2 台账：与旧字面量逐字同）。
  assert.ok(!("sentinel" in fx), "sentinel never leaks into effects");
});

test("builtinAssets merge order: derived art first, then spec keys in literal order", () => {
  const spec = minSpec({
    scrim: {
      kind: "baked-gradient",
      stops: { light: [["1, 1, 1", 10], ["2, 2, 2", 20]], dark: [["3, 3, 3", 10], ["4, 4, 4", 20]] },
    },
    wallpaper: { kind: "legacy-baked", placeholder: null },
    backgroundArt: { mime: "image/webp", url: "data:image/webp;base64,QUFB" },
    builtinAssets: { zebra: { mime: "image/png", url: "data:zebra" }, alpha: { mime: "image/png", url: "data:alpha" } },
  });
  const skin = defineSkin(spec);
  assert.deepEqual(Object.keys(skin.builtinAssets), ["art", "zebra", "alpha"]);
});

test("desktopBlur.rate defaults to 55", () => {
  const skin = defineSkin(minSpec());
  const fx = skin.project({ panelOpacity: 100, slogan: { zh: "t", en: "t" } }, null);
  // rate=55 ⇒ boosted = min(24, blurPx + 100/55)；用对照：rate 若为其他值则数值不同。
  const boosted = fx.backdrop.desktopBlur.light;
  const blurPx = fx.backdrop.blur;
  assert.equal(boosted, Math.min(24, blurPx + 100 / 55));
});

test("production face is exactly seven fields (factory return order pinned)", () => {
  const skin = defineSkin(minSpec());
  // 产物评审 Q5-②：键序钉（工厂返回字面序），非集合钉。
  assert.deepEqual(
    Object.keys(skin),
    ["id", "label", "description", "Mark", "Name", "project", "builtinAssets"],
  );
});

test("label passes through both legal types untouched", () => {
  assert.equal(defineSkin(minSpec()).label, "Test Skin");
  const bilingual = defineSkin(minSpec({ label: { zh: "美人志", en: "Meirenzhi" } })).label;
  assert.deepEqual(bilingual, { zh: "美人志", en: "Meirenzhi" });
});

test("all scope literals in each skin's staticCss match the bodyAttribute derivation (Q3 pin)", () => {
  // 产物评审 Q3 主人裁量落地：全等门退役后，cssSegments 裸串段内嵌的作用域
  // 字面量（如 meirenzhi 氛围规则引用的 SCOPE 常量）与工厂派生值的一致性
  // 由本钉看守。测试侧独立重推 kebab 派生（不 import 工厂实现），对齐
  // translucency-contract 的独立基线风格。
  const kebab = (bodyAttribute) =>
    bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const factories = {
    openbmc: () => createOpenBmcHarness({ jsx: () => null }),
    "uefi-harness": () => createUefiHarness({ jsx: () => null }),
    meirenzhi: () => createMeirenzhiSkin({ jsx: () => null }),
  };
  for (const [id, factory] of Object.entries(factories)) {
    const skin = factory();
    const fx = skin.project({ panelOpacity: 50, slogan: { zh: "t", en: "t" } }, null);
    const expected = `body[data-${kebab(fx.bodyAttribute)}]`;
    const found = fx.staticCss.match(/body\[data-dsh-[a-z0-9-]+\]/g) ?? [];
    assert.ok(found.length >= 1, `${id}: pin is non-vacuous (at least one scope literal)`);
    for (const literal of found) {
      assert.equal(literal, expected, `${id}: scope literal must match the derived scope`);
    }
  }
});

// ADR-0027 Task 4：riding 三元变体（floor）——缺省二元仍合法；三元仅在
// sidebar-fill / input-major 两键合法且过 +25 帽/整数校验（细矩阵见
// tests/text-floor.test.mjs，此处钉 minSpec 形态下的载入合法性）。
test("riding 三元变体：sidebar-fill 合法 floor 载入 + 仍过 minSpec 全链", () => {
  const fx = defineSkin(minSpec({
    riding: {
      "--dsw-alias-bg-base": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 35] },
      "--dsw-specific-sidebar-fill": { light: ["250, 249, 246", 40, 60], dark: ["18, 18, 26", 52] },
    },
  }));
  assert.equal(typeof fx.project, "function");
});

test("riding 三元变体：二元缺省仍合法（现行为不变）", () => {
  assert.doesNotThrow(() => defineSkin(minSpec()));
});
