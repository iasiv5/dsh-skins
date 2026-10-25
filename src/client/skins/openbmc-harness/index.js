/** Independent OpenBMC Studio skin (id: openbmc).
 *
 * ADR-0019：声明表脚手架（表骨架/段展开/收尾）住 ../define-skin.js，本皮肤
 * 只持规格数据与品牌 JSX；背景原画住 ./background-art.js（资产独居一文件）。
 * 装饰族调用与「规则唯一来源在 ../decoration.js」归位注释已随工厂单源化
 * （裁决史见 decoration.js 头注），段间注释字节由 cssSegments 裸串段自持。
 */
import { BACKGROUND_ART } from "./background-art.js";
import { defineSkin } from "../define-skin.js";

/* ================================================================
 * ① LOGO — OpenBMC 官方图标（蓝绿渐变飘带）
 *
 * 原始 SVG 是 OpenBMC 项目徽标：上部为蓝/绿双色渐变飘带图标，
 * 下部为 "OpenBMC" 字样。图标插槽只取飘带部分 —— viewBox 裁剪为
 * "25 -12 190 190"（原图 241×240 中 y>195 的字样区域被裁掉）。
 * ================================================================ */
const ICON_VIEWBOX = "25 -12 190 190";

/** 品牌图元（ADR-0019 Decision 5）：飘带四 path 与两组渐变的唯一载体——
 * Mark（长 id，obmc- 前缀）与 favicon（短 id a–d）经 id 注入各自拼装，
 * 双串各自逐字节保全（B5）；渐变多实例同 id 的 defs 内容一致，安全。 */
const ICON_GRADIENTS = [
  { longId: "obmc-blue-a", shortId: "a", x1: "82.9", y1: "11.55", x2: "82.9", y2: "154.54", stops: [["0", "#00b0da"], ["1", "#008abf"]] },
  { longId: "obmc-blue-b", shortId: "b", x1: "81.55", y1: "27.55", x2: "81.55", y2: "158.66", stops: [["0", "#00b0da"], ["1", "#008abf"]] },
  { longId: "obmc-green-a", shortId: "c", x1: "156.66", y1: "51.54", x2: "156.66", y2: "154.8", stops: [["0", "#a5d440"], ["1", "#8cce3f"]] },
  { longId: "obmc-green-b", shortId: "d", x1: "158.41", y1: "51.54", x2: "158.41", y2: "154.8", stops: [["0", "#a5d440"], ["1", "#8cce3f"]] },
];
const ICON_PATHS = [
  { gradient: 0, d: "M65.85,81.86a53.68,53.68,0,0,0,11.61,33.41c-.1.29-.15.6-.22.9a10.81,10.81,0,0,0-.34,2.57,11,11,0,1,0,11-11,10.75,10.75,0,0,0-1.2.07c-.31,0-.61.08-.91.13A42.82,42.82,0,0,1,99.95,43.86h0V2.07l-.77.21q-3.63.94-7.12,2.2c-1.29.47-2.58,1-3.84,1.48h0V38.19l-.13.1A53.79,53.79,0,0,0,65.85,81.86Z" },
  { gradient: 1, d: "M120.28,96.58a14.54,14.54,0,0,1-14.55-14.37H93.59v0a26.29,26.29,0,0,0,21,25.65v45.35A71.13,71.13,0,0,1,63.9,38.1c.31.06.63.1,1,.13s.64,0,1,0a10.83,10.83,0,1,0-10.25-7.41,82.23,82.23,0,0,0,64.18,133.6c1.41,0,2.81-.06,4.2-.14l1.63-.09h0V95.57A14.47,14.47,0,0,1,120.28,96.58Z" },
  { gradient: 2, d: "M171.95,68.54a53.78,53.78,0,0,0-9.85-19.71,11.31,11.31,0,0,0,.32-1.3,10.78,10.78,0,0,0,.24-2.17,11,11,0,1,0-8.89,10.8,42.83,42.83,0,0,1-14.17,64.08V162c1.08-.27,2.14-.56,3.2-.87a82.35,82.35,0,0,0,8.53-3V125.91a53.91,53.91,0,0,0,20.6-57.37Z" },
  { gradient: 3, d: "M184.63,132.75A82.21,82.21,0,0,0,119.79,0c-1.64,0-3.26.06-4.87.16h-.11V68.55h0A14.53,14.53,0,0,1,120,67.48h.27A14.56,14.56,0,0,1,134.87,82s0,.07,0,.11,0,.08,0,.13h11.08A26.21,26.21,0,0,0,125.81,56.8V11.3A71.14,71.14,0,0,1,176,125.83h-.07a11,11,0,0,0-12.58,10.88,11,11,0,0,0,11,11h0a11,11,0,0,0,10.54-14.13C184.82,133.3,184.73,133,184.63,132.75Z" },
];

