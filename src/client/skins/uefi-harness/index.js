/**
 * UEFI Studio skin (id: uefi-harness).
 * It is intentionally self-contained and can be deleted without touching any
 * other skin. The mark and favicon carry the UEFI Forum's official red cube
 * logo (source and trademark note in README known limits); the rest of the
 * design remains a placeholder until the final design lands.
 *
 * ADR-0019：声明表脚手架（表骨架/段展开/收尾）住 ../define-skin.js，本皮肤
 * 只持规格数据与品牌 JSX；背景原画住 ./background-art.js（资产独居一文件）。
 */
import { BACKGROUND_ART } from "./background-art.js";
import { defineSkin } from "../define-skin.js";

// Official UEFI Forum logo — the red cube with white "uefi" letters, embedded
// as two vector paths traced from uefi.org's published uefi_logo_red.gif
// (retrieved via Wikimedia Commons "Logo of the UEFI Forum.svg"; trademark of
// the UEFI Forum, used here solely to identify the UEFI Studio skin).
const LOGO_VIEWBOX = "0 0 367.92 424.8";
const LOGO_WHITE =
  "M183.505 7.5l12.515.016 59.87 34.233.632 13.683 23.938.38L339.524 89.6l16.386 30.31 5.136 192.808L349.92 329.3l-56.88 32.657-19.564-1.81-13.315 20.69-56.41 32.404-89.687-32.764L4.375 312.71 7.5 109.59z";
const LOGO_RED =
  "M182.88 0l13.14 7.516-86.427 50.52S83.443 71.21 74.16 81.362c-11.362 12.428-7.917 30.125 2.16 42.48 24.693 30.28 88.66 54.367 141.12 34.56C239.666 150.01 339.524 89.6 339.524 89.6l28.397 16.243v213.12l-18 10.337V207.36l-56.88 32.66v121.937l-32.88 18.88V311.04l20.28-12.24v-51.543l-20.28 11.646s-2.37-32.09 1.92-42.902c4.1-10.31 15.74-21.72 25.2-18.72 6.95 2.21 5.76 24.95 5.76 24.95s42.95-24.85 56.88-32.86c2.25-36.34-9.13-59-43.92-55.44-15.87 1.63-28.37 10.02-38.88 17.28-11.14 7.7-20.4 16.555-28.8 26.64-15.89 19.1-33.02 45.26-35.28 76.32-1.77 24.357.71 159.07.71 159.07L183.6 424.8 0 318.96V105.84L182.88 0zM115.2 167.04c-13.318-10.95-29.718-21.208-47.52-25.2-11.942-2.678-23.93-1.128-32.4 3.6-22.328 12.466-28.844 45.437-26.64 77.76 3.508 51.445 22.065 86.146 48.96 113.04 17.977 17.977 47.576 39.66 74.16 41.76 27.702 2.187 36.335-16.023 42.48-36.72-20.956-14.324-44.265-26.296-65.52-40.32-3.91 2.99-3.572 6.328-9.36 6.48-5.15.135-10.955-4.727-14.4-9.36-6.09-8.19-8.026-21.054-8.64-30.96 33.78 18.062 66.363 37.317 100.08 55.44 3.688-67.27-23.104-124.2-61.2-155.52zM280.46 55.813l-85.795 52.732s-22.85 14.813-38.136 13.134c-4.99-.55-13.31-4.77-13.68-8.64-.7-7.16 25.2-21.02 25.2-21.02l87.84-50.27L280.46 55.8zM109.44 241.2c-11.23-5.81-21.966-12.114-32.4-18.72 1.032-7.922 2.438-15.645 12.24-13.68 11.49 2.303 19.817 20.686 20.16 32.4z";

const faviconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + LOGO_VIEWBOX + '">' +
  '<path fill="#FFFFFF" d="' + LOGO_WHITE + '"/>' +
  '<path fill="#DC0000" d="' + LOGO_RED + '"/></svg>';
