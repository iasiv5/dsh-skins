/**
 * Combined-shell switcher tests (T6): the five dirty-leave channels, the
 * docked panel column, and focus management — driven through the REAL
 * installSidebarSwitcher + REAL panel with the shared fake React.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { installSidebarSwitcher, sweepShellHeight } from "../src/client/sidebar-switcher.js";
import { PANEL_CSS } from "../src/client/personalization/panel.js";
import { UPDATE_CSS } from "../src/client/update-panel.js";
import { createFakeReact, jsx, flatten } from "./fake-react.mjs";

function makeDom(viewportHeight = 900, viewportWidth = 1400) {
  const docListeners = new Map();
  const winListeners = new Map();
  const focused = [];
  const confirms = [];
  const created = [];
  let confirmResult = true;
  globalThis.document = {
    head: { appendChild: () => {}, removeChild: () => {} },
    body: { appendChild: () => {} },
    getElementById: (id) => (id.endsWith("-gear") ? { focus: () => focused.push(id) } : null),
    createElement: () => { const el = { dataset: {}, appendChild: () => {}, remove() {} }; created.push(el); return el; },
    addEventListener: (kind, fn) => docListeners.set(kind, fn),
    removeEventListener: () => {},
  };
  globalThis.window = {
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    confirm: (text) => { confirms.push(text); return confirmResult; },
    addEventListener: (kind, fn) => winListeners.set(kind, fn),
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  return {
    docListeners, winListeners, focused, confirms, created,
    setConfirm: (value) => { confirmResult = value; },
    fireOutsidePointer: () => docListeners.get("pointerdown")({ target: { closest: () => null } }),
    fireEscape: () => winListeners.get("keydown")({ key: "Escape" }),
  };
}

function makeConfigClient() {
  const listeners = new Set();
  const previews = new Map();
  let state = { status: "synced", revision: 7, mode: "normal", skins: {}, library: [], references: {}, dirtyCount: 0 };
  const calls = { flushNow: 0, restore: 0 };
  const emit = () => { for (const l of [...listeners]) l(state); };
  return {
    calls,
    getState: () => state,
    onStateChange: (l) => (listeners.add(l), () => listeners.delete(l)),
    effectiveOverrides: () => ({}),
    preview: () => { previews.set("tgcf panelOpacity", 66); state = { ...state, dirtyCount: previews.size }; emit(); },
    previewReset: () => {},
    restore: () => { calls.restore += 1; previews.clear(); state = { ...state, dirtyCount: 0 }; emit(); },
    flushNow: async () => { calls.flushNow += 1; return { flushed: 1 }; },
    retry: () => {},
    uploadImage: async () => ({ error: "offline" }),
    deleteImage: async () => ({ error: "offline" }),
    confirmRecovery: async () => ({ ok: true }),
    refetch: async () => {},
    assetUrl: () => null,
  };
}

function makeHarness(viewportHeight = 900, viewportWidth = 1400) {
  const dom = makeDom(viewportHeight, viewportWidth);
  const configClient = makeConfigClient();
  const react = createFakeReact();
  let active = "openbmc";
  const runtime = {
    officialId: "official",
    active: () => active,
    select: (id) => { active = id; },
    list: () => [
      { id: "openbmc", label: "OpenBMC", description: "bmc" },
      { id: "uefi-harness", label: "UEFI", description: "uefi" },
      { id: "tgcf", label: "TGCF", description: "tgcf" },
    ],
  };
  const themeSnapshot = { preference: "system", active: { id: "light" }, themes: [], revision: 0 };
  let registered = null;
  const ctx = {
    effect: (fn) => { fn(); return () => {}; },
    slots: {
      inject: (key, callback) => callback() ?? (() => {}),
      register: (opts, comp) => { registered = { opts, comp }; return () => {}; },
    },
    locale: {
      register: () => () => {},
      getLocale: () => ({ active: "zh" }),
      translate: () => null,
    },
    theme: {
      getTheme: () => themeSnapshot,
      setTheme: (id) => { themeSnapshot.preference = id; },
      on: () => () => {},
    },
    on: () => () => {},
    connection: { isLoopback: false },
  };
  const reactDom = { createPortal: (children) => ({ $$portal: true, children }) };
  installSidebarSwitcher(ctx, {
    runtime,
    jsx: (type, props, key) => jsx(type, props, key),
    react,
    reactDom,
    configClient,
    skinsById: () => ({}),
  });
  const SidebarAction = registered.comp;

  let tree = null;
  const attachFocusRecorders = () => {
    // Attach recorders where the components call .focus() so focus
    // management is observable through the fake DOM. Runs after EVERY render:
    // rerenders recreate node objects and refs follow the newest node.
    for (const node of [...flatten(tree), ...inShell()]) {
      if (node.props?.tabIndex === -1 && node.props?.role === "heading" && node.focus === undefined) {
        node.focus = (options) => dom.focused.push(options?.preventScroll ? "panel-heading-prevent-scroll" : "panel-heading");
      }
      if (node.type === "button" && String(node.props.className).includes("dsh-skins-switcher-btn") && node.focus === undefined) {
        node.focus = () => dom.focused.push("switcher-trigger");
      }
    }
  };

  const render = () => react.render(() => {
    tree = react.instantiate(jsx(SidebarAction, { wide: true }));
    // The reactDom stub bypasses instantiate for portal content — descend
    // manually so the shell's components (panel included) become real trees.
    for (const node of flatten(tree)) {
      if (node?.$$portal && node.children !== undefined) {
        node.children = react.instantiate(node.children);
      }
    }
    attachFocusRecorders();
  });

  // The reactDom stub renders portals as { $$portal, children } — descend
  // into the shell before flattening; the switcher trigger lives outside it.
  const shell = () => {
    const portal = tree.props.children.find((child) => child?.$$portal);
    return portal?.children ?? null;
  };
  const inShell = () => flatten(shell() ?? {});
  const gearButton = (skinId) => inShell().find((n) => n.type === "button" && n.props.id === `${skinId}-gear`);
  const cardButton = (skinId) => inShell().find(
    (n) => n.type === "button" && n.props.role === "menuitemradio" && n.key === skinId,
  );
  const switcherButton = () => flatten(tree).find((n) => n.type === "button" && String(n.props.className).includes("dsh-skins-switcher-btn"));
  const panelColumn = () => inShell().find((n) => n.props?.className === "dsh-skins-pz-panel") ?? null;
  const collapseButton = () => inShell().find(
    (n) => n.type === "button" && String(n.props.className).includes("dsh-skins-pz-collapse"),
  ) ?? null;
  const translucencyInput = () => inShell().find((n) => n.type === "input" && n.props["aria-label"] === "通透度 Transparency");
  const heading = () => inShell().find((n) => n.props?.role === "heading");

  render();

  const openShell = async () => {
    switcherButton().props.onClick();
    await tick();
    attachFocusRecorders();
  };

  return { dom, configClient, tree: () => tree, render, shell, gearButton, cardButton, switcherButton, panelColumn, collapseButton, translucencyInput, heading, openShell, attachFocusRecorders, getActive: () => active,
    cssText: () => dom.created.map((el) => el.textContent ?? "").join("\n") };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("① gear opens the docked panel column and focuses the heading", async () => {
  const h = makeHarness();
  await h.openShell();
  assert.equal(h.panelColumn(), null, "no panel before the gear click");

  h.gearButton("tgcf").props.onClick();
  await tick();
  h.attachFocusRecorders();
  // The panel mount effect runs at the next microtask checkpoint; give the
  // recorder a chance by re-running it through another render cycle.
  await tick();
  const column = h.panelColumn();
  assert.notEqual(column, null, "panel column appears beside the list");
  assert.equal(column.props.role, "region");
  assert.equal(column.props["aria-label"], "个性化设置");
   assert.ok(h.dom.focused.includes("panel-heading-prevent-scroll"),
     "panel heading receives focus without scrolling the transitioning shell");
  const gearNode = h.gearButton("tgcf");
  assert.equal(flatten(gearNode).some((n) => n.props?.className === "dsh-skins-pz-gear-dot"), false,
    "no override dot on the gear (user ruling #9)");
  const shell = h.shell();
  assert.ok(String(shell.props.className).includes("dsh-skins-wide"), "shell enters wide mode");
  assert.ok(String(shell.props.className).includes("dsh-skins-pop"), "shell keeps the dialog class");
});

test("② clean shell: outside click closes, focus returns to the trigger, and NOTHING flushes (R1)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("openbmc").props.onClick();
  await tick();
  h.dom.fireOutsidePointer();
  await tick();
  assert.equal(h.shell(), null, "shell closed");
  assert.ok(h.dom.focused.includes("switcher-trigger"), "focus lands on the persistent trigger");
  assert.equal(h.configClient.calls.flushNow, 0, "no PATCH path may run on close (ADR-0001)");
});

test("③ outside click closes directly — no confirmation even with a pending edit (ADR-0003)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.translucencyInput().props.onChange({ target: { value: "66" } });
  await tick();
  assert.equal(h.configClient.getState().dirtyCount, 1, "edit pending (the debounce owns it)");

  h.dom.fireOutsidePointer();
  await tick();
  assert.equal(h.shell(), null, "shell closed");
  assert.equal(h.dom.confirms.length, 0, "no discard dialog — auto-save owns persistence");
  assert.ok(h.dom.focused.includes("switcher-trigger"), "focus lands on the persistent trigger");
  assert.equal(h.configClient.calls.flushNow, 0, "closing never flushes; the debounce does");
});

test("④ Escape closes directly — no confirmation (ADR-0003)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.translucencyInput().props.onChange({ target: { value: "66" } });
  await tick();
  h.dom.fireEscape();
  await tick();
  assert.equal(h.shell(), null, "Escape closes");
  assert.equal(h.dom.confirms.length, 0, "no dialog");
});

test("⑤ gear re-click collapses the panel directly (no confirm, ADR-0003)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.gearButton("tgcf").props.onClick();
  await tick();
  assert.equal(h.panelColumn(), null, "panel collapsed");
  assert.notEqual(h.shell(), null, "shell itself stays open");
  assert.equal(h.dom.confirms.length, 0, "no confirmation on collapse");
});

test("⑥ gear target switch works directly (no dirty confirm, ADR-0003)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.gearButton("openbmc").props.onClick();
  await tick();
  assert.equal(h.getActive(), "openbmc", "active follows the gear");
  assert.ok(h.heading().props.children.includes("OpenBMC"), "panel retargeted");
  assert.equal(h.dom.confirms.length, 0, "no confirmation");
});

test("⑦ panel open: card click follows the panel target (v2.4.1, reverses Q48)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.cardButton("uefi-harness").props.onClick();
  await tick();
  assert.equal(h.getActive(), "uefi-harness", "card switches the active skin");
  assert.equal(h.dom.confirms.length, 0, "clean panel → no confirm needed");
  assert.notEqual(h.panelColumn(), null, "panel stays docked");
  assert.ok(h.heading().props.children.includes("UEFI"), "panel target follows the selection");
  // Active and panel target can never split while the panel is open.
  assert.ok(!h.heading().props.children.includes("TGCF"), "stale panel content is gone");

  // Non-personalizable target (official): the panel collapses via the same
  // clean path instead of docking an empty column.
  h.cardButton("official").props.onClick();
  await tick();
  assert.equal(h.getActive(), "official");
  assert.equal(h.panelColumn(), null, "no empty panel column for a skin without schema");
  assert.equal(h.dom.confirms.length, 0, "still clean → still no confirm");
});

test("⑧ card switch with a pending edit: direct switch, no confirm (ADR-0003)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.translucencyInput().props.onChange({ target: { value: "66" } });
  await tick();
  h.cardButton("uefi-harness").props.onClick();
  await tick();
  assert.equal(h.getActive(), "uefi-harness", "direct switch");
  assert.ok(h.heading().props.children.includes("UEFI"), "panel follows");
  assert.equal(h.dom.confirms.length, 0, "no discard dialog — the debounce owns persistence");
});

test("⑨ panel closed: card click is a plain switch, no confirm", async () => {
  const h = makeHarness();
  await h.openShell();
  h.cardButton("tgcf").props.onClick();
  await tick();
  assert.equal(h.getActive(), "tgcf");
  assert.equal(h.panelColumn(), null, "no panel appears from a card click");
  assert.equal(h.dom.confirms.length, 0, "panel closed ⇒ nothing dirty to guard");
});

test("⑩ shell is clamped to the space above its anchor; panel column scrolls; action bar sticks (issue #2)", async () => {
  const h = makeHarness(900);
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  const sh = h.shell();
  // The trigger stub has no rect → fallback anchor top = innerHeight-60 ⇒ box.bottom = 68.
  assert.equal(sh.props.style.bottom, 68);
  assert.equal(sh.props.style.maxHeight, 820, "innerHeight - anchor - margin: the shell top can never leave the viewport");
  const css = h.cssText();
  assert.ok(css.includes(".dsh-skins-wide .dsh-skins-pz-panel{overflow-y:auto"),
    "wide mode: the panel column owns its scroll region");
  assert.ok(css.includes(".dsh-skins-pz-panel{box-sizing:border-box;flex:0 1 700px"),
    "panel column is shrinkable — the wide shell can never overflow horizontally");
  assert.ok(css.includes("width:min(1105px"),
    "wide shell sized for a 6-per-row wallpaper grid (v2.4.1 #3)");
  assert.ok(css.includes(".dsh-skins-pz-panel{flex:1 1 auto;min-height:0;flex-basis:auto"),
    "stacked (<904px) sheet: the panel column flex-fills the shell and keeps its own scroll region");
  assert.ok(!css.includes("overflow-y:visible"),
    "stacked mode no longer opts the panel out of its scroll region (窄视窗小条条回归)");
  assert.ok(css.includes(".dsh-skins-pz-panel{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}"),
    "panel scroll region gets the slim themed scrollbar (Firefox + Chromium 121+)");
  assert.ok(css.includes(".dsh-skins-pop::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}"),
    "shell scroll region gets the same slim webkit scrollbar");
  assert.ok(css.includes("width:min(390px"),
    "the list column is 360px in BOTH narrow and wide shells (no menu resize on gear click)");
  assert.ok(css.includes("transition:width .2s ease-out"),
    "the shell width animates so docking looks smooth");
  assert.ok(css.includes(".dsh-skins-sweeping{overflow:hidden}"),
    "the morph clips the whole shell (the held panel column overflows horizontally)");
  assert.ok(css.includes(".dsh-skins-sweeping .dsh-skins-pz-panel{overflow-y:hidden}"),
    "the morph clips the panel column's scrollbar for the ~200ms the box is pinned (issue #13 rev.)");
  assert.ok(css.includes("@media (min-width:905px){.dsh-skins-sweeping.dsh-skins-wide .dsh-skins-pz-panel{flex:0 0 var(--dsh-skins-sweep-panel-basis,700px)}}"),
    "the panel column is held at its settled width during the morph (clip-reveal, desktop wide row only)");
  assert.ok(css.indexOf(".dsh-skins-wide .dsh-skins-pz-panel{overflow-y:auto")
    < css.indexOf(".dsh-skins-sweeping .dsh-skins-pz-panel{overflow-y:hidden}"),
    "级联契约：sweep 裁剪必须晚于宽壳滚动规则");
  assert.ok(css.endsWith(PANEL_CSS + "\n" + UPDATE_CSS),
    "组合契约：单标签以 [SHELL, PANEL, UPDATE] 收尾");
  assert.ok(css.includes("min-width:0;width:360px;flex:none"),
    "list column width is fixed in the BASE rule — the instant wide-class flip on collapse cannot resize it");
  assert.ok(css.includes(".dsh-skins-pop{transition:none}"),
    "reduced-motion skips the width animation");
  assert.ok(
    css.includes('body[data-ds-dark-theme]:not([data-dsh-meirenzhi-skin]):not([data-dsh-openbmc-skin]):not([data-dsh-uefi-harness]):not([data-dsh-tgcf-skin]) .dsh-skins-pop{background:rgba(41,42,44,0.97)}'),
    "official dark pop gets a deep charcoal, skinned modes keep their token overlay (ruling #16)");
  assert.ok(
    css.includes(".dsh-skins-pop-card-on,.dsh-skins-pop-card-on:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}"),
    "selected cards border with the skin brand color, not the frozen blue static (ruling #16)");
  assert.ok(!css.includes("var(--dsh-alias-interactive-bg-hover)"),
    "gear hover consumes the real dsw token - the dsh name is a dead key (ruling #16)");

  const tiny = makeHarness(260);
  await tiny.openShell();
  assert.equal(tiny.shell().props.style.maxHeight, 220, "very short viewports keep a usable floor, never a negative/zero clamp");
});

test("⑩b stacked sheet: panel-open popover becomes a near-full-viewport sheet (窄视窗回归)", async () => {
  const h = makeHarness(700, 390);
  await h.openShell();
  // List-only popover keeps the anchor clamp (field issue #2 semantics).
  assert.equal(h.shell().props.style.bottom, 68, "list-only: anchored above the trigger as before");
  assert.equal(h.shell().props.style.maxHeight, 620, "list-only: 700 - 68 - 12, the anchor clamp is unchanged");
  h.gearButton("tgcf").props.onClick();
  await tick();
  // Sheet: 12px margins all around; the panel column flex-fills the rest
  // with its own scroll region (see the stacked media rules in SHELL_CSS).
  assert.equal(h.shell().props.style.bottom, 12, "sheet anchors 12px above the viewport bottom");
  assert.equal(h.shell().props.style.maxHeight, 676, "sheet: 700 - 24, the full viewport minus margins");
  assert.notEqual(h.panelColumn(), null, "the panel column is mounted inside the sheet");
});

test("⑪ gear toggle sweeps the shell box on one beat, measured at the settled width (issue #13 rev.)", () => {
  // Expand regression: the first cut read its height target off the width
  // transition's progress-0 layout, where the panel column is squeezed to
  // ~0px and the content extent is inflated (5000px here). It must measure
  // at the settled width (1105px) instead, then sweep BOTH axes to the
  // final box — otherwise the pin releases with a one-frame drop from the
  // inflated target (the residual open-direction bounce, sized differently
  // at 0/6/12/18+ gallery images).
  let onTransitionEnd = null;
  const makeShell = ({ width, rectHeight, extentByWidth, panelWidth = null }) => {
    const shell = {
      currentWidth: width, // settled layout: the frozen class flip already applied
      rectHeight,
      extentByWidth,
      style: {
        setProperty(name, value) { this[name] = value; },
        removeProperty(name) { delete this[name]; },
      },
      classlist: [],
      offsetHeight: 493, // consumed by the forced reflow between pins and release
      getBoundingClientRect: () => ({ width: shell.currentWidth, height: shell.rectHeight }),
      get scrollHeight() { return shell.extentByWidth[shell.currentWidth]; },
      addEventListener: (kind, fn) => { if (kind === "transitionend") onTransitionEnd = fn; },
      removeEventListener: () => {},
      classList: {
        add: (name) => shell.classlist.push(name),
        remove: (name) => { const at = shell.classlist.indexOf(name); if (at >= 0) shell.classlist.splice(at, 1); },
      },
      querySelector: panelWidth === null ? undefined
        : (selector) => (selector === ".dsh-skins-pz-panel"
          ? { getBoundingClientRect: () => ({ width: panelWidth }) }
          : null),
    };
    return shell;
  };

  const expand = makeShell({ width: 1105, rectHeight: 900, extentByWidth: { 1105: 900, 390: 5000 }, panelWidth: 707 });
  const finish = sweepShellHeight(expand, { from: 493, fromWidth: 390, maxHeight: 1000 });
  assert.equal(expand.style.height, "900px",
    "target is the settled-width content extent, NOT the progress-0 squashed extent clamped (1000px)");
  assert.equal(expand.style.width, "1105px", "width is released to the settled box on the same beat");
  assert.equal(expand.style.overflow, "hidden",
    "both axes clip during the sweep — the held panel column overflows horizontally in the reveal");
  assert.equal(expand.style["--dsh-skins-sweep-panel-basis"], "707px",
    "the panel column is held at its settled width so fading content never reflows (clip-reveal)");
  assert.ok(expand.classlist.includes("dsh-skins-sweeping"), "the sweep clips scrollbars mid-morph");
  assert.ok(expand.style.transition.includes("height 200ms ease-out"), "height rides the same beat as the width");
  assert.ok(expand.style.transition.includes("width 200ms ease-out"),
    "inline transition restates width — an inline transition replaces the stylesheet's width-only rule");
  onTransitionEnd({ propertyName: "height" });
  assert.equal(expand.style.height, "", "pin released after the sweep — auto height resolves to the target");
  assert.equal(expand.style.width, "");
  assert.equal(expand.style.transition, "");
  assert.equal(expand.style.overflow, "");
  assert.equal(expand.style["--dsh-skins-sweep-panel-basis"], undefined, "the panel-basis hold is released with the pins");
  assert.ok(!expand.classlist.includes("dsh-skins-sweeping"), "the sweep clip is released with the pins");
  finish(); // idempotent double-release

  // Collapse: 724 → 493 sweeps down while the width rides back 1105 → 390.
  const down = makeShell({ width: 390, rectHeight: 493, extentByWidth: { 390: 493 } });
  down.offsetHeight = 724;
  sweepShellHeight(down, { from: 724, fromWidth: 1105, maxHeight: 728 });
  assert.equal(down.style.height, "493px", "collapse sweeps down to the list-column height");
  assert.equal(down.style.width, "390px", "collapse re-animates the width from the pre-toggle box");
  assert.equal(down.style["--dsh-skins-sweep-panel-basis"], undefined,
    "no panel child (already unmounted) → no basis hold, and no crash on the missing querySelector");
  assert.deepEqual(down.classlist, ["dsh-skins-sweeping"]);
});

test("⑫ height sweep no-ops where a sweep would be wrong — and never leaks the measurement freeze (issue #13 rev.)", () => {
  const style = {};
  const shell = {
    style, currentWidth: 500, rectHeight: 400, extentByWidth: { 500: 400 },
    getBoundingClientRect: () => ({ width: shell.currentWidth, height: shell.rectHeight }),
    get scrollHeight() { return shell.extentByWidth[shell.currentWidth]; },
  };
  assert.equal(typeof sweepShellHeight(undefined, { from: 100, fromWidth: 390, maxHeight: 600 }), "function", "always returns a cleanup");
  assert.deepEqual(style, {}, "no shell → nothing pinned");
  assert.equal(typeof sweepShellHeight(shell, { from: null, fromWidth: 390, maxHeight: 600 }), "function");
  assert.deepEqual(style, {}, "first shell open (no pre-toggle box) → nothing pinned");
  sweepShellHeight(shell, { from: 400, fromWidth: 500, maxHeight: 600 });
  assert.deepEqual(style, {},
    "target equals current and width is unchanged → nothing to animate; the transition:none freeze must be undone, not leaked");
  const savedMatchMedia = globalThis.window.matchMedia;
  globalThis.window.matchMedia = () => ({ matches: true });
  try {
    sweepShellHeight(
      { ...shell, extentByWidth: { 500: 4000 }, style },
      { from: 400, fromWidth: 500, maxHeight: 600 },
    );
    assert.deepEqual(style, {}, "reduced motion → instant layout, never a sweep, never a freeze");
  } finally {
    if (savedMatchMedia === undefined) delete globalThis.window.matchMedia;
    else globalThis.window.matchMedia = savedMatchMedia;
  }
});

test("⑬ panel header collapses the panel back to the skin list (v1.0.0 ruling)", async () => {
  const h = makeHarness();
  await h.openShell();
  h.gearButton("tgcf").props.onClick();
  await tick();
  h.attachFocusRecorders();
  assert.notEqual(h.panelColumn(), null, "panel open");
  assert.equal(h.gearButton("tgcf").props["aria-expanded"], true, "the gear reports its expanded state");
  const heading = h.heading();
  assert.equal(heading.props["aria-level"], 2, "the heading stays the header's focus target");
  const collapse = h.collapseButton();
  assert.notEqual(collapse, null, "the panel header hosts a collapse control");
  assert.equal(collapse.props["aria-label"], "收起个性化面板", "localized collapse label");
  assert.equal(collapse.props.title, "收起个性化面板", "tooltip teaches the affordance");

  collapse.props.onClick();
  await tick();
  assert.equal(h.panelColumn(), null, "panel collapsed");
  assert.notEqual(h.shell(), null, "the shell itself stays open — collapse ≠ dismiss");
  assert.ok(h.dom.focused.includes("tgcf-gear"), "focus returned to the gear that opened the panel");
  assert.equal(h.gearButton("tgcf").props["aria-expanded"], false, "gear state follows the panel");

  const css = h.cssText();
  assert.ok(css.includes('.dsh-skins-pz-gear[aria-expanded="true"]{opacity:1;border-color:var(--dsw-alias-brand-primary)'),
    "the gear shows its expanded state in the brand language (ruling: toggle legibility)");
});
