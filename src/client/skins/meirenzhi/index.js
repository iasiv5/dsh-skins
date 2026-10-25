/**
 * 「凡人修仙传 · 美人志」— fan-made, non-official skin (factory-default skin
 * since its introduction; registered FIRST, see src/client/index.js).
 *
 * The 6 bundled wallpapers (1 group + 5 solo, generated
 * by scripts/build-meirenzhi-wallpapers.mjs) are AI-generated fan art the
 * product owner supplied for bundling — NOT official《凡人修仙传》material.
 * The dragon brand mark/favicon (golden dragon on a red rounded plate, per
 * the product owner's reference image) is an original code-drawn SVG; the
 * BEAUTY badge is rendered with HTML/CSS and the
 * fireflies with CSS pseudo-elements + radial gradients. The personalization
 * contract lives in src/shared/personalization/catalog.js. Effects are
 * produced by `project()` (values → SkinEffects) and executed by the generic
 * runtime; this module never touches the DOM.
 *
 * ADR-0019：声明表脚手架（表骨架/段展开/收尾）住 ../define-skin.js，本皮肤
 * 只持规格数据与品牌 JSX；装饰族调用与归位注释的唯一来源随之单源化。
 */

import {
  WALLPAPER_MUPEILING,
  WALLPAPER_NANGONGQUE,
  WALLPAPER_NANGONGWAN,
  WALLPAPER_YINYUE,
  WALLPAPER_YUNTAI,
  WALLPAPER_ZILING,
} from "./wallpapers.js";
import { defineSkin } from "../define-skin.js";

/** 氛围裸串段的作用域字面量——须与 bodyAttribute 派生值保持一致。 */
const SCOPE = "body[data-dsh-meirenzhi-skin]";

// Mark: user-provided 掌天瓶 icon PNG transcoded to WebP (96px, q75) and
// inlined as a data URL (2026-09-01 ruling — dragon plate reverted).
const MARK_URL = "data:image/webp;base64,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";

/**
 * 投影声明表规格（ADR-0013 机制 + ADR-0019 工厂收拢：机制住
 * ../translucency.js，骨架/段展开/收尾住 ../define-skin.js，本皮肤只持
 * 参数）。出厂锚 35（= catalog web 出厂默认，ADR-0010）：随动重基线与模糊
 * 铰链共用——锚点处壁纸零模糊；t+offset 旧写法已展开为 pivot 形式的烘焙点
 * （baked = 35 + 100·offset）。纱走 overlay 通道（30·t²，三位小数），
 * 壁纸为纯 assets 模型；desktop 出厂 66 属 catalog 默认层，投影不感知
 * profile。
 */