/* ================================================================
 * ② FAVICON — 同一枚 OpenBMC 图标（独立 SVG data URL，与 ① 同源：
 * 图元常量共享，id 注入短拼法 a–d，字节与旧手写串逐字全等）
 * ================================================================ */
const FAVICON_MIME = "image/svg+xml";
const FAVICON_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + ICON_VIEWBOX + '">' +
    '<defs>' +
    ICON_GRADIENTS.map((g) =>
      '<linearGradient id="' + g.shortId + '" gradientUnits="userSpaceOnUse" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '">'
      + g.stops.map(([offset, color]) => '<stop offset="' + offset + '" stop-color="' + color + '"/>').join("")
      + '</linearGradient>').join("") +
    '</defs>' +
    ICON_PATHS.map((p) => '<path fill="url(#' + ICON_GRADIENTS[p.gradient].shortId + ')" d="' + p.d + '"/>').join("") +
    '</svg>'
  );

/* ================================================================
 * ③ 配色 + ④ 字体 — OpenBMC 蓝绿双色系，明暗两套
 *
 * 品牌色取自 logo 渐变：蓝 #00b0da→#008abf、绿 #a5d440→#8cce3f。
 * 亮色模式用深一档的蓝保证白底对比度；暗色模式提亮为青。
 * ================================================================ */
// 浮层毛玻璃家族 tint（ADR-0012）：家族配方与选择器并集住在 frost-family.js，
// 本皮肤只自持色值。menu 明/暗均异于 frost（逐字取自下方 token 块现行读数）。
const TINTS = {
  frost: { light: "247, 250, 252", dark: "12, 26, 38" },
  menu: { light: "242, 247, 251", dark: "14, 33, 48" },
};

/** 占位背景 · 亮色：左上品牌蓝光晕 + 右下品牌绿光晕 */
const PLACEHOLDER_LIGHT =
  "radial-gradient(1100px 750px at 18% 0%, rgba(0, 176, 218, 0.10), transparent 60%)," +
  "radial-gradient(950px 700px at 85% 100%, rgba(140, 206, 63, 0.10), transparent 55%)";
/** 占位背景 · 暗色：更深的蓝绿光晕 */
const PLACEHOLDER_DARK =
  "radial-gradient(1100px 750px at 18% 0%, rgba(0, 150, 200, 0.14), transparent 60%)," +
  "radial-gradient(950px 700px at 85% 100%, rgba(125, 190, 55, 0.09), transparent 55%)";

/**
 * 投影声明表规格（ADR-0013 机制 + ADR-0019 工厂收拢）：机制住
 * ../translucency.js，骨架/派生/收尾住 ../define-skin.js，本皮肤只持参数。
 * 出厂锚 55：随动重基线与模糊铰链共用（P=0 纯壁纸完全可见，P>55 起壁纸
 * ::before 模糊与面板霜层同步增强）；desktop 出厂 66 属 catalog 默认层，
 * 投影不感知 profile。
 */
