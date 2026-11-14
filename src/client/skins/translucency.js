/**
 * 通透度投影核（ADR-0013）——三皮统一的投影机制，与 frost-family.js 同位
 * 同 doctrine：机制住共享模块，色值/品牌资源由各皮肤声明表自持。
 *
 * 出厂锚（GLOSSARY）：单一具名常量同时驱动随动重基线与模糊铰链——
 *   riding α   = clamp(P + baked − anchor, 0, 100) / 100   （两位小数）
 *   blur       = round(max·max(0,(P − anchor)/(100 − anchor))²)（锚点恒 0）
 * 桌面模糊增益率（P/rate，钳 24）与出厂锚是两个概念，绝不共用参数。
 * values.panelOpacity 的定义域 [0,100] 由字段目录的 range 校验保证
 * （mergeValues → validateOverride，越界回落默认值）；riding α 与 overlay
 * 纱 t 在各自公式内做钳位，blur 曲线不重复钳 P——越界输入不在支持范围。
 * 投影不感知 profile：Desktop 出厂 66 属字段目录的默认层，只经 values
 * 进入；本模块永远不知道自己跑在哪个 profile 上。
 *
 * riding 全走 tokenOverrides 单通道（ADR-0017）：ThemePresenter 以 body
 * 内联 style 落值、恒胜样式表，静态 riding 声明已随 ADR-0004 锚点字节
 * 不变式一并收档——CSS 模板不持任何 P 相关值。
 */
import { resolveImageRef } from "../../shared/personalization/catalog.js";

/** 玻璃规则单行（camelCase body 属性 → data-kebab 作用域）。 */
export function glassRule(bodyAttribute, glassVar) {
  const attr = bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `body[data-${attr}] [id="root"]{backdrop-filter:blur(var(${glassVar},0px))}`;
}

/**
 * 以皮肤声明表产出完整投影函数 project(values, assets) → SkinEffects 草稿
 * （形状经 projector.js 的 normalizeEffects 校验冻结）。表形状见
 * ADR-0013 与实施计划「架构快照」。
 */
export function createProjection(table) {
  const { anchor, riding, scrim, blur, glassVar, desktopBlur, wallpaper } = table;

  return function project(values, assets) {
    const P = values.panelOpacity;
    const pct = (points) => (points / 100).toFixed(2);
    const pt = (baked) => Math.min(100, Math.max(0, P + baked - anchor));
    // 地板钳制（ADR-0027 D1）：alpha = max(pt(baked), floor)；floor 缺省 0 →
    // max(pt, 0) ≡ pt，二元条目行为逐字节不变。
    const alpha = (rgb, baked, floor = 0) => `rgba(${rgb}, ${pct(Math.max(pt(baked), floor))})`;

    const tokenOverrides = { ...(table.constantTokens ?? {}) };
    for (const [key, modes] of Object.entries(riding)) {
      tokenOverrides[key] = {
        light: alpha(modes.light[0], modes.light[1], modes.light[2] ?? 0),
        dark: alpha(modes.dark[0], modes.dark[1], modes.dark[2] ?? 0),
      };
    }

    let imageLight;
    let imageDark;
    let overlayLight = null;
    let overlayDark = null;
    if (scrim.kind === "overlay") {
      const t = Math.min(1, Math.max(0, P / 100));
      const s = (Math.round(scrim.coefficient * t * t) / 100).toFixed(3);
      overlayLight = `linear-gradient(rgba(${scrim.light}, ${s}) 0%, rgba(${scrim.light}, ${s}) 100%)`;
      overlayDark = `linear-gradient(rgba(${scrim.dark}, ${s}) 0%, rgba(${scrim.dark}, ${s}) 100%)`;
      const url = assets?.wallpaper?.url ?? null;
      imageLight = url === null ? null : `url("${url}")`;
      imageDark = url === null ? null : `url("${url}")`;
    } else {
      const scrimLight = `linear-gradient(${alpha(scrim.stops.light[0][0], scrim.stops.light[0][1])} 0%, `
        + `${alpha(scrim.stops.light[1][0], scrim.stops.light[1][1])} 100%)` + scrim.artLayer;
      const scrimDark = `linear-gradient(${alpha(scrim.stops.dark[0][0], scrim.stops.dark[0][1])} 0%, `
        + `${alpha(scrim.stops.dark[1][0], scrim.stops.dark[1][1])} 100%)` + scrim.artLayer;
      if (wallpaper.kind === "legacy-baked") {
        // Legacy 壁纸语义（ADR-0004 起）：用户图走裸 url（纱不上用户图）；
        // 烘焙分支在空 art 下落入声明的占位兜底（未声明则仍用纱）。
        const url = assets?.wallpaper?.url ?? null;
        const custom = typeof values.wallpaper === "string" && values.wallpaper !== wallpaper.sentinel
          && resolveImageRef(values.wallpaper)?.kind === "user" && url !== null;
        imageLight = custom ? `url("${url}")`
          : (scrim.artLayer === "" ? (wallpaper.placeholder?.light ?? scrimLight) : scrimLight);
        imageDark = custom ? `url("${url}")`
          : (scrim.artLayer === "" ? (wallpaper.placeholder?.dark ?? scrimDark) : scrimDark);
      } else {
        const url = assets?.wallpaper?.url ?? null;
        imageLight = url === null ? scrimLight : `url("${url}")`;
        imageDark = url === null ? scrimDark : `url("${url}")`;
      }
    }

    const blurPx = Math.round(blur.max * Math.max(0, (P - anchor) / (100 - anchor)) ** 2);
    const boosted = Math.min(24, blurPx + P / desktopBlur.rate);
    const desktopBlurPair = desktopBlur.dark === "none"
      ? { light: boosted, dark: blurPx }
      : { light: boosted, dark: boosted };

    return {
      bodyAttribute: table.bodyAttribute,
      slogans: values.slogan,
      titleBrand: table.titleBrand,
      favicon: table.favicon,
      backdrop: { imageLight, imageDark, overlayLight, overlayDark, blur: blurPx, desktopBlur: desktopBlurPair },
      tokenOverrides,
      cssVariables: blurPx > 0 ? { [glassVar]: { light: `${blurPx}px`, dark: `${blurPx}px` } } : null,
      staticCss: blurPx > 0 ? table.staticCss + "\n" + glassRule(table.bodyAttribute, glassVar) : table.staticCss,
      decorations: null,
    };
  };
}
