/**
 * 皮肤声明表工厂（ADR-0019）——三皮声明的表骨架、派生与收尾单源。
 *
 * 规格三层（ADR-0019 Decision 2）：
 *   直传  id/label/description/titleBrand/favicon{href,mime}/anchor/bodyAttribute/
 *         riding/constantTokens(可 null)/scrim(overlay|baked-gradient 原样)/blur/
 *         glassVar/desktopBlur{dark}/wallpaper{kind,placeholder?}/builtinAssets/
 *         decoration/streaming/可选 badge/tints/Mark/Name；
 *   派生  SCOPE←bodyAttribute（camelCase→data-kebab，与投影核 glassRule 同律）；
 *         scrim.artLayer＋builtinAssets.art←backgroundArt{mime,url}；
 *         wallpaper.sentinel＝`builtin:<id>:art`（仅 legacy-baked 且有 backgroundArt）；
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

const REQUIRED = [
  "id", "label", "description", "titleBrand", "favicon", "anchor", "bodyAttribute",
  "riding", "scrim", "blur", "glassVar", "desktopBlur", "wallpaper", "tints",
  "cssSegments", "Mark", "Name",
];
const OPTIONAL = ["constantTokens", "builtinAssets", "backgroundArt", "decoration", "streaming", "badge"];
const KNOWN_KEYS = new Set([...REQUIRED, ...OPTIONAL]);

const SEGMENT_NAMES = new Set(["badge", "decoration", "streaming", "rootclear", "frost"]);
const BARE_IDENTIFIER = /^[a-z][a-z0-9-]*$/;

const kebabAttr = (bodyAttribute) =>
  bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const scopeOf = (bodyAttribute) => `body[data-${kebabAttr(bodyAttribute)}]`;

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

export function defineSkin(spec) {
  for (const key of Object.keys(spec)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown spec key: ${key}`);
  }
  for (const key of REQUIRED) {
    if (spec[key] === undefined) throw new Error(`Missing required spec field: ${key}`);
  }

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
  const table = {
    bodyAttribute: spec.bodyAttribute,
    titleBrand: spec.titleBrand,
    favicon: spec.favicon,
    anchor: spec.anchor,
    riding: spec.riding,
    constantTokens: spec.constantTokens ?? null,
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
