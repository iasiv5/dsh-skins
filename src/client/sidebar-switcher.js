import { createUpdatePanel, UPDATE_CSS } from "./update-panel.js";
import { DICTS, NS, formatTemplate } from "./dicts.js";
import { createPersonalizationPanel, PANEL_CSS } from "./personalization/panel.js";
import { getSkinSchema } from "../shared/personalization/catalog.js";

const TAG_ID = "dsh-skins/sidebar.css";

/** The shell width/height animation beat (keep in sync with the CSS below). */
const SWEEP_MS = 200;

/**
 * Height+width sweep across gear expand/collapse/retarget (field issue #13,
 * revised after the 18+-image gallery report). The shell's box is
 * content-driven (auto→auto), so `transition: height` alone never
 * interpolates and every toggle snapped the box to its new height in a
 * single frame — on expansion the whole list column jumped up while the
 * width was still animating (the visible "bounce"; collapse only masked it
 * because there the snap rode the width motion in the same beat).
 *
 * The first cut pinned the pre-toggle height and swept toward a target read
 * off the POST-COMMIT layout — but that layout was measured while the width
 * transition still sat at progress 0: the panel column, squeezed between the
 * 360px list column and the not-yet-grown shell, was ~0px wide, so its
 * content (labels, inputs, thumbs) stacked vertically and the measured
 * extent was wildly inflated. The sweep either no-op'd (target ≈ from while
 * the panel was squashed) or overshot toward the clamp ceiling — and when
 * the pin released, the box snapped from the inflated target down to its
 * true resting height. That one-frame drop is the residual open-direction
 * bounce, and its size varied with gallery fill (0/6/12/18+ images all
 * produced different drop magnitudes) because the inflation grows with
 * panel content. Collapse stayed smooth by accident: the panel is already
 * unmounted and the list column is a fixed 360px, so the measured target
 * happened to equal the resting height regardless of width.
 *
 * The revision therefore freezes transitions BEFORE the first post-commit
 * recalc, letting the wide-class width apply instantly so the content is
 * measured at its SETTLED geometry. It then pins BOTH axes back to the
 * pre-toggle box, and releases width+height into one eased beat toward the
 * final box. The sweep target now equals the natural resting height for ANY
 * gallery size — empty, 6, 12, 18 or past the "还有 N 张未显示" fold — so
 * the release never snaps.
 *
 * Second residual (the "slight" open jitter after the target was fixed):
 * during the width beat the panel column was squeezed from ~0px to full
 * width, so its visibly fading content reflowed continuously — thumbs
 * growing, text rewrapping — against the dead-still list column. The sweep
 * therefore also holds the panel column at its settled width (measured at
 * the frozen layout, carried in a CSS var, applied by the sweeping class in
 * the wide row layout only) and lets the box growth act as a pure
 * clip-reveal: the panel's geometry is final from frame 0, and only the
 * clip window, the box height and the entrance opacity animate.
 *
 * Returns a cleanup that releases the pin (safe to call twice).
 */
