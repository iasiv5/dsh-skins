/**
 * 「天官赐福 · 百无禁忌」— fan-made, non-official skin.
 *
 * The factory wallpaper is bundled AI-generated fan art (wallpapers.js,
 * 豆包AI origin — see §18/§19); the brand mark and favicon are the product
 * owner's 「天官赐福」 seal artwork (seal.js, 1.0.0 — retires the
 * code-drawn lantern), while the butterfly sprite remains original
 * code-drawn SVG. The
 * personalization contract lives in src/shared/personalization/catalog.js.
 * Effects are produced by `project()` (values → SkinEffects) and executed
 * by the generic runtime; this module never touches the DOM.
 */

import { SEAL_MARK } from "./seal.js";
import { WALLPAPER_CRIMSON, WALLPAPER_MOONLIT, WALLPAPER_PALE } from "./wallpapers.js";

const SCOPE = "body[data-dsh-tgcf-skin]";

function svgUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s{2,}/g, " "))}`;
}


const BUTTERFLY_SPRITE = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
  + `<path d="M32 30 C24 12 8 10 6 22 C5 32 20 36 32 33 C44 36 59 32 58 22 C56 10 40 12 32 30z" fill="#cfd8ea" opacity=".9"/>`
  + `<path d="M32 33 C26 44 14 46 13 39 C13 33 24 32 32 36 C40 32 51 33 51 39 C50 46 38 44 32 33z" fill="#aab6cf" opacity=".8"/>`
  + `<ellipse cx="32" cy="34" rx="2.5" ry="11" fill="#8d99b5"/>`
  + `</svg>`,
);

const CSS = [
  // Panel glass: the app shell frosts whatever sits behind it (the runtime
  // backdrop pseudo layers). Ruling #14: the frost strength rides the same
  // translucency curve as the wallpaper blur (var fed from project() below),
  // so P=0 is unfrosted pure wallpaper; 12px at the historical default P=82.
  `${SCOPE} #root{backdrop-filter:blur(var(--dsh-tgcf-glass-blur,12px))}`,
  // Ambient motion (always-on, design Q6): a slow lantern breath on the
  // wallpaper layer and two silver butterflies drifting between the
  // wallpaper and the frosted shell.
  `@keyframes dsh-tgcf-breathe{0%,100%{opacity:.94}50%{opacity:1}}`,
  `${SCOPE}::before{animation:dsh-tgcf-breathe 26s ease-in-out infinite}`,
  `@keyframes dsh-tgcf-drift-a{0%{transform:translate(0,0) rotate(-8deg)}50%{transform:translate(46px,-30px) rotate(10deg)}100%{transform:translate(0,0) rotate(-8deg)}}`,
  `@keyframes dsh-tgcf-drift-b{0%{transform:translate(0,0) rotate(14deg)}50%{transform:translate(-38px,26px) rotate(-12deg)}100%{transform:translate(0,0) rotate(14deg)}}`,
  `${SCOPE} #root::before{content:"";position:fixed;left:8%;top:14%;width:56px;height:56px;z-index:-1;`
  + `background:url("${BUTTERFLY_SPRITE}") center/contain no-repeat;opacity:.22;animation:dsh-tgcf-drift-a 34s ease-in-out infinite;pointer-events:none}`,
  `${SCOPE} #root::after{content:"";position:fixed;right:11%;bottom:18%;width:40px;height:40px;z-index:-1;`
  + `background:url("${BUTTERFLY_SPRITE}") center/contain no-repeat;opacity:.16;animation:dsh-tgcf-drift-b 41s ease-in-out infinite;pointer-events:none}`,
  `@media (prefers-reduced-motion:reduce){${SCOPE}::before,${SCOPE} #root::before,${SCOPE} #root::after{animation:none}}`,
  // Solid inverted motto "NO TABOOS" (TgcfName badge, official HARNESS
  // 反色 language): ink box + snow text on the 素白 glass, flipped to snow
  // box + ink text on the 墨黑 glass. #181010/#FFFCF6 are the skin's own
  // 墨黑/素白 (same values panelBase tints the glass with).
  `${SCOPE} .dsh-tgcf-badge{display:inline-flex;align-items:center;background:#181010;border-radius:4px;padding:0 5px;font-size:10px;line-height:16px;font-weight:600;letter-spacing:.08em;color:#FFFCF6}`,
  `body[data-dsh-tgcf-skin][data-ds-dark-theme] .dsh-tgcf-badge{background:#FFFCF6;color:#181010}`,
  // 用户气泡描边 + 轻投影（openbmc 同款泡泡边框：框出用户输入区）。挂接用
  // :is() 并集（精确哈希 ∪ 结构化，见 docs/adr/0006）：哈希漂移与 DOM 结构
  // 变化两种单点故障各有一支兜底，钩子前提由 verify-upstream-hooks 守卫在
  // check 时钉住。失效仅影响描边装饰，token 填充不受影响。
  `${SCOPE} :is([class*="Sixlwa_bubble"], [class*="userStack"] > [class*="_bubble"]){border:1px solid rgba(195, 39, 43, 0.38);box-shadow:0 1px 4px rgba(195, 39, 43, 0.10)}`,
  `body[data-dsh-tgcf-skin][data-ds-dark-theme] :is([class*="Sixlwa_bubble"], [class*="userStack"] > [class*="_bubble"]){border-color:rgba(224, 86, 74, 0.38);box-shadow:0 1px 6px rgba(224, 86, 74, 0.10)}`,
  // 目标面板气泡（goal stack > bubble，与用户气泡同族描边）。ADR-0006 v1.0.4
  // amendment：主人目测 goal 无描边观感不佳，裁决扩入；同款并集策略，守卫
  // 清单已登记 goal 精确哈希与 _stack 结构前提。
  `${SCOPE} :is([class*="oRe1gG_bubble"], [class*="_stack"] > [class*="_bubble"]){border:1px solid rgba(195, 39, 43, 0.38);box-shadow:0 1px 4px rgba(195, 39, 43, 0.10)}`,
  `body[data-dsh-tgcf-skin][data-ds-dark-theme] :is([class*="oRe1gG_bubble"], [class*="_stack"] > [class*="_bubble"]){border-color:rgba(224, 86, 74, 0.38);box-shadow:0 1px 6px rgba(224, 86, 74, 0.10)}`,
].join("\n");