const favicon = "data:image/svg+xml," + encodeURIComponent(faviconSvg);

// 浮层毛玻璃家族 tint（ADR-0012）：家族配方与选择器并集住在 frost-family.js，
// 本皮肤只自持色值。menu 明与 frost 明同值、暗异（逐字取自下方 token 块现行读数）。
const TINTS = {
  frost: { light: "248, 247, 255", dark: "23, 18, 45" },
  menu: { light: "248, 247, 255", dark: "28, 22, 55" },
};

/**
 * 投影声明表规格（ADR-0013 机制 + ADR-0019 工厂收拢）：机制住
 * ../translucency.js，骨架/派生/收尾住 ../define-skin.js，本皮肤只持参数。
 * 出厂锚 55：随动重基线与模糊铰链共用；desktop 出厂 66 属 catalog 默认层，
 * 投影不感知 profile。
 */
const SPEC = {
  id: "uefi-harness",
  label: "UEFI Studio",
  description: {
    zh: "紫电初醒 · 流霞渐染 · 绀青成韵",
    en: "Violet spark · gilded backdrop · violet-blue palette",
  },
  titleBrand: "UEFI Studio",
  favicon: { href: favicon, mime: "image/svg+xml" },
  anchor: 55,
  bodyAttribute: "dshUefiHarness",
  // 随动族（ADR-0013）：值即出厂锚点 55 处的烘焙读数，全走 tokenOverrides
  // （ADR-0017：模板不持 P 相关值）。
  riding: {
    "--dsw-alias-bg-base": { light: ["248, 247, 255", 55], dark: ["23, 18, 45", 55] },
    "--dsw-alias-bg-module-platform": { light: ["241, 238, 255", 55], dark: ["39, 31, 73", 60] },
    "--dsw-alias-bg-layer-1": { light: ["255, 255, 255", 48], dark: ["31, 25, 59", 55] },
    "--dsw-alias-bg-layer-2": { light: ["247, 245, 255", 56], dark: ["39, 31, 73", 60] },
    "--dsw-alias-bg-layer-3": { light: ["241, 238, 255", 62], dark: ["48, 38, 88", 64] },
    "--dsw-specific-sidebar-fill": { light: ["238, 235, 255", 60], dark: ["25, 20, 48", 72] },
    "--dsw-specific-input-major": { light: ["255, 255, 255", 62], dark: ["42, 34, 78", 55] },
  },
  // 常量族（ADR-0016 C1：原 css 模板手写行逐字迁入；等式钉在
  // tests/translucency-contract.test.mjs「uefi C1」）。
  constantTokens: {
    "--dsw-alias-brand-primary": { light: "#6553d8", dark: "#a99cff" },
    "--dsw-alias-brand-primary-invert": { light: "#ffffff", dark: "#1b143a" },
    "--dsw-alias-brand-text": { light: "#5846c2", dark: "#b7acff" },
    "--dsw-alias-bg-overlay": { light: "rgba(252, 251, 255, 0.82)", dark: "rgba(27, 21, 54, 0.88)" },
    "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(101, 83, 216, 0.09)", dark: "rgba(169, 156, 255, 0.10)" },
    "--dsw-specific-sidebar-nav-item-active": { light: "rgba(101, 83, 216, 0.15)", dark: "rgba(169, 156, 255, 0.17)" },
    "--dsw-specific-sidebar-nav-item-active-accent": { light: "#8b7cff", dark: "#6657a8" },
    "--dsw-specific-selector": { light: "rgba(232, 228, 255, 0.78)", dark: "rgba(51, 40, 96, 0.78)" },
    "--dsw-specific-tip": { light: "rgba(244, 242, 255, 0.88)", dark: "rgba(34, 27, 65, 0.90)" },
    "--dsw-alias-label-primary": { light: "#211c36", dark: "#f0edff" },
    "--dsw-alias-label-secondary": { light: "#554d74", dark: "#b9b1d6" },
    "--dsw-alias-label-dimmed": { light: "#81799e", dark: "#827a9f" },
    "--dsw-alias-interactive-bg-hover": { light: "rgba(101, 83, 216, 0.09)", dark: "rgba(169, 156, 255, 0.11)" },
    "--dsw-alias-interactive-bg-active": { light: "rgba(101, 83, 216, 0.15)", dark: "rgba(169, 156, 255, 0.18)" },
    "--dsw-specific-bubble": { light: "rgba(101, 83, 216, 0.11)", dark: "rgba(60, 48, 108, 0.90)" },
    "--dsw-specific-bubble-highlight": { light: "rgba(101, 83, 216, 0.18)", dark: "rgba(78, 63, 138, 0.92)" },
    "--dsw-font-family": {
      light: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      dark: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    },
  },
  scrim: {
    kind: "baked-gradient",
    stops: {
      light: [["248, 247, 255", 10], ["238, 234, 255", 22]],
      dark: [["23, 18, 45", 8], ["16, 12, 34", 20]],
    },
  },
  blur: { max: 24 },
  glassVar: "--dsh-uefi-glass-blur",
  desktopBlur: { dark: "boost" },
  wallpaper: {
    kind: "legacy-baked",
    placeholder: null,
  },
  backgroundArt: { mime: "image/webp", url: BACKGROUND_ART },
  builtinAssets: {}, // art 由工厂自 backgroundArt 派生（ADR-0014 B15 显式声明语义不变）
  // 用户+目标气泡描边：本皮肤只持描边色。
  decoration: { light: "101, 83, 216", dark: "169, 156, 255" },
  // 流式呼吸光条（ADR-0016 视觉窗口：静态版升级呼吸，衰减色 = 暗色品牌主色 @0.20，Q16）。
  streaming: { decay: "169, 156, 255" },
  tints: TINTS,
  // 段序＝现状 css 模板序（ADR-0019 机制 a：段间注释/缩进/空行字节由裸串段
  // 自持，工厂恒等拼接；本块由旧模板程序化切分生成，禁止手改字节）。
  cssSegments: [
    "\n/* 配色 token（常量族 + 随动族）一律走声明表 → constantTokens / riding →\n * tokenOverrides（ADR-0016 C1 + ADR-0017），CSS 模板只持品牌装饰段。 */\n",
    "rootclear",
    "\n/* 流式呼吸光条（ADR-0016 视觉窗口：静态版升级呼吸，衰减色 = 暗色品牌主色\n * @0.20，Q16）：规则唯一来源在 ../decoration.js streamingCss。 */\n",
    "streaming",
    "\n/* 用户+目标气泡描边（ADR-0006 并集挂接谱系，goal v1.0.4 扩入——全谱系说明\n * 见 ../decoration.js 头注）：规则唯一来源在 decoration.js（ADR-0016），\n * 本皮肤只持描边色。 */\n",
    "decoration",
    "\n\n  ",
    "frost",
    "\n\n\n\n",
  ],
};

export function createUefiHarness({ jsx }) {
  function UefiMark({ size = 24, className }) {
    return jsx("svg", {
      width: size,
      height: size,
      viewBox: LOGO_VIEWBOX,
      fill: "none",
      className,
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      children: [
        jsx("path", { fill: "#FFFFFF", d: LOGO_WHITE }),
        jsx("path", { fill: "#DC0000", d: LOGO_RED }),
      ],
    });
  }

  function UefiName() {
    return jsx("span", {
      style: { display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 650, letterSpacing: ".02em", whiteSpace: "nowrap" },
      children: [
        jsx("span", { children: "UEFI" }),
        jsx("span", {
          style: { border: "1px solid currentColor", borderRadius: "4px", padding: "0 5px", fontSize: "10px", lineHeight: "16px", letterSpacing: ".08em" },
          children: "STUDIO",
        }),
      ],
    });
  }

  return defineSkin({ ...SPEC, Mark: UefiMark, Name: UefiName });
}
