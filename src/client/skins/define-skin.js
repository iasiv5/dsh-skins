/**
 * 皮肤声明表工厂（ADR-0019）——三皮声明的表骨架、派生与收尾单源。
 *
 * 规格三层（ADR-0019 Decision 2）：
 *   直传  id/label/description/titleBrand/favicon{href,mime}/anchor/bodyAttribute/
 *         riding/constantTokens(可 null)/fonts{必填：text|code 槽 → null|字符串|
 *         {light,dark}，ADR-0025}/scrim(overlay|baked-gradient 原样)/blur/
 *         glassVar/desktopBlur{dark}/wallpaper{kind,placeholder?}/builtinAssets/
 *         decoration/streaming/可选 badge/tints/Mark/Name；
 *   派生  SCOPE←bodyAttribute（camelCase→data-kebab，与投影核 glassRule 同律）；
 *         scrim.artLayer＋builtinAssets.art←backgroundArt{mime,url}；
 *         wallpaper.sentinel＝`builtin:<id>:art`（仅 legacy-baked 且有 backgroundArt）；
 *         constantTokens.font 系←fonts（ADR-0025：发射目标恒为宿主 default 层
 *         token，永不直打 alias——层级守卫 tests/font-slots.test.mjs 钉死）；
 *   默认  desktopBlur.rate＝55。
 *
 * cssSegments（Decision 3，2026-10-25 计划评审 P1 主人裁定 a）：有序段清单，
 * 段间无自动分隔——工厂恒等拼接（join("")）零插入，一切段间字节（换行、缩进、
 * 空行）连同注释由裸串段自持。项判别：badge|decoration|streaming|rootclear|frost
 * 五个保留名精确匹配即展开为装饰/家族调用；形如裸标识符（^[a-z][a-z0-9-]*$）
 * 的其他字符串一律 Unknown segment throw（拼写错误 fail-closed）；含 CSS 语法的
 * 字符串为裸串段原样透传（注释、keyframes 等必含语法字符，永不落入标识符形状）；
 * 非字符串项与非数组一律 throw（产物评审 Q5-③ 加固）。
 *
 * schema 校验中间档（Decision 4）：未知顶层规格键、缺必填、未知段名、段参数
 * 缺失均 throw；深层值形状不校验——分支知识留在投影核，防第二解释器。
 * 收尾（Decision 1）：产出 ADR-0014 恰好七字段生产对象，project 由
 * createProjection(builtTable) 供给；「规则唯一来源在 decoration.js」的归位
 * 注释以本头注释为唯一存活副本（ADR-0016 裁决史见 decoration.js 头注）。
 */
import { createProjection } from "./translucency.js";
import { badgeCss, decorationCss, streamingCss, rootClear } from "./decoration.js";
import { frostFamilyCss } from "./frost-family.js";

/** 字体槽位 → 宿主 default 层 token 的唯一映射（ADR-0025）：皮肤槽位发射
 * 目标恒为 default 层，永不直打 alias（--dsw-font-family / --ds-font-family-code
 * 由 tests/font-slots.test.mjs 层级守卫禁入）。 */
export const FONT_TOKENS = {
  text: "--dsh-font-family-text-default",
  code: "--dsh-font-family-code-default",
};

// 逐字拷贝自 runtime 0.2.1-rc.5 @deepseek-ai/dsh-client-ui-theme lib/client.js
// base_css_default 的 :root 块（--dsh-font-family-text-default / -code-default）；
// 漂移由 scripts/verify-upstream-hooks.mjs 字面量锚点（第 8 组）盯住（ADR-0025）。
// 用途：未来皮肤品牌字体前置复合 `'"X", ' + HOST_DEFAULT_TEXT`——default 层
// 殿后语义使宿主后续演进自动成为回退尾。
export const HOST_DEFAULT_TEXT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const HOST_DEFAULT_CODE = '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"';