/** Default panel glass colours (素白 / 墨黑) derived from the palette. */
function panelBase(lightMode, alpha) {
  return lightMode ? `rgba(255,252,246,${alpha})` : `rgba(24,16,16,${alpha})`;
}

/**
 * Sidebar presence above the content base (ruling #15), mirroring the
 * reference skins' deltas: openbmc and uefi both sit their sidebar fill at
 * bg-base +0.05 in the light theme and +0.17 in the dark theme, so the menu
 * column keeps readable contrast while the content area stays translucent.
 */
const SIDEBAR_DELTA = { light: 0.05, dark: 0.17 };

/**
 * Static identity palette since the personalization simplification (Q35):
 * accent/gold/bubbleColour stopped being editable fields, but the skin's
 * visual identity keeps the exact values that used to be catalog defaults.
 */
const PALETTE = {
  accent: { light: "#C3272B", dark: "#E0564A" },
  gold: { light: "#C9A227", dark: "#D4AF37" },
};

/**
 * 用户气泡（产品主人裁决 2026-09-01：保持题材红色系，但参照 openbmc/uefi 的
 * 双 token 结构降饱和）——浅色态：朱红轻透纱（深字，融进素白玻璃，不再饱和
 * 红实底）；深色态：深朱红实底保留（亮字，墨黑玻璃上的主题主色）。
 * highlight 为流式/悬停高亮层，随同族提亮一档。
 */
const BUBBLE = { light: "rgba(195, 39, 43, 0.10)", dark: "#8E2A2F" };
const BUBBLE_HIGHLIGHT = { light: "rgba(195, 39, 43, 0.18)", dark: "rgba(170, 55, 60, 0.92)" };