const SPEC = {
  id: "openbmc",
  label: "OpenBMC Studio",
  description: {
    zh: "冰绡叠浪 · 风雷入画 · 缥碧盈卷",
    en: "Ice-silk waves · storm-wing backdrop · ice-blue palette",
  },
  titleBrand: "OpenBMC Studio",
  favicon: { href: FAVICON_DATA_URL, mime: FAVICON_MIME },
  anchor: 55,
  bodyAttribute: "dshOpenbmcSkin",
  // 随动族（ADR-0013）：值即出厂锚点 55 处的烘焙读数，全走 tokenOverrides
  // （ADR-0017：模板不持 P 相关值）。
  riding: {
    "--dsw-alias-bg-base": { light: ["247, 250, 252", 55], dark: ["12, 26, 38", 55] },
    "--dsw-alias-bg-module-platform": { light: ["240, 246, 250", 55], dark: ["22, 48, 67", 60] },
    "--dsw-alias-bg-layer-1": { light: ["255, 255, 255", 48], dark: ["18, 38, 53", 55] },
    "--dsw-alias-bg-layer-2": { light: ["255, 255, 255", 56], dark: ["22, 48, 67", 60] },
    "--dsw-alias-bg-layer-3": { light: ["255, 255, 255", 62], dark: ["26, 58, 80", 64] },
    "--dsw-specific-sidebar-fill": { light: ["238, 246, 251", 60], dark: ["13, 30, 44", 72] },
    "--dsw-specific-input-major": { light: ["255, 255, 255", 60], dark: ["18, 42, 60", 65] },
    "--dsw-specific-login-input": { light: ["255, 255, 255", 60], dark: ["18, 42, 60", 65] },
  },
  // 常量族（ADR-0016 C1：原 CSS 模板手写行逐字迁入，明暗同键；等式钉在
  // tests/translucency-contract.test.mjs「openbmc C1」）。品牌色取自 logo
  // 渐变（蓝 #00b0da→#008abf、绿 #a5d440→#8cce3f）：亮用深一档蓝保证白底
  // 对比度，暗提亮为青；交互 hover-accent 为绿点缀；暗气泡=深冰蓝海军
  // （与画面同色相，拒绝纯黑）；滚动条同系引用壳令牌。
  constantTokens: {
    "--dsw-alias-brand-primary": { light: "#0083b0", dark: "#3ec1e8" },
    "--dsw-alias-brand-primary-invert": { light: "#ffffff", dark: "#06222e" },
    "--dsw-alias-brand-text": { light: "#007197", dark: "#5ec8e8" },
    "--dsw-alias-bg-overlay": { light: "rgba(250, 252, 253, 0.82)", dark: "rgba(10, 22, 32, 0.88)" },
    "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(231, 241, 248, 0.90)", dark: "rgba(18, 41, 58, 0.90)" },
    "--dsw-specific-sidebar-nav-item-active": { light: "rgba(220, 235, 245, 0.90)", dark: "rgba(20, 47, 68, 0.90)" },
    "--dsw-specific-sidebar-nav-item-active-accent": { light: "#9cc8e0", dark: "#29526f" },
    "--dsw-specific-selector": { light: "rgba(227, 239, 247, 0.85)", dark: "rgba(16, 40, 64, 0.85)" },
    "--dsw-specific-tip": { light: "rgba(240, 246, 250, 0.90)", dark: "rgba(12, 30, 44, 0.92)" },
    "--dsw-alias-label-primary": { light: "#16262e", dark: "#dde9ee" },
    "--dsw-alias-label-secondary": { light: "#3f5a66", dark: "#9fb4bd" },
    "--dsw-alias-label-dimmed": { light: "#6b838e", dark: "#69818c" },
    "--dsw-alias-interactive-bg-hover": { light: "rgba(0, 138, 191, 0.08)", dark: "rgba(62, 193, 232, 0.10)" },
    "--dsw-alias-interactive-bg-active": { light: "rgba(0, 138, 191, 0.14)", dark: "rgba(62, 193, 232, 0.16)" },
    "--dsw-alias-interactive-bg-hover-accent": { light: "rgba(140, 206, 63, 0.14)", dark: "rgba(165, 212, 64, 0.16)" },
    "--dsw-specific-bubble": { light: "rgba(0, 138, 191, 0.10)", dark: "rgba(20, 41, 60, 0.90)" },
    "--dsw-specific-bubble-highlight": { light: "rgba(0, 138, 191, 0.18)", dark: "rgba(29, 61, 85, 0.90)" },
    "--dsw-font-family": {
      light: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
      dark: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    },
    "--ds-font-family-code": {
      light: '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
      dark: '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
    },
    "--dsh-scrollbar-thumb": { light: "var(--dsw-alias-scrollbar-bg-l2)", dark: "var(--dsw-alias-scrollbar-bg-l2)" },
    "--dsh-scrollbar-thumb-hover": { light: "var(--dsw-alias-scrollbar-hover-l2)", dark: "var(--dsw-alias-scrollbar-hover-l2)" },
  },
  scrim: {
    kind: "baked-gradient",
    stops: {
      light: [["247, 250, 252", 15], ["240, 246, 250", 28]],
      dark: [["7, 14, 22", 10], ["4, 9, 14", 24]],
    },
  },
  blur: { max: 24 },
  glassVar: "--dsh-openbmc-glass-blur",
  desktopBlur: { dark: "none" }, // OpenBMC dark remains the approved reference baseline
  wallpaper: {
    kind: "legacy-baked",
    placeholder: { light: PLACEHOLDER_LIGHT, dark: PLACEHOLDER_DARK },
  },
  backgroundArt: { mime: "image/webp", url: BACKGROUND_ART },
  builtinAssets: {}, // art 由工厂自 backgroundArt 派生（ADR-0014 B15 显式声明语义不变）
  // 品牌徽章：官方 ▐HARNESS▌ 同构反色片；本皮自持色值与 metrics（14px/650）。
  badge: {
    selector: ".dsh-openbmc-badge",
    colors: { light: { bg: "#14202B", fg: "#F7FAFC" }, dark: { bg: "#F7FAFC", fg: "#14202B" } },
    metrics: { lineHeight: "14px", fontWeight: 650 },
  },
  // 用户+目标气泡描边：本皮肤只持描边色。
  decoration: { light: "0, 131, 176", dark: "62, 193, 232" },
  // 流式呼吸光条：品牌青衰减色。
  streaming: { decay: "62, 193, 232" },
  tints: TINTS,
  // 段序＝现状 CSS 模板序（ADR-0019 机制 a：段间注释/缩进/空行字节由裸串段
  // 自持，工厂恒等拼接；本块由旧模板程序化切分生成，禁止手改字节）。
  cssSegments: [
    "\n  /* ---------- ③ 配色：token（常量族 + 随动族）一律走声明表 → constantTokens /\n     riding → tokenOverrides（ADR-0016 C1 + ADR-0017），CSS 模板只持品牌装饰段 ---------- */\n\n  /* ---------- ④b 品牌徽章：官方 ▐HARNESS▌ 同构反色片 ----------\n   * 规则唯一来源在 ../decoration.js badgeCss（ADR-0016；裁决史见其头注），\n   * 本皮自持色值与 metrics（14px/650，Q7 参数化保留现值）。 */\n  ",
    "badge",
    "\n\n  /* ---------- ⑥ 会话气泡装饰：品牌描边 + 流式呼吸光条 ----------\n   * 用户气泡填充（明色品牌蓝 tint / 暗色深冰蓝）已随常量族迁声明表\n   * （ADR-0016 C1：--dsw-specific-bubble(-highlight)）。 */\n  /* 用户+目标气泡描边（ADR-0006 并集挂接谱系，goal v1.0.4 扩入；结构分支\n   * 不命中 goal 面板气泡、goal 经自己的 _stack 并集描边——全谱系说明见\n   * ../decoration.js 头注）：规则唯一来源在 decoration.js（ADR-0016），\n   * 本皮肤只持描边色。 */\n  ",
    "decoration",
    "\n  /* 助手消息流式输出中：左侧品牌色呼吸光条——规则唯一来源在\n   * ../decoration.js streamingCss（ADR-0016 视觉窗口；keyframes 家族化改名\n   * obmc-stream-pulse → dsh-skins-stream-pulse，像素不变）。 */\n  ",
    "streaming",
    "\n  /* ---------- ⑦ 根容器清底（防御，鲸吟同款家族化 ADR-0016；滚动条同系\n   * token 已随常量族迁声明表） ---------- */\n  ",
    "rootclear",
    "\n  /* 注意：不要用类名选择器定位侧栏元素 —— 插件样式经 CSS modules 哈希，\n   * 类名不可预测；一律通过 token 或 data-* 属性作用。 */\n\n  ",
    "frost",
    "\n\n\n\n",
  ],
};