const REQUIRED = [
  "id", "label", "description", "titleBrand", "favicon", "anchor", "bodyAttribute",
  "riding", "fonts", "scrim", "blur", "glassVar", "desktopBlur", "wallpaper", "tints",
  "cssSegments", "Mark", "Name",
];
const OPTIONAL = ["constantTokens", "builtinAssets", "backgroundArt", "decoration", "streaming", "badge"];
const KNOWN_KEYS = new Set([...REQUIRED, ...OPTIONAL]);

const SEGMENT_NAMES = new Set(["badge", "decoration", "streaming", "rootclear", "frost"]);
const BARE_IDENTIFIER = /^[a-z][a-z0-9-]*$/;

const kebabAttr = (bodyAttribute) =>
  bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const scopeOf = (bodyAttribute) => `body[data-${kebabAttr(bodyAttribute)}]`;

// 文字地板通道禁令与增量帽（ADR-0027 D1/D2，评审 R1-4/R2-3 收口）：floor 第三元
// 仅允许被钳两键；sidebar-fill 受 baked+25 增量帽约束，input-major 因「输入框
// 实体面」裁定豁免。钉进声明校验作单一解释点（帽/通道超界在工厂调用期 throw）。
const FLOOR_ALLOWED_KEYS = new Set(["--dsw-specific-sidebar-fill", "--dsw-specific-input-major"]);
const FLOOR_CAP_KEYS = new Set(["--dsw-specific-sidebar-fill"]);

function validateRiding(riding) {
  if (riding === null || typeof riding !== "object" || Array.isArray(riding)) {
    throw new Error("riding must be an object keyed by token");
  }
  for (const [key, modes] of Object.entries(riding)) {
    for (const mode of ["light", "dark"]) {
      const entry = modes?.[mode];
      if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) {
        throw new Error(`riding "${key}" ${mode}: entry must be [rgb, baked] or [rgb, baked, floor]`);
      }
      if (typeof entry[0] !== "string" || entry[0].trim() === "") {
        throw new Error(`riding "${key}" ${mode}: rgb must be a non-empty string`);
      }
      const baked = entry[1];
      if (typeof baked !== "number" || !Number.isInteger(baked) || baked < 0 || baked > 100) {
        throw new Error(`riding "${key}" ${mode}: baked must be an integer 0-100`);
      }
      if (entry.length === 3) {
        if (!FLOOR_ALLOWED_KEYS.has(key)) {
          throw new Error(`riding "${key}": floor (third element) is only allowed on --dsw-specific-sidebar-fill / --dsw-specific-input-major (ADR-0027 D1)`);
        }
        const floor = entry[2];
        if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 0 || floor > 100) {
          throw new Error(`riding "${key}" ${mode}: floor must be an integer 0-100`);
        }
        if (FLOOR_CAP_KEYS.has(key) && floor > baked + 25) {
          throw new Error(`riding "${key}" ${mode}: floor ${floor} exceeds baked+25 cap (${baked + 25}) (ADR-0027 D2)`);
        }
      }
    }
  }
}

function needSegmentParam(param, name) {
  if (param === undefined || param === null) {
    throw new Error(`Missing segment param: ${name}`);
  }
  return param;
}

function expandSegment(item, spec, scope) {
  if (!SEGMENT_NAMES.has(item)) {
    if (BARE_IDENTIFIER.test(item)) throw new Error(`Unknown segment: ${item}`);
    return item; // 裸串段：CSS 语法文本原样透传（含段间字节）。
  }
  switch (item) {
    case "badge": {
      const badge = needSegmentParam(spec.badge, item);
      return badgeCss(scope, badge.selector, badge.colors, badge.metrics);
    }
    case "decoration":
      return decorationCss(scope, needSegmentParam(spec.decoration, item));
    case "streaming":
      return streamingCss(scope, needSegmentParam(spec.streaming, item));
    case "rootclear":
      return rootClear(scope);
    case "frost":
      return frostFamilyCss(scope, needSegmentParam(spec.tints, item));
    default:
      throw new Error(`Unknown segment: ${item}`);
  }
}