const SPEC = {
  id: "meirenzhi",
  label: { zh: "凡人修仙传 · 美人志", en: "Mortal's Journey · Beauty Chronicle" },
  description: {
    zh: "云鬓花颜 · 霞衣夜月 · 凡尘问道",
    en: "Moonlit silks · crimson & gold · mortal path",
  },
  titleBrand: "美人志",
  favicon: { href: MARK_URL, mime: "image/webp" },
  anchor: 35,
  bodyAttribute: "dshMeirenzhiSkin",
  riding: {
    "--dsw-alias-bg-base": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 35] },
    "--dsw-specific-sidebar-fill": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 52] },
    "--dsw-alias-bg-module-platform": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 40] },
    "--dsw-specific-input-major": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 45] },
  },
  constantTokens: {
    // 常量族：品牌绯红 × 鎏金、浮层「较实」、控件态、导航态（设计定案 §视觉系统）。
    // 用户气泡（产品主人裁决，参照 openbmc/uefi 双 token 结构）：浅色态=品牌
    // 绯红轻透纱（深字，融进暖雾白面板）；深色态=玄夜面板族较实底（亮字）。
    // 不再用饱和红实底，避免会话区色彩疲劳。
    "--dsw-alias-brand-primary": { light: "#B8433F", dark: "#E58A80" },
    "--dsw-alias-brand-text": { light: "#A87B2F", dark: "#D9B45C" },
    "--dsw-alias-button-primary-fill": { light: "#B8433F", dark: "#E58A80" },
    "--dsw-alias-button-primary-hover": { light: "#A87B2F", dark: "#D9B45C" },
    "--dsw-alias-bg-overlay": { light: "rgba(252, 250, 246, 0.85)", dark: "rgba(24, 24, 34, 0.88)" },
    "--dsw-alias-interactive-bg-hover": { light: "rgba(184, 67, 63, 0.08)", dark: "rgba(229, 138, 128, 0.14)" },
    "--dsw-alias-interactive-bg-active": { light: "rgba(184, 67, 63, 0.14)", dark: "rgba(229, 138, 128, 0.20)" },
    "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(250, 249, 246, 0.6)", dark: "rgba(28, 28, 40, 0.6)" },
    "--dsw-specific-sidebar-nav-item-active": { light: "rgba(250, 249, 246, 0.9)", dark: "rgba(28, 28, 40, 0.9)" },
    "--dsw-specific-bubble": { light: "rgba(184, 67, 63, 0.10)", dark: "rgba(24, 24, 34, 0.90)" },
    "--dsw-specific-bubble-highlight": { light: "rgba(184, 67, 63, 0.18)", dark: "rgba(40, 40, 56, 0.92)" },
  },
  scrim: { kind: "overlay", coefficient: 30, light: "252, 250, 246", dark: "16, 16, 26" },
  blur: { max: 12 },
  glassVar: "--dsh-mrz-glass-blur",
  desktopBlur: { dark: "boost" },
  wallpaper: { kind: "assets" },
  builtinAssets: {
    yuntai: { mime: "image/webp", url: WALLPAPER_YUNTAI },
    mupeiling: { mime: "image/webp", url: WALLPAPER_MUPEILING },
    ziling: { mime: "image/webp", url: WALLPAPER_ZILING },
    nangongwan: { mime: "image/webp", url: WALLPAPER_NANGONGWAN },
    nangongque: { mime: "image/webp", url: WALLPAPER_NANGONGQUE },
    yinyue: { mime: "image/webp", url: WALLPAPER_YINYUE },
  },
  // 反色徽章（official HARNESS 反色语言，tgcf badge 同构）：规则唯一来源在
  // ../decoration.js（ADR-0016）；#12121A/#FAF9F6 与面板底色族同源。
  badge: {
    selector: ".dsh-mrz-badge",
    colors: { light: { bg: "#12121A", fg: "#FAF9F6" }, dark: { bg: "#FAF9F6", fg: "#12121A" } },
    metrics: { lineHeight: "16px", fontWeight: 600 },
  },
  // 用户+目标气泡描边（ADR-0006 并集挂接谱系，goal v1.0.4 扩入）：规则唯一
  // 来源在 ../decoration.js（ADR-0016），本皮肤只持描边色。
  decoration: { light: "184, 67, 63", dark: "229, 138, 128" },
  // 流式呼吸光条（ADR-0016 视觉窗口，本皮新增）：品牌令牌骨架 + 鎏金衰减
  // rgba(217, 180, 92, 0.20)（Q10 主人裁定例外，与萤火虫同源色）。
  streaming: { decay: "217, 180, 92" },
  // 浮层毛玻璃家族 tint（ADR-0012）：menu 与 frost 同值（暖雾白/玄夜），
  // 仍写两组、不靠巧合省略。家族配方与选择器并集住在 frost-family.js。
  tints: {
    frost: { light: "250, 249, 246", dark: "18, 18, 26" },
    menu: { light: "250, 249, 246", dark: "18, 18, 26" },
  },
  // 段序＝现状 CSS 数组序（ADR-0019 机制 a：段间字节由 "\n" 裸串项自持，
  // 工厂恒等拼接）。Ambient motion：慢速辉光呼吸骑在 runtime 的壁纸
  // ::before 层 + 两只漂移萤火虫走 #root 伪元素预算（与 tgcf 蝴蝶同形同
  // 价）；prefers-reduced-motion 全灭。
  cssSegments: [
    "badge", "\n",
    "decoration", "\n",
    "rootclear", "\n",
    "streaming", "\n",
    `@keyframes dsh-mrz-breathe{0%,100%{opacity:.94}50%{opacity:1}}`, "\n",
    `${SCOPE}::before{animation:dsh-mrz-breathe 26s ease-in-out infinite}`, "\n",
    `@keyframes dsh-mrz-drift-a{0%{transform:translate(0,0)}50%{transform:translate(42px,-34px)}100%{transform:translate(0,0)}}`, "\n",
    `@keyframes dsh-mrz-drift-b{0%{transform:translate(0,0)}50%{transform:translate(-46px,28px)}100%{transform:translate(0,0)}}`, "\n",
    `${SCOPE} #root::before{content:"";position:fixed;left:13%;top:19%;width:9px;height:9px;z-index:-1;`
      + `background:radial-gradient(circle, rgba(217,180,92,.95) 0%, rgba(217,180,92,0) 70%);opacity:.16;animation:dsh-mrz-drift-a 38s ease-in-out infinite;pointer-events:none}`, "\n",
    `${SCOPE} #root::after{content:"";position:fixed;right:17%;bottom:23%;width:14px;height:14px;z-index:-1;`
      + `background:radial-gradient(circle, rgba(250,249,246,.9) 0%, rgba(250,249,246,0) 70%);opacity:.12;animation:dsh-mrz-drift-b 47s ease-in-out infinite;pointer-events:none}`, "\n",
    `@media (prefers-reduced-motion:reduce){${SCOPE}::before,${SCOPE} #root::before,${SCOPE} #root::after{animation:none}}`, "\n",
    "frost",
  ],
};

export function createMeirenzhiSkin(jsxRuntime) {
  const { jsx } = jsxRuntime;

  function MeiRenZhiMark({ size = 24, className }) {
    // 掌天瓶 icon rides a plain img so the bundled WebP data URL works in
    // every slot that renders it; alt="" + aria-hidden keep it decorative.
    return jsx("img", {
      src: MARK_URL,
      alt: "",
      width: size,
      height: size,
      className,
      style: { display: "block", borderRadius: "2px", filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.30))" },
      "aria-hidden": "true",
    });
  }

  function MeiRenZhiName() {
    // 「凡人修仙传」鎏金→绯红渐变裁字（原始方案；行楷字体栈与手绘 SVG 字形
    // 两版均被产品主人否决——观感不足/不可读，2026-09-01 回归此方案）+
    // 反色徽章 BEAUTY（tgcf badge 同构，亮暗反转由 CSS 的 .dsh-mrz-badge
    // 规则承担）。
    return jsx("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      },
      children: [
        jsx("span", {
          style: {
            background: "linear-gradient(120deg, #A87B2F, #D9B45C 45%, #B8433F)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          },
          children: "凡人修仙传",
        }),
        jsx("span", { className: "dsh-mrz-badge", children: "BEAUTY" }),
      ],
    });
  }

  return defineSkin({ ...SPEC, Mark: MeiRenZhiMark, Name: MeiRenZhiName });
}