export function sweepShellHeight(shell, { from, fromWidth, maxHeight, duration = SWEEP_MS } = {}) {
  if (!shell || typeof from !== "number" || !Number.isFinite(from)) return () => {};
  if (typeof shell.getBoundingClientRect !== "function") return () => {};
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return () => {};
  // Freeze before the first post-commit recalc: the class flip applies
  // instantly (no transition has started yet to race with), so the box can
  // be measured at its settled width. The previous inline transition, if
  // any, is restored whenever nothing needs animating.
  const prevTransition = shell.style.transition;
  shell.style.transition = "none";
  const finalRect = shell.getBoundingClientRect();
  const toWidth = finalRect.width;
  // Post-commit box: the clamped layout height and the unclamped content
  // extent — the sweep's target is the clamp ceiling, not the content.
  const content = Math.max(finalRect.height, shell.scrollHeight || 0);
  const target = typeof maxHeight === "number" ? Math.min(content, maxHeight) : content;
  const startWidth = typeof fromWidth === "number" && Number.isFinite(fromWidth)
    ? fromWidth
    : toWidth; // retarget/resize sweeps keep the width pinned to the box
  const heightDelta = Math.abs(target - from);
  const widthDelta = Math.abs(toWidth - startWidth);
  if (!Number.isFinite(target) || (heightDelta < 1 && widthDelta < 1)) {
    // Never leak the freeze. Real CSSStyleDeclarations read "" when the
    // inline property is unset, so the restore-assignment clears it; only
    // plain-object test doubles read undefined, and those delete instead.
    if (prevTransition === undefined) delete shell.style.transition;
    else shell.style.transition = prevTransition;
    return () => {};
  }
  const release = () => {
    shell.style.height = "";
    shell.style.width = "";
    shell.style.transition = "";
    shell.style.overflow = "";
    shell.style.removeProperty?.("--dsh-skins-sweep-panel-basis");
    shell.classList?.remove?.("dsh-skins-sweeping");
  };
  // Hold the panel column at its SETTLED width for the morph: measured here
  // at the frozen settled layout, then pinned via the sweeping class (fixed
  // basis, no shrink) so the panel's content never reflows mid-flight — the
  // box growth becomes a pure clip-reveal. Without the hold, the column is
  // squeezed from ~0px to full width while the entrance animation fades it
  // in, and the visibly fading content squirms (thumbs growing, text
  // rewrapping) against the dead-still list column — the residual open-
  // direction jitter. The CSS var carries the measured width; the class
  // only bites in the wide row layout (desktop media query).
  const panelColumn = shell.querySelector?.(".dsh-skins-pz-panel") ?? null;
  const panelBasis = panelColumn === null ? 0 : panelColumn.getBoundingClientRect().width;
  // The inline transition REPLACES the stylesheet's width-only transition —
  // it must restate width, or the box would snap horizontally mid-sweep.
  // Both axes are pinned first (the class already says "final", so width
  // would otherwise jump pre-paint), then released together on one beat.
  shell.classList?.add?.("dsh-skins-sweeping"); // clip-reveal: no scrollbars while clamped
  if (panelBasis > 0) {
    shell.style.setProperty?.("--dsh-skins-sweep-panel-basis", `${Math.round(panelBasis * 100) / 100}px`);
  }
  shell.style.height = `${from}px`;
  shell.style.width = `${startWidth}px`;
  shell.style.overflow = "hidden";
  void shell.offsetHeight; // commit the pins as the transition's from-values
  shell.style.transition = `width ${duration}ms ease-out, height ${duration}ms ease-out`;
  shell.style.width = `${toWidth}px`;
  shell.style.height = `${target}px`;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    shell.removeEventListener?.("transitionend", onEnd);
    release();
  };
  const onEnd = (event) => { if (event?.propertyName === "height") finish(); };
  const timer = setTimeout(finish, duration + 60); // transitionend can be eaten
  shell.addEventListener?.("transitionend", onEnd);
  return finish;
}
const THEME_CHOICES = [
  { id: "light", labelKey: "appearance.light" },
  { id: "dark", labelKey: "appearance.dark" },
  { id: "system", labelKey: "appearance.system" },
];

