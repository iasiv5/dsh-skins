import { projectSkin } from "./personalization/projector.js";

const SKIN_STORAGE_KEY = "dsh-skins:active";
const SKIN_URL_PARAM = "skin";
const OFFICIAL_SKIN_ID = "official";
const LEGACY_OFFICIAL_ALIAS = "default";
const HERO_NS = "conversation";
const HERO_KEY = "hero.headline";
const ACTIVE_EVENT = "dsh-skins:active-changed";

/** dataset camelCase → attribute name: dshTgcfSkin → data-dsh-tgcf-skin. */
function datasetAttribute(key) {
  return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** Create the registry and single-mounted-skin runtime. */
export function createSkinRuntime() {
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
    // explicitly chooses an appearance — meirenzhi since its introduction,
    // openbmc before that. Stored selections and ?skin= keep priority.
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
              ctx.slots.register({ name: "sidebar.brand.mark", priority: -10 }, skin.Mark),
              ctx.slots.register({ name: "sidebar.brand.name", priority: -10 }, skin.Name),
              ctx.slots.register({ name: "conversation.hero.brand.mark", priority: -10 }, skin.Mark),
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