function buildScrim(spec) {
  if (spec.scrim.kind === "overlay") return { ...spec.scrim };
  const artLayer = spec.backgroundArt ? `, url(${spec.backgroundArt.url})` : "";
  return { ...spec.scrim, artLayer };
}

function buildWallpaper(spec) {
  const wallpaper = { ...spec.wallpaper };
  if (wallpaper.kind === "legacy-baked" && spec.backgroundArt) {
    wallpaper.sentinel = `builtin:${spec.id}:art`;
  }
  return wallpaper;
}

/** 字体槽位值三态校验与派生（ADR-0025）：null=宿主跟随（不发射）；字符串=
 * 明暗同栈 fan-out；{light,dark}=逐字。未知槽/空串/畸形对象一律 throw。 */
function deriveFonts(fonts) {
  if (fonts === null || typeof fonts !== "object" || Array.isArray(fonts)) {
    throw new Error("fonts must be an object keyed by font slot");
  }
  const derived = {};
  for (const [slot, value] of Object.entries(fonts)) {
    if (!Object.hasOwn(FONT_TOKENS, slot)) throw new Error(`Unknown font slot: ${slot}`);
    const bad = `font slot "${slot}": value must be null, a non-empty string, or { light, dark }`;
    if (value === null) continue;
    if (typeof value === "string") {
      if (value === "") throw new Error(bad);
      derived[FONT_TOKENS[slot]] = { light: value, dark: value };
      continue;
    }
    const keys = typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    if (keys.length !== 2 || !keys.includes("light") || !keys.includes("dark")
      || typeof value.light !== "string" || value.light === ""
      || typeof value.dark !== "string" || value.dark === "") {
      throw new Error(bad);
    }
    derived[FONT_TOKENS[slot]] = { light: value.light, dark: value.dark };
  }
  return derived;
}

export function defineSkin(spec) {
  for (const key of Object.keys(spec)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown spec key: ${key}`);
  }
  for (const key of REQUIRED) {
    if (spec[key] === undefined) throw new Error(`Missing required spec field: ${key}`);
  }
  validateRiding(spec.riding);

  const scope = scopeOf(spec.bodyAttribute);
  if (!Array.isArray(spec.cssSegments)) throw new Error("cssSegments must be an array");
  const staticCss = spec.cssSegments.map((item) => {
    if (typeof item !== "string") throw new Error(`Invalid segment item: ${typeof item}`);
    return expandSegment(item, spec, scope);
  }).join("");
  const builtinAssets = Object.assign(
    {},
    spec.backgroundArt ? { art: { mime: spec.backgroundArt.mime, url: spec.backgroundArt.url } } : {},
    spec.builtinAssets ?? {},
  );
  // 字体派生并入常量族（ADR-0025）：spec.constantTokens 原对象不被改写；
  // 两者皆空保持 null（原语义），{} 归 null 对下游不可见（tokenOverrides 展开
  // 后同形）。
  const fontTokens = deriveFonts(spec.fonts);
  const constantBase = spec.constantTokens ?? {};
  const constantTokens = Object.keys(fontTokens).length > 0 || Object.keys(constantBase).length > 0
    ? { ...constantBase, ...fontTokens }
    : null;
  const table = {
    bodyAttribute: spec.bodyAttribute,
    titleBrand: spec.titleBrand,
    favicon: spec.favicon,
    anchor: spec.anchor,
    riding: spec.riding,
    constantTokens,
    scrim: buildScrim(spec),
    blur: spec.blur,
    glassVar: spec.glassVar,
    desktopBlur: { rate: spec.desktopBlur.rate ?? 55, dark: spec.desktopBlur.dark },
    wallpaper: buildWallpaper(spec),
    staticCss,
  };

  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    Mark: spec.Mark,
    Name: spec.Name,
    project: createProjection(table),
    builtinAssets,
  };
}