const SHELL_CSS = [
  '[data-slot="sidebar.footer.action"]{display:flex!important;flex-direction:column;width:100%;min-width:0}',
  '[data-slot="sidebar.footer.action"]>*{flex:none;min-width:0}',
  '.dsh-skins-switcher-wrap{width:100%}',
  '.dsh-skins-switcher-wrap.rail{display:flex;justify-content:center}',
  '.dsh-skins-switcher-btn{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:calc(100% + 4px);height:42px;margin:4px -2px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;overflow:hidden}',
  '.dsh-skins-switcher-wrap.rail .dsh-skins-switcher-btn{width:36px;height:36px;margin:8px 0 10px;padding:0;justify-content:center;border-radius:50%;gap:0}',
  '.dsh-skins-switcher-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-skins-switcher-btn.on,.dsh-skins-switcher-btn[aria-expanded=true]{background:var(--dsw-specific-sidebar-nav-item-active)}',
  '.dsh-skins-switcher-btn svg{flex:none;width:16px;height:16px}',
  '.dsh-skins-switcher-wrap.rail .dsh-skins-switcher-btn svg{width:18px;height:18px}',
  '.dsh-skins-switcher-btn span{white-space:nowrap;overflow:hidden}',
  '.dsh-skins-pop{position:fixed;z-index:60;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:min(390px,calc(100vw - 24px));max-height:calc(100vh - 24px);padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.14));overflow-y:auto;transition:width .2s ease-out}',
  // Slim themed scrollbars for the shell's own scroll region (list-only
  // popover): thin + token-colored thumb, WebKit and Firefox both covered.
  '.dsh-skins-pop{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
  '.dsh-skins-pop::-webkit-scrollbar{width:8px;height:8px}',
  '.dsh-skins-pop::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}',
  '.dsh-skins-pop::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}',
  '.dsh-skins-pop::-webkit-scrollbar-track{background:transparent}',
  // 【共享原子】.dsh-skins-pop-title is shared vocabulary: the panel module
  // reuses it for its header heading (styled contextually in PANEL_CSS).
  '.dsh-skins-pop-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:0 4px}',
  '.dsh-skins-theme-grid{display:flex;align-items:stretch;gap:8px}',
  '.dsh-skins-theme-card{box-sizing:border-box;display:flex;flex:1;min-width:0;height:72px;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
  '.dsh-skins-theme-card:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-skins-theme-card-on,.dsh-skins-theme-card-on:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-skins-theme-card svg{width:18px;height:18px;flex:none}',
  '.dsh-skins-pop-divider{height:1px;margin:4px 0;background:var(--dsw-alias-border-l2)}',
  '.dsh-skins-pop-card{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;width:100%;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}',
  '.dsh-skins-pop-card:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-skins-pop-card-on,.dsh-skins-pop-card-on:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-skins-pop-card-label{font-size:14px;line-height:20px;font-weight:500}',
  '.dsh-skins-pop-card-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
  // 【共享原子】.dsh-skins-update-spinner (+ its keyframes and the
  // reduced-motion opt-out) is shared vocabulary: the update panel AND the
  // personalization panel's delete badge both render it.
  '.dsh-skins-update-spinner{width:16px;height:16px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsh-skins-spin .8s linear infinite}',
  '@keyframes dsh-skins-spin{to{transform:rotate(360deg)}}',
  '@media (prefers-reduced-motion:reduce){.dsh-skins-update-spinner{animation:none}}',
  // -- personalization gear + panel -------------------------------------------
  '.dsh-skins-pop-card-row{display:flex;width:100%;min-width:0;gap:6px;align-items:stretch}',
  '.dsh-skins-pop-card-row .dsh-skins-pop-card{flex:1;min-width:0}',
  '.dsh-skins-pz-gear{position:relative;flex:none;align-self:center;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.75;transition:opacity .15s}',
  '.dsh-skins-pz-gear:hover,.dsh-skins-pz-gear:focus-visible,.dsh-skins-pz-gear.touch{opacity:1;border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}',
  // Expanded state (declared after the hover rule so the brand tint wins
  // while hovering too): the gear IS the panel toggle — make that legible in
  // both states, same visual language as the selected skin card.
  '.dsh-skins-pz-gear[aria-expanded="true"]{opacity:1;border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}',
  '.dsh-skins-pz-gear svg{width:16px;height:16px}',
  // Deep dark surfaces: meirenzhi/openbmc/uefi/tgcf tint the bg-overlay token
  // with their own families, but in the OFFICIAL skin no token override exists
  // and the pop inherited the host's washed mid-gray (#61666b). Scope a
  // deep charcoal to the no-skin state (ruling #16); skinned modes keep
  // their token-driven overlay.
  'body[data-ds-dark-theme]:not([data-dsh-meirenzhi-skin]):not([data-dsh-openbmc-skin]):not([data-dsh-uefi-harness]):not([data-dsh-tgcf-skin]) .dsh-skins-pop{background:rgba(41,42,44,0.97)}',
  // -- combined shell (Q44/Q46): list column + docked panel column ----------
  '.dsh-skins-pop.dsh-skins-wide{flex-direction:row;align-items:stretch;width:min(1105px,calc(100vw - 24px))}',
  '.dsh-skins-pop-main{display:flex;flex-direction:column;gap:8px;min-width:0;width:360px;flex:none}',
  '.dsh-skins-pop.dsh-skins-wide .dsh-skins-pop-main{flex:0 0 360px}',
  // box-sizing is NOT inherited: without border-box here, the sweep's
  // measured rect width feeds flex-basis as a CONTENT width (+15px padding/
  // border), so the panel would sit 15px wide through the morph and snap
  // back at release — border-box makes the measured rect and the basis the
  // same quantity.
  // The panel COLUMN container is rendered by this shell (粘连外壳), so its
  // styles are shell-owned; the panel module's own root is .dsh-skins-pz.
  // The class name is part of the panel module's published interface to the
  // shell — the sweep rules below target it by name.
  '.dsh-skins-pz-panel{box-sizing:border-box;flex:0 1 700px;min-width:0;display:flex;flex-direction:column;gap:10px;padding-left:14px;border-left:1px solid var(--dsw-alias-border-l2);overflow-x:hidden;transform:translateX(16px);opacity:0;animation:dsh-skins-pz-in .2s ease-out forwards}',
  '@keyframes dsh-skins-pz-in{to{transform:none;opacity:1}}',
  '@media (prefers-reduced-motion:reduce){.dsh-skins-pz-panel{animation:none;transform:none;opacity:1}.dsh-skins-pop{transition:none}}',
  // Stacked sheet (≤904px + panel open): the shell becomes a near-full-
  // viewport sheet and the PANEL COLUMN owns the scroll (flex-fills the
  // shell, slim scrollbar) — anchoring a growing panel above the trigger
  // crammed list + panel into one sliver (field report: 窄视窗小条条).
  // Specificity (0,3,0) still beats the wide-scroll base rule below for
  // flex/basis; overflow-y now INHERITS that base rule instead of opting out.
  '@media (max-width:904px){.dsh-skins-pop.dsh-skins-wide{flex-direction:column;width:min(390px,calc(100vw - 24px))}.dsh-skins-pz-panel{flex:1 1 auto;min-height:0;flex-basis:auto;padding-left:0;border-left:0;border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px;transform:translateY(12px)}}',
  '.dsh-skins-pz-panel{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
  '.dsh-skins-pz-panel::-webkit-scrollbar{width:8px;height:8px}',
  '.dsh-skins-pz-panel::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}',
  '.dsh-skins-pz-panel::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}',
  '.dsh-skins-pz-panel::-webkit-scrollbar-track{background:transparent}',
  // -- field issue #2: a dedicated scroll region for the panel column -----
  //    (the cell corner-badges / sticky action bar half of the same ruling
  //    lives in the panel's own PANEL_CSS now) --------------------------------
  '.dsh-skins-wide .dsh-skins-pz-panel{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}',
  // While the shell is mid-sweep its height is pinned below the panel's
  // content extent, so scrollbars would flash on for the ~200ms of the
  // morph: the whole shell clips (both axes — the panel column is held wide
  // and overflows horizontally during the reveal), and the panel column's
  // own scrollbar is clipped too. Equal specificity with the wide scroll
  // rule and declared after it, so wide mode clips during the sweep; the
  // stacked sheet keeps the panel's own scroll region and clips with it.
  // Sweep is SHELL motion behaviour: these rules are written against the
  // panel column's class name — the declared interface use mentioned above.
  '.dsh-skins-sweeping{overflow:hidden}',
  '.dsh-skins-sweeping .dsh-skins-pz-panel{overflow-y:hidden}',
  // Clip-reveal hold (issue #13 rev. 2): the panel column stays at its
  // settled width for the whole beat — measured into the CSS var by the
  // sweep — so its content never reflows while it fades in. Desktop wide
  // row layout only; in the stacked column layout a fixed flex-basis would
  // be a HEIGHT, and the stacked panel never reflows horizontally anyway.
  '@media (min-width:905px){.dsh-skins-sweeping.dsh-skins-wide .dsh-skins-pz-panel{flex:0 0 var(--dsh-skins-sweep-panel-basis,700px)}}',
].join("\n");

