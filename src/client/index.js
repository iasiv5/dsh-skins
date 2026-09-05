import { createSkinRuntime } from "./runtime.js";
import { installSidebarSwitcher } from "./sidebar-switcher.js";
import { installRemoteThemePersistence, readLocalThemePreference } from "./theme-persistence.js";
import { createConfigClient } from "./personalization/config-client.js";
import { createMeirenzhiSkin } from "./skins/meirenzhi/index.js";
import { createOpenBmcHarness } from "./skins/openbmc-harness/index.js";
import { createUefiHarness } from "./skins/uefi-harness/index.js";
import { createTgcfSkin } from "./skins/tgcf/index.js";

window.__ModuleLoader__.load({
  // MUST equal the package.json `name` (and the roster row `name` in
  // cordis.patch.yml): the boot page emits __DSH_BOOT__ entries keyed by the
  // package name, and dsh-client-modules rejects a bundle whose registration
  // does not match its graph-row id ("loaded without registering …").
  id: "@iasiv5/dsh-skins",
  factory: (require) => {
    const jsxRuntime = require("react/jsx-runtime");
    const react = require("react");
    const reactDom = require("react-dom");

    const runtime = createSkinRuntime();
    const skinById = new Map();
    for (const factory of [createMeirenzhiSkin, createOpenBmcHarness, createUefiHarness, createTgcfSkin]) {
      const skin = factory(jsxRuntime);
      if (skin.builtinAssets === undefined) {
        // Legacy skins resolve their builtin art ref through their own baked
        // strings (the projector's legacy adapter never needs the URL, but
        // resolution failure must not be a pipeline failure).
        skin.builtinAssets = {
          art: { mime: "image/webp", url: skin.art !== "" ? skin.art : skin.placeholderLight },
        };
      }
      skinById.set(skin.id, skin);
      runtime.register(skin);
    }

    // Personalization plumbing (design §7.1): mount immediately on defaults,
    // then hot-update when the config syncs — never block first paint.
    const configClient = typeof fetch === "function"
      ? createConfigClient({ contextActive: () => runtime.active() })
      : null;
    if (configClient !== null) {
      const assetResolver = (ref) => {
        if (ref.kind === "builtin") {
          const asset = skinById.get(ref.skinId)?.builtinAssets?.[ref.assetKey];
          return asset ? { url: asset.url, mime: asset.mime } : null;
        }
        const meta = configClient.getState().library.find((entry) => entry.id === ref.id);
        return meta
          ? { url: `/dsh-skins/assets/${meta.id}.${meta.extension}`, mime: meta.mime }
          : null;
      };
      const metaProvider = (id) => configClient.getState().library.find((entry) => entry.id === id) ?? null;
      runtime.setPersonalization({
        getOverrides: (skinId) => configClient.effectiveOverrides(skinId),
        assetResolver,
        metaProvider,
      });
      let lastOverridesKey = null;
      configClient.onStateChange(() => {
        const activeId = runtime.active();
        if (activeId === runtime.officialId) return;
        const key = JSON.stringify(configClient.effectiveOverrides(activeId));
        if (key === lastOverridesKey) return;
        lastOverridesKey = key;
        runtime.updateActive();
      });
      configClient.boot();
    }

    const inject = ["slots", "locale", "theme", "connection"];

    function apply(ctx) {
      installRemoteThemePersistence(ctx);
      ctx.effect(() => runtime.apply(ctx), "dsh-skins: active skin");
      if (configClient !== null) {
        ctx.effect(() => () => configClient.dispose(), "dsh-skins: config client");
      }
      try {
        installSidebarSwitcher(ctx, {
          runtime,
          jsx: jsxRuntime.jsx,
          react,
          reactDom,
          configClient,
          skinsById: (id) => skinById.get(id) ?? null,
        });
      } catch (error) {
        console.warn("[dsh-skins] sidebar switcher registration failed:", error);
      }
    }

    window.__DSH_SKINS__ = {
      list: runtime.list,
      select: runtime.select,
      active: runtime.active,
      themePreference: readLocalThemePreference,
      personalization: configClient,
      hotUpdate: runtime.updateActive,
    };

    return {
      apply,
      inject,
      selectSkin: runtime.select,
      listSkins: runtime.list,
    };
  },
});