export function createTgcfSkin(jsxRuntime) {
  const { jsx } = jsxRuntime;

  function TgcfMark({ size = 24, className }) {
    // Brand mark = the 「天官赐福」 seal artwork (1.0.0): retires the
    // code-drawn lantern SVG. A plain img keeps the bundled WebP working in
    // every slot that renders the mark (sidebar brand + new-session hero);
    // alt="" + aria-hidden keep it decorative next to the brand text.
    return jsx("img", {
      src: SEAL_MARK,
      alt: "",
      width: size,
      height: size,
      className,
      style: { display: "block", borderRadius: "2px" },
      "aria-hidden": "true",
    });
  }

  function TgcfName() {
    // Harness badge language (official/openbmc HARNESS 反色块): the brand
    // text keeps its gradient, then a solid inverted badge "NO TABOOS"
    // rides after it — 4px radius, 10px caps, .08em tracking like the
    // reference badge. Black/white inversion is theme-aware via the
    // .dsh-tgcf-badge rules in the static CSS below
    // (亮色墨底素白字 / 暗色素白底墨字).
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
            background: "linear-gradient(120deg,#C9A227,#E8C56A 45%,#C3272B)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          },
          children: "天官赐福",
        }),
        jsx("span", { className: "dsh-tgcf-badge", children: "NO TABOOS" }),
      ],
    });
  }

  const builtinAssets = {
    crimson: { mime: "image/webp", url: WALLPAPER_CRIMSON },
    pale: { mime: "image/webp", url: WALLPAPER_PALE },
    moonlit: { mime: "image/webp", url: WALLPAPER_MOONLIT },
    "seal-favicon": { mime: "image/webp", url: SEAL_MARK },
  };

  function project(values, assets) {
    // Ruling #14: one translucency knob drives the panel tint, the wallpaper
    // scrim and the blur. Ruling #15 amendment — the knob's CONTRACT is the
    // full visual range: P=0 pure wallpaper, P=100 wallpaper fully hidden.
    // The scrim/blur therefore grow QUADRATICALLY (12·(P/100)² and
    // 30·(P/100)²): linear growth saturated the perceived effect by ~50%,
    // leaving the upper half of the slider feeling dead. Panel tint alpha
    // stays linear (it IS the requested percentage).
    const t = Math.min(1, Math.max(0, values.panelOpacity / 100));
    const alpha = t;
    // Sidebar fill rides ABOVE the content base by the reference-skin delta
    // (ruling #15): menu column stays readable, content stays translucent.
    // Rounded to points — 0.1 + 0.05 must never print as 0.15000000000000002.
    const sidebarAlpha = {
      light: Math.min(1, Math.round((alpha + SIDEBAR_DELTA.light) * 100) / 100),
      dark: Math.min(1, Math.round((alpha + SIDEBAR_DELTA.dark) * 100) / 100),
    };
    // Composer glass (1.0.0 user report): the new-session / conversation
    // input card paints with --dsw-specific-input-major, which tgcf never
    // overrode — it fell back to the host's SOLID surface (an opaque slab in
    // both themes), and the card's embedded selector sat at a near-opaque
    // 0.92. Mirror the reference skins' structure (openbmc/uefi): the card
    // rides the content base with a small positive delta (theirs +5/+10),
    // the selector with +0/+5, so the whole composer stays glass and rides
    // the same knob. At the factory P=35 → card 0.40/0.45, selector 0.35/0.40.
    const composerAlpha = {
      light: Math.min(1, Math.round((alpha + 0.05) * 100) / 100),
      dark: Math.min(1, Math.round((alpha + 0.1) * 100) / 100),
    };
    const selectorAlpha = {
      light: alpha,
      dark: Math.min(1, Math.round((alpha + 0.05) * 100) / 100),
    };
    // Single-value scrim (Q35): one alpha drives both theme overlays; the
    // base tint stays per-theme (warm white veil / ink veil).
    const scrimAlpha = (Math.round(30 * t * t) / 100).toFixed(3);
    const blurPx = Math.round(12 * t * t);
    const scrimLight = `linear-gradient(rgba(255,246,234,${scrimAlpha}),rgba(255,246,234,${scrimAlpha}))`;
    const scrimDark = `linear-gradient(rgba(14,7,8,${scrimAlpha}),rgba(14,7,8,${scrimAlpha}))`;
    const wallpaperUrl = assets.wallpaper?.url ?? null;
    // The favicon field is gone (Q35): the seal icon is a static skin asset.
    const faviconAsset = builtinAssets["seal-favicon"];
    return {
      bodyAttribute: "dshTgcfSkin",
      slogans: values.slogan ?? null,
      titleBrand: "天官赐福", // static brand segment — the field was removed (v2.4.1 #5)
      favicon: { href: faviconAsset.url, mime: faviconAsset.mime },
      backdrop: {
        imageLight: wallpaperUrl === null ? null : `url("${wallpaperUrl}")`,
        imageDark: wallpaperUrl === null ? null : `url("${wallpaperUrl}")`,
        overlayLight: scrimLight,
        overlayDark: scrimDark,
        blur: blurPx,
      },
      tokenOverrides: {
        "--dsw-alias-brand-primary": PALETTE.accent,
        "--dsw-alias-brand-text": PALETTE.gold,
        "--dsw-alias-button-primary-fill": PALETTE.accent,
        "--dsw-alias-button-primary-hover": PALETTE.gold,
        "--dsw-alias-bg-base": { light: panelBase(true, alpha), dark: panelBase(false, alpha) },
        "--dsw-specific-sidebar-fill": { light: panelBase(true, sidebarAlpha.light), dark: panelBase(false, sidebarAlpha.dark) },
        // Floating layers (the switcher pop, menus) stay 较实 regardless of P,
        // but tinted with the skin family - 素白 light / 墨黑 dark - instead of
        // the host's neutral gray (ruling #16).
        "--dsw-alias-bg-overlay": { light: panelBase(true, 0.82), dark: panelBase(false, 0.88) },
        // Control states tint with the 朱红 family (ruling #16, mirroring the
        // openbmc/uefi alphas 0.08/0.14): hovers and the trigger chip stop
        // falling back to the host's neutral blue-gray.
        "--dsw-alias-interactive-bg-hover": { light: "rgba(195,39,43,0.08)", dark: "rgba(224,86,74,0.14)" },
        "--dsw-alias-interactive-bg-active": { light: "rgba(195,39,43,0.14)", dark: "rgba(224,86,74,0.20)" },
        "--dsw-alias-bg-module-platform": { light: panelBase(true, selectorAlpha.light), dark: panelBase(false, selectorAlpha.dark) },
        // The composer card (new session + ongoing input) must stay glass,
        // not the host's solid input default (1.0.0 user report; openbmc/
        // uefi pattern: base + small per-theme delta).
        "--dsw-specific-input-major": { light: panelBase(true, composerAlpha.light), dark: panelBase(false, composerAlpha.dark) },
        "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(255,252,246,0.6)", dark: "rgba(24,16,16,0.6)" },
        "--dsw-specific-sidebar-nav-item-active": { light: "rgba(255,252,246,0.9)", dark: "rgba(24,16,16,0.9)" },
        "--dsw-specific-bubble": BUBBLE,
        "--dsw-specific-bubble-highlight": BUBBLE_HIGHLIGHT,
      },
      cssVariables: {
        // The panel-glass frost (static CSS consumes the var) rides the same
        // curve; same value both themes — frost is a translucency effect.
        "--dsh-tgcf-glass-blur": { light: `${blurPx}px`, dark: `${blurPx}px` },
      },
      staticCss: CSS,
      decorations: null,
    };
  }

  return {
    id: "tgcf",
    label: { zh: "天官赐福", en: "Heaven Official's Blessing" },
    description: {
      zh: "千灯引路 · 朱红鎏金 · 长夜同明",
      en: "A thousand lights · vermilion & gold",
    },
    bodyAttr: "dshTgcfSkin",
    Mark: TgcfMark,
    Name: TgcfName,
    favicon: SEAL_MARK,
    faviconMime: "image/webp",
    title: "天官赐福",
    css: CSS,
    // Legacy fallback path (projector layer-3 safety net) stays coherent:
    art: "",
    scrimLight: `url("${WALLPAPER_CRIMSON}")`,
    scrimDark: `url("${WALLPAPER_CRIMSON}")`,
    placeholderLight: `url("${WALLPAPER_CRIMSON}")`,
    placeholderDark: `url("${WALLPAPER_CRIMSON}")`,
    slogans: { zh: "百无禁忌", en: "No Taboos" },
    builtinAssets,
    project,
  };
}