/** Single style tag composition: shell chrome first, then the surface
 *  modules' owned CSS. The order IS the cascade contract (equal-specificity
 *  pairs must not cross blocks) — pinned by tests/sidebar-switcher.test.mjs. */
const CSS = [SHELL_CSS, PANEL_CSS, UPDATE_CSS].join("\n");

export function installSidebarSwitcher(ctx, { runtime, jsx, react, reactDom, configClient, skinsById }) {
  const UpdatePanel = createUpdatePanel({ jsx, react });

  function fallbackTranslate(key, params = {}) {
    return formatTemplate(DICTS.zh[key] ?? key, params);
  }

  /** Locale-aware translate for the personalization surface. */
  function localeTranslate(key, params = {}) {
    try {
      const text = ctx.locale?.translate?.(NS, key, params);
      if (typeof text === "string" && text !== key) return text;
    } catch {}
    return fallbackTranslate(key, params);
  }

  function labelFor(skinId) {
    if (skinId === runtime.officialId) return localeTranslate("skins.official.label");
    const listed = runtime.list().find((skin) => skin.id === skinId);
    return listed?.label ?? skinId;
  }

  function builtinAssetsFor(skinId) {
    return skinsById?.(skinId)?.builtinAssets ?? {};
  }

  const PersonalizationPanel = configClient
    ? createPersonalizationPanel({
      jsx, react, configClient, tr: localeTranslate, builtinAssetsFor, labelFor,
    })
    : null;

  function GearIcon() {
    return jsx("svg", {
      width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
      xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true",
      children: jsx("path", {
        d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
          + "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
        stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round",
      }),
    });
  }

  function SwitcherIcon() {
    return jsx("svg", {
      width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
      xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true",
      children: [
        jsx("path", { d: "M12 3a9 9 0 1 0 .6 17.98c1.2-.05 1.8-1.5 1-2.4-.9-1-.25-2.58 1.1-2.58H18a4 4 0 0 0 4-4c0-5-4.5-9-10-9Z", stroke: "currentColor", strokeWidth: "1.6" }),
        jsx("circle", { cx: "7.8", cy: "10.2", r: "1.1", fill: "currentColor" }),
        jsx("circle", { cx: "11", cy: "7.2", r: "1.1", fill: "currentColor" }),
        jsx("circle", { cx: "15.2", cy: "7.8", r: "1.1", fill: "currentColor" }),
        jsx("circle", { cx: "17.4", cy: "11.4", r: "1.1", fill: "currentColor" }),
      ],
    });
  }

  function ThemeIcon({ id }) {
    if (id === "light") {
      return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
        jsx("circle", { cx: "12", cy: "12", r: "4", stroke: "currentColor", strokeWidth: "1.6" }),
        jsx("path", { d: "M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
      ] });
    }
    if (id === "dark") {
      return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: jsx("path", { d: "M20 15.2A8.2 8.2 0 0 1 8.8 4a8.2 8.2 0 1 0 11.2 11.2Z", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }) });
    }
    return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
      jsx("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2.5", stroke: "currentColor", strokeWidth: "1.6" }),
      jsx("path", { d: "M8 21h8M12 17v4", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
    ] });
  }

  function SidebarAction({ wide, t }) {
    const tr = typeof t === "function" ? (key, params) => t(key, params) : fallbackTranslate;
    const [open, setOpen] = react.useState(false);
    const [activeId, setActiveId] = react.useState(runtime.active);
    const [box, setBox] = react.useState(null);
    const [personalizeId, setPersonalizeId] = react.useState(null);
    const [themePreference, setThemePreference] = react.useState(() => ctx.theme?.getTheme?.().preference ?? "system");
    const buttonRef = react.useRef(null);
    const shellRef = react.useRef(null);
    const shellSizeRef = react.useRef(null);

    // Capture the shell's current box (width AND height) during render — i.e.
    // BEFORE React mutates the DOM for this render — so the size sweep
    // (layout effect below) knows the box's pre-toggle geometry on both
    // axes. Reading layout here is fine: this component re-renders only on
    // discrete user/state events.
    if (open && shellRef.current && typeof shellRef.current.getBoundingClientRect === "function") {
      const rect = shellRef.current.getBoundingClientRect();
      shellSizeRef.current = { width: rect.width, height: rect.height };
    }

    // Closing the shell clears the panel state. Auto-save lives in the
    // session-global config client (ADR-0003), so an in-flight debounce
    // completes regardless of the shell's lifecycle.
    react.useEffect(() => {
      if (open) return undefined;
      setPersonalizeId(null);
      return undefined;
    }, [open]);

    const closeShell = () => {
      setOpen(false);
      // The gear unmounts with the shell; focus lands on the persistent trigger.
      buttonRef.current?.focus?.();
    };

    // Collapse the panel back into the skin list WITHOUT dismissing the
    // shell — the same move as clicking the expanded gear. Focus returns to
    // that gear so keyboard users keep their place; the panel header's
    // collapse control routes here too (v1.0.0 ruling).
    const collapsePanel = (skinId) => {
      setPersonalizeId(null);
      try { document.getElementById(`${skinId}-gear`)?.focus?.(); } catch {}
    };

    react.useEffect(() => {
      if (!open) return undefined;
      const onPointer = (event) => {
        const node = event.target;
        if (!node || typeof node.closest !== "function") return;
        if (node.closest(".dsh-skins-pop, .dsh-skins-switcher-wrap")) return;
        closeShell();
      };
      const onKey = (event) => { if (event.key === "Escape") closeShell(); };
      document.addEventListener("pointerdown", onPointer, true);
      window.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", onPointer, true);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);

    react.useEffect(() => {
      const onChange = () => setActiveId(runtime.active());
      window.addEventListener("dsh-skins:active-changed", onChange);
      return () => window.removeEventListener("dsh-skins:active-changed", onChange);
    }, []);

    react.useEffect(() => ctx.on("theme/change", (snapshot) => {
      if (snapshot?.preference) setThemePreference(snapshot.preference);
    }), []);

    const openPopover = () => {
      const rect = buttonRef.current?.getBoundingClientRect?.() ?? { left: 12, top: window.innerHeight - 60 };
      setBox({ left: Math.round(rect.left) + 4, bottom: Math.round(window.innerHeight - rect.top + 8) });
      setActiveId(runtime.active());
      setThemePreference(ctx.theme?.getTheme?.().preference ?? "system");
      setOpen(true);
    };

    const themeCards = THEME_CHOICES.map((choice) => jsx("button", {
      type: "button",
      className: `dsh-skins-theme-card${themePreference === choice.id ? " dsh-skins-theme-card-on" : ""}`,
      "aria-pressed": themePreference === choice.id,
      onClick: () => {
        ctx.theme.setTheme(choice.id);
        setThemePreference(choice.id);
      },
      children: [jsx(ThemeIcon, { id: choice.id }), jsx("span", { children: tr(choice.labelKey) })],
    }, choice.id));

    const choices = [
      {
        id: runtime.officialId,
        label: tr("skins.official.label"),
        description: tr("skins.official.description"),
      },
      ...runtime.list(),
    ];
    const skinCards = choices.map((skin) => {
      const personalizable = configClient !== null && getSkinSchema(skin.id) !== null;
      const card = jsx("button", {
        type: "button",
        role: "menuitemradio",
        "aria-checked": activeId === skin.id,
        className: `dsh-skins-pop-card${activeId === skin.id ? " dsh-skins-pop-card-on" : ""}`,
        onClick: () => {
          // Panel open → the card is a panel-target switch (design §7.2,
          // v2.4.1): the panel follows the selection so active and panel
          // target can never split. No confirmation — auto-save keeps the
          // preview layer transient and harmless (v2.5). A non-personalizable
          // target (no schema) collapses the panel instead of following.
          if (personalizeId !== null && personalizeId !== skin.id) {
            setPersonalizeId(personalizable ? skin.id : null);
          }
          runtime.select(skin.id);
          setActiveId(skin.id);
        },
        children: [
          jsx("span", { className: "dsh-skins-pop-card-label", children: skin.label }),
          jsx("span", { className: "dsh-skins-pop-card-desc", children: skin.description }),
        ],
      }, skin.id);
      if (!personalizable) return card;
      return jsx("div", { className: "dsh-skins-pop-card-row", children: [
        card,
        jsx("button", {
          type: "button",
          id: `${skin.id}-gear`,
          className: "dsh-skins-pz-gear",
          "aria-label": localeTranslate("personalization.title"),
          title: localeTranslate("personalization.title"),
          "aria-expanded": personalizeId === skin.id,
          onClick: () => {
            if (personalizeId === skin.id) {
              // Collapse: focus returns to the gear.
              collapsePanel(skin.id);
              return;
            }
            // Opening (or re-targeting) the panel selects the skin so edits
            // preview live; auto-save persists them in the background (v2.5).
            runtime.select(skin.id);
            setActiveId(runtime.active());
            setPersonalizeId(skin.id);
          },
          children: [
            jsx(GearIcon, {}),
          ],
        }, `${skin.id}-gear`),
      ] }, skin.id);
    });

    const showPersonalization = personalizeId !== null && PersonalizationPanel !== null;
    // Wide shell (Q46, v2.4.1 #3): list column (360px) + shrinkable panel
    // column (700px basis) in one 1105px dialog. Clamp so the wide shell
    // never overflows the right edge.
    // Stacked sheet (viewport ≤904px + panel open): stop anchoring the shell
    // to the trigger's remaining headroom — on a short window that clamps
    // the shell to a sliver and list + panel fight for it (field report:
    // 窄视窗下全部塞进小条条). The shell becomes a near-full-viewport
    // sheet (12px margins) and the stacked CSS lets the panel column flex-
    // fill it with its own scroll region. List-only popovers keep the
    // anchor clamp (field issue #2 semantics unchanged).
    const stackedSheet = showPersonalization && typeof window !== "undefined" && window.innerWidth <= 904;
    const shellLeft = box === null ? undefined
      : showPersonalization && typeof window !== "undefined"
        ? Math.max(12, Math.min(box.left, window.innerWidth - 1117))
        : box.left;
    // Clamp the shell to the space actually available ABOVE its bottom
    // anchor: the CSS max-height(100vh-24px) alone ignores the anchor
    // offset, so a tall panel slides its top off-screen with the content
    // unreachable AND unscrollable (field issue #2). The stacked sheet
    // replaces the anchor term with the full viewport (minus the margins).
    const shellMaxHeight = box === null || typeof window === "undefined" || typeof window.innerHeight !== "number"
      ? undefined
      : stackedSheet
        ? window.innerHeight - 24
        : Math.max(220, window.innerHeight - box.bottom - 12);
    // Post-commit, pre-paint: pin the pre-toggle box and sweep BOTH axes to
    // the settled one on a single beat (field issue #13, revised — see
    // sweepShellHeight for why the target must be measured at the final
    // width, not at the width transition's progress-0 layout).
    react.useLayoutEffect(() => {
      if (!open || box === null) return undefined;
      const shell = shellRef.current;
      if (!shell) return undefined;
      const size = shellSizeRef.current;
      shellSizeRef.current = null;
      return sweepShellHeight(shell, {
        from: size?.height,
        fromWidth: size?.width,
        maxHeight: shellMaxHeight,
      }) ?? undefined;
    }, [open, showPersonalization, personalizeId, shellMaxHeight]);
    const panel = open && box && typeof document !== "undefined"
      ? reactDom.createPortal(jsx("div", {
        ref: shellRef,
        className: `dsh-skins-pop${showPersonalization ? " dsh-skins-wide" : ""}`,
        role: "dialog",
        "aria-label": showPersonalization ? localeTranslate("personalization.title") : tr("skins.switch"),
        style: { left: shellLeft, bottom: stackedSheet ? 12 : box.bottom, maxHeight: shellMaxHeight },
        children: [
          jsx("div", { key: "main", className: "dsh-skins-pop-main", children: [
            jsx("div", { key: "appearance", className: "dsh-skins-pop-title", children: tr("appearance.title") }),
            jsx("div", { key: "grid", className: "dsh-skins-theme-grid", children: themeCards }),
            jsx("div", { key: "d1", className: "dsh-skins-pop-divider", "aria-hidden": "true" }),
            jsx("div", { key: "skins", className: "dsh-skins-pop-title", children: tr("skins.title") }),
            ...skinCards,
            jsx(UpdatePanel, { key: "update", open, tr }),
          ] }),
          showPersonalization ? jsx("div", {
            key: "panel", className: "dsh-skins-pz-panel",
            role: "region", "aria-label": localeTranslate("personalization.panelLabel"),
            children: jsx(PersonalizationPanel, {
              skinId: personalizeId,
              onCollapse: () => collapsePanel(personalizeId),
            }),
          }) : null,
        ],
      }), document.body)
      : null;

    return jsx("div", {
      className: `dsh-skins-switcher-wrap${wide ? "" : " rail"}`,
      children: [
        jsx("button", {
          ref: buttonRef,
          type: "button",
          className: `dsh-skins-switcher-btn${open ? " on" : ""}`,
          "aria-label": tr("skins.switch"),
          "aria-expanded": open,
          title: tr("skins.switch"),
          onClick: () => { if (open) closeShell(); else openPopover(); },
          children: [jsx(SwitcherIcon, {}), wide ? jsx("span", { children: tr("skins.switch") }) : null],
        }),
        panel,
      ],
    });
  }

  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-skins";
    tag.dataset.pluginCss = TAG_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "dsh-skins: sidebar switcher style");

  ctx.effect(() => {
    try { return ctx.locale.register(NS, DICTS); } catch { return () => {}; }
  }, "dsh-skins: sidebar switcher dictionary");

  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "skins-switcher",
    order: 4,
    locale: NS,
    label: () => {
      try {
        const text = ctx.locale?.translate?.(NS, "skins.switch");
        if (typeof text === "string" && text !== "skins.switch") return text;
      } catch {}
      return fallbackTranslate("skins.switch");
    },
  }, SidebarAction));
}