export function createOpenBmcHarness(jsxRuntime) {
  const { jsx } = jsxRuntime;

  function OpenBmcMark({ size = 24, className }) {
    return jsx("svg", {
      width: size,
      height: size,
      viewBox: ICON_VIEWBOX,
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      className,
      "aria-hidden": "true",
      children: [
        jsx("defs", {
          children: ICON_GRADIENTS.map((g) =>
            jsx("linearGradient", {
              id: g.longId, gradientUnits: "userSpaceOnUse",
              x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2,
              children: g.stops.map(([offset, color]) => jsx("stop", { offset, stopColor: color })),
            })),
        }),
        ...ICON_PATHS.map((p) =>
          jsx("path", {
            fill: "url(#" + ICON_GRADIENTS[p.gradient].longId + ")",
            d: p.d,
          })),
      ],
    });
  }

  /* 品牌名：沿用官方 "deepseek ▐HARNESS▌" 的排版语言 ——
   * "OpenBMC" 用 openbmc 官方 logo 的字标字形（O/p/e/n/B 主色、M/C 次级色，
   * 随主题 token 自适应），"STUDIO" 徽章为 HTML 反色片（.dsh-openbmc-badge，
   * 皮肤 CSS 提供明暗两套显式颜色），品牌更名后不再逐字节复刻官方
   * BrandWordmark 字形。 */
  function OpenBmcName() {
    return jsx("span", {
      style: { display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
      "aria-hidden": "true",
      children: [
        jsx("svg", {
          width: 94.6, height: 24,
          viewBox: "0 0 94.6 24", fill: "none",
          children: [
            jsx("g", { transform: "translate(0 -71.26) scale(0.3914)", children: [
            jsx("path", { d: "M33.19,213.53A14.53,14.53,0,1,1,18.66,199a14.53,14.53,0,0,1,14.53,14.53m4.12,0a18.66,18.66,0,1,0-18.66,18.66,18.66,18.66,0,0,0,18.66-18.66", fill: "currentColor" }),
            jsx("path", { d: "M63.68,224.4a12.41,12.41,0,0,1-4.86,5.17,13.54,13.54,0,0,1-7,1.85H45.54V240h-4V205.43H51.64a13.41,13.41,0,0,1,9.57,3.76,12.73,12.73,0,0,1,2.47,15.21m-18.14,3.24h5.77A9.48,9.48,0,0,0,58.05,225a8.59,8.59,0,0,0,2.76-6.54,8.38,8.38,0,0,0-2.7-6.41,9.43,9.43,0,0,0-6.68-2.51H45.54Z", fill: "currentColor" }),
            jsx("path", { d: "M96.44,219.75a4.56,4.56,0,0,0,.14-1.36c0-7.38-6.27-13.36-14-13.36s-14,6-14,13.36,6.27,13.36,14,13.36a14,14,0,0,0,11.93-6.52l-3.25-2.45a9.89,9.89,0,0,1-8.68,5,9.43,9.43,0,1,1,0-18.83,9.8,9.8,0,0,1,9.35,6.54c0,.07.15.63.17.7H76.59v3.52Z", fill: "currentColor" }),
            jsx("path", { d: "M119.82,208.4a10.6,10.6,0,0,0-7.9-3.34,10.15,10.15,0,0,0-4.16.83,15.94,15.94,0,0,0-3.62,2.24v-2.7H99.91v26h4.23V216.64a7.74,7.74,0,0,1,2.08-5.5,7.48,7.48,0,0,1,10.66,0,7.76,7.76,0,0,1,2.08,5.48v14.78h4.11v-15a11.12,11.12,0,0,0-3.24-8", fill: "currentColor" }),
            jsx("path", { d: "M154.37,220.69a6.77,6.77,0,0,1-6.75,6.79H132.14V213.9h15.49a6.78,6.78,0,0,1,6.75,6.79m-2.29-15.93a5.08,5.08,0,0,1-5.05,5.08l-14.89,0V199.67H147a5.07,5.07,0,0,1,5.05,5.08m.94,6.7a9,9,0,0,0-5.69-15.75H128v35.75h20.14l.28,0v0A10.73,10.73,0,0,0,153,211.46", fill: "var(--dsw-alias-label-secondary)" }),
            jsx("path", { d: "M201.22,231.42V195.65H196.53L182,225.14,167.47,195.65H162.72V231.42H166.89V204.21L180.33,231.42H183.67L197.1,204.21V231.42Z", fill: "var(--dsw-alias-label-secondary)" }),
            jsx("path", { d: "M241.23,205.77a18.66,18.66,0,1,0-.24,16L237.26,220a14.51,14.51,0,1,1,.21-12.46Z", fill: "var(--dsw-alias-label-secondary)" }),
            ]}),
          ],
        }),
        jsx("span", {
          className: "dsh-openbmc-badge",
          children: "STUDIO",
        }),
      ],
    });
  }

  return defineSkin({ ...SPEC, Mark: OpenBmcMark, Name: OpenBmcName });
}
