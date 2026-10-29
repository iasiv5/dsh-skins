import { projectSkin } from "./personalization/projector.js";

const SKIN_STORAGE_KEY = "dsh-skins:active";
const SKIN_URL_PARAM = "skin";
const OFFICIAL_SKIN_ID = "official";
const LEGACY_OFFICIAL_ALIAS = "default";
const HERO_NS = "conversation";
const HERO_KEY = "hero.headline";
const ACTIVE_EVENT = "dsh-skins:active-changed";

/** dataset camelCase → attribute name: dshMeirenzhiSkin → data-dsh-meirenzhi-skin. */
function datasetAttribute(key) {
  return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** Create the registry and single-mounted-skin runtime. */
// -- Windows Desktop shell alignment (ADR-0009) ------------------------------
// On the Windows desktop the shell chrome (caption strip, sidebar, the
// content column's 16px corner notch and the native WCO caption buttons)
// stacks several translucent paints over DWM acrylic and the WCO overlay
// color; with the skins' translucent fills those layers expose art variance
// and acrylic ghosts, and the chrome never reads as one surface (three field
// rounds: petal notch, washed strip, off-tone buttons). The user's target is
// the native read: one unified shell color with the conversation area as an
// independent rounded sheet. So on the desktop the shell fill token is
// forced OPAQUE to the skin's own base color — strip, sidebar, notch and the
// WCO buttons (the win32 preload feeds the overlay from this very token via
// its probe span) all share one exact color by construction, and the content
// column keeps the native two-tone (its translucent bg-base over the opaque
// fill). The three single-paint rules stay so no future translucent desktop
// design can reintroduce double-paint seams. All rules are gated by the
// public `html[data-windows-titlebar]` marker (never matches ordinary Web,
// where the translucent design is unchanged), pinned to structural
// css-modules local names (`_frame` / `_sidebarCol` / `_root`, ADR-0006/0007
// doctrine); scripts/verify-upstream-hooks.mjs (#7) fails `check` when those
// local names or the painted-token line drift.
function parseRgbaChannels(value) {
  const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/i.exec(value ?? "");
  if (match === null) return null;
  const channels = [match[1], match[2], match[3], match[4]].map(Number);
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  const [r, g, b, a] = channels;
  return { r, g, b, a: Math.min(1, Math.max(0, a)) };
}

/**
 * Build the sidebar paint-order guard for one skin (ADR-0021): after a skin
 * switch the compositor can paint the center column over the sidebar column
 * — layout and hit-testing stay correct while the collapsed rail stops
 * painting ("invisible but clickable"). Pin the sidebar column one explicit
 * step up the stacking order so its grid sibling can never overpaint it.
 * Static CSS on the skin's own lifecycle (mounted with the skin, removed
 * with it); no runtime scheduling, no timing dependence — an earlier
 * grid-nudge family was rejected on cross-environment evidence (see the
 * ADR's rejected-options history).
 */
function sidebarPaintOrderCss(bodyAttribute) {
  return `body[${datasetAttribute(bodyAttribute)}] [class*="_sidebarCol"]{position:relative;z-index:1}`;
}

/**
 * Build the desktop shell alignment CSS for one skin: the three
 * single-paint rules, the opaque shell-fill token override (light and dark),
 * the wallpaper-in-content rules (the center column carries the same
 * scrim+art backdrop the Web paints on body::before), and the dockkit pane
 * rules (fullscreen panels get the opaque shell color). `opaqueFills`/
 * `backdrop` may be null when the skin ships no fill override or no
 * backdrop — the respective rules are then skipped.
 */
function buildShellAlignmentCss(bodyAttribute, opaqueFills, backdrop) {
  const body = `body[${datasetAttribute(bodyAttribute)}]`;
  const scoped = `html[data-windows-titlebar] ${body}`;
  const lines = [
    "/* dsh-skins shell-frame alignment (ADR-0009): solid chrome + wallpaper in the conversation area on Windows desktop */",
    'html[data-windows-titlebar] [class*="_frame"]:has(> [class*="_sidebarCol"])::before{background:0 0}',
    'html[data-windows-titlebar] [class*="_frame"] > [class*="_sidebarCol"]{background:0 0}',
    'html[data-windows-titlebar] [class*="_sidebarCol"] > [class*="_root"]{background:0 0}',
  ];
  if (opaqueFills !== null) {
    lines.push(
      `${scoped}{--dsw-specific-sidebar-fill:${opaqueFills.light}!important}`,
      `${scoped}[data-ds-dark-theme]{--dsw-specific-sidebar-fill:${opaqueFills.dark}!important}`,
    );
  }
  if (backdrop !== null && backdrop !== undefined && backdrop.imageLight !== null && backdrop.imageDark !== null) {
    lines.push(
      `${scoped} [class*="_centerCol"]{background-image:${backdrop.imageLight};background-size:cover;background-position:center;background-repeat:no-repeat}`,
      `${scoped}[data-ds-dark-theme] [class*="_centerCol"]{background-image:${backdrop.imageDark}}`,
    );
  }
  if (opaqueFills !== null) {
    // The right sidebar panel hangs over the conversation area in its
    // fullscreen mode; give its top-level occupant node the same solid skin
    // color as the rest of the chrome, so translucent panel surfaces never
    // float over chat text regardless of which package occupies the column.
    // [data-rightbar-col] is a stable layout attribute.
    lines.push(
      `${scoped} [data-rightbar-col] > *{background-color:${opaqueFills.light}!important}`,
      `${scoped}[data-ds-dark-theme] [data-rightbar-col] > *{background-color:${opaqueFills.dark}!important}`,
    );
    // Fullscreen dockkit panes (right panel "fullscreen", floats) tab over
    // the conversation area with fully transparent chrome containers; give
    // the pane surface the opaque shell color so chat text never bleeds
    // through. The dockkit pane class lives in the frontend dist stylesheet
    // and is pinned by verify-upstream-hooks.mjs.
    lines.push(
      `${scoped} [class*="_pane_"]{background:${opaqueFills.light}!important}`,
      `${scoped}[data-ds-dark-theme] [class*="_pane_"]{background:${opaqueFills.dark}!important}`,
    );
  }
  return lines.join("\n");
}

/** 全屏态右栏列霜面底（ADR-0020）：data-rightbar-fullscreen 期间把右栏
 * 列底色提到 94% 皮色 + frost blur——聊天透字变不可读柔光，停靠态因选择器
 * 带状态属性而零命中。双表面：①栅格列轨道（[class*="_rightbarCol"]，右
 * ~45% 条带）；②dockkit 全屏面板根（[data-sidebar-right-panel="fullscreen"]，
 * 全窗尺寸、背景透明、自带 fullscreen 状态自门控——它不是 rightbarCol 的
 * 直子，occupant 直子选择器打不中；2026-10-28 主人 Console DOM 实测定面）。
 * 浓度裁定（2026-10-28 第三次热部署）：全屏面板托管的是活会话 UI（标签/
 * 消息/输入框），半透明霜面会让正常界面读作「漏出」——主人裁定全屏改
 * 实底（rgb 直出，无 blur），与官方全屏观感对齐；停靠态半透明不受影响。
 * opaqueFills 与 Desktop
 * shell 对齐同源（riding sidebar-fill 的 rgb 通道）；null（皮未 ride
 * sidebar-fill）返回空串，调用方跳过挂载。固定值不随通透度旋钮联动
 * （frost 家族同律）。blur 只声明在 light 规则、暗色经级联继承（frost
 * 家族同构）：勿给 light 规则加 :not([data-ds-dark-theme]) 或删其 blur，
 * 否则暗色静默丢模糊（评审 S2）。 */
export function buildFullscreenBaseCss(bodyAttribute, opaqueFills) {
  if (opaqueFills === null) return "";
  const body = `body[${datasetAttribute(bodyAttribute)}]`;
  const column = " [data-rightbar-fullscreen] [class*=\"_rightbarCol\"]";
  const dockPanel = " [data-sidebar-right-panel=\"fullscreen\"]";
  const dockPane = " [data-sidebar-right-panel=\"fullscreen\"] [data-dockkit-pane]";
  return [
    "/* dsh-skins fullscreen base (ADR-0020): solid skin-tone base while data-rightbar-fullscreen is set — the fullscreen dockkit PANE paints a translucent bg token where the official theme paints opaque white (DOM-dump evidence), so the pane is the bleed surface; solid matches the official look. Docked column untouched */",
    `${body}${column},${body}${dockPanel},${body}${dockPane}{background-color:${opaqueFills.light}!important}`,
    `${body}[data-ds-dark-theme]${column},${body}[data-ds-dark-theme]${dockPanel},${body}[data-ds-dark-theme]${dockPane}{background-color:${opaqueFills.dark}!important}`,
  ].join("\n");
}

export const shellAlignment = { parseRgbaChannels, buildShellAlignmentCss };

/**
 * 生产面（ADR-0014）：皮肤模块 interface 的全部字段，恰为生产代码消费的
 * 七项。interface 变宽必须显式动这里——register 对集合外字段 fail closed。
 */
export const PRODUCTION_FIELDS = new Set([
  "id", "label", "description", "Mark", "Name", "project", "builtinAssets",
]);

export function createSkinRuntime({ profile = "web" } = {}) {
  const skins = new Map();
  const order = [];
  let ctx = null;
  let mounted = null; // { skin, effects, overrides, stop }
  let selectedId = null;
  let personalization = null; // { getOverrides, assetResolver, metaProvider }

  function register(skin) {
    if (!skin || typeof skin.id !== "string" || skin.id.length === 0) {
      throw new Error("[dsh-skins] every skin needs a non-empty id");
    }
    if (skin.id === OFFICIAL_SKIN_ID || skin.id === LEGACY_OFFICIAL_ALIAS) {
      throw new Error(`[dsh-skins] skin id "${skin.id}" is reserved for the official appearance`);
    }
    for (const key of Object.keys(skin)) {
      if (!PRODUCTION_FIELDS.has(key)) {
        throw new Error(`[dsh-skins] unknown skin field "${key}" on "${skin.id}" — the skin interface is exactly PRODUCTION_FIELDS (ADR-0014)`);
      }
    }
    if (skins.has(skin.id)) throw new Error(`[dsh-skins] duplicate skin id "${skin.id}"`);
    skins.set(skin.id, skin);
    order.push(skin.id);
  }

  /** Active UI locale ("zh"|"en"); falls back to zh before apply(). */
  function activeLocale() {
    try {
      return ctx?.locale?.getLocale?.().active ?? "zh";
    } catch {
      return "zh";
    }
  }

  function localizedText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return value[activeLocale()] ?? value.en ?? value.zh ?? "";
    return String(value);
  }

  function list() {
    return order.map((id) => {
      const skin = skins.get(id);
      return { id, label: localizedText(skin.label), description: localizedText(skin.description) };
    });
  }

  function normalizeChoiceId(id) {
    return id === LEGACY_OFFICIAL_ALIAS ? OFFICIAL_SKIN_ID : id;
  }

  function isKnownChoice(id) {
    return id === OFFICIAL_SKIN_ID || skins.has(id);
  }

  function resolveSelectedId() {
    try {
      const query = window.location?.search;
      const fromUrl = query ? new URLSearchParams(query).get(SKIN_URL_PARAM) : null;
      const normalizedUrl = normalizeChoiceId(fromUrl);
      if (normalizedUrl && isKnownChoice(normalizedUrl)) {
        localStorage.setItem(SKIN_STORAGE_KEY, normalizedUrl);
        return normalizedUrl;
      }
      const stored = normalizeChoiceId(localStorage.getItem(SKIN_STORAGE_KEY));
      if (stored && isKnownChoice(stored)) {
        localStorage.setItem(SKIN_STORAGE_KEY, stored);
        return stored;
      }
    } catch {}
    // Factory default (出厂皮肤): the first registered skin wins until the user
    // explicitly chooses an appearance — openbmc since v1.0.6 (Studio rebrand),
    // meirenzhi before that. Stored selections and ?skin= keep priority.
    return order[0];
  }

  function announce(id) {
    if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(ACTIVE_EVENT, { detail: id }));
    }
  }

  // -- personalization plumbing ----------------------------------------------

  function overridesFor(skinId) {
    try {
      return personalization?.getOverrides?.(skinId) ?? {};
    } catch {
      return {};
    }
  }

  function projectionContext() {
    return {
      profile,
      assetResolver: personalization?.assetResolver,
      metaProvider: personalization?.metaProvider,
    };
  }

  // -- effects execution (transactional; design §3/§7.1) ----------------------

  function styleTag(id, content) {
    let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`);
    if (tag === null) {
      tag = document.createElement("style");
      tag.dataset.plugin = "dsh-skins";
      tag.dataset.pluginCss = id;
      document.head.appendChild(tag);
    }
    tag.textContent = content; // reuse must never serve stale CSS
    return tag;
  }

  function backdropCss(effects) {
    const backdrop = effects.backdrop;
    if (backdrop === null) return null;
    const selector = `body[${datasetAttribute(effects.bodyAttribute)}]`;
    const darkSelector = `${selector}[data-ds-dark-theme]`;
    const rules = [];
    if (backdrop.imageLight !== null || backdrop.imageDark !== null) {
      const blur = backdrop.blur > 0
        ? `filter:blur(${backdrop.blur}px);transform:scale(1.02);`
        : "";
      rules.push(`${selector}::before{content:"";position:fixed;inset:0;z-index:-1;`
        + `background-image:${backdrop.imageLight ?? "none"};background-size:cover;`
        + `background-position:center;background-repeat:no-repeat;pointer-events:none;${blur}}`);
      if (backdrop.imageDark !== null && backdrop.imageDark !== backdrop.imageLight) {
        rules.push(`${darkSelector}::before{background-image:${backdrop.imageDark}}`);
      }
    }
    if (backdrop.overlayLight !== null || backdrop.overlayDark !== null) {
      rules.push(`${selector}::after{content:"";position:fixed;inset:0;z-index:-1;`
        + `background-image:${backdrop.overlayLight ?? "none"};pointer-events:none;}`);
      if (backdrop.overlayDark !== null && backdrop.overlayDark !== backdrop.overlayLight) {
        rules.push(`${darkSelector}::after{background-image:${backdrop.overlayDark}}`);
      }
    }
    const desktopBlur = backdrop.desktopBlur ?? null;
    if (desktopBlur !== null && (backdrop.imageLight !== null || backdrop.imageDark !== null)) {
      const desktopSelector = `html[data-windows-titlebar] ${selector}`;
      const blurDeclarations = (blur) => `filter:blur(${blur}px);transform:scale(1.02);`;
      if (desktopBlur.light === desktopBlur.dark) {
        if (desktopBlur.light > 0) {
          rules.push(`${desktopSelector}::before{${blurDeclarations(desktopBlur.light)}}`);
        }
      } else {
        if (desktopBlur.light > 0) {
          rules.push(`${desktopSelector}:not([data-ds-dark-theme])::before{${blurDeclarations(desktopBlur.light)}}`);
        }
        if (desktopBlur.dark > 0) {
          rules.push(`${desktopSelector}[data-ds-dark-theme]::before{${blurDeclarations(desktopBlur.dark)}}`);
        }
      }
    }
    return rules.length === 0 ? null : rules.join("\n");
  }


  function variablesCss(effects) {
    if (effects.cssVariables === null) return null;
    const selector = `body[${datasetAttribute(effects.bodyAttribute)}]`;
    const darkSelector = `${selector}[data-ds-dark-theme]`;
    const light = [];
    const dark = [];
    for (const [name, pair] of Object.entries(effects.cssVariables)) {
      light.push(`${name}:${pair.light}`);
      dark.push(`${name}:${pair.dark}`);
    }
    return `${selector}{${light.join(";")}}\n${darkSelector}{${dark.join(";")}}`;
  }

  // Third-party brand coexistence (2026-10-13 ds-bot incident): third-party
  // plugins copy the "obvious" priority -10 for the single brand seats. A
  // latecomer registering the SAME priority on a single slot throws inside
  // its own apply() and its whole activation dies (cordis fiber state=3), so
  // dsh-skins must never sit on the magnet value. We claim a deep, unlikely
  // base seat instead and probe the slot ledger before registering: blind
  // -10 latecomers then register cleanly and get shadowed ("lowest
  // renders") instead of crashing.
  const BRAND_PRIORITY_BASE = -20;

  function occupantPriorities(name) {
    try {
      return (ctx.slots.entries?.(name) ?? []).map((entry) => entry.options.priority ?? 0);
    } catch {
      return [];
    }
  }

  /**
   * register() wrapped for coexistence: an equal-priority single-slot
   * conflict is a cosmetic loss (one brand seat), never worth failing the
   * skin mount. Probe the ledger for a free seat below BRAND_PRIORITY_BASE,
   * and on a racing conflict retry deeper a bounded number of times; if the
   * seat stays contested, leave it to its occupant and mount the skin
   * without it. Unknown errors still throw (buildEffects unwinds them).
   */
  function registerBrandSeat(name, component) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const taken = occupantPriorities(name);
      const floor = taken.length > 0 ? Math.min(...taken) - 1 : BRAND_PRIORITY_BASE;
      const priority = Math.min(BRAND_PRIORITY_BASE, floor);
      try {
        return ctx.slots.register({ name, priority }, component);
      } catch (error) {
        if (!/already has a registration/.test(String(error?.message ?? error))) throw error;
        console.warn(`[dsh-skins] brand seat "${name}" priority ${priority} taken; retrying deeper`);
      }
    }
    console.warn(`[dsh-skins] brand seat "${name}" stays with its occupant; skin mounts without it`);
    return () => {};
  }

  /**
   * Generalized stale-paint heal (ADR-0021 amendment): after a runtime skin
   * switch, some regions can stop repainting (rail: fixed by the paint-order
   * guard; fullscreen→dock: fixed by the repaint hook; field evidence
   * 2026-10-29 mobile: the conversation area and composer also went blank
   * after skin churn). Removing and re-adding every skin style tag forces the
   * proven style-invalidation repaint, healing all of them at once. Runs only
   * on a real switch (previous skin mounted), never at cold boot; double rAF
   * keeps the unstyled window to ~1 frame. Inert in DOM-stub environments.
   */
  function refreshSkinStyleTags() {
    if (typeof requestAnimationFrame !== "function" || typeof document === "undefined" || document.head?.querySelectorAll === undefined) return;
    const tags = [...document.head.querySelectorAll('style[data-plugin-css^="dsh-skins/"]')];
    if (tags.length === 0) return;
    const saved = tags.map((tag) => ({ id: tag.dataset.pluginCss, content: tag.textContent }));
    for (const tag of tags) tag.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const { id, content } of saved) {
        if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) continue;
        const fresh = document.createElement("style");
        fresh.dataset.plugin = "dsh-skins";
        fresh.dataset.pluginCss = id;
        fresh.textContent = content;
        document.head.append(fresh);
      }
    }));
  }

  /**
   * Fullscreen→dock stale-frame unstick (ADR-0021 amendment): when the right
   * panel leaves fullscreen, the compositor can keep painting the last
   * fullscreen frame while layout and hit-testing are already correct
   * (field evidence 2026-10-29: removing any dsh-skins style tag snapped the
   * view back). Removing and re-adding our fullscreen.css tag forces exactly
   * that proven style-invalidation repaint, scoped to our own tag. Installed
   * once per runtime; inert in DOM-stub environments without MutationObserver.
   */
  let rightPanelRepaintHookInstalled = false;
  function installRightPanelRepaintHook() {
    if (rightPanelRepaintHookInstalled || typeof MutationObserver !== "function") return;
    if (typeof document === "undefined" || document.body === undefined || document.body === null) return;
    rightPanelRepaintHookInstalled = true;
    const observer = new MutationObserver((records) => {
      for (const record of records ?? []) {
        const before = record.oldValue;
        const after = record.target.getAttribute?.("data-sidebar-right-panel");
        if (before !== "fullscreen" || after === "fullscreen") continue;
        const tag = document.querySelector('style[data-plugin-css$=".fullscreen.css"]');
        if (tag === null) continue;
        const id = tag.dataset.pluginCss;
        const content = tag.textContent;
        tag.remove();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const fresh = document.createElement("style");
          fresh.dataset.plugin = "dsh-skins";
          fresh.dataset.pluginCss = id;
          fresh.textContent = content;
          document.head.append(fresh);
        }));
      }
    });
    observer.observe(document.body, {
      subtree: true, attributes: true,
      attributeFilter: ["data-sidebar-right-panel"], attributeOldValue: true,
    });
  }

  /**
   * Build a skin's effects WITHOUT touching the mounted state. Every side
   * effect registers its rollback BEFORE mutating (R7): a mid-build crash
   * unwinds itself completely and the previously mounted skin keeps running.
   * Returns the unwind function; throws only after self-cleanup.
   */
  function buildEffects(skin, effects) {
    if (!ctx) throw new Error("[dsh-skins] mount before apply");
    const body = document.body;
    const stops = [];
    const unwind = () => {
      for (let index = stops.length - 1; index >= 0; index -= 1) {
        try { stops[index](); } catch {}
      }
    };

    try {
      // Slot contributions must be declaration-aware (see design history):
      // nested inject() waits for the owning UI plugins exactly like the
      // official brand plugin.
      stops.push(ctx.slots.inject("sidebar.brand.mark", () =>
        ctx.slots.inject("sidebar.brand.name", () =>
          ctx.slots.inject("conversation.hero.brand.mark", () => {
            const registrations = [
              registerBrandSeat("sidebar.brand.mark", skin.Mark),
              registerBrandSeat("sidebar.brand.name", skin.Name),
              registerBrandSeat("conversation.hero.brand.mark", skin.Mark),
            ];
            return () => {
              for (let index = registrations.length - 1; index >= 0; index -= 1) {
                registrations[index]();
              }
            };
          })
        )
      ));

      if (effects.slogans !== null) {
        const table = ctx.locale?.dicts?.get(HERO_NS);
        const originals = [];
        if (table) {
          for (const [locale, entries] of table) {
            if (entries && entries[HERO_KEY] !== undefined) {
              originals.push([entries, entries[HERO_KEY]]);
              entries[HERO_KEY] = effects.slogans[locale] ?? effects.slogans.zh;
            }
          }
        }
        stops.push(() => {
          for (const [entries, value] of originals) entries[HERO_KEY] = value;
        });
      }

      if (effects.staticCss !== null) {
        const tag = styleTag(`dsh-skins/${skin.id}.css`, effects.staticCss);
        stops.push(() => tag.remove());
      }

      // Sidebar paint-order guard (ADR-0021): after a skin switch the
      // compositor can paint the center column over the sidebar column —
      // layout and hit-testing stay correct while the collapsed rail stops
      // painting ("invisible but clickable"). Pin the sidebar column one
      // explicit step up the stacking order so its grid sibling can never
      // overpaint it. Static CSS on the skin's own lifecycle: mounted with
      // the skin, removed with it; no runtime scheduling, no timing
      // dependence (an earlier grid-nudge family was rejected — see ADR).
      {
        const tag = styleTag(`dsh-skins/${skin.id}.paintorder.css`,
          sidebarPaintOrderCss(effects.bodyAttribute));
        stops.push(() => tag.remove());
      }

      // Windows Desktop shell alignment (ADR-0009): emitted per skin — the
      // opaque chrome color derives from the skin's own fill token and the
      // conversation area carries the skin's own scrim+art backdrop — and
      // mount/unmount with the skin transaction like every other emitted
      // tag. Inert on Web (no titlebar marker) and gone with `official`
      // (unmount restores the host's translucent-capable paints).
      {
        const fills = effects.tokenOverrides?.["--dsw-specific-sidebar-fill"] ?? null;
        const lightFill = fills === null ? null : parseRgbaChannels(fills.light);
        const darkFill = fills === null ? null : parseRgbaChannels(fills.dark);
        const opaqueFills = lightFill !== null && darkFill !== null ? {
          light: `rgb(${lightFill.r}, ${lightFill.g}, ${lightFill.b})`,
          dark: `rgb(${darkFill.r}, ${darkFill.g}, ${darkFill.b})`,
        } : null;
        const backdrop = effects.backdrop === null ? null : {
          imageLight: effects.backdrop.imageLight,
          imageDark: effects.backdrop.imageDark,
        };
        const tag = styleTag(`dsh-skins/${skin.id}.shell.css`,
          buildShellAlignmentCss(effects.bodyAttribute, opaqueFills, backdrop));
        stops.push(() => tag.remove());
        // Fullscreen frost base (ADR-0020): state-scoped by the layout's
        // data-rightbar-fullscreen marker — the fullscreen right sidebar
        // covers the chat area, so its column base concentrates to a 94%
        // skin tone + frost blur; the docked column never matches. Same
        // opaqueFills derivation as the Desktop shell rules; profile-neutral
        // (inert-but-harmless under the Desktop opaque occupant rules).
        const fullscreenCss = buildFullscreenBaseCss(effects.bodyAttribute, opaqueFills);
        if (fullscreenCss !== "") {
          const fullscreenTag = styleTag(`dsh-skins/${skin.id}.fullscreen.css`, fullscreenCss);
          stops.push(() => fullscreenTag.remove());
        }
      }

      const backdrop = backdropCss(effects);
      if (backdrop !== null) {
        const tag = styleTag(`dsh-skins/${skin.id}.backdrop.css`, backdrop);
        stops.push(() => tag.remove());
      }

      const variables = variablesCss(effects);
      if (variables !== null) {
        const tag = styleTag(`dsh-skins/${skin.id}.vars.css`, variables);
        stops.push(() => tag.remove());
      }

      if (effects.decorations !== null) {
        for (const decoration of effects.decorations) {
          const tag = styleTag(`dsh-skins/${skin.id}.decor.${decoration.key}.css`, decoration.css);
          stops.push(() => tag.remove());
        }
      }

      if (effects.tokenOverrides !== null && typeof ctx.theme?.overrideTokens === "function") {
        const disposeTokens = ctx.theme.overrideTokens(`dsh-skins/${skin.id}`, effects.tokenOverrides);
        stops.push(disposeTokens);
      }

      // Body scope attribute: register the rollback BEFORE setting it.
      const hadAttribute = body.dataset[effects.bodyAttribute] !== undefined;
      stops.push(() => {
        if (!hadAttribute) delete body.dataset[effects.bodyAttribute];
      });
      body.dataset[effects.bodyAttribute] = "";

      if (effects.favicon !== null) {
        const removedIcons = [...document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
        let favicon = null;
        stops.push(() => {
          if (favicon !== null) favicon.remove();
          for (const element of removedIcons) document.head.append(element);
        });
        removedIcons.forEach((element) => element.remove());
        favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.type = effects.favicon.mime;
        favicon.href = effects.favicon.href;
        document.head.append(favicon);
      }

      // Browser chrome identity, cooperatively: rebrand only the product
      // segment and keep the session segment intact (see design history —
      // the official DocumentTitle projector rewrites ~75ms after mount).
      const officialBrand = "DeepSeek Harness";
      const brand = effects.titleBrand === null || effects.titleBrand === "" ? null : effects.titleBrand;
      let titleObserver = null;
      stops.push(() => {
        if (titleObserver !== null) {
          titleObserver.disconnect();
          if (document.title === brand) document.title = officialBrand;
          else if (brand !== null && document.title.endsWith(" — " + brand)) {
            document.title = document.title.slice(0, document.title.length - brand.length) + officialBrand;
          }
        }
      });
      if (brand !== null) {
        const withBrand = (text) => {
          if (text === officialBrand) return brand;
          if (text.endsWith(" — " + officialBrand)) return text.slice(0, text.length - officialBrand.length) + brand;
          return null; // foreign writer or already rebranded: leave untouched
        };
        const rebrand = () => {
          const next = withBrand(document.title);
          if (next !== null && next !== document.title) document.title = next;
        };
        rebrand();
        titleObserver = new MutationObserver(rebrand);
        titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
      }
    } catch (error) {
      unwind();
      throw error;
    }
    return unwind;
  }

  function unmount() {
    if (!mounted) return;
    mounted.stop();
    mounted = null;
  }

  /**
   * Teardown-first mount (N1): effects share DOM node identities (style
   * tags, token layers, dict entries), so the OLD set must be fully
   * disposed BEFORE the new one is built — otherwise the old disposers tear
   * down nodes the new set is actively using. A failed build restores the
   * previous skin by RE-PROJECTING it (the projector is pure and cheap);
   * when even that fails we fall back to official.
   */
  function applyEffects(skin, effects, overrides) {
    const previous = mounted === null ? null : { skin: mounted.skin, overrides: mounted.overrides };
    unmount(); // restores officials first: correct title/favicon baseline
    let stop;
    try {
      stop = buildEffects(skin, effects);
    } catch (error) {
      console.warn(`[dsh-skins] mounting "${skin.id}" failed`, error);
      restorePrevious(previous, error);
      return false;
    }
    mounted = { skin, effects, overrides, stop };
    selectedId = skin.id;
    announce(skin.id);
    installRightPanelRepaintHook();
    if (previous !== null) refreshSkinStyleTags(); // real switch (not cold boot)
    return true;
  }

  function restorePrevious(previous, cause) {
    if (previous !== null) {
      try {
        const restored = projectSkin(previous.skin, previous.overrides, projectionContext());
        if (restored.effects !== null) {
          const stop = buildEffects(previous.skin, restored.effects);
          mounted = { skin: previous.skin, effects: restored.effects, overrides: previous.overrides, stop };
          selectedId = previous.skin.id;
          announce(previous.skin.id);
          return;
        }
      } catch (restoreError) {
        console.error("[dsh-skins] restoring the previous skin failed; falling back to official", restoreError);
      }
    }
    void cause;
    selectedId = OFFICIAL_SKIN_ID;
    announce(OFFICIAL_SKIN_ID);
  }

  /** Project + mount a skin; false = failed (previous restored or official). */
  function mountSkin(skin) {
    const overrides = overridesFor(skin.id);
    const result = projectSkin(skin, overrides, projectionContext());
    if (result.effects === null) {
      console.warn(`[dsh-skins] skin "${skin.id}" failed to project`);
      if (mounted !== null) return false; // projection failed, current skin untouched
      selectedId = OFFICIAL_SKIN_ID; // first boot fail-closed
      announce(OFFICIAL_SKIN_ID);
      return false;
    }
    if (result.degraded !== "none") {
      console.warn(`[dsh-skins] skin "${skin.id}" projected with degraded defaults (${result.degraded})`);
    }
    return applyEffects(skin, result.effects, overrides);
  }

  /**
   * Hot-update the active skin's effects after a config change. Projection
   * failures keep the current effects; mount failures re-project and
   * restore the previous overrides (design §7.1 / §3).
   */
  function updateActive() {
    if (mounted === null) return { applied: false, reason: "none" };
    const skin = mounted.skin;
    const overrides = overridesFor(skin.id);
    const result = projectSkin(skin, overrides, projectionContext());
    if (result.effects === null) {
      console.warn("[dsh-skins] config hot-update failed to project; keeping current effects");
      return { applied: false, reason: "projection-failed" };
    }
    const applied = applyEffects(skin, result.effects, overrides);
    return applied
      ? { applied: true, degraded: result.degraded }
      : { applied: false, reason: "mount-failed" };
  }

  function select(id) {
    const normalizedId = normalizeChoiceId(id);
    const skin = skins.get(normalizedId);
    if (normalizedId !== OFFICIAL_SKIN_ID && !skin) {
      throw new Error(`[dsh-skins] unknown skin "${id}" — available: ${[OFFICIAL_SKIN_ID, ...order].join(", ")}`);
    }
    if (selectedId === normalizedId && mounted !== null) return normalizedId;

    if (normalizedId === OFFICIAL_SKIN_ID) {
      unmount();
      selectedId = OFFICIAL_SKIN_ID;
      try { localStorage.setItem(SKIN_STORAGE_KEY, normalizedId); } catch {}
      announce(OFFICIAL_SKIN_ID);
      return normalizedId;
    }

    if (mountSkin(skin)) {
      try { localStorage.setItem(SKIN_STORAGE_KEY, normalizedId); } catch {}
    } else {
      console.warn(`[dsh-skins] selection of "${normalizedId}" did not take effect`);
    }
    return normalizedId;
  }

  function setPersonalization(provider) {
    personalization = provider ?? null;
    if (mounted !== null) updateActive();
  }

  function apply(nextCtx) {
    ctx = nextCtx;
    const id = resolveSelectedId();
    if (id === OFFICIAL_SKIN_ID) {
      selectedId = OFFICIAL_SKIN_ID;
    } else {
      const skin = skins.get(id) ?? skins.get(order[0]);
      if (!skin) throw new Error("[dsh-skins] no skins registered");
      if (!mountSkin(skin)) selectedId = OFFICIAL_SKIN_ID; // fail-closed first boot
    }
    return () => {
      unmount();
      selectedId = null;
    };
  }

  return {
    officialId: OFFICIAL_SKIN_ID,
    register,
    list,
    select,
    apply,
    unmount,
    updateActive,
    setPersonalization,
    active: () => selectedId,
  };
}
