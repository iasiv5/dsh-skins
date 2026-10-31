(() => {
  // src/shared/personalization/catalog.js
  var GLOBAL_MAX_BYTES = 20 * 1024 * 1024;
  var GLOBAL_MAX_PIXELS = 4e7;
  var GIF_MAX_PIXELS = 12e6;
  var ASSET_ID_PATTERN = /^u_[0-9a-f]{32}$/;
  var BUILTIN_REF_PATTERN = /^builtin:([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;
  function defaultWallpaperRef(skinId) {
    const skin = SKINS[skinId];
    if (skin === void 0) return void 0;
    const field = skin.fields.find((candidate) => candidate.key === "wallpaper");
    return field?.default ?? void 0;
  }
  var USER_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  var WALLPAPER_FIELD = {
    key: "wallpaper",
    type: "image",
    scope: "single",
    labelKey: "personalization.wallpaper",
    default: null,
    // filled per skin below
    allowedUserMime: USER_IMAGE_MIMES,
    maxBytes: GLOBAL_MAX_BYTES,
    maxWidth: 16384,
    maxHeight: 16384,
    maxPixels: GLOBAL_MAX_PIXELS
  };
  var SKINS = {
    // ADR-0004 (reversing design §9a): every catalog skin declares the same
    // standard field set. Slogan defaults are single-sourced here (ADR-0014/B14)
    // — the factories carry no static copies. panelOpacity defaults are each
    // skin's 出厂锚 (GLOSSARY; 55/55/35 web, 66 desktop): they anchor the riding
    // rebase and blur hinge inside skins/translucency.js, and the byte-equality
    // at the anchor is pinned by tests/translucency-contract.test.mjs. Legacy
    // wallpaper semantics (scrim never applies to user images, placeholder
    // branch) live in the translucency projection kernel's wallpaper branches.
    // openbmc（出厂皮肤，v1.0.6 起注册顺序第一位，见 client/index.js）
    openbmc: {
      builtinAssets: { art: { mime: "image/webp", labelKey: "personalization.openbmc.art" } },
      fields: [
        { ...WALLPAPER_FIELD, default: "builtin:openbmc:art", builtinChoices: ["art"] },
        {
          key: "slogan",
          type: "text",
          scope: "locale",
          labelKey: "personalization.slogan",
          maxLength: 40,
          default: { zh: "察于未萌 · 治于未乱", en: "Govern before the storm" }
        },
        {
          key: "panelOpacity",
          type: "range",
          scope: "single",
          labelKey: "personalization.panelTranslucency",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
          default: 55
        }
      ]
    },
    "uefi-harness": {
      builtinAssets: { art: { mime: "image/webp", labelKey: "personalization.uefi.art" } },
      fields: [
        { ...WALLPAPER_FIELD, default: "builtin:uefi-harness:art", builtinChoices: ["art"] },
        {
          key: "slogan",
          type: "text",
          scope: "locale",
          labelKey: "personalization.slogan",
          maxLength: 40,
          default: { zh: "启于固件 · 行于万象", en: "Boot before everything" }
        },
        {
          key: "panelOpacity",
          type: "range",
          scope: "single",
          labelKey: "personalization.panelTranslucency",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
          default: 55
        }
      ]
    },
    // 美人志（v1.0.6 前的出厂皮肤，现注册顺序第三位）：6 张内置精选，出厂默认 yuntai
    // （001合照）领头并对齐已移除 tgcf 皮肤的「出厂默认领先」惯例；panelOpacity 锚定
    // 其二次曲线（projector 数学见 skins/meirenzhi/index.js）。
    meirenzhi: {
      builtinAssets: {
        yuntai: { mime: "image/webp", labelKey: "personalization.meirenzhi.yuntai" },
        mupeiling: { mime: "image/webp", labelKey: "personalization.meirenzhi.mupeiling" },
        ziling: { mime: "image/webp", labelKey: "personalization.meirenzhi.ziling" },
        nangongwan: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongwan" },
        nangongque: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongque" },
        yinyue: { mime: "image/webp", labelKey: "personalization.meirenzhi.yinyue" }
      },
      fields: [
        {
          ...WALLPAPER_FIELD,
          default: "builtin:meirenzhi:yuntai",
          builtinChoices: [
            "yuntai",
            "mupeiling",
            "ziling",
            "nangongwan",
            "nangongque",
            "yinyue"
          ]
        },
        {
          key: "slogan",
          type: "text",
          scope: "locale",
          labelKey: "personalization.slogan",
          maxLength: 40,
          default: { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" }
        },
        {
          key: "panelOpacity",
          type: "range",
          scope: "single",
          labelKey: "personalization.panelTranslucency",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
          default: 35
        }
      ]
    }
  };
  function getSkinSchema(skinId, profile = "web") {
    const entry = SKINS[skinId];
    if (entry === void 0) return null;
    const fields = profile === "desktop" ? entry.fields.map((field) => field.key === "panelOpacity" ? { ...field, default: 66 } : field) : entry.fields;
    return { skinId, fields, builtinAssets: entry.builtinAssets };
  }
  function getField(skinId, key) {
    return SKINS[skinId]?.fields.find((field) => field.key === key) ?? null;
  }
  function defaultsFor(skinId, profile = "web") {
    const values = {};
    for (const field of getSkinSchema(skinId, profile)?.fields ?? []) values[field.key] = field.default;
    return values;
  }
  function isSameOverrideValue(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) {
      return false;
    }
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((key) => Object.hasOwn(b, key) && isSameOverrideValue(a[key], b[key]));
  }
  function resolveImageRef(value) {
    if (typeof value !== "string" || value.length === 0) return null;
    if (value.startsWith("builtin:")) {
      const match = BUILTIN_REF_PATTERN.exec(value);
      return match === null ? null : { kind: "builtin", skinId: match[1], assetKey: match[2] };
    }
    if (ASSET_ID_PATTERN.test(value)) return { kind: "user", id: value };
    return null;
  }
  var HEX_COLOR = /^#[0-9a-f]{6}$/i;
  var CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  function scopeKeys(scope) {
    if (scope === "locale") return ["zh", "en"];
    if (scope === "colorScheme") return ["light", "dark"];
    return null;
  }
  function validScopeObject(value, scope, checkMember) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = scopeKeys(scope);
    if (Object.keys(value).length !== keys.length) return false;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
      if (!checkMember(value[key])) return false;
    }
    return true;
  }
  function validateTextMember(value, field) {
    if (typeof value !== "string") return false;
    if (CONTROL_CHARS.test(value)) return false;
    return value.length <= field.maxLength;
  }
  function validateRangeMember(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (value < field.min || value > field.max) return false;
    if (field.step !== void 0 && field.step > 0) {
      const steps = (value - field.min) / field.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) return false;
    }
    return true;
  }
  function validateScalar(value, field) {
    switch (field.type) {
      case "text":
        return validateTextMember(value, field);
      case "range":
        return validateRangeMember(value, field);
      case "select":
        return typeof value === "string" && field.options.some((option) => option.value === value);
      default:
        return false;
    }
  }
  function validateImageRef(value, field, skinId, meta) {
    const ref = resolveImageRef(value);
    if (ref === null) return false;
    if (ref.kind === "builtin") {
      if (ref.skinId !== skinId) return false;
      return SKINS[skinId]?.builtinAssets[ref.assetKey] !== void 0;
    }
    if (meta === void 0 || meta === null) return true;
    return metaSatisfiesField(field, meta);
  }
  function metaSatisfiesField(field, meta) {
    if (typeof meta.mime !== "string" || !field.allowedUserMime.includes(meta.mime)) return false;
    if (meta.byteLength > field.maxBytes) return false;
    if (meta.width > field.maxWidth || meta.height > field.maxHeight) return false;
    const maxPixels = meta.mime === "image/gif" ? Math.min(field.maxPixels, GIF_MAX_PIXELS) : field.maxPixels;
    return meta.width * meta.height <= maxPixels;
  }
  function validateOverride(skinId, key, value, metaProvider) {
    const field = getField(skinId, key);
    if (field === null) return { ok: false, code: "UNKNOWN_FIELD" };
    const provider = typeof metaProvider === "function" ? metaProvider : void 0;
    if (field.scope === "single") {
      if (field.type === "image") {
        const ref = resolveImageRef(value);
        if (ref === null) return { ok: false, code: "BAD_SHAPE" };
        if (ref.kind === "builtin") {
          if (!validateImageRef(value, field, skinId, void 0)) return { ok: false, code: "BAD_ASSET" };
          return { ok: true };
        }
        if (provider !== void 0) {
          const meta = provider(ref.id);
          if (meta === null) return { ok: false, code: "MISSING_ASSET" };
          if (!validateImageRef(value, field, skinId, meta)) return { ok: false, code: "BAD_ASSET" };
        }
        return { ok: true };
      }
      if (!validateScalar(value, field)) return { ok: false, code: "BAD_VALUE" };
      return { ok: true };
    }
    if (!validScopeObject(value, field.scope, (member) => {
      if (field.type === "text") return validateTextMember(member, field);
      if (field.type === "range") return validateRangeMember(member, field);
      if (field.type === "color") return typeof member === "string" && HEX_COLOR.test(member);
      return false;
    })) return { ok: false, code: "BAD_SHAPE" };
    return { ok: true };
  }
  function mergeValues(skinId, overrides, metaProvider, profile = "web") {
    const schema = getSkinSchema(skinId, profile);
    if (schema === null) return { values: {}, issues: [] };
    const provider = typeof metaProvider === "function" ? metaProvider : void 0;
    const values = {};
    const issues = [];
    for (const field of schema.fields) {
      const override = overrides?.[field.key];
      if (override === void 0) {
        values[field.key] = field.default;
        continue;
      }
      const verdict = validateOverride(skinId, field.key, override, provider);
      if (verdict.ok) {
        values[field.key] = override;
      } else {
        values[field.key] = field.default;
        issues.push({ key: field.key, code: verdict.code });
      }
    }
    return { values, issues };
  }

  // src/client/personalization/projector.js
  var DATASET_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function deepFreeze(value) {
    if (value === null || typeof value !== "object") return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  function optionalString(value) {
    if (value === void 0 || value === null) return null;
    return typeof value === "string" ? value : void 0;
  }
  function normalizeEffects(draft) {
    let source;
    try {
      source = structuredClone(draft);
    } catch {
      return null;
    }
    if (!isPlainObject(source)) return null;
    if (typeof source.bodyAttribute !== "string" || !DATASET_KEY.test(source.bodyAttribute)) return null;
    const slogans = source.slogans ?? null;
    if (slogans !== null && (!isPlainObject(slogans) || typeof slogans.zh !== "string" || typeof slogans.en !== "string")) return null;
    const titleBrand = optionalString(source.titleBrand);
    if (titleBrand === void 0) return null;
    const favicon2 = source.favicon ?? null;
    if (favicon2 !== null && (!isPlainObject(favicon2) || typeof favicon2.href !== "string" || favicon2.href.length === 0 || typeof favicon2.mime !== "string")) return null;
    const backdrop = source.backdrop ?? null;
    if (backdrop !== null) {
      if (!isPlainObject(backdrop)) return null;
      for (const key of ["imageLight", "imageDark", "overlayLight", "overlayDark"]) {
        const value = backdrop[key] ?? null;
        if (value !== null && typeof value !== "string") return null;
      }
      const blur = backdrop.blur ?? 0;
      if (typeof blur !== "number" || !(blur >= 0 && blur <= 24)) return null;
      const desktopBlur = backdrop.desktopBlur ?? null;
      if (desktopBlur !== null) {
        if (!isPlainObject(desktopBlur)) return null;
        for (const key of ["light", "dark"]) {
          const value = desktopBlur[key];
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 24) return null;
        }
      }
    }
    const tokenOverrides = source.tokenOverrides ?? null;
    if (tokenOverrides !== null) {
      if (!isPlainObject(tokenOverrides)) return null;
      for (const value of Object.values(tokenOverrides)) {
        if (!isPlainObject(value) || typeof value.light !== "string" || typeof value.dark !== "string") return null;
      }
    }
    const cssVariables = source.cssVariables ?? null;
    if (cssVariables !== null) {
      if (!isPlainObject(cssVariables)) return null;
      for (const value of Object.values(cssVariables)) {
        if (!isPlainObject(value) || typeof value.light !== "string" || typeof value.dark !== "string") return null;
      }
    }
    const staticCss = optionalString(source.staticCss);
    if (staticCss === void 0) return null;
    const decorations = source.decorations ?? null;
    if (decorations !== null) {
      if (!Array.isArray(decorations)) return null;
      for (const decoration of decorations) {
        if (!isPlainObject(decoration) || typeof decoration.key !== "string" || decoration.key.length === 0 || typeof decoration.css !== "string") return null;
      }
    }
    return deepFreeze({
      bodyAttribute: source.bodyAttribute,
      slogans,
      titleBrand,
      favicon: favicon2,
      backdrop: backdrop === null ? null : {
        imageLight: backdrop.imageLight ?? null,
        imageDark: backdrop.imageDark ?? null,
        overlayLight: backdrop.overlayLight ?? null,
        overlayDark: backdrop.overlayDark ?? null,
        blur: backdrop.blur ?? 0,
        desktopBlur: backdrop.desktopBlur ?? null
      },
      tokenOverrides,
      cssVariables,
      staticCss,
      decorations
    });
  }
  function projectSkin(skin, rawOverrides, context = {}) {
    const schema = getSkinSchema(skin.id, context.profile);
    if (schema === null) {
      return { effects: null, issues: [], degraded: "failed" };
    }
    const project = skin.project;
    const attempt = (overrides) => {
      const { values, issues } = mergeValues(skin.id, overrides, context.metaProvider, context.profile);
      const resolvedAssets = {};
      for (const field of schema.fields) {
        if (field.type !== "image") continue;
        const ref = resolveImageRef(values[field.key]);
        if (ref === null) continue;
        const resolved = context.assetResolver?.(ref) ?? null;
        if (resolved === null || typeof resolved.url !== "string" || resolved.url.length === 0) {
          throw new Error(`asset resolution failed for ${skin.id}.${field.key}`);
        }
        resolvedAssets[field.key] = resolved;
      }
      return { issues, normalized: normalizeEffects(project(values, resolvedAssets)) };
    };
    const safeAttempt = (overrides) => {
      try {
        return attempt(overrides);
      } catch {
        return { issues: [], normalized: null, crashed: true };
      }
    };
    const first = safeAttempt(rawOverrides ?? {});
    if (first.normalized !== null) return { effects: first.normalized, issues: first.issues, degraded: "none" };
    const second = safeAttempt(defaultsFor(skin.id, context.profile));
    if (second.normalized !== null) return { effects: second.normalized, issues: first.issues, degraded: "defaults" };
    return { effects: null, issues: first.issues, degraded: "failed" };
  }

  // src/client/runtime.js
  var SKIN_STORAGE_KEY = "dsh-skins:active";
  var SKIN_URL_PARAM = "skin";
  var OFFICIAL_SKIN_ID = "official";
  var LEGACY_OFFICIAL_ALIAS = "default";
  var HERO_NS = "conversation";
  var HERO_KEY = "hero.headline";
  var ACTIVE_EVENT = "dsh-skins:active-changed";
  function datasetAttribute(key) {
    return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  }
  function resolvePreloadUrl(skins, personalization, skinId, defaultRef) {
    if (typeof skinId !== "string" || skinId === "" || skinId === OFFICIAL_SKIN_ID) return null;
    let ref = defaultRef;
    try {
      const override = personalization?.getOverrides?.(skinId)?.wallpaper;
      if (typeof override === "string" && override !== "") ref = override;
    } catch {
    }
    if (typeof ref !== "string") return null;
    const match = BUILTIN_REF_PATTERN.exec(ref);
    if (match === null) return null;
    const asset = skins.get?.(match[1])?.builtinAssets?.[match[2]];
    const url = asset?.url;
    return typeof url === "string" && url.startsWith("/dsh-skins/assets/") ? url : null;
  }
  function parseRgbaChannels(value) {
    const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/i.exec(value ?? "");
    if (match === null) return null;
    const channels = [match[1], match[2], match[3], match[4]].map(Number);
    if (channels.some((channel) => !Number.isFinite(channel))) return null;
    const [r, g, b, a] = channels;
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  }
  function sidebarPaintOrderCss(bodyAttribute) {
    return `body[${datasetAttribute(bodyAttribute)}] [class*="_sidebarCol"]{position:relative;z-index:1}`;
  }
  function buildShellAlignmentCss(bodyAttribute, opaqueFills, backdrop) {
    const body = `body[${datasetAttribute(bodyAttribute)}]`;
    const scoped = `html[data-windows-titlebar] ${body}`;
    const lines = [
      "/* dsh-skins shell-frame alignment (ADR-0009): solid chrome + wallpaper in the conversation area on Windows desktop */",
      'html[data-windows-titlebar] [class*="_frame"]:has(> [class*="_sidebarCol"])::before{background:0 0}',
      'html[data-windows-titlebar] [class*="_frame"] > [class*="_sidebarCol"]{background:0 0}',
      'html[data-windows-titlebar] [class*="_sidebarCol"] > [class*="_root"]{background:0 0}'
    ];
    if (opaqueFills !== null) {
      lines.push(
        `${scoped}{--dsw-specific-sidebar-fill:${opaqueFills.light}!important}`,
        `${scoped}[data-ds-dark-theme]{--dsw-specific-sidebar-fill:${opaqueFills.dark}!important}`
      );
    }
    if (backdrop !== null && backdrop !== void 0 && backdrop.imageLight !== null && backdrop.imageDark !== null) {
      lines.push(
        `${scoped} [class*="_centerCol"]{background-image:${backdrop.imageLight};background-size:cover;background-position:center;background-repeat:no-repeat}`,
        `${scoped}[data-ds-dark-theme] [class*="_centerCol"]{background-image:${backdrop.imageDark}}`
      );
    }
    if (opaqueFills !== null) {
      lines.push(
        `${scoped} [data-rightbar-col] > *{background-color:${opaqueFills.light}!important}`,
        `${scoped}[data-ds-dark-theme] [data-rightbar-col] > *{background-color:${opaqueFills.dark}!important}`
      );
      lines.push(
        `${scoped} [class*="_pane_"]{background:${opaqueFills.light}!important}`,
        `${scoped}[data-ds-dark-theme] [class*="_pane_"]{background:${opaqueFills.dark}!important}`
      );
    }
    return lines.join("\n");
  }
  function buildFullscreenBaseCss(bodyAttribute, opaqueFills) {
    if (opaqueFills === null) return "";
    const body = `body[${datasetAttribute(bodyAttribute)}]`;
    const column = ' [data-rightbar-fullscreen] [class*="_rightbarCol"]';
    const emptyPaneGuard = ':not(:has([class*="_paneBody"] > [class*="_empty"]))';
    const openGate = '[data-sidebar-right-open="true"]';
    const dockPanel = ` [data-sidebar-right-panel="fullscreen"]${openGate}${emptyPaneGuard}`;
    const dockPane = ` [data-sidebar-right-panel="fullscreen"]${openGate} [data-dockkit-pane]${emptyPaneGuard}`;
    return [
      "/* dsh-skins fullscreen base (ADR-0020): solid skin-tone base while data-rightbar-fullscreen is set — the fullscreen dockkit PANE paints a translucent bg token where the official theme paints opaque white (DOM-dump evidence), so the pane is the bleed surface; solid matches the official look. Docked column untouched. Sheet rules gated on data-sidebar-right-open (stale-fullscreen collapse, ADR-0021 amendment 四) */",
      `${body}${column},${body}${dockPanel},${body}${dockPane}{background-color:${opaqueFills.light}!important}`,
      `${body}[data-ds-dark-theme]${column},${body}[data-ds-dark-theme]${dockPanel},${body}[data-ds-dark-theme]${dockPane}{background-color:${opaqueFills.dark}!important}`
    ].join("\n");
  }
  function buildReadingBaseCss(bodyAttribute, opaqueFills) {
    if (opaqueFills === null) return "";
    const body = `body[${datasetAttribute(bodyAttribute)}]`;
    const panel = ' [data-plugin-panel="true"]';
    return [
      "/* dsh-skins reading base (ADR-0022): solid skin-tone base under the plugin panel route container — the live page paints the whole route transparent over the wallpaper while the official theme paints an opaque bg token (DOM-dump evidence 2026-10-30), so text sits on a translucent token x wallpaper composite; solid matches the official look. Element-bound: the route leaves the DOM with the page, no state gate needed. Layer pin per ADR-0021 amendment doctrine (large-area cover rules always carry the pin). */",
      `${body}${panel}{position:relative;z-index:0;background-color:${opaqueFills.light}!important}`,
      `${body}[data-ds-dark-theme]${panel}{position:relative;z-index:0;background-color:${opaqueFills.dark}!important}`
    ].join("\n");
  }
  var PRODUCTION_FIELDS = /* @__PURE__ */ new Set([
    "id",
    "label",
    "description",
    "Mark",
    "Name",
    "project",
    "builtinAssets"
  ]);
  function createSkinRuntime({ profile = "web" } = {}) {
    const skins = /* @__PURE__ */ new Map();
    const order = [];
    let ctx = null;
    let mounted = null;
    let selectedId = null;
    let personalization = null;
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
    function activeLocale() {
      try {
        return ctx?.locale?.getLocale?.().active ?? "zh";
      } catch {
        return "zh";
      }
    }
    function localizedText(value) {
      if (value === null || value === void 0) return "";
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
      } catch {
      }
      return order[0];
    }
    function announce(id) {
      if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent(ACTIVE_EVENT, { detail: id }));
      }
    }
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
        metaProvider: personalization?.metaProvider
      };
    }
    function styleTag(id, content) {
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`);
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = "dsh-skins";
        tag.dataset.pluginCss = id;
        document.head.appendChild(tag);
      }
      tag.textContent = content;
      return tag;
    }
    function backdropCss(effects) {
      const backdrop = effects.backdrop;
      if (backdrop === null) return null;
      const selector = `body[${datasetAttribute(effects.bodyAttribute)}]`;
      const darkSelector = `${selector}[data-ds-dark-theme]`;
      const rules = [];
      if (backdrop.imageLight !== null || backdrop.imageDark !== null) {
        const blur = backdrop.blur > 0 ? `filter:blur(${backdrop.blur}px);transform:scale(1.02);` : "";
        rules.push(`${selector}::before{content:"";position:fixed;inset:0;z-index:-1;background-image:${backdrop.imageLight ?? "none"};background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;${blur}}`);
        if (backdrop.imageDark !== null && backdrop.imageDark !== backdrop.imageLight) {
          rules.push(`${darkSelector}::before{background-image:${backdrop.imageDark}}`);
        }
      }
      if (backdrop.overlayLight !== null || backdrop.overlayDark !== null) {
        rules.push(`${selector}::after{content:"";position:fixed;inset:0;z-index:-1;background-image:${backdrop.overlayLight ?? "none"};pointer-events:none;}`);
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
      return `${selector}{${light.join(";")}}
${darkSelector}{${dark.join(";")}}`;
    }
    const BRAND_PRIORITY_BASE = -20;
    function occupantPriorities(name) {
      try {
        return (ctx.slots.entries?.(name) ?? []).map((entry) => entry.options.priority ?? 0);
      } catch {
        return [];
      }
    }
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
      return () => {
      };
    }
    function refreshSkinStyleTags() {
      if (typeof requestAnimationFrame !== "function" || typeof document === "undefined" || document.head?.querySelectorAll === void 0) return;
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
    let rightPanelRepaintHookInstalled = false;
    function installRightPanelRepaintHook() {
      if (rightPanelRepaintHookInstalled || typeof MutationObserver !== "function") return;
      if (typeof document === "undefined" || document.body === void 0 || document.body === null) return;
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
        subtree: true,
        attributes: true,
        attributeFilter: ["data-sidebar-right-panel"],
        attributeOldValue: true
      });
    }
    function buildEffects(skin, effects) {
      if (!ctx) throw new Error("[dsh-skins] mount before apply");
      const body = document.body;
      const stops = [];
      const unwind = () => {
        for (let index = stops.length - 1; index >= 0; index -= 1) {
          try {
            stops[index]();
          } catch {
          }
        }
      };
      try {
        stops.push(ctx.slots.inject(
          "sidebar.brand.mark",
          () => ctx.slots.inject(
            "sidebar.brand.name",
            () => ctx.slots.inject("conversation.hero.brand.mark", () => {
              const registrations = [
                registerBrandSeat("sidebar.brand.mark", skin.Mark),
                registerBrandSeat("sidebar.brand.name", skin.Name),
                registerBrandSeat("conversation.hero.brand.mark", skin.Mark)
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
              if (entries && entries[HERO_KEY] !== void 0) {
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
        {
          const tag = styleTag(
            `dsh-skins/${skin.id}.paintorder.css`,
            sidebarPaintOrderCss(effects.bodyAttribute)
          );
          stops.push(() => tag.remove());
        }
        {
          const fills = effects.tokenOverrides?.["--dsw-specific-sidebar-fill"] ?? null;
          const lightFill = fills === null ? null : parseRgbaChannels(fills.light);
          const darkFill = fills === null ? null : parseRgbaChannels(fills.dark);
          const opaqueFills = lightFill !== null && darkFill !== null ? {
            light: `rgb(${lightFill.r}, ${lightFill.g}, ${lightFill.b})`,
            dark: `rgb(${darkFill.r}, ${darkFill.g}, ${darkFill.b})`
          } : null;
          const backdrop2 = effects.backdrop === null ? null : {
            imageLight: effects.backdrop.imageLight,
            imageDark: effects.backdrop.imageDark
          };
          const tag = styleTag(
            `dsh-skins/${skin.id}.shell.css`,
            buildShellAlignmentCss(effects.bodyAttribute, opaqueFills, backdrop2)
          );
          stops.push(() => tag.remove());
          const fullscreenCss = buildFullscreenBaseCss(effects.bodyAttribute, opaqueFills);
          if (fullscreenCss !== "") {
            const fullscreenTag = styleTag(`dsh-skins/${skin.id}.fullscreen.css`, fullscreenCss);
            stops.push(() => fullscreenTag.remove());
          }
          const readingCss = buildReadingBaseCss(effects.bodyAttribute, opaqueFills);
          if (readingCss !== "") {
            const readingTag = styleTag(`dsh-skins/${skin.id}.reading.css`, readingCss);
            stops.push(() => readingTag.remove());
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
        const hadAttribute = body.dataset[effects.bodyAttribute] !== void 0;
        stops.push(() => {
          if (!hadAttribute) delete body.dataset[effects.bodyAttribute];
        });
        body.dataset[effects.bodyAttribute] = "";
        if (effects.favicon !== null) {
          const removedIcons = [...document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
          let favicon2 = null;
          stops.push(() => {
            if (favicon2 !== null) favicon2.remove();
            for (const element of removedIcons) document.head.append(element);
          });
          removedIcons.forEach((element) => element.remove());
          favicon2 = document.createElement("link");
          favicon2.rel = "icon";
          favicon2.type = effects.favicon.mime;
          favicon2.href = effects.favicon.href;
          document.head.append(favicon2);
        }
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
            return null;
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
    function applyEffects(skin, effects, overrides) {
      const previous = mounted === null ? null : { skin: mounted.skin, overrides: mounted.overrides };
      unmount();
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
      if (previous !== null) refreshSkinStyleTags();
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
    function mountSkin(skin) {
      const overrides = overridesFor(skin.id);
      const result = projectSkin(skin, overrides, projectionContext());
      if (result.effects === null) {
        console.warn(`[dsh-skins] skin "${skin.id}" failed to project`);
        if (mounted !== null) return false;
        selectedId = OFFICIAL_SKIN_ID;
        announce(OFFICIAL_SKIN_ID);
        return false;
      }
      if (result.degraded !== "none") {
        console.warn(`[dsh-skins] skin "${skin.id}" projected with degraded defaults (${result.degraded})`);
      }
      return applyEffects(skin, result.effects, overrides);
    }
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
      return applied ? { applied: true, degraded: result.degraded } : { applied: false, reason: "mount-failed" };
    }
    function preloadEffectiveWallpaper(normalizedId) {
      try {
        const url = resolvePreloadUrl(skins, personalization, normalizedId, defaultWallpaperRef(normalizedId));
        if (url !== null && typeof Image === "function") {
          const image = new Image();
          image.src = url;
        }
      } catch {
      }
    }
    function select(id) {
      const normalizedId = normalizeChoiceId(id);
      const skin = skins.get(normalizedId);
      if (normalizedId !== OFFICIAL_SKIN_ID && !skin) {
        throw new Error(`[dsh-skins] unknown skin "${id}" — available: ${[OFFICIAL_SKIN_ID, ...order].join(", ")}`);
      }
      if (selectedId === normalizedId && mounted !== null) return normalizedId;
      preloadEffectiveWallpaper(normalizedId);
      if (normalizedId === OFFICIAL_SKIN_ID) {
        unmount();
        selectedId = OFFICIAL_SKIN_ID;
        try {
          localStorage.setItem(SKIN_STORAGE_KEY, normalizedId);
        } catch {
        }
        announce(OFFICIAL_SKIN_ID);
        return normalizedId;
      }
      if (mountSkin(skin)) {
        try {
          localStorage.setItem(SKIN_STORAGE_KEY, normalizedId);
        } catch {
        }
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
        if (!mountSkin(skin)) selectedId = OFFICIAL_SKIN_ID;
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
      active: () => selectedId
    };
  }

  // src/client/dicts.js
  var NS = "dsh-skins.ui";
  var DICTS = {
    zh: {
      "skins.switch": "主题切换",
      "skins.title": "选择皮肤",
      "skins.official.label": "DeepSeek Harness（官方）",
      "skins.official.description": "素笺玄墨 · 留白生辉 · 本色天成",
      "appearance.title": "外观配色",
      "appearance.light": "浅色",
      "appearance.dark": "深色",
      "appearance.system": "跟随系统",
      // Personalization surface (1.0.0)
      "personalization.title": "个性化",
      "personalization.collapse": "收起个性化面板",
      "personalization.reset": "恢复默认",
      "personalization.confirmTitle": "确认操作",
      "personalization.confirm": "确认",
      "personalization.cancel": "取消",
      "personalization.resetJoin": "\n• ",
      "personalization.resetConfirm": "以下设置将恢复为出厂默认：\n\n{fields}\n\n此操作立即生效，确认继续吗？",
      "personalization.resetConfirmIntro": "以下设置将恢复为出厂默认：",
      "personalization.resetConfirmOutro": "此操作立即生效，确认继续吗？",
      "personalization.light": "浅色",
      "personalization.dark": "深色",
      "personalization.builtin": "内置画作",
      "personalization.builtin.default": "默认壁纸",
      "personalization.wallpaper": "壁纸 Wallpaper",
      "personalization.slogan": "标语 Slogan",
      "personalization.panelTranslucency": "通透度 Transparency",
      "personalization.openbmc.art": "左风右雷（默认壁纸）",
      "personalization.uefi.art": "集成电路（默认壁纸）",
      "personalization.meirenzhi.yuntai": "云台雅集 · 合照（默认壁纸）",
      "personalization.meirenzhi.mupeiling": "慕沛灵 · 单人",
      "personalization.meirenzhi.ziling": "紫灵 · 单人",
      "personalization.meirenzhi.nangongwan": "南宫婉 · 单人",
      "personalization.meirenzhi.nangongque": "南宫阙 · 单人",
      "personalization.meirenzhi.yinyue": "银月 · 单人",
      "personalization.library": "图库",
      "personalization.library.upload": "上传图片",
      "personalization.library.delete": "删除",
      "personalization.library.deleteConfirm": "删除后，以下皮肤的壁纸将回退为默认：",
      "personalization.library.deleteFailed": "删除失败，请重试",
      "personalization.library.deleted": "已删除：{name}",
      "personalization.library.empty": "图库为空，上传一张图片试试",
      "personalization.library.more": "还有 {count} 张未显示",
      "personalization.panelLabel": "个性化设置",
      "personalization.saveFailed": "保存失败，请重试",
      "personalization.saveConflict": "配置已在其他窗口更新，请重试",
      "personalization.fieldReverted": "壁纸已失效，已回退默认",
      "personalization.library.previewRef": "未保存引用",
      "personalization.library.clear": "清空图库",
      "personalization.library.clearConfirm": "将永久删除全部 {count} 张上传图片，且不可恢复。以下壁纸设置将回退为默认：{names}",
      "personalization.library.clearFailed": "清空图库失败，已刷新剩余列表",
      "personalization.library.uploading": "正在上传…",
      "personalization.library.uploadingBatch": "正在上传 {done}/{total}…",
      "personalization.library.uploadSomeFailed": "已上传 {ok} 张，{failed} 张失败（{reason}）",
      "personalization.library.uploadFailed": "上传失败，请重试",
      "personalization.status.loading": "正在同步个性化配置…",
      "personalization.status.offline": "配置尚未同步，暂时无法编辑",
      "personalization.status.retry": "重试",
      "personalization.status.unsupported": "配置由更新版本的插件创建，当前只读",
      "personalization.status.recovery": "检测到配置文件损坏",
      "personalization.status.recoveryHint": "可以从图片库重建配置；自定义标语与颜色等覆写可能丢失。",
      "personalization.recovery.confirm": "确认恢复",
      // Host-reported personalization errors (see host-errors.js HOST_ERROR_KEYS)
      "host.personalization.tooLarge": "图片超过大小限制",
      "host.personalization.unsupportedImage": "不支持的图片格式",
      "host.personalization.animatedWebp": "动画 WebP 暂不支持",
      "host.personalization.diskFull": "磁盘剩余空间不足",
      "host.personalization.invalidFilename": "文件展示名无效",
      "host.personalization.assetMissing": "图片不存在",
      "host.personalization.invalidConfig": "配置校验失败",
      "host.personalization.readonly": "配置为更高版本创建，当前只读",
      "host.personalization.recoveryRequired": "配置状态待恢复，请先在个性化面板确认恢复",
      "host.personalization.unknownSkin": "皮肤不存在",
      "host.personalization.uploadTimeout": "上传超时，请检查网络后重试"
    },
    en: {
      "skins.switch": "Theme Switcher",
      "skins.title": "Choose Skin",
      "skins.official.label": "DeepSeek Harness (Official)",
      "skins.official.description": "Plain paper & dark ink · breathing white space · naturally itself",
      "appearance.title": "Appearance",
      "appearance.light": "Light",
      "appearance.dark": "Dark",
      "appearance.system": "System",
      // Personalization surface (1.0.0)
      "personalization.title": "Personalize",
      "personalization.collapse": "Collapse personalization panel",
      "personalization.reset": "Restore defaults",
      "personalization.confirmTitle": "Confirm action",
      "personalization.confirm": "Confirm",
      "personalization.cancel": "Cancel",
      "personalization.resetJoin": "\n• ",
      "personalization.resetConfirm": "These settings will be reset to factory defaults:\n\n{fields}\n\nThis takes effect immediately. Continue?",
      "personalization.resetConfirmIntro": "These settings will be reset to factory defaults:",
      "personalization.resetConfirmOutro": "This takes effect immediately. Continue?",
      "personalization.light": "Light",
      "personalization.dark": "Dark",
      "personalization.builtin": "Built-in artwork",
      "personalization.builtin.default": "Default wallpaper",
      "personalization.wallpaper": "Wallpaper",
      "personalization.slogan": "Slogan",
      "personalization.panelTranslucency": "Panel translucency",
      "personalization.openbmc.art": "Left Wind, Right Thunder (default)",
      "personalization.uefi.art": "Integrated circuit (default)",
      "personalization.meirenzhi.yuntai": "Yuntai Gathering · Group (default)",
      "personalization.meirenzhi.mupeiling": "Mu Peiling · Solo",
      "personalization.meirenzhi.ziling": "Zi Ling · Solo",
      "personalization.meirenzhi.nangongwan": "Nangong Wan · Solo",
      "personalization.meirenzhi.nangongque": "Nangong Que · Solo",
      "personalization.meirenzhi.yinyue": "Yin Yue · Solo",
      "personalization.library": "Library",
      "personalization.library.upload": "Upload image",
      "personalization.library.delete": "Delete",
      "personalization.library.deleteConfirm": "These skins will fall back to their default wallpaper:",
      "personalization.library.deleted": "Deleted: {name}",
      "personalization.library.deleteFailed": "Delete failed; try again",
      "personalization.library.empty": "Library is empty — upload an image",
      "personalization.library.more": "{count} more hidden",
      "personalization.panelLabel": "Personalization settings",
      "personalization.saveFailed": "Save failed; try again",
      "personalization.saveConflict": "Settings changed in another window; try again",
      "personalization.fieldReverted": "Wallpaper no longer exists; reset to default",
      "personalization.library.previewRef": "unsaved reference",
      "personalization.library.clear": "Clear library",
      "personalization.library.clearConfirm": "This permanently deletes all {count} uploaded images. These wallpaper settings fall back to defaults: {names}",
      "personalization.library.clearFailed": "Clear library failed; the remaining list was refreshed",
      "personalization.library.uploading": "Uploading…",
      "personalization.library.uploadingBatch": "Uploading {done}/{total}…",
      "personalization.library.uploadSomeFailed": "Uploaded {ok}; {failed} failed ({reason})",
      "personalization.library.uploadFailed": "Upload failed; try again",
      "personalization.status.loading": "Syncing personalization…",
      "personalization.status.offline": "Settings not synced yet; editing is unavailable",
      "personalization.status.retry": "Retry",
      "personalization.status.unsupported": "Created by a newer plugin version; read-only",
      "personalization.status.recovery": "Configuration file is damaged",
      "personalization.status.recoveryHint": "It can be rebuilt from the image library; custom slogans and colors may be lost.",
      "personalization.recovery.confirm": "Confirm recovery",
      // Host-reported personalization errors (see host-errors.js HOST_ERROR_KEYS)
      "host.personalization.tooLarge": "Image exceeds the size limit",
      "host.personalization.unsupportedImage": "Unsupported image format",
      "host.personalization.animatedWebp": "Animated WebP is not supported",
      "host.personalization.diskFull": "Not enough disk space",
      "host.personalization.invalidFilename": "Invalid display name",
      "host.personalization.assetMissing": "Image not found",
      "host.personalization.invalidConfig": "Configuration failed validation",
      "host.personalization.readonly": "Created by a newer config version; read-only",
      "host.personalization.recoveryRequired": "Configuration needs recovery; confirm it in the personalization panel first",
      "host.personalization.unknownSkin": "Skin not found",
      "host.personalization.uploadTimeout": "Upload timed out; check your connection and retry"
    }
  };
  function formatTemplate(template, params = {}) {
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template
    );
  }

  // src/client/host-errors.js
  var HOST_ERROR_KEYS = {
    UPLOAD_TOO_LARGE: "host.personalization.tooLarge",
    // UPLOAD_TIMEOUT: client-side fetch abort (config-client uploadImage).
    // UPLOAD_FAILED (any other rejected upload fetch) is intentionally unmapped —
    // resolveHostErrorText falls back to the panel's generic uploadFailed copy.
    UPLOAD_TIMEOUT: "host.personalization.uploadTimeout",
    UNSUPPORTED_IMAGE: "host.personalization.unsupportedImage",
    ANIMATION_UNSUPPORTED: "host.personalization.animatedWebp",
    DISK_FULL: "host.personalization.diskFull",
    FILENAME_INVALID: "host.personalization.invalidFilename",
    ASSET_NOT_FOUND: "host.personalization.assetMissing",
    INVALID_CONFIG: "host.personalization.invalidConfig",
    STORE_READONLY: "host.personalization.readonly",
    STORE_RECOVERY_REQUIRED: "host.personalization.recoveryRequired",
    UNKNOWN_SKIN: "host.personalization.unknownSkin"
  };
  function safeTr(tr, key, params) {
    if (typeof tr !== "function") return key;
    const text = tr(key, params);
    return typeof text === "string" ? text : key;
  }
  function resolveHostErrorText(value, tr) {
    if (value === null || value === void 0 || value === "") return "";
    if (typeof value === "string") return value;
    const key = value.code === void 0 ? void 0 : HOST_ERROR_KEYS[value.code];
    if (key !== void 0) {
      const text = safeTr(tr, key, value.params ?? {});
      if (text !== key) return text;
    }
    return value.text ?? value.message ?? String(value);
  }

  // src/client/personalization/panel.js
  var PANEL_CSS = [
    // Panel header collapse control (v1.0.0 ruling): ghost icon button in the
    // gear's visual language; collapses the PANEL only, never the shell.
    // margin-left:auto keeps it alone at the header's far right — the reset
    // control stays by the title on the left, separated by the flexible gap,
    // so aiming for « cannot mis-fire a destructive reset.
    ".dsh-skins-pz-collapse{flex:none;align-self:center;margin-left:auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.75;transition:opacity .15s}",
    ".dsh-skins-pz-collapse:hover,.dsh-skins-pz-collapse:focus-visible{opacity:1;border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-skins-pz-collapse svg{width:14px;height:14px}",
    ".dsh-skins-pz{display:flex;flex-direction:column;gap:10px}",
    ".dsh-skins-pz-head{display:flex;align-items:center;gap:8px}",
    // Title does NOT grow (flex:0 1 auto): the reset control must sit right
    // after the title text on the header's LEFT side (v1.0.0 ruling) — a
    // growing title would push it to the right end, adjacent to the collapse
    // chevron, and aiming for « could mis-fire a destructive reset.
    ".dsh-skins-pz-head .dsh-skins-pop-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;outline:none}",
    ".dsh-skins-pz-row{display:flex;flex-direction:column;gap:6px}",
    ".dsh-skins-pz-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);font-weight:500}",
    ".dsh-skins-pz-fields{display:flex;flex-direction:column;gap:6px}",
    ".dsh-skins-pz-colors{flex-direction:row;gap:14px}",
    ".dsh-skins-pz-color{display:flex;align-items:center;gap:6px}",
    ".dsh-skins-pz-color input[type=color]{width:34px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer}",
    ".dsh-skins-pz-range{display:flex;align-items:center;gap:8px}",
    ".dsh-skins-pz-range input[type=range]{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}",
    ".dsh-skins-pz-range output{flex:none;min-width:44px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".dsh-skins-pz-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}",
    ".dsh-skins-pz-btn{flex:none;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}",
    ".dsh-skins-pz-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-skins-pz-btn:disabled{opacity:.55;cursor:default}",
    ".dsh-skins-pz-group{display:flex;flex-direction:column;gap:6px}",
    ".dsh-skins-pz-thumbs{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}",
    // Grid helpers must span the full row: squeezed into one ~110px column
    // track, the "还有 N 张未显示" button and the empty-library hint wrapped
    // into multi-line stubs (field report). Centered full-row reads as the
    // load-more affordance; the hint stays left-aligned with its group label.
    ".dsh-skins-pz-thumbs>.dsh-skins-pz-btn{grid-column:1/-1;justify-self:center;white-space:nowrap}",
    ".dsh-skins-pz-thumbs>.dsh-skins-pz-muted{grid-column:1/-1;white-space:nowrap}",
    ".dsh-skins-pz-thumb{position:relative;aspect-ratio:4/3;padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);cursor:pointer}",
    ".dsh-skins-pz-thumb img{width:100%;height:100%;object-fit:cover}",
    ".dsh-skins-pz-thumb.on{border-color:var(--dsw-alias-brand-primary)}",
    ".dsh-skins-pz-thumb:disabled{opacity:.55;cursor:default}",
    ".dsh-skins-pz-muted{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
    ".dsh-skins-pz-strip{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px}",
    ".dsh-skins-pz-status{display:flex;align-items:center;gap:8px;justify-content:space-between}",
    ".dsh-skins-pz-warn{border-color:var(--dsw-alias-state-warning,#c77d00)}",
    ".dsh-skins-pz-asset{display:flex;align-items:center;gap:8px}",
    ".dsh-skins-pz-asset img{flex:none;width:44px;height:33px;border-radius:6px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2)}",
    ".dsh-skins-pz-asset-copy{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".dsh-skins-pz-gallery{display:flex;flex-direction:column;gap:8px}",
    // field issue #2: library cell corner-badges and the sticky action bar
    // (the scroll-region half of the same ruling lives in the shell's CSS —
    // it styles the shell-rendered panel column).
    ".dsh-skins-pz-cell{position:relative;display:block}",
    ".dsh-skins-pz-cell .dsh-skins-pz-thumb{width:100%}",
    ".dsh-skins-pz-del{position:absolute;top:4px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font:inherit;font-size:14px;line-height:1;cursor:pointer}",
    ".dsh-skins-pz-del:hover{background:rgba(0,0,0,.78)}",
    ".dsh-skins-pz-del:disabled{opacity:.55;cursor:default}",
    ".dsh-skins-pz-del .dsh-skins-spinner{width:12px;height:12px;border-width:2px}",
    ".dsh-skins-pz-rowbtns{display:flex;gap:6px;flex-wrap:wrap}",
    ".dsh-skins-pz-actions{position:sticky;bottom:0;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:2px;padding:10px 2px 2px;background:var(--dsw-alias-bg-overlay);border-top:1px solid var(--dsw-alias-border-l2)}",
    ".dsh-skins-pz-cluster{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}",
    ".dsh-skins-pz-cluster-status{flex-direction:column;align-items:flex-start;gap:4px;flex-wrap:nowrap}",
    ".dsh-skins-pz-primary{background:var(--dsh-alias-brand-primary,#C3272B);border-color:transparent;color:#fff}",
    ".dsh-skins-pz-primary:hover{filter:brightness(1.06)}",
    ".dsh-skins-pz-danger{color:var(--dsw-alias-error-text,var(--dsw-static-red-500,#d33));border-color:var(--dsw-alias-error-text,var(--dsw-static-red-500,#d33))}",
    ".dsh-skins-pz-fields-locale{flex-direction:row;gap:6px}",
    ".dsh-skins-pz-fields-locale .dsh-skins-pz-input{flex:1;min-width:0}",
    // HTML <dialog>.showModal() stays inside the renderer's top layer: unlike
    // window.confirm(), it never opens the Windows/Electron JavaScript dialog
    // that can leave the Desktop window unfocused after dismissal.
    ".dsh-skins-pz-dialog{box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.25));font:inherit}",
    ".dsh-skins-pz-dialog::backdrop{background:rgba(0,0,0,.45)}",
    ".dsh-skins-pz-dialog-message{margin:0 0 20px;white-space:pre-line;line-height:1.6;font-size:14px}",
    ".dsh-skins-pz-dialog-intro{margin:0;font-size:14px;line-height:1.6}.dsh-skins-pz-dialog-outro{margin:0 0 20px;font-size:14px;line-height:1.6}",
    ".dsh-skins-pz-dialog-tags{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px;padding:0;list-style:none}",
    ".dsh-skins-pz-dialog-tag{box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,transparent);border-radius:999px;background:var(--dsw-alias-bg-layer-1);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;font-weight:600;white-space:normal}",
    '.dsh-skins-pz-dialog-tag::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary)}',
    ".dsh-skins-pz-dialog-actions{display:flex;justify-content:flex-end;gap:8px}",
    // Stacked (<904px) resets MUST come after the rules they override — the
    // array order is the cascade order among equal-specificity selectors.
    "@media (max-width:904px){.dsh-skins-pz-thumbs{grid-template-columns:repeat(4,1fr)}}"
  ].join("\n");
  var PAGE_SIZE = 18;
  function createPersonalizationPanel({ jsx, react, configClient, tr, builtinAssetsFor, labelFor }) {
    const { useState, useEffect, useRef } = react;
    function useConfigState() {
      const [state, setState] = useState(() => configClient.getState());
      useEffect(() => configClient.onStateChange(() => setState(configClient.getState())), []);
      return state;
    }
    function TextField({ field, value, onValue, disabled }) {
      const inputs = field.scope === "locale" ? ["zh", "en"].map((locale) => jsx("input", {
        key: locale,
        type: "text",
        className: "dsh-skins-pz-input",
        value: value?.[locale] ?? "",
        maxLength: field.maxLength,
        disabled,
        "aria-label": `${tr(field.labelKey)} (${locale.toUpperCase()})`,
        placeholder: field.default?.[locale] ?? "",
        onChange: (event) => onValue({ ...value, [locale]: event.target.value })
      }, locale)) : [jsx("input", {
        key: "single",
        type: "text",
        className: "dsh-skins-pz-input",
        value: value ?? "",
        maxLength: field.maxLength,
        disabled,
        "aria-label": tr(field.labelKey),
        placeholder: field.default ?? "",
        onChange: (event) => onValue(event.target.value)
      })];
      return jsx("label", { className: "dsh-skins-pz-row", children: [
        jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
        jsx("div", {
          className: `dsh-skins-pz-fields${field.scope === "locale" ? " dsh-skins-pz-fields-locale" : ""}`,
          children: inputs
        })
      ] });
    }
    function RangeField({ field, value, onValue, disabled }) {
      const current = value ?? field.default;
      return jsx("label", { className: "dsh-skins-pz-row", children: [
        jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
        jsx("div", { className: "dsh-skins-pz-fields", children: jsx("div", { className: "dsh-skins-pz-range", children: [
          jsx("input", {
            type: "range",
            min: field.min,
            max: field.max,
            step: field.step,
            value: current,
            disabled,
            "aria-label": tr(field.labelKey),
            onChange: (event) => onValue(Number(event.target.value))
          }),
          jsx("output", { children: `${current}${field.unit ?? ""}` })
        ] }) })
      ] });
    }
    function SelectField({ field, value, onValue, disabled }) {
      return jsx("label", { className: "dsh-skins-pz-row", children: [
        jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
        jsx("div", { className: "dsh-skins-pz-fields", children: jsx("select", {
          className: "dsh-skins-pz-input",
          value: value ?? field.default,
          disabled,
          "aria-label": tr(field.labelKey),
          onChange: (event) => onValue(event.target.value),
          children: field.options.map((option) => jsx("option", {
            value: option.value,
            children: tr(option.labelKey)
          }, option.value))
        }) })
      ] });
    }
    function WallpaperSection({ skinId, field, value, onValue, state, disabled, requestConfirm }) {
      const uploadRef = useRef(null);
      const [message, setMessage] = useState(null);
      const [deletingId, setDeletingId] = useState(null);
      const [clearing, setClearing] = useState(false);
      const [visible, setVisible] = useState(PAGE_SIZE);
      const schema = getSkinSchema(skinId);
      const builtins = schema?.builtinAssets ?? {};
      const liveAssets = builtinAssetsFor(skinId);
      const choices = field.builtinChoices ?? [];
      const library = state.library;
      const deleteAsset = async (asset) => {
        setMessage(null);
        setDeletingId(asset.id);
        try {
          const result = await configClient.deleteImage(asset.id);
          setMessage(result.error ? tr("personalization.library.deleteFailed") : tr("personalization.library.deleted", { name: asset.displayName }));
        } catch {
          setMessage(tr("personalization.library.deleteFailed"));
        } finally {
          setDeletingId(null);
        }
      };
      const referenceLabelsFor = (assetId) => configClient.referencesFor(assetId).map((entry) => entry.layer === "preview" ? `${labelFor(entry.skinId)} · ${entry.key} · ${tr("personalization.library.previewRef")}` : `${labelFor(entry.skinId)} · ${entry.key}`);
      const removeAsset = (asset) => {
        if (deletingId !== null || clearing) return;
        const references = referenceLabelsFor(asset.id);
        if (references.length === 0) return deleteAsset(asset);
        requestConfirm(
          `${tr("personalization.library.deleteConfirm")}
${references.join("\n")}`,
          () => deleteAsset(asset)
        );
      };
      const clearLibrary = () => {
        if (clearing || deletingId !== null || library.length === 0) return;
        const names = /* @__PURE__ */ new Map();
        for (const asset of library) {
          for (const label of referenceLabelsFor(asset.id)) {
            names.set(label, true);
          }
        }
        const listed = [...names.keys()].join("、");
        requestConfirm(tr("personalization.library.clearConfirm", {
          count: library.length,
          names: listed === "" ? "—" : listed
        }), async () => {
          setClearing(true);
          try {
            const result = await configClient.clearLibrary();
            if (result.error) {
              setMessage(tr("personalization.library.clearFailed"));
              void configClient.refetch();
            }
          } catch {
            setMessage(tr("personalization.library.clearFailed"));
            void configClient.refetch();
          } finally {
            setClearing(false);
          }
        });
      };
      return jsx("div", { className: "dsh-skins-pz-row", children: [
        jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
        jsx("div", { className: "dsh-skins-pz-fields", children: [
          choices.length > 0 ? jsx("div", { className: "dsh-skins-pz-group", children: [
            jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.builtin") }),
            jsx("div", { className: "dsh-skins-pz-thumbs", children: choices.map((key) => {
              const asset = builtins[key];
              const ref = `builtin:${skinId}:${key}`;
              return jsx("button", {
                type: "button",
                className: `dsh-skins-pz-thumb${value === ref ? " on" : ""}`,
                disabled,
                title: tr(asset?.labelKey ?? "personalization.builtin.default"),
                "aria-pressed": value === ref,
                onClick: () => onValue(ref),
                children: jsx("img", { src: liveAssets[key]?.url ?? asset?.url ?? "", alt: tr(asset?.labelKey ?? key), loading: "lazy", decoding: "async" })
              }, key);
            }) })
          ] }) : null,
          jsx("div", { className: "dsh-skins-pz-group", children: [
            jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.library") }),
            jsx("div", { className: "dsh-skins-pz-thumbs", children: [
              ...library.slice(0, visible).map((asset) => jsx("div", {
                key: asset.id,
                className: `dsh-skins-pz-cell${value === asset.id ? " on" : ""}`,
                children: [
                  jsx("button", {
                    type: "button",
                    className: `dsh-skins-pz-thumb${value === asset.id ? " on" : ""}`,
                    disabled,
                    title: asset.displayName,
                    "aria-pressed": value === asset.id,
                    onClick: () => onValue(asset.id),
                    children: jsx("img", { src: configClient.assetUrl(asset), alt: asset.displayName, loading: "lazy", decoding: "async" })
                  }, asset.id),
                  jsx("button", {
                    type: "button",
                    className: `dsh-skins-pz-del${deletingId === asset.id ? " dsh-skins-pz-del-busy" : ""}`,
                    disabled: disabled || deletingId !== null || clearing,
                    "aria-label": `${tr("personalization.library.delete")}: ${asset.displayName}`,
                    onClick: () => removeAsset(asset),
                    children: deletingId === asset.id ? jsx("span", { className: "dsh-skins-spinner", "aria-hidden": "true" }) : "×"
                  }, `${asset.id}-del`)
                ]
              })),
              library.length > visible ? jsx("button", {
                type: "button",
                className: "dsh-skins-pz-btn",
                onClick: () => setVisible(visible + PAGE_SIZE),
                children: tr("personalization.library.more", { count: library.length - visible })
              }) : null,
              library.length === 0 ? jsx("span", {
                className: "dsh-skins-pz-muted",
                children: tr("personalization.library.empty")
              }) : null
            ] }),
            message === null ? null : jsx("div", { className: "dsh-skins-pz-status dsh-skins-pz-muted", children: message }),
            jsx("div", { className: "dsh-skins-pz-rowbtns", children: [
              jsx("button", {
                type: "button",
                className: "dsh-skins-pz-btn",
                disabled: disabled || deletingId !== null || clearing,
                onClick: () => uploadRef.current?.click(),
                children: tr("personalization.library.upload")
              }),
              library.length > 0 ? jsx("button", {
                type: "button",
                className: "dsh-skins-pz-btn dsh-skins-pz-danger",
                disabled: disabled || deletingId !== null || clearing,
                onClick: clearLibrary,
                children: tr("personalization.library.clear")
              }) : null
            ] }),
            jsx("input", {
              ref: uploadRef,
              type: "file",
              accept: "image/png,image/jpeg,image/webp,image/gif",
              multiple: true,
              style: { display: "none" },
              onChange: async (event) => {
                const files = [...event.target.files ?? []];
                event.target.value = "";
                if (files.length === 0) return;
                if (files.length > 1) {
                  let ok = 0;
                  let lastAssetId = null;
                  let firstError = null;
                  for (let index = 0; index < files.length; index += 1) {
                    setMessage(tr("personalization.library.uploadingBatch", {
                      done: index + 1,
                      total: files.length
                    }));
                    const result2 = await configClient.uploadImage(files[index]);
                    if (result2.asset) {
                      ok += 1;
                      lastAssetId = result2.asset.id;
                    } else if (firstError === null) {
                      firstError = resolveHostErrorText(
                        { code: result2.error, message: tr("personalization.library.uploadFailed") },
                        tr
                      );
                    }
                  }
                  if (lastAssetId !== null) {
                    onValue(lastAssetId);
                    await configClient.flushNow();
                  }
                  setMessage(firstError === null ? null : ok === 0 ? firstError : tr("personalization.library.uploadSomeFailed", {
                    ok,
                    failed: files.length - ok,
                    reason: firstError
                  }));
                  return;
                }
                const result = await configClient.uploadImage(files[0]);
                if (result.asset) {
                  setMessage(null);
                  onValue(result.asset.id);
                  await configClient.flushNow();
                } else {
                  setMessage(resolveHostErrorText(
                    { code: result.error, message: tr("personalization.library.uploadFailed") },
                    tr
                  ));
                }
              }
            })
          ] })
        ] })
      ] });
    }
    function CollapseIcon() {
      return jsx("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        children: jsx("path", {
          d: "M17 6 L11 12 L17 18 M11 6 L5 12 L11 18",
          stroke: "currentColor",
          strokeWidth: "1.6",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        })
      });
    }
    return function PersonalizationPanel({ skinId, onCollapse }) {
      const state = useConfigState();
      const desktopProfile = typeof location !== "undefined" && location.protocol === "dsh-app:" && location.hostname === "app";
      const profile = desktopProfile ? "desktop" : "web";
      const schema = getSkinSchema(skinId, profile);
      const headerRef = useRef(null);
      const dialogRef = useRef(null);
      const confirmationRef = useRef(null);
      const [confirmation, setConfirmation] = useState(null);
      const requestConfirm = (message, accept, { detailItems = null } = {}) => {
        if (!desktopProfile) {
          if (window.confirm(message)) void accept();
          return;
        }
        if (confirmationRef.current !== null) return;
        const next = { message, accept, detailItems };
        confirmationRef.current = next;
        setConfirmation(next);
      };
      const cancelConfirm = () => {
        confirmationRef.current = null;
        setConfirmation(null);
      };
      const acceptConfirm = () => {
        if (confirmationRef.current !== confirmation) return;
        confirmationRef.current = null;
        setConfirmation(null);
        if (configClient.canWrite()) {
          void confirmation.accept();
        }
      };
      useEffect(() => {
        if (confirmation !== null) dialogRef.current?.showModal?.();
      }, [confirmation]);
      const wideLayout = typeof window !== "undefined" && window.innerWidth >= 905;
      useEffect(() => {
        headerRef.current?.focus?.(wideLayout ? { preventScroll: true } : void 0);
      }, []);
      if (schema === null) return null;
      const writesBlocked = !configClient.canWrite();
      const overrides = configClient.effectiveOverrides(skinId);
      const { values } = mergeValues(skinId, overrides, void 0, profile);
      const hasAnyOverride = Object.keys(overrides).length > 0;
      const fieldRows = schema.fields.map((field) => {
        const value = values[field.key];
        const setValue = (next) => configClient.preview(skinId, field.key, next);
        const common = { field, value, onValue: setValue, disabled: writesBlocked };
        switch (field.type) {
          case "text":
            return jsx(TextField, { ...common, key: field.key });
          case "range":
            return jsx(RangeField, { ...common, key: field.key });
          case "select":
            return jsx(SelectField, { ...common, key: field.key });
          case "image":
            return jsx(WallpaperSection, {
              ...common,
              key: field.key,
              skinId,
              state,
              requestConfirm
            });
          default:
            return null;
        }
      });
      const statusCluster = [];
      if (state.mode === "recovery") {
        statusCluster.push(jsx("div", { key: "recovery", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
          jsx("div", { children: tr("personalization.status.recovery") }),
          jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.status.recoveryHint") }),
          jsx("button", {
            type: "button",
            className: "dsh-skins-pz-btn",
            onClick: () => configClient.confirmRecovery(),
            children: tr("personalization.recovery.confirm")
          })
        ] }));
      }
      if (state.status === "loading") {
        statusCluster.push(jsx("div", { key: "loading", className: "dsh-skins-pz-status", children: [
          jsx("span", { children: tr("personalization.status.loading") })
        ] }));
      }
      if (state.status === "offline-failed") {
        statusCluster.push(jsx("div", { key: "offline", className: "dsh-skins-pz-status", children: [
          jsx("span", { children: tr("personalization.status.offline") }),
          jsx("button", {
            type: "button",
            className: "dsh-skins-pz-btn",
            onClick: () => configClient.refetch(),
            children: tr("personalization.status.retry")
          })
        ] }));
      }
      if (state.status === "unsupported-readonly") {
        statusCluster.push(jsx("div", { key: "ro", className: "dsh-skins-pz-status", children: [
          jsx("span", { children: tr("personalization.status.unsupported") })
        ] }));
      }
      const notices = state.notices;
      const conflictNotice = notices.find((notice) => notice.kind === "conflict");
      const errorNotice = notices.find((notice) => notice.kind === "error");
      if (conflictNotice !== void 0) {
        statusCluster.push(jsx("div", { key: "save-conflict", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
          jsx("span", { children: tr("personalization.saveConflict") })
        ] }));
      } else if (errorNotice !== void 0) {
        statusCluster.push(jsx("div", { key: "save-error", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
          jsx("span", { children: tr("personalization.saveFailed") }),
          jsx("div", { className: "dsh-skins-pz-muted", children: errorNotice.message })
        ] }));
      }
      const revertedNotice = notices.find((notice) => notice.kind === "reverted");
      if (revertedNotice !== void 0 && revertedNotice.fields.length > 0) {
        statusCluster.push(jsx("div", { key: "reverted", className: "dsh-skins-pz-status", children: [
          jsx("div", { children: tr("personalization.fieldReverted") }),
          jsx("div", {
            className: "dsh-skins-pz-muted",
            children: revertedNotice.fields.map((entry) => `${labelFor(entry.skinId)} · ${entry.key}`).join("、")
          })
        ] }));
      }
      return jsx("div", { className: "dsh-skins-pz", children: [
        // Header row (`.dsh-skins-pz-head`): the heading stays the focus
        // target (issue #12); the reset and collapse controls pack at its
        // right end so both are discoverable where the user is looking —
        // the gear that opened it is a full column away (user ruling). The
        // reset appears only while the skin has overrides, and its appearing
        // can no longer change the panel's height (v1.0.0 ruling).
        jsx("div", { className: "dsh-skins-pz-head", children: [
          jsx("div", {
            ref: headerRef,
            className: "dsh-skins-pop-title",
            tabIndex: -1,
            role: "heading",
            "aria-level": 2,
            children: `${tr("personalization.title")} · ${labelFor(skinId)}`
          }),
          hasAnyOverride ? jsx("button", {
            type: "button",
            className: "dsh-skins-pz-btn dsh-skins-pz-danger",
            disabled: writesBlocked,
            onClick: () => {
              const affected = schema.fields.filter((field) => overrides[field.key] !== void 0).map((field) => tr(field.labelKey));
              requestConfirm(tr("personalization.resetConfirm", {
                fields: affected.length > 0 ? `• ${affected.join(tr("personalization.resetJoin"))}` : "—"
              }), () => {
                for (const field of schema.fields) configClient.previewReset(skinId, field.key);
                void configClient.flushNow();
              }, { detailItems: affected });
            },
            children: tr("personalization.reset")
          }) : null,
          onCollapse ? jsx("button", {
            type: "button",
            className: "dsh-skins-pz-collapse",
            "aria-label": tr("personalization.collapse"),
            title: tr("personalization.collapse"),
            onClick: onCollapse,
            children: jsx(CollapseIcon, {})
          }) : null
        ] }),
        ...fieldRows,
        statusCluster.length > 0 ? jsx("div", {
          className: "dsh-skins-pz-actions",
          children: jsx("div", { className: "dsh-skins-pz-cluster dsh-skins-pz-cluster-status", children: statusCluster })
        }) : null,
        confirmation === null ? null : jsx("dialog", {
          ref: dialogRef,
          className: "dsh-skins-pz-dialog",
          "aria-labelledby": "dsh-skins-confirm-title",
          onCancel: (event) => {
            event.preventDefault();
            cancelConfirm();
          },
          children: [
            jsx("div", { id: "dsh-skins-confirm-title", className: "dsh-skins-pop-title", children: tr("personalization.confirmTitle") }),
            confirmation.detailItems === null ? jsx("p", { className: "dsh-skins-pz-dialog-message", children: confirmation.message }) : jsx("div", { children: [
              jsx("p", { className: "dsh-skins-pz-dialog-intro", children: tr("personalization.resetConfirmIntro") }),
              confirmation.detailItems.length > 0 ? jsx("ul", { className: "dsh-skins-pz-dialog-tags", children: confirmation.detailItems.map((label) => jsx("li", { className: "dsh-skins-pz-dialog-tag", children: label }, label)) }) : jsx("p", { className: "dsh-skins-pz-dialog-message", children: "—" }),
              jsx("p", { className: "dsh-skins-pz-dialog-outro", children: tr("personalization.resetConfirmOutro") })
            ] }),
            jsx("div", { className: "dsh-skins-pz-dialog-actions", children: [
              jsx("button", {
                type: "button",
                className: "dsh-skins-pz-btn",
                autoFocus: true,
                onClick: cancelConfirm,
                children: tr("personalization.cancel")
              }),
              jsx("button", {
                type: "button",
                className: "dsh-skins-pz-btn dsh-skins-pz-danger",
                disabled: writesBlocked,
                onClick: acceptConfirm,
                children: tr("personalization.confirm")
              })
            ] })
          ]
        })
      ] });
    };
  }

  // src/client/sidebar-switcher.js
  var TAG_ID = "dsh-skins/sidebar.css";
  var SWEEP_MS = 200;
  function sweepShellHeight(shell, { from, fromWidth, maxHeight, duration = SWEEP_MS } = {}) {
    if (!shell || typeof from !== "number" || !Number.isFinite(from)) return () => {
    };
    if (typeof shell.getBoundingClientRect !== "function") return () => {
    };
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return () => {
    };
    const prevTransition = shell.style.transition;
    shell.style.transition = "none";
    const finalRect = shell.getBoundingClientRect();
    const toWidth = finalRect.width;
    const content = Math.max(finalRect.height, shell.scrollHeight || 0);
    const target = typeof maxHeight === "number" ? Math.min(content, maxHeight) : content;
    const startWidth = typeof fromWidth === "number" && Number.isFinite(fromWidth) ? fromWidth : toWidth;
    const heightDelta = Math.abs(target - from);
    const widthDelta = Math.abs(toWidth - startWidth);
    if (!Number.isFinite(target) || heightDelta < 1 && widthDelta < 1) {
      if (prevTransition === void 0) delete shell.style.transition;
      else shell.style.transition = prevTransition;
      return () => {
      };
    }
    const release = () => {
      shell.style.height = "";
      shell.style.width = "";
      shell.style.transition = "";
      shell.style.overflow = "";
      shell.style.removeProperty?.("--dsh-skins-sweep-panel-basis");
      shell.classList?.remove?.("dsh-skins-sweeping");
    };
    const panelColumn = shell.querySelector?.(".dsh-skins-pz-panel") ?? null;
    const panelBasis = panelColumn === null ? 0 : panelColumn.getBoundingClientRect().width;
    shell.classList?.add?.("dsh-skins-sweeping");
    if (panelBasis > 0) {
      shell.style.setProperty?.("--dsh-skins-sweep-panel-basis", `${Math.round(panelBasis * 100) / 100}px`);
    }
    shell.style.height = `${from}px`;
    shell.style.width = `${startWidth}px`;
    shell.style.overflow = "hidden";
    void shell.offsetHeight;
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
    const onEnd = (event) => {
      if (event?.propertyName === "height") finish();
    };
    const timer = setTimeout(finish, duration + 60);
    shell.addEventListener?.("transitionend", onEnd);
    return finish;
  }
  var THEME_CHOICES = [
    { id: "light", labelKey: "appearance.light" },
    { id: "dark", labelKey: "appearance.dark" },
    { id: "system", labelKey: "appearance.system" }
  ];
  var SHELL_CSS = [
    '[data-slot="sidebar.footer.action"]{display:flex!important;flex-direction:column;width:100%;min-width:0}',
    '[data-slot="sidebar.footer.action"]>*{flex:none;min-width:0}',
    ".dsh-skins-switcher-wrap{width:100%}",
    ".dsh-skins-switcher-wrap.rail{display:flex;justify-content:center}",
    ".dsh-skins-switcher-btn{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:calc(100% + 4px);height:42px;margin:4px -2px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;overflow:hidden}",
    ".dsh-skins-switcher-wrap.rail .dsh-skins-switcher-btn{width:36px;height:36px;margin:8px 0 10px;padding:0;justify-content:center;border-radius:50%;gap:0}",
    ".dsh-skins-switcher-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-skins-switcher-btn.on,.dsh-skins-switcher-btn[aria-expanded=true]{background:var(--dsw-specific-sidebar-nav-item-active)}",
    ".dsh-skins-switcher-btn svg{flex:none;width:16px;height:16px}",
    ".dsh-skins-switcher-wrap.rail .dsh-skins-switcher-btn svg{width:18px;height:18px}",
    ".dsh-skins-switcher-btn span{white-space:nowrap;overflow:hidden}",
    // 毛玻璃弹层（dsh-quota-watch 同款配方）：86% 不透明底 + blur14 提饱和，
    // 下层文字被底色盖住、只余柔光，弹层文字保持清晰可读；首条 solid 声明
    // 兜底不支持 color-mix 的浏览器。
    // Width term reserves 16px margins per side on sub-414px viewports (the
    // 390px cap keeps every wider viewport untouched). The old 24px term left
    // only ~10px of right margin once the trigger-anchored left offset was
    // paid, and — combined with the fixed 360px list column — clipped the
    // gear column at the pop's own edge on phones (field report 2026-10-14:
    // 手机上齿轮被截半 + 横向滚动条).
    ".dsh-skins-pop{position:fixed;z-index:60;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:min(390px,calc(100vw - 32px));max-height:calc(100vh - 24px);padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-overlay));background:color-mix(in srgb,var(--dsw-alias-bg-base,#1f1f1f) 86%,transparent);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.14));overflow-y:auto;transition:width .2s ease-out}",
    // Slim themed scrollbars for the shell's own scroll region (list-only
    // popover): thin + token-colored thumb, WebKit and Firefox both covered.
    ".dsh-skins-pop{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}",
    ".dsh-skins-pop::-webkit-scrollbar{width:8px;height:8px}",
    ".dsh-skins-pop::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}",
    ".dsh-skins-pop::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}",
    ".dsh-skins-pop::-webkit-scrollbar-track{background:transparent}",
    // 【共享原子】.dsh-skins-pop-title is shared vocabulary: the panel module
    // reuses it for its header heading (styled contextually in PANEL_CSS).
    ".dsh-skins-pop-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:0 4px}",
    ".dsh-skins-theme-grid{display:flex;align-items:stretch;gap:8px}",
    ".dsh-skins-theme-card{box-sizing:border-box;display:flex;flex:1;min-width:0;height:72px;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}",
    ".dsh-skins-theme-card:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-skins-theme-card-on,.dsh-skins-theme-card-on:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}",
    ".dsh-skins-theme-card svg{width:18px;height:18px;flex:none}",
    ".dsh-skins-pop-divider{height:1px;margin:4px 0;background:var(--dsw-alias-border-l2)}",
    ".dsh-skins-pop-card{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;width:100%;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}",
    ".dsh-skins-pop-card:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".dsh-skins-pop-card-on,.dsh-skins-pop-card-on:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}",
    ".dsh-skins-pop-card-label{font-size:14px;line-height:20px;font-weight:500}",
    ".dsh-skins-pop-card-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
    // 【共享原子】.dsh-skins-spinner (+ its keyframes and the
    // reduced-motion opt-out) is the personalization panel's delete-badge
    // loading indicator, styled here with the shell's base atoms.
    ".dsh-skins-spinner{width:16px;height:16px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsh-skins-spin .8s linear infinite}",
    "@keyframes dsh-skins-spin{to{transform:rotate(360deg)}}",
    "@media (prefers-reduced-motion:reduce){.dsh-skins-spinner{animation:none}}",
    // -- personalization gear + panel -------------------------------------------
    ".dsh-skins-pop-card-row{display:flex;width:100%;min-width:0;gap:6px;align-items:stretch}",
    ".dsh-skins-pop-card-row .dsh-skins-pop-card{flex:1;min-width:0}",
    ".dsh-skins-pz-gear{position:relative;flex:none;align-self:center;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.75;transition:opacity .15s}",
    ".dsh-skins-pz-gear:hover,.dsh-skins-pz-gear:focus-visible,.dsh-skins-pz-gear.touch{opacity:1;border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}",
    // Expanded state (declared after the hover rule so the brand tint wins
    // while hovering too): the gear IS the panel toggle — make that legible in
    // both states, same visual language as the selected skin card.
    '.dsh-skins-pz-gear[aria-expanded="true"]{opacity:1;border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform)}',
    ".dsh-skins-pz-gear svg{width:16px;height:16px}",
    // Deep dark surfaces: meirenzhi/openbmc/uefi tint the bg-overlay token
    // with their own families, but in the OFFICIAL skin no token override exists
    // and the pop inherited the host's washed mid-gray (#61666b). Scope a
    // deep charcoal to the no-skin state (ruling #16); skinned modes keep
    // their token-driven overlay.
    "body[data-ds-dark-theme]:not([data-dsh-meirenzhi-skin]):not([data-dsh-openbmc-skin]):not([data-dsh-uefi-harness]) .dsh-skins-pop{background:rgba(41,42,44,0.97)}",
    // -- combined shell (Q44/Q46): list column + docked panel column ----------
    ".dsh-skins-pop.dsh-skins-wide{flex-direction:row;align-items:stretch;width:min(1105px,calc(100vw - 24px))}",
    // List column: exactly 360px wherever the 390px narrow shell fits (the
    // v2.5 宽度恒定 ruling #10/#11), shrinking only BELOW a 414px viewport —
    // a fixed 360px column inside a narrower pop overflowed horizontally and
    // pushed the gear column behind the pop's right edge (same field report).
    ".dsh-skins-pop-main{display:flex;flex-direction:column;gap:8px;min-width:0;width:min(360px,100%);flex:none}",
    ".dsh-skins-pop.dsh-skins-wide .dsh-skins-pop-main{flex:0 0 360px}",
    // box-sizing is NOT inherited: without border-box here, the sweep's
    // measured rect width feeds flex-basis as a CONTENT width (+15px padding/
    // border), so the panel would sit 15px wide through the morph and snap
    // back at release — border-box makes the measured rect and the basis the
    // same quantity.
    // The panel COLUMN container is rendered by this shell (粘连外壳), so its
    // styles are shell-owned; the panel module's own root is .dsh-skins-pz.
    // The class name is part of the panel module's published interface to the
    // shell — the sweep rules below target it by name.
    ".dsh-skins-pz-panel{box-sizing:border-box;flex:0 1 700px;min-width:0;display:flex;flex-direction:column;gap:10px;padding-left:14px;border-left:1px solid var(--dsw-alias-border-l2);overflow-x:hidden;transform:translateX(16px);opacity:0;animation:dsh-skins-pz-in .2s ease-out forwards}",
    "@keyframes dsh-skins-pz-in{to{transform:none;opacity:1}}",
    "@media (prefers-reduced-motion:reduce){.dsh-skins-pz-panel{animation:none;transform:none;opacity:1}.dsh-skins-pop{transition:none}}",
    // Stacked sheet (≤904px + panel open): the shell becomes a near-full-
    // viewport sheet and the PANEL COLUMN owns the scroll (flex-fills the
    // shell, slim scrollbar) — anchoring a growing panel above the trigger
    // crammed list + panel into one sliver (field report: 窄视窗小条条).
    // Specificity (0,3,0) still beats the wide-scroll base rule below for
    // flex/basis; overflow-y now INHERITS that base rule instead of opting out.
    "@media (max-width:904px){.dsh-skins-pop.dsh-skins-wide{flex-direction:column;width:min(390px,calc(100vw - 24px))}.dsh-skins-pz-panel{flex:1 1 auto;min-height:0;flex-basis:auto;padding-left:0;border-left:0;border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px;transform:translateY(12px)}}",
    ".dsh-skins-pz-panel{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}",
    ".dsh-skins-pz-panel::-webkit-scrollbar{width:8px;height:8px}",
    ".dsh-skins-pz-panel::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}",
    ".dsh-skins-pz-panel::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary)}",
    ".dsh-skins-pz-panel::-webkit-scrollbar-track{background:transparent}",
    // -- field issue #2: a dedicated scroll region for the panel column -----
    //    (the cell corner-badges / sticky action bar half of the same ruling
    //    lives in the panel's own PANEL_CSS now) --------------------------------
    ".dsh-skins-wide .dsh-skins-pz-panel{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}",
    // While the shell is mid-sweep its height is pinned below the panel's
    // content extent, so scrollbars would flash on for the ~200ms of the
    // morph: the whole shell clips (both axes — the panel column is held wide
    // and overflows horizontally during the reveal), and the panel column's
    // own scrollbar is clipped too. Equal specificity with the wide scroll
    // rule and declared after it, so wide mode clips during the sweep; the
    // stacked sheet keeps the panel's own scroll region and clips with it.
    // Sweep is SHELL motion behaviour: these rules are written against the
    // panel column's class name — the declared interface use mentioned above.
    ".dsh-skins-sweeping{overflow:hidden}",
    ".dsh-skins-sweeping .dsh-skins-pz-panel{overflow-y:hidden}",
    // Clip-reveal hold (issue #13 rev. 2): the panel column stays at its
    // settled width for the whole beat — measured into the CSS var by the
    // sweep — so its content never reflows while it fades in. Desktop wide
    // row layout only; in the stacked column layout a fixed flex-basis would
    // be a HEIGHT, and the stacked panel never reflows horizontally anyway.
    "@media (min-width:905px){.dsh-skins-sweeping.dsh-skins-wide .dsh-skins-pz-panel{flex:0 0 var(--dsh-skins-sweep-panel-basis,700px)}}"
  ].join("\n");
  var CSS = [SHELL_CSS, PANEL_CSS].join("\n");
  function installSidebarSwitcher(ctx, { runtime, jsx, react, reactDom, configClient, skinsById }) {
    function fallbackTranslate(key, params = {}) {
      return formatTemplate(DICTS.zh[key] ?? key, params);
    }
    function localeTranslate(key, params = {}) {
      try {
        const text = ctx.locale?.translate?.(NS, key, params);
        if (typeof text === "string" && text !== key) return text;
      } catch {
      }
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
    const PersonalizationPanel = configClient ? createPersonalizationPanel({
      jsx,
      react,
      configClient,
      tr: localeTranslate,
      builtinAssetsFor,
      labelFor
    }) : null;
    function GearIcon() {
      return jsx("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        children: jsx("path", {
          d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinejoin: "round"
        })
      });
    }
    function SwitcherIcon() {
      return jsx("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        children: [
          jsx("path", { d: "M12 3a9 9 0 1 0 .6 17.98c1.2-.05 1.8-1.5 1-2.4-.9-1-.25-2.58 1.1-2.58H18a4 4 0 0 0 4-4c0-5-4.5-9-10-9Z", stroke: "currentColor", strokeWidth: "2" }),
          jsx("circle", { cx: "7.8", cy: "10.2", r: "1.1", fill: "currentColor" }),
          jsx("circle", { cx: "11", cy: "7.2", r: "1.1", fill: "currentColor" }),
          jsx("circle", { cx: "15.2", cy: "7.8", r: "1.1", fill: "currentColor" }),
          jsx("circle", { cx: "17.4", cy: "11.4", r: "1.1", fill: "currentColor" })
        ]
      });
    }
    function ThemeIcon({ id }) {
      if (id === "light") {
        return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
          jsx("circle", { cx: "12", cy: "12", r: "4", stroke: "currentColor", strokeWidth: "1.6" }),
          jsx("path", { d: "M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
        ] });
      }
      if (id === "dark") {
        return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: jsx("path", { d: "M20 15.2A8.2 8.2 0 0 1 8.8 4a8.2 8.2 0 1 0 11.2 11.2Z", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }) });
      }
      return jsx("svg", { viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
        jsx("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2.5", stroke: "currentColor", strokeWidth: "1.6" }),
        jsx("path", { d: "M8 21h8M12 17v4", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
      ] });
    }
    function SidebarAction(props) {
      if (shellTakeover()) return null;
      return jsx(SidebarActionBody, props);
    }
    function SidebarActionBody({ wide, t }) {
      const tr = typeof t === "function" ? (key, params) => t(key, params) : fallbackTranslate;
      const [open, setOpen] = react.useState(false);
      const [activeId, setActiveId] = react.useState(runtime.active);
      const [box, setBox] = react.useState(null);
      const [personalizeId, setPersonalizeId] = react.useState(null);
      const [themePreference, setThemePreference] = react.useState(() => ctx.theme?.getTheme?.().preference ?? "system");
      const buttonRef = react.useRef(null);
      const shellRef = react.useRef(null);
      const shellSizeRef = react.useRef(null);
      if (open && shellRef.current && typeof shellRef.current.getBoundingClientRect === "function") {
        const rect = shellRef.current.getBoundingClientRect();
        shellSizeRef.current = { width: rect.width, height: rect.height };
      }
      react.useEffect(() => {
        if (open) return void 0;
        setPersonalizeId(null);
        return void 0;
      }, [open]);
      const closeShell = () => {
        setOpen(false);
        buttonRef.current?.focus?.();
      };
      const collapsePanel = (skinId) => {
        setPersonalizeId(null);
        try {
          document.getElementById(`${skinId}-gear`)?.focus?.();
        } catch {
        }
      };
      react.useEffect(() => {
        if (!open) return void 0;
        const onPointer = (event) => {
          const node = event.target;
          if (!node || typeof node.closest !== "function") return;
          if (node.closest(".dsh-skins-pop, .dsh-skins-switcher-wrap")) return;
          closeShell();
        };
        const onKey = (event) => {
          if (event.key === "Escape" && !document.querySelector?.("dialog.dsh-skins-pz-dialog[open]")) closeShell();
        };
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
        children: [jsx(ThemeIcon, { id: choice.id }), jsx("span", { children: tr(choice.labelKey) })]
      }, choice.id));
      const choices = [
        {
          id: runtime.officialId,
          label: tr("skins.official.label"),
          description: tr("skins.official.description")
        },
        ...runtime.list()
      ];
      const skinCards = choices.map((skin) => {
        const personalizable = configClient !== null && getSkinSchema(skin.id) !== null;
        const card = jsx("button", {
          type: "button",
          role: "menuitemradio",
          "aria-checked": activeId === skin.id,
          "data-skin-id": skin.id,
          // ADR-0021/R21: stable hook for tests and headless verification — never match on localized labels
          className: `dsh-skins-pop-card${activeId === skin.id ? " dsh-skins-pop-card-on" : ""}`,
          onClick: () => {
            if (personalizeId !== null && personalizeId !== skin.id) {
              setPersonalizeId(personalizable ? skin.id : null);
            }
            runtime.select(skin.id);
            setActiveId(skin.id);
          },
          children: [
            jsx("span", { className: "dsh-skins-pop-card-label", children: skin.label }),
            jsx("span", { className: "dsh-skins-pop-card-desc", children: skin.description })
          ]
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
                collapsePanel(skin.id);
                return;
              }
              runtime.select(skin.id);
              setActiveId(runtime.active());
              setPersonalizeId(skin.id);
            },
            children: [
              jsx(GearIcon, {})
            ]
          }, `${skin.id}-gear`)
        ] }, skin.id);
      });
      const showPersonalization = personalizeId !== null && PersonalizationPanel !== null;
      const stackedSheet = showPersonalization && typeof window !== "undefined" && window.innerWidth <= 904;
      const shellLeft = box === null ? void 0 : showPersonalization && typeof window !== "undefined" ? Math.max(12, Math.min(box.left, window.innerWidth - 1117)) : typeof window !== "undefined" ? Math.max(16, Math.min(box.left, window.innerWidth - Math.min(390, window.innerWidth - 32) - 16)) : box.left;
      const shellMaxHeight = box === null || typeof window === "undefined" || typeof window.innerHeight !== "number" ? void 0 : stackedSheet ? window.innerHeight - 24 : Math.max(220, window.innerHeight - box.bottom - 12);
      react.useLayoutEffect(() => {
        if (!open || box === null) return void 0;
        const shell = shellRef.current;
        if (!shell) return void 0;
        const size = shellSizeRef.current;
        shellSizeRef.current = null;
        return sweepShellHeight(shell, {
          from: size?.height,
          fromWidth: size?.width,
          maxHeight: shellMaxHeight
        }) ?? void 0;
      }, [open, showPersonalization, personalizeId, shellMaxHeight]);
      const panel = open && box && typeof document !== "undefined" ? reactDom.createPortal(jsx("div", {
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
            ...skinCards
          ] }),
          showPersonalization ? jsx("div", {
            key: "panel",
            className: "dsh-skins-pz-panel",
            role: "region",
            "aria-label": localeTranslate("personalization.panelLabel"),
            children: jsx(PersonalizationPanel, {
              skinId: personalizeId,
              onCollapse: () => collapsePanel(personalizeId)
            })
          }) : null
        ]
      }), document.body) : null;
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
            onClick: () => {
              if (open) closeShell();
              else openPopover();
            },
            children: [jsx(SwitcherIcon, {}), wide ? jsx("span", { children: tr("skins.switch") }) : null]
          }),
          panel
        ]
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
      try {
        return ctx.locale.register(NS, DICTS);
      } catch {
        return () => {
        };
      }
    }, "dsh-skins: sidebar switcher dictionary");
    const shellTakeover = () => {
      try {
        return (ctx.slots.entries?.("sidebar.workspaces") ?? []).some((entry) => (entry.options.priority ?? 0) < 0);
      } catch {
        return false;
      }
    };
    ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
      name: "sidebar.footer.action",
      id: "skins-switcher",
      // Footer order stays at the positive utility seat (4): the bot view is
      // handled by the shell-takeover sentinel below (we render nothing there),
      // so order only sorts the PLAIN harness foot — where the DS Bot entry
      // (-200) belongs ABOVE these utility rows (ruling 2026-10-13: a deep
      // negative order was tried and reverted because it sank the DS Bot entry
      // to the bottom of the harness foot).
      order: 4,
      locale: NS,
      label: () => {
        try {
          const text = ctx.locale?.translate?.(NS, "skins.switch");
          if (typeof text === "string" && text !== "skins.switch") return text;
        } catch {
        }
        return fallbackTranslate("skins.switch");
      }
    }, SidebarAction));
  }

  // src/client/theme-persistence.js
  var THEME_STORAGE_KEY = "dsh-skins:theme-preference";
  var PREFERENCES = /* @__PURE__ */ new Set(["light", "dark", "system"]);
  function installRemoteThemePersistence(ctx) {
    if (ctx.connection?.isLoopback === true) return;
    const theme = ctx.theme;
    if (!theme || typeof theme.getTheme !== "function" || typeof theme.setTheme !== "function") return;
    const persist = (snapshot) => {
      const preference = snapshot?.preference;
      if (!PREFERENCES.has(preference)) return;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
      }
    };
    ctx.on("theme/change", persist);
    let stored;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
    }
    if (PREFERENCES.has(stored)) {
      if (theme.getTheme().preference !== stored) theme.setTheme(stored);
    } else {
      persist(theme.getTheme());
    }
  }
  function readLocalThemePreference() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  // src/client/personalization/config-client.js
  var CHANNEL = "dsh-skins";
  var FETCH_TIMEOUT_MS = 3e3;
  var UPLOAD_TIMEOUT_MS = 12e4;
  var RETRY = /* @__PURE__ */ Symbol("dsh-skins:write-dialect-retry");
  function cloneSkins(skins) {
    return skins === void 0 || skins === null ? {} : structuredClone(skins);
  }
  function createConfigClient(options = {}) {
    const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
    const baseUrl = options.baseUrl ?? "/dsh-skins";
    const profile = options.profile === "desktop" ? "desktop" : "web";
    const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
    const uploadTimeoutMs = options.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS;
    if (typeof fetchImpl !== "function") throw new Error("config client requires a fetch implementation");
    let status = "loading";
    let snapshot = { skins: {}, library: [], references: {}, revision: 0, mode: "normal" };
    const previews = /* @__PURE__ */ new Map();
    const listeners = /* @__PURE__ */ new Set();
    let fetchGeneration = 0;
    let disposed = false;
    let writeChain = Promise.resolve();
    let notices = [];
    let channel = null;
    function setFlushFailure(code, message) {
      notices = notices.filter((notice) => notice.kind === "reverted");
      if (code === "REVISION_CONFLICT") notices.push({ kind: "conflict" });
      else if (message) notices.push({ kind: "error", message });
    }
    function noteReverted(entry) {
      const current = notices.find((notice) => notice.kind === "reverted");
      if (current !== void 0 && current.fields.some((field) => field.skinId === entry.skinId && field.key === entry.key)) return;
      notices = [
        ...notices.filter((notice) => notice.kind !== "reverted"),
        { kind: "reverted", fields: [...current?.fields ?? [], entry] }
      ];
    }
    function emit() {
      for (const listener of [...listeners]) {
        try {
          listener(publicState());
        } catch {
        }
      }
    }
    function publicState() {
      return {
        status,
        revision: snapshot.revision,
        mode: snapshot.mode,
        skins: cloneSkins(snapshot.skins),
        library: snapshot.library,
        references: snapshot.references ?? {},
        recovery: snapshot.recovery,
        quota: snapshot.quota,
        notices: structuredClone(notices),
        dirtyCount: previews.size
      };
    }
    async function request(path, init = {}) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? (typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : void 0)
      });
      return response;
    }
    function setStatus(next) {
      if (status === next) return;
      status = next;
      emit();
    }
    async function refetch() {
      if (disposed) return publicState();
      const generation = ++fetchGeneration;
      const contextAtStart = options.contextActive?.();
      try {
        const response = await request("/config");
        if (disposed || generation !== fetchGeneration) return publicState();
        if (contextAtStart !== void 0 && options.contextActive?.() !== contextAtStart) {
          void refetch();
          return publicState();
        }
        if (response.status === 404 || response.status === 501) {
          setStatus("offline-failed");
          return publicState();
        }
        if (!response.ok) {
          setStatus("offline-failed");
          return publicState();
        }
        const body = await response.json();
        if (disposed || generation !== fetchGeneration) return publicState();
        if (contextAtStart !== void 0 && options.contextActive?.() !== contextAtStart) {
          void refetch();
          return publicState();
        }
        if (body?.mode === "unsupported") {
          snapshot = { ...body, references: {} };
          setStatus("unsupported-readonly");
          emit();
          return publicState();
        }
        if (body?.mode === "recovery") {
          snapshot = { ...body };
          setStatus("synced");
          emit();
          return publicState();
        }
        snapshot = { ...body };
        setStatus("synced");
        emit();
        return publicState();
      } catch {
        if (!disposed) setStatus("offline-failed");
        return publicState();
      }
    }
    const FLUSH_DEBOUNCE_MS = 400;
    let flushTimer = null;
    function writeGate() {
      if (status === "synced") {
        return snapshot.mode === "recovery" ? "recovery" : null;
      }
      if (status === "loading") return "loading";
      if (status === "unsupported-readonly") return "unsupported";
      return "offline";
    }
    function scheduleFlush() {
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushNow();
      }, FLUSH_DEBOUNCE_MS);
    }
    function runWriteOp(operations, policy) {
      writeChain = writeChain.then(async () => {
        try {
          if (disposed) return policy.disposed();
          const blocked = writeGate();
          if (blocked !== null) return policy.gated(blocked);
          const attemptedRevision = snapshot.revision;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            let response;
            try {
              response = await request("/config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ baseRevision: snapshot.revision, operations: operations() })
              });
            } catch (error) {
              return policy.offline(error);
            }
            if (disposed) return policy.disposedMidflight();
            if (response.status === 409) {
              const conflictBody = await response.json().catch(() => null);
              const code = conflictBody?.code;
              const errorMessage = conflictBody?.error ?? "HTTP 409";
              if (code === "STORE_READONLY") {
                setFlushFailure(null, null);
                setStatus("unsupported-readonly");
                return policy.readOnly(conflictBody);
              }
              if (code === "REVISION_CONFLICT") {
                const decision2 = await policy.onConflict({ attempt, attemptedRevision, errorMessage });
                if (decision2 === RETRY) continue;
                return decision2;
              }
              if (code === "STORE_RECOVERY_REQUIRED") {
                const decision2 = await policy.onRecoveryRequired(errorMessage);
                if (decision2 === RETRY) {
                  throw new Error("[dsh-skins] onRecoveryRequired must resolve, never RETRY");
                }
                return decision2;
              }
              const decision = await policy.onUnknown409({ attempt, errorMessage });
              if (decision === RETRY) continue;
              return decision;
            }
            if (!response.ok) return await policy.onError(response);
            const result = await policy.onSuccess(response);
            await refetch();
            announce();
            return result;
          }
          return policy.exhausted();
        } catch (error) {
          return policy.chainError(error);
        }
      });
      return writeChain;
    }
    function flushNow() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (previews.size === 0) return Promise.resolve({ flushed: 0 });
      const intent = [...previews.entries()];
      const buildOperations = () => intent.map(([composite, value]) => {
        const [skinId, key] = composite.split(" ");
        return value === null ? { op: "delete", skinId, key } : { op: "set", skinId, key, value };
      });
      const count = buildOperations().length;
      return runWriteOp(buildOperations, {
        disposed: () => ({ flushed: 0, blocked: "disposed" }),
        disposedMidflight: () => ({ flushed: 0 }),
        gated: (blocked) => ({ flushed: 0, blocked }),
        offline: (error) => {
          throw error;
        },
        readOnly: (conflictBody) => ({ flushed: 0, blocked: "conflict", errorMessage: conflictBody?.error ?? "" }),
        // ADR-0003: retry once only after a conflict refetch has actually
        // applied a newer normal-mode snapshot.
        onConflict: async ({ attempt, attemptedRevision }) => {
          if (attempt === 1) {
            setFlushFailure("REVISION_CONFLICT", null);
            emit();
            return { flushed: 0, blocked: "conflict" };
          }
          const refreshed = await refetch();
          const mayRetry = refreshed.status === "synced" && refreshed.mode === "normal" && refreshed.revision !== attemptedRevision;
          if (mayRetry) return RETRY;
          if (refreshed.mode === "recovery") {
            setFlushFailure(null, null);
            emit();
            return { flushed: 0, blocked: "recovery" };
          }
          if (refreshed.status === "offline-failed") {
            setFlushFailure(null, null);
            emit();
            return { flushed: 0, blocked: "offline" };
          }
          if (refreshed.status === "unsupported-readonly") {
            setFlushFailure(null, null);
            emit();
            return { flushed: 0, blocked: "unsupported" };
          }
          setFlushFailure("REVISION_CONFLICT", null);
          emit();
          return { flushed: 0, blocked: "conflict" };
        },
        onRecoveryRequired: async (errorMessage) => {
          const refreshed = await refetch();
          if (refreshed.mode === "recovery") {
            setFlushFailure(null, null);
            emit();
            return { flushed: 0, blocked: "recovery" };
          }
          setFlushFailure(null, errorMessage);
          emit();
          return { flushed: 0, blocked: "error", errorMessage };
        },
        onUnknown409: ({ errorMessage }) => {
          setFlushFailure(null, errorMessage);
          emit();
          return { flushed: 0, blocked: "error", errorMessage };
        },
        onError: async (response) => {
          const errorBody = await response.json().catch(() => null);
          const errorMessage = errorBody?.error ?? `HTTP ${response.status}`;
          const issues = Array.isArray(errorBody?.params?.issues) ? errorBody.params.issues : null;
          let excised = false;
          let onlyDangling = issues !== null && issues.length > 0;
          if (issues !== null) {
            for (const issue of issues) {
              const dangling = issue.code === "MISSING_ASSET" || issue.code === "BAD_ASSET";
              if (!dangling) onlyDangling = false;
              if (dangling && typeof issue.skinId === "string" && typeof issue.key === "string") {
                const composite = `${issue.skinId} ${issue.key}`;
                if (previews.has(composite)) {
                  previews.delete(composite);
                  excised = true;
                  noteReverted({ skinId: issue.skinId, key: issue.key });
                }
              }
            }
          }
          const healed = onlyDangling && excised;
          setFlushFailure(null, healed ? null : errorMessage);
          emit();
          if (excised && previews.size > 0) void flushNow();
          if (healed) return { flushed: 0, blocked: null, selfHealed: true };
          return { flushed: 0, blocked: "error", errorMessage };
        },
        onSuccess: async (response) => {
          await response.json().catch(() => null);
          for (const [composite, value] of intent) {
            if (previews.get(composite) === value) previews.delete(composite);
          }
          setFlushFailure(null, null);
          notices = [];
          return { flushed: count };
        },
        exhausted: () => ({ flushed: 0, blocked: "conflict" }),
        chainError: () => {
          setFlushFailure(null, null);
          emit();
          return { flushed: 0, blocked: "error" };
        }
      });
    }
    function announce() {
      try {
        if (typeof window !== "undefined" && typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("dsh-skins:config-changed"));
        }
      } catch {
      }
      try {
        if (channel === null && typeof BroadcastChannel === "function") channel = new BroadcastChannel(CHANNEL);
        channel?.postMessage({ kind: "config-changed" });
      } catch {
      }
    }
    function preview(skinId, key, value) {
      const composite = `${skinId} ${key}`;
      const storedOverride = snapshot.skins[skinId]?.[key];
      const previewed = previews.get(composite);
      if (isSameOverrideValue(value, defaultsFor(skinId, profile)[key])) {
        if (storedOverride === void 0 && previewed === void 0) return;
        if (previewed === null) return;
        return previewReset(skinId, key);
      }
      if (effectiveOverrides(skinId)[key] === value) return;
      previews.set(composite, value);
      setFlushFailure(null, null);
      scheduleFlush();
      emit();
    }
    function previewReset(skinId, key) {
      previews.set(`${skinId} ${key}`, null);
      setFlushFailure(null, null);
      scheduleFlush();
      emit();
    }
    function effectiveOverrides(skinId) {
      const merged = cloneSkins(snapshot.skins[skinId] ?? {});
      for (const [composite, value] of previews) {
        const [owner, key] = composite.split(" ");
        if (owner !== skinId) continue;
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      return merged;
    }
    async function assetFingerprint(bytes) {
      if (typeof crypto?.subtle?.digest !== "function") return null;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    function attemptUpload(bytes, file, displayName) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller === null ? null : setTimeout(() => controller.abort(), uploadTimeoutMs);
      return request("/library", {
        method: "POST",
        signal: controller === null ? void 0 : controller.signal,
        headers: {
          "content-type": typeof file?.type === "string" && file.type !== "" ? file.type : "application/octet-stream",
          "x-filename": encodeURIComponent(displayName ?? file?.name ?? "wallpaper")
        },
        body: bytes
      }).finally(() => {
        if (timer !== null) clearTimeout(timer);
      });
    }
    async function interpretAttempt(response, networkError) {
      if (networkError !== void 0) {
        const timedOut = networkError?.name === "TimeoutError" || networkError?.name === "AbortError";
        return timedOut ? { error: "UPLOAD_TIMEOUT" } : null;
      }
      if (response.ok) return { kind: "ok", response };
      const body = await response.json().catch(() => null);
      if (body?.code) return { error: body.code };
      if (response.status === 413) return { error: "UPLOAD_TOO_LARGE" };
      if (response.status === 400) return null;
      return { error: `HTTP ${response.status}` };
    }
    async function uploadImage(file, displayName) {
      const blocked = writeGate();
      if (blocked !== null) return { error: blocked };
      const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
      let networkError;
      let response;
      try {
        response = await attemptUpload(bytes, file, displayName);
      } catch (error) {
        networkError = error;
      }
      let outcome = await interpretAttempt(response, networkError);
      if (outcome !== null) return concludeUpload(outcome);
      await refetch();
      const fingerprint = await assetFingerprint(bytes);
      const stored = snapshot.library.find((a) => fingerprint !== null ? a.sha256 === fingerprint : a.byteLength === bytes.length && a.displayName === (displayName ?? file?.name ?? "wallpaper"));
      if (stored) return { asset: stored };
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        response = await attemptUpload(bytes, file, displayName);
      } catch {
        return { error: "UPLOAD_FAILED" };
      }
      outcome = await interpretAttempt(response, void 0);
      if (outcome === null || outcome.kind !== "ok") {
        return outcome?.error !== void 0 ? { error: outcome.error } : { error: "UPLOAD_FAILED" };
      }
      return concludeUpload(outcome);
    }
    async function concludeUpload(outcome) {
      if (outcome.error !== void 0) return { error: outcome.error };
      const body = await outcome.response.json();
      if (body?.asset?.id !== void 0) {
        snapshot = {
          ...snapshot,
          revision: typeof body.revision === "number" ? body.revision : snapshot.revision,
          library: [...snapshot.library, body.asset],
          quota: {
            count: (snapshot.quota?.count ?? 0) + 1,
            totalBytes: (snapshot.quota?.totalBytes ?? 0) + (body.asset.byteLength ?? 0)
          }
        };
        emit();
      }
      announce();
      return { asset: body.asset };
    }
    function runGalleryOp(operations, goalAchieved) {
      const conflictDisposition = async ({ attempt }) => {
        await refetch();
        if (goalAchieved()) return { affectedSkins: [] };
        if (attempt === 1) {
          setFlushFailure(null, null);
          emit();
          return { error: "REVISION_CONFLICT" };
        }
        return RETRY;
      };
      return runWriteOp(() => operations, {
        disposed: () => ({ error: "disposed" }),
        disposedMidflight: () => ({ error: "disposed" }),
        gated: (blocked) => ({ error: blocked }),
        offline: () => ({ error: "OFFLINE" }),
        readOnly: () => ({ error: "conflict" }),
        onConflict: conflictDisposition,
        // ADR-0018 alignment: the recovery code is dispatched BY NAME now —
        // never folded into the blind conflict retry. Code passthrough: the
        // Host-stable code reaches the caller unsuppressed (host-errors.js
        // resolves it), after one refetch so the recovery banner can land.
        onRecoveryRequired: async () => {
          await refetch();
          return { error: "STORE_RECOVERY_REQUIRED" };
        },
        onUnknown409: conflictDisposition,
        // unknown 409s keep the goal-first read
        onError: async (response) => {
          const body = await response.json().catch(() => null);
          if (body?.code === "INVALID_CONFIG" && body.params?.issues?.some((issue) => issue.code === "ASSET_NOT_FOUND")) {
            await refetch();
            if (goalAchieved()) return { affectedSkins: [] };
            return { error: "ASSET_NOT_FOUND" };
          }
          return { error: body?.code ?? `HTTP ${response.status}` };
        },
        onSuccess: async (response) => {
          const body = await response.json().catch(() => null);
          return { affectedSkins: body?.affectedSkins ?? [], revision: body?.revision };
        },
        exhausted: () => ({ error: "REVISION_CONFLICT" }),
        chainError: (error) => {
          throw error;
        }
      });
    }
    async function deleteImage(id) {
      const blocked = writeGate();
      if (blocked !== null) return { error: blocked };
      return runGalleryOp(
        [{ op: "deleteAsset", assetId: id }],
        () => !snapshot.library.some((entry) => entry.id === id)
      );
    }
    function clearLibrary() {
      return runGalleryOp([{ op: "clearLibrary" }], () => snapshot.library.length === 0);
    }
    function valuedPreviews() {
      const fields = [];
      for (const [composite, value] of previews) {
        if (value === null) continue;
        const [skinId, key] = composite.split(" ");
        fields.push({ skinId, key, value });
      }
      return fields;
    }
    function referencesFor(assetId) {
      const persisted = (snapshot.references?.[assetId] ?? []).map((entry) => ({ skinId: entry.skinId, key: entry.key, layer: "persisted" }));
      const preview2 = valuedPreviews().filter((entry) => entry.value === assetId).map((entry) => ({ skinId: entry.skinId, key: entry.key, layer: "preview" }));
      return [...persisted, ...preview2];
    }
    async function confirmRecovery() {
      const response = await request("/recovery", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { error: body?.code ?? `HTTP ${response.status}` };
      }
      await refetch();
      return { ok: true };
    }
    function assetUrl(meta) {
      if (meta === null || meta === void 0 || typeof meta.id !== "string") return null;
      return `${baseUrl}/assets/${meta.id}.${meta.extension}`;
    }
    const api = {
      boot: refetch,
      refetch,
      flushNow,
      preview,
      previewReset,
      effectiveOverrides,
      uploadImage,
      deleteImage,
      clearLibrary,
      referencesFor,
      confirmRecovery,
      assetUrl,
      getState: publicState,
      canWrite: () => writeGate() === null,
      onStateChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose() {
        disposed = true;
        if (flushTimer !== null) clearTimeout(flushTimer);
        fetchGeneration += 1;
        try {
          channel?.close();
        } catch {
        }
        try {
          if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
        } catch {
        }
        listeners.clear();
      }
    };
    function onCrossTabMessage(event) {
      if (event?.data?.kind === "config-changed") refetch();
    }
    function onFocus() {
      refetch();
    }
    try {
      if (typeof BroadcastChannel === "function") {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = onCrossTabMessage;
        if (typeof channel.unref === "function") channel.unref();
      }
    } catch {
    }
    try {
      if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    } catch {
    }
    return api;
  }

  // src/client/builtin-assets.js
  var SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
  function builtinAssetUrl(skinId, assetKey, extension = "webp") {
    if (typeof skinId !== "string" || !SEGMENT_PATTERN.test(skinId)) {
      throw new RangeError(`builtinAssetUrl: invalid skinId ${JSON.stringify(skinId)}`);
    }
    if (typeof assetKey !== "string" || !SEGMENT_PATTERN.test(assetKey)) {
      throw new RangeError(`builtinAssetUrl: invalid assetKey ${JSON.stringify(assetKey)}`);
    }
    if (typeof extension !== "string" || !/^[a-z0-9]+$/.test(extension)) {
      throw new RangeError(`builtinAssetUrl: invalid extension ${JSON.stringify(extension)}`);
    }
    const rev = "1.5.22";
    return `/dsh-skins/assets/b_${skinId}_${assetKey}.${extension}?v=${rev}`;
  }

  // src/client/skins/meirenzhi/wallpapers.js
  var WALLPAPER_YUNTAI = builtinAssetUrl("meirenzhi", "yuntai");
  var WALLPAPER_MUPEILING = builtinAssetUrl("meirenzhi", "mupeiling");
  var WALLPAPER_ZILING = builtinAssetUrl("meirenzhi", "ziling");
  var WALLPAPER_NANGONGWAN = builtinAssetUrl("meirenzhi", "nangongwan");
  var WALLPAPER_NANGONGQUE = builtinAssetUrl("meirenzhi", "nangongque");
  var WALLPAPER_YINYUE = builtinAssetUrl("meirenzhi", "yinyue");

  // src/client/skins/translucency.js
  function glassRule(bodyAttribute, glassVar) {
    const attr = bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    return `body[data-${attr}] [id="root"]{backdrop-filter:blur(var(${glassVar},0px))}`;
  }
  function createProjection(table) {
    const { anchor, riding, scrim, blur, glassVar, desktopBlur, wallpaper } = table;
    return function project(values, assets) {
      const P = values.panelOpacity;
      const pct = (points) => (points / 100).toFixed(2);
      const pt = (baked) => Math.min(100, Math.max(0, P + baked - anchor));
      const alpha = (rgb, baked) => `rgba(${rgb}, ${pct(pt(baked))})`;
      const tokenOverrides = { ...table.constantTokens ?? {} };
      for (const [key, modes] of Object.entries(riding)) {
        tokenOverrides[key] = {
          light: alpha(modes.light[0], modes.light[1]),
          dark: alpha(modes.dark[0], modes.dark[1])
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
        const scrimLight = `linear-gradient(${alpha(scrim.stops.light[0][0], scrim.stops.light[0][1])} 0%, ${alpha(scrim.stops.light[1][0], scrim.stops.light[1][1])} 100%)` + scrim.artLayer;
        const scrimDark = `linear-gradient(${alpha(scrim.stops.dark[0][0], scrim.stops.dark[0][1])} 0%, ${alpha(scrim.stops.dark[1][0], scrim.stops.dark[1][1])} 100%)` + scrim.artLayer;
        if (wallpaper.kind === "legacy-baked") {
          const url = assets?.wallpaper?.url ?? null;
          const custom = typeof values.wallpaper === "string" && values.wallpaper !== wallpaper.sentinel && resolveImageRef(values.wallpaper)?.kind === "user" && url !== null;
          imageLight = custom ? `url("${url}")` : scrim.artLayer === "" ? wallpaper.placeholder?.light ?? scrimLight : scrimLight;
          imageDark = custom ? `url("${url}")` : scrim.artLayer === "" ? wallpaper.placeholder?.dark ?? scrimDark : scrimDark;
        } else {
          const url = assets?.wallpaper?.url ?? null;
          imageLight = url === null ? scrimLight : `url("${url}")`;
          imageDark = url === null ? scrimDark : `url("${url}")`;
        }
      }
      const blurPx = Math.round(blur.max * Math.max(0, (P - anchor) / (100 - anchor)) ** 2);
      const boosted = Math.min(24, blurPx + P / desktopBlur.rate);
      const desktopBlurPair = desktopBlur.dark === "none" ? { light: boosted, dark: blurPx } : { light: boosted, dark: boosted };
      return {
        bodyAttribute: table.bodyAttribute,
        slogans: values.slogan,
        titleBrand: table.titleBrand,
        favicon: table.favicon,
        backdrop: { imageLight, imageDark, overlayLight, overlayDark, blur: blurPx, desktopBlur: desktopBlurPair },
        tokenOverrides,
        cssVariables: blurPx > 0 ? { [glassVar]: { light: `${blurPx}px`, dark: `${blurPx}px` } } : null,
        staticCss: blurPx > 0 ? table.staticCss + "\n" + glassRule(table.bodyAttribute, glassVar) : table.staticCss,
        decorations: null
      };
    };
  }

  // src/client/skins/decoration.js
  var BUBBLE_HOOKS = {
    chat: { exact: "Sixlwa_bubble", container: "userStack" },
    goal: { exact: "oRe1gG_bubble", container: "_stack" },
    bubbleLocal: "_bubble"
  };
  var unionSelector = (hook) => `:is([class*="${hook.exact}"], [class*="${hook.container}"] > [class*="${BUBBLE_HOOKS.bubbleLocal}"])`;
  function decorationCss(scope, palette) {
    const chat = unionSelector(BUBBLE_HOOKS.chat);
    const goal = unionSelector(BUBBLE_HOOKS.goal);
    return [
      `${scope} ${chat}{border:1px solid rgba(${palette.light}, 0.38);box-shadow:0 1px 4px rgba(${palette.light}, 0.10)}`,
      `${scope}[data-ds-dark-theme] ${chat}{border-color:rgba(${palette.dark}, 0.38);box-shadow:0 1px 6px rgba(${palette.dark}, 0.10)}`,
      `${scope} ${goal}{border:1px solid rgba(${palette.light}, 0.38);box-shadow:0 1px 4px rgba(${palette.light}, 0.10)}`,
      `${scope}[data-ds-dark-theme] ${goal}{border-color:rgba(${palette.dark}, 0.38);box-shadow:0 1px 6px rgba(${palette.dark}, 0.10)}`
    ].join("\n");
  }
  function rootClear(scope) {
    return `${scope} [id="root"]{background:0 0}`;
  }
  function badgeCss(scope, className, colors, metrics) {
    return [
      `${scope} ${className}{display:inline-flex;align-items:center;background:${colors.light.bg};border-radius:4px;padding:0 5px;font-size:10px;line-height:${metrics.lineHeight};font-weight:${metrics.fontWeight};letter-spacing:.08em;color:${colors.light.fg}}`,
      `${scope}[data-ds-dark-theme] ${className}{background:${colors.dark.bg};color:${colors.dark.fg}}`
    ].join("\n");
  }
  function streamingCss(scope, palette) {
    const KEYFRAMES = "dsh-skins-stream-pulse";
    return [
      `${scope} [data-streaming]{border-radius:4px;box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}`,
      `@keyframes ${KEYFRAMES}{from{box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}to{box-shadow:inset 3px 0 0 rgba(${palette.decay}, 0.20)}}`,
      `@media (prefers-reduced-motion: no-preference){${scope} [data-streaming]{animation:${KEYFRAMES} 1.6s ease-in-out infinite alternate}}`
    ].join("\n");
  }

  // src/client/skins/frost-family.js
  function frostFamilyCss(scope, tints) {
    const { frost, menu } = tints;
    return `/* 浮层毛玻璃家族（配方与选择器并集的唯一来源；裁决与修订史见 ADR-0007，单点生成见 ADR-0012）
   * 宿主 Modal（设置页各弹窗、风险确认）、dsh-m / dsh-skins / dsh-context 等
   * 插件弹层、dockkit 悬浮窗壳与宿主对话框兜底、下拉菜单面、右栏内嵌卡与
   * 提示卡的统一配方：86% 不透明皮肤底色 + blur(14px) saturate(1.3) 提饱和
   * （.lc-tip 经主人两轮实测定 96% 特例浓度），下层内容被盖住只余柔光；
   * --dsw-mask-blur 点亮官方默认 none 的遮罩模糊，弹窗四周一并磨砂。
   * 浮层族全部为固定值，不随通透度旋钮联动。遮罩/对话框由宿主 CSS modules
   * 渲染、类名不可测 → role/aria 属性定位；.dshm-* / .dsvm-* / .lc-* /
   * .dsh-skins-pop 为各插件自有稳定类名；结构钩子 _float_ / _dialog_ 由
   * verify-upstream-hooks 钉住。1.5.1 豁免（ADR-0007 amendment）：dsh-m 截图
   * 灯箱 .dsvm-lightbox 根同带 role/aria 语义，浅色 tint 会把影院式黑遮罩染
   * 成浅毛玻璃、白色控件整体隐形（用户双模式实拍）——影院遮罩归 dsh-m 自有
   * 不变量（0.9.62 起 background !important 自持），此处 :not 双保险、语义
   * 归位。 */
  ${scope} { --dsw-menu-surface-fill: rgba(${menu.light}, 0.94); --dsw-alias-menu-group-header-fill: rgba(${menu.light}, 0.94); --dsw-specific-menu: rgba(${menu.light}, 0.94); }
  ${scope}[data-ds-dark-theme] { --dsw-menu-surface-fill: rgba(${menu.dark}, 0.94); --dsw-alias-menu-group-header-fill: rgba(${menu.dark}, 0.94); --dsw-specific-menu: rgba(${menu.dark}, 0.94); }
  ${scope} { --dsw-mask-blur: blur(10px); }
  ${scope} [role="dialog"][aria-modal="true"]:not(.dsvm-lightbox),
  ${scope} .dshm-panel,
  ${scope} .dshm-compat-dialog,
  ${scope} .dshm-dshchip-tip,
  ${scope} .dsh-skins-pop {
    background: color-mix(in srgb, rgb(${frost.light}) 86%, transparent);
    backdrop-filter: blur(14px) saturate(1.3);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
  }
  ${scope}[data-ds-dark-theme] [role="dialog"][aria-modal="true"]:not(.dsvm-lightbox),
  ${scope}[data-ds-dark-theme] .dshm-panel,
  ${scope}[data-ds-dark-theme] .dshm-compat-dialog,
  ${scope}[data-ds-dark-theme] .dshm-dshchip-tip,
  ${scope}[data-ds-dark-theme] .dsh-skins-pop {
    background: color-mix(in srgb, rgb(${frost.dark}) 86%, transparent);
  }
  ${scope} .dshm-overlay,
  ${scope} .dsvm-overlay,
  ${scope} .lc-ov-backdrop,
  ${scope} .lc-modal-backdrop {
    backdrop-filter: var(--dsw-mask-blur, blur(10px));
    -webkit-backdrop-filter: var(--dsw-mask-blur, blur(10px));
  }
  ${scope} [class*="_float_"],
  ${scope} [class*="_dialog_"],
  ${scope} .dsvm-filterpop,
  ${scope} .dsvm-modalbox,
  ${scope} .dsvm-chipswrap {
    background: color-mix(in srgb, rgb(${frost.light}) 86%, transparent);
    backdrop-filter: blur(14px) saturate(1.3);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
  }
  ${scope}[data-ds-dark-theme] [class*="_float_"],
  ${scope}[data-ds-dark-theme] [class*="_dialog_"],
  ${scope}[data-ds-dark-theme] .dsvm-filterpop,
  ${scope}[data-ds-dark-theme] .dsvm-modalbox,
  ${scope}[data-ds-dark-theme] .dsvm-chipswrap {
    background: color-mix(in srgb, rgb(${frost.dark}) 86%, transparent);
  }
  ${scope} .lc-ov-card,
  ${scope} .lc-modal-card,
  ${scope} .lc-card,
  ${scope} .lc-settings-card {
    background: color-mix(in srgb, rgb(${frost.light}) 86%, transparent);
    backdrop-filter: blur(14px) saturate(1.3);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
  }
  ${scope}[data-ds-dark-theme] .lc-ov-card,
  ${scope}[data-ds-dark-theme] .lc-modal-card,
  ${scope}[data-ds-dark-theme] .lc-card,
  ${scope}[data-ds-dark-theme] .lc-settings-card {
    background: color-mix(in srgb, rgb(${frost.dark}) 86%, transparent);
  }
  ${scope} .lc-card:has(.group\\/tip:hover) {
    position: relative;
    z-index: 10;
  }
  ${scope} .lc-tip {
    background: color-mix(in srgb, rgb(${frost.light}) 96%, transparent);
    backdrop-filter: blur(14px) saturate(1.3);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
  }
  ${scope}[data-ds-dark-theme] .lc-tip {
    background: color-mix(in srgb, rgb(${frost.dark}) 96%, transparent);
  }`;
  }

  // src/client/skins/define-skin.js
  var REQUIRED = [
    "id",
    "label",
    "description",
    "titleBrand",
    "favicon",
    "anchor",
    "bodyAttribute",
    "riding",
    "scrim",
    "blur",
    "glassVar",
    "desktopBlur",
    "wallpaper",
    "tints",
    "cssSegments",
    "Mark",
    "Name"
  ];
  var OPTIONAL = ["constantTokens", "builtinAssets", "backgroundArt", "decoration", "streaming", "badge"];
  var KNOWN_KEYS = /* @__PURE__ */ new Set([...REQUIRED, ...OPTIONAL]);
  var SEGMENT_NAMES = /* @__PURE__ */ new Set(["badge", "decoration", "streaming", "rootclear", "frost"]);
  var BARE_IDENTIFIER = /^[a-z][a-z0-9-]*$/;
  var kebabAttr = (bodyAttribute) => bodyAttribute.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  var scopeOf = (bodyAttribute) => `body[data-${kebabAttr(bodyAttribute)}]`;
  function needSegmentParam(param, name) {
    if (param === void 0 || param === null) {
      throw new Error(`Missing segment param: ${name}`);
    }
    return param;
  }
  function expandSegment(item, spec, scope) {
    if (!SEGMENT_NAMES.has(item)) {
      if (BARE_IDENTIFIER.test(item)) throw new Error(`Unknown segment: ${item}`);
      return item;
    }
    switch (item) {
      case "badge": {
        const badge = needSegmentParam(spec.badge, item);
        return badgeCss(scope, badge.selector, badge.colors, badge.metrics);
      }
      case "decoration":
        return decorationCss(scope, needSegmentParam(spec.decoration, item));
      case "streaming":
        return streamingCss(scope, needSegmentParam(spec.streaming, item));
      case "rootclear":
        return rootClear(scope);
      case "frost":
        return frostFamilyCss(scope, needSegmentParam(spec.tints, item));
      default:
        throw new Error(`Unknown segment: ${item}`);
    }
  }
  function buildScrim(spec) {
    if (spec.scrim.kind === "overlay") return { ...spec.scrim };
    const artLayer = spec.backgroundArt ? `, url(${spec.backgroundArt.url})` : "";
    return { ...spec.scrim, artLayer };
  }
  function buildWallpaper(spec) {
    const wallpaper = { ...spec.wallpaper };
    if (wallpaper.kind === "legacy-baked" && spec.backgroundArt) {
      wallpaper.sentinel = `builtin:${spec.id}:art`;
    }
    return wallpaper;
  }
  function defineSkin(spec) {
    for (const key of Object.keys(spec)) {
      if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown spec key: ${key}`);
    }
    for (const key of REQUIRED) {
      if (spec[key] === void 0) throw new Error(`Missing required spec field: ${key}`);
    }
    const scope = scopeOf(spec.bodyAttribute);
    if (!Array.isArray(spec.cssSegments)) throw new Error("cssSegments must be an array");
    const staticCss = spec.cssSegments.map((item) => {
      if (typeof item !== "string") throw new Error(`Invalid segment item: ${typeof item}`);
      return expandSegment(item, spec, scope);
    }).join("");
    const builtinAssets = Object.assign(
      {},
      spec.backgroundArt ? { art: { mime: spec.backgroundArt.mime, url: spec.backgroundArt.url } } : {},
      spec.builtinAssets ?? {}
    );
    const table = {
      bodyAttribute: spec.bodyAttribute,
      titleBrand: spec.titleBrand,
      favicon: spec.favicon,
      anchor: spec.anchor,
      riding: spec.riding,
      constantTokens: spec.constantTokens ?? null,
      scrim: buildScrim(spec),
      blur: spec.blur,
      glassVar: spec.glassVar,
      desktopBlur: { rate: spec.desktopBlur.rate ?? 55, dark: spec.desktopBlur.dark },
      wallpaper: buildWallpaper(spec),
      staticCss
    };
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      Mark: spec.Mark,
      Name: spec.Name,
      project: createProjection(table),
      builtinAssets
    };
  }

  // src/client/skins/meirenzhi/index.js
  var SCOPE = "body[data-dsh-meirenzhi-skin]";
  var MARK_URL = "data:image/webp;base64,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";
  var SPEC = {
    id: "meirenzhi",
    label: { zh: "凡人修仙传 · 美人志", en: "Mortal's Journey · Beauty Chronicle" },
    description: {
      zh: "云鬓花颜 · 霞衣夜月 · 凡尘问道",
      en: "Moonlit silks · crimson & gold · mortal path"
    },
    titleBrand: "美人志",
    favicon: { href: MARK_URL, mime: "image/webp" },
    anchor: 35,
    bodyAttribute: "dshMeirenzhiSkin",
    riding: {
      "--dsw-alias-bg-base": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 35] },
      "--dsw-specific-sidebar-fill": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 52] },
      "--dsw-alias-bg-module-platform": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 40] },
      "--dsw-specific-input-major": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 45] }
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
      "--dsw-specific-bubble-highlight": { light: "rgba(184, 67, 63, 0.18)", dark: "rgba(40, 40, 56, 0.92)" }
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
      yinyue: { mime: "image/webp", url: WALLPAPER_YINYUE }
    },
    // 反色徽章（official HARNESS 反色语言，tgcf badge 同构）：规则唯一来源在
    // ../decoration.js（ADR-0016）；#12121A/#FAF9F6 与面板底色族同源。
    badge: {
      selector: ".dsh-mrz-badge",
      colors: { light: { bg: "#12121A", fg: "#FAF9F6" }, dark: { bg: "#FAF9F6", fg: "#12121A" } },
      metrics: { lineHeight: "16px", fontWeight: 600 }
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
      menu: { light: "250, 249, 246", dark: "18, 18, 26" }
    },
    // 段序＝现状 CSS 数组序（ADR-0019 机制 a：段间字节由 "\n" 裸串项自持，
    // 工厂恒等拼接）。Ambient motion：慢速辉光呼吸骑在 runtime 的壁纸
    // ::before 层 + 两只漂移萤火虫走 #root 伪元素预算（与 tgcf 蝴蝶同形同
    // 价）；prefers-reduced-motion 全灭。
    cssSegments: [
      "badge",
      "\n",
      "decoration",
      "\n",
      "rootclear",
      "\n",
      "streaming",
      "\n",
      `@keyframes dsh-mrz-breathe{0%,100%{opacity:.94}50%{opacity:1}}`,
      "\n",
      `${SCOPE}::before{animation:dsh-mrz-breathe 26s ease-in-out infinite}`,
      "\n",
      `@keyframes dsh-mrz-drift-a{0%{transform:translate(0,0)}50%{transform:translate(42px,-34px)}100%{transform:translate(0,0)}}`,
      "\n",
      `@keyframes dsh-mrz-drift-b{0%{transform:translate(0,0)}50%{transform:translate(-46px,28px)}100%{transform:translate(0,0)}}`,
      "\n",
      `${SCOPE} #root::before{content:"";position:fixed;left:13%;top:19%;width:9px;height:9px;z-index:-1;background:radial-gradient(circle, rgba(217,180,92,.95) 0%, rgba(217,180,92,0) 70%);opacity:.16;animation:dsh-mrz-drift-a 38s ease-in-out infinite;pointer-events:none}`,
      "\n",
      `${SCOPE} #root::after{content:"";position:fixed;right:17%;bottom:23%;width:14px;height:14px;z-index:-1;background:radial-gradient(circle, rgba(250,249,246,.9) 0%, rgba(250,249,246,0) 70%);opacity:.12;animation:dsh-mrz-drift-b 47s ease-in-out infinite;pointer-events:none}`,
      "\n",
      `@media (prefers-reduced-motion:reduce){${SCOPE}::before,${SCOPE} #root::before,${SCOPE} #root::after{animation:none}}`,
      "\n",
      "frost"
    ]
  };
  function createMeirenzhiSkin(jsxRuntime) {
    const { jsx } = jsxRuntime;
    function MeiRenZhiMark({ size = 24, className }) {
      return jsx("img", {
        src: MARK_URL,
        alt: "",
        width: size,
        height: size,
        className,
        style: { display: "block", borderRadius: "2px", filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.30))" },
        "aria-hidden": "true"
      });
    }
    function MeiRenZhiName() {
      return jsx("span", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontWeight: 700,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap"
        },
        children: [
          jsx("span", {
            style: {
              background: "linear-gradient(120deg, #A87B2F, #D9B45C 45%, #B8433F)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent"
            },
            children: "凡人修仙传"
          }),
          jsx("span", { className: "dsh-mrz-badge", children: "BEAUTY" })
        ]
      });
    }
    return defineSkin({ ...SPEC, Mark: MeiRenZhiMark, Name: MeiRenZhiName });
  }

  // src/client/skins/openbmc-harness/background-art.js
  var BACKGROUND_ART = "data:image/webp;base64,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";

  // src/client/skins/openbmc-harness/index.js
  var ICON_VIEWBOX = "25 -12 190 190";
  var ICON_GRADIENTS = [
    { longId: "obmc-blue-a", shortId: "a", x1: "82.9", y1: "11.55", x2: "82.9", y2: "154.54", stops: [["0", "#00b0da"], ["1", "#008abf"]] },
    { longId: "obmc-blue-b", shortId: "b", x1: "81.55", y1: "27.55", x2: "81.55", y2: "158.66", stops: [["0", "#00b0da"], ["1", "#008abf"]] },
    { longId: "obmc-green-a", shortId: "c", x1: "156.66", y1: "51.54", x2: "156.66", y2: "154.8", stops: [["0", "#a5d440"], ["1", "#8cce3f"]] },
    { longId: "obmc-green-b", shortId: "d", x1: "158.41", y1: "51.54", x2: "158.41", y2: "154.8", stops: [["0", "#a5d440"], ["1", "#8cce3f"]] }
  ];
  var ICON_PATHS = [
    { gradient: 0, d: "M65.85,81.86a53.68,53.68,0,0,0,11.61,33.41c-.1.29-.15.6-.22.9a10.81,10.81,0,0,0-.34,2.57,11,11,0,1,0,11-11,10.75,10.75,0,0,0-1.2.07c-.31,0-.61.08-.91.13A42.82,42.82,0,0,1,99.95,43.86h0V2.07l-.77.21q-3.63.94-7.12,2.2c-1.29.47-2.58,1-3.84,1.48h0V38.19l-.13.1A53.79,53.79,0,0,0,65.85,81.86Z" },
    { gradient: 1, d: "M120.28,96.58a14.54,14.54,0,0,1-14.55-14.37H93.59v0a26.29,26.29,0,0,0,21,25.65v45.35A71.13,71.13,0,0,1,63.9,38.1c.31.06.63.1,1,.13s.64,0,1,0a10.83,10.83,0,1,0-10.25-7.41,82.23,82.23,0,0,0,64.18,133.6c1.41,0,2.81-.06,4.2-.14l1.63-.09h0V95.57A14.47,14.47,0,0,1,120.28,96.58Z" },
    { gradient: 2, d: "M171.95,68.54a53.78,53.78,0,0,0-9.85-19.71,11.31,11.31,0,0,0,.32-1.3,10.78,10.78,0,0,0,.24-2.17,11,11,0,1,0-8.89,10.8,42.83,42.83,0,0,1-14.17,64.08V162c1.08-.27,2.14-.56,3.2-.87a82.35,82.35,0,0,0,8.53-3V125.91a53.91,53.91,0,0,0,20.6-57.37Z" },
    { gradient: 3, d: "M184.63,132.75A82.21,82.21,0,0,0,119.79,0c-1.64,0-3.26.06-4.87.16h-.11V68.55h0A14.53,14.53,0,0,1,120,67.48h.27A14.56,14.56,0,0,1,134.87,82s0,.07,0,.11,0,.08,0,.13h11.08A26.21,26.21,0,0,0,125.81,56.8V11.3A71.14,71.14,0,0,1,176,125.83h-.07a11,11,0,0,0-12.58,10.88,11,11,0,0,0,11,11h0a11,11,0,0,0,10.54-14.13C184.82,133.3,184.73,133,184.63,132.75Z" }
  ];
  var FAVICON_MIME = "image/svg+xml";
  var FAVICON_DATA_URL = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + ICON_VIEWBOX + '"><defs>' + ICON_GRADIENTS.map((g) => '<linearGradient id="' + g.shortId + '" gradientUnits="userSpaceOnUse" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '">' + g.stops.map(([offset, color]) => '<stop offset="' + offset + '" stop-color="' + color + '"/>').join("") + "</linearGradient>").join("") + "</defs>" + ICON_PATHS.map((p) => '<path fill="url(#' + ICON_GRADIENTS[p.gradient].shortId + ')" d="' + p.d + '"/>').join("") + "</svg>"
  );
  var TINTS = {
    frost: { light: "247, 250, 252", dark: "12, 26, 38" },
    menu: { light: "242, 247, 251", dark: "14, 33, 48" }
  };
  var PLACEHOLDER_LIGHT = "radial-gradient(1100px 750px at 18% 0%, rgba(0, 176, 218, 0.10), transparent 60%),radial-gradient(950px 700px at 85% 100%, rgba(140, 206, 63, 0.10), transparent 55%)";
  var PLACEHOLDER_DARK = "radial-gradient(1100px 750px at 18% 0%, rgba(0, 150, 200, 0.14), transparent 60%),radial-gradient(950px 700px at 85% 100%, rgba(125, 190, 55, 0.09), transparent 55%)";
  var SPEC2 = {
    id: "openbmc",
    label: "OpenBMC Studio",
    description: {
      zh: "冰绡叠浪 · 风雷入画 · 缥碧盈卷",
      en: "Ice-silk waves · storm-wing backdrop · ice-blue palette"
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
      "--dsw-specific-login-input": { light: ["255, 255, 255", 60], dark: ["18, 42, 60", 65] }
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
        dark: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif'
      },
      "--ds-font-family-code": {
        light: '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
        dark: '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace'
      },
      "--dsh-scrollbar-thumb": { light: "var(--dsw-alias-scrollbar-bg-l2)", dark: "var(--dsw-alias-scrollbar-bg-l2)" },
      "--dsh-scrollbar-thumb-hover": { light: "var(--dsw-alias-scrollbar-hover-l2)", dark: "var(--dsw-alias-scrollbar-hover-l2)" }
    },
    scrim: {
      kind: "baked-gradient",
      stops: {
        light: [["247, 250, 252", 15], ["240, 246, 250", 28]],
        dark: [["7, 14, 22", 10], ["4, 9, 14", 24]]
      }
    },
    blur: { max: 24 },
    glassVar: "--dsh-openbmc-glass-blur",
    desktopBlur: { dark: "none" },
    // OpenBMC dark remains the approved reference baseline
    wallpaper: {
      kind: "legacy-baked",
      placeholder: { light: PLACEHOLDER_LIGHT, dark: PLACEHOLDER_DARK }
    },
    backgroundArt: { mime: "image/webp", url: BACKGROUND_ART },
    builtinAssets: {},
    // art 由工厂自 backgroundArt 派生（ADR-0014 B15 显式声明语义不变）
    // 品牌徽章：官方 ▐HARNESS▌ 同构反色片；本皮自持色值与 metrics（14px/650）。
    badge: {
      selector: ".dsh-openbmc-badge",
      colors: { light: { bg: "#14202B", fg: "#F7FAFC" }, dark: { bg: "#F7FAFC", fg: "#14202B" } },
      metrics: { lineHeight: "14px", fontWeight: 650 }
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
      "\n\n\n\n"
    ]
  };
  function createOpenBmcHarness(jsxRuntime) {
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
            children: ICON_GRADIENTS.map((g) => jsx("linearGradient", {
              id: g.longId,
              gradientUnits: "userSpaceOnUse",
              x1: g.x1,
              y1: g.y1,
              x2: g.x2,
              y2: g.y2,
              children: g.stops.map(([offset, color]) => jsx("stop", { offset, stopColor: color }))
            }))
          }),
          ...ICON_PATHS.map((p) => jsx("path", {
            fill: "url(#" + ICON_GRADIENTS[p.gradient].longId + ")",
            d: p.d
          }))
        ]
      });
    }
    function OpenBmcName() {
      return jsx("span", {
        style: { display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
        "aria-hidden": "true",
        children: [
          jsx("svg", {
            width: 94.6,
            height: 24,
            viewBox: "0 0 94.6 24",
            fill: "none",
            children: [
              jsx("g", { transform: "translate(0 -71.26) scale(0.3914)", children: [
                jsx("path", { d: "M33.19,213.53A14.53,14.53,0,1,1,18.66,199a14.53,14.53,0,0,1,14.53,14.53m4.12,0a18.66,18.66,0,1,0-18.66,18.66,18.66,18.66,0,0,0,18.66-18.66", fill: "currentColor" }),
                jsx("path", { d: "M63.68,224.4a12.41,12.41,0,0,1-4.86,5.17,13.54,13.54,0,0,1-7,1.85H45.54V240h-4V205.43H51.64a13.41,13.41,0,0,1,9.57,3.76,12.73,12.73,0,0,1,2.47,15.21m-18.14,3.24h5.77A9.48,9.48,0,0,0,58.05,225a8.59,8.59,0,0,0,2.76-6.54,8.38,8.38,0,0,0-2.7-6.41,9.43,9.43,0,0,0-6.68-2.51H45.54Z", fill: "currentColor" }),
                jsx("path", { d: "M96.44,219.75a4.56,4.56,0,0,0,.14-1.36c0-7.38-6.27-13.36-14-13.36s-14,6-14,13.36,6.27,13.36,14,13.36a14,14,0,0,0,11.93-6.52l-3.25-2.45a9.89,9.89,0,0,1-8.68,5,9.43,9.43,0,1,1,0-18.83,9.8,9.8,0,0,1,9.35,6.54c0,.07.15.63.17.7H76.59v3.52Z", fill: "currentColor" }),
                jsx("path", { d: "M119.82,208.4a10.6,10.6,0,0,0-7.9-3.34,10.15,10.15,0,0,0-4.16.83,15.94,15.94,0,0,0-3.62,2.24v-2.7H99.91v26h4.23V216.64a7.74,7.74,0,0,1,2.08-5.5,7.48,7.48,0,0,1,10.66,0,7.76,7.76,0,0,1,2.08,5.48v14.78h4.11v-15a11.12,11.12,0,0,0-3.24-8", fill: "currentColor" }),
                jsx("path", { d: "M154.37,220.69a6.77,6.77,0,0,1-6.75,6.79H132.14V213.9h15.49a6.78,6.78,0,0,1,6.75,6.79m-2.29-15.93a5.08,5.08,0,0,1-5.05,5.08l-14.89,0V199.67H147a5.07,5.07,0,0,1,5.05,5.08m.94,6.7a9,9,0,0,0-5.69-15.75H128v35.75h20.14l.28,0v0A10.73,10.73,0,0,0,153,211.46", fill: "var(--dsw-alias-label-secondary)" }),
                jsx("path", { d: "M201.22,231.42V195.65H196.53L182,225.14,167.47,195.65H162.72V231.42H166.89V204.21L180.33,231.42H183.67L197.1,204.21V231.42Z", fill: "var(--dsw-alias-label-secondary)" }),
                jsx("path", { d: "M241.23,205.77a18.66,18.66,0,1,0-.24,16L237.26,220a14.51,14.51,0,1,1,.21-12.46Z", fill: "var(--dsw-alias-label-secondary)" })
              ] })
            ]
          }),
          jsx("span", {
            className: "dsh-openbmc-badge",
            children: "STUDIO"
          })
        ]
      });
    }
    return defineSkin({ ...SPEC2, Mark: OpenBmcMark, Name: OpenBmcName });
  }

  // src/client/skins/uefi-harness/background-art.js
  var BACKGROUND_ART2 = builtinAssetUrl("uefi-harness", "art");

  // src/client/skins/uefi-harness/index.js
  var LOGO_VIEWBOX = "0 0 367.92 424.8";
  var LOGO_WHITE = "M183.505 7.5l12.515.016 59.87 34.233.632 13.683 23.938.38L339.524 89.6l16.386 30.31 5.136 192.808L349.92 329.3l-56.88 32.657-19.564-1.81-13.315 20.69-56.41 32.404-89.687-32.764L4.375 312.71 7.5 109.59z";
  var LOGO_RED = "M182.88 0l13.14 7.516-86.427 50.52S83.443 71.21 74.16 81.362c-11.362 12.428-7.917 30.125 2.16 42.48 24.693 30.28 88.66 54.367 141.12 34.56C239.666 150.01 339.524 89.6 339.524 89.6l28.397 16.243v213.12l-18 10.337V207.36l-56.88 32.66v121.937l-32.88 18.88V311.04l20.28-12.24v-51.543l-20.28 11.646s-2.37-32.09 1.92-42.902c4.1-10.31 15.74-21.72 25.2-18.72 6.95 2.21 5.76 24.95 5.76 24.95s42.95-24.85 56.88-32.86c2.25-36.34-9.13-59-43.92-55.44-15.87 1.63-28.37 10.02-38.88 17.28-11.14 7.7-20.4 16.555-28.8 26.64-15.89 19.1-33.02 45.26-35.28 76.32-1.77 24.357.71 159.07.71 159.07L183.6 424.8 0 318.96V105.84L182.88 0zM115.2 167.04c-13.318-10.95-29.718-21.208-47.52-25.2-11.942-2.678-23.93-1.128-32.4 3.6-22.328 12.466-28.844 45.437-26.64 77.76 3.508 51.445 22.065 86.146 48.96 113.04 17.977 17.977 47.576 39.66 74.16 41.76 27.702 2.187 36.335-16.023 42.48-36.72-20.956-14.324-44.265-26.296-65.52-40.32-3.91 2.99-3.572 6.328-9.36 6.48-5.15.135-10.955-4.727-14.4-9.36-6.09-8.19-8.026-21.054-8.64-30.96 33.78 18.062 66.363 37.317 100.08 55.44 3.688-67.27-23.104-124.2-61.2-155.52zM280.46 55.813l-85.795 52.732s-22.85 14.813-38.136 13.134c-4.99-.55-13.31-4.77-13.68-8.64-.7-7.16 25.2-21.02 25.2-21.02l87.84-50.27L280.46 55.8zM109.44 241.2c-11.23-5.81-21.966-12.114-32.4-18.72 1.032-7.922 2.438-15.645 12.24-13.68 11.49 2.303 19.817 20.686 20.16 32.4z";
  var faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + LOGO_VIEWBOX + '"><path fill="#FFFFFF" d="' + LOGO_WHITE + '"/><path fill="#DC0000" d="' + LOGO_RED + '"/></svg>';
  var favicon = "data:image/svg+xml," + encodeURIComponent(faviconSvg);
  var TINTS2 = {
    frost: { light: "248, 247, 255", dark: "23, 18, 45" },
    menu: { light: "248, 247, 255", dark: "28, 22, 55" }
  };
  var SPEC3 = {
    id: "uefi-harness",
    label: "UEFI Studio",
    description: {
      zh: "紫电初醒 · 流霞渐染 · 绀青成韵",
      en: "Violet spark · gilded backdrop · violet-blue palette"
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
      "--dsw-specific-input-major": { light: ["255, 255, 255", 62], dark: ["42, 34, 78", 55] }
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
        dark: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
      }
    },
    scrim: {
      kind: "baked-gradient",
      stops: {
        light: [["248, 247, 255", 10], ["238, 234, 255", 22]],
        dark: [["23, 18, 45", 8], ["16, 12, 34", 20]]
      }
    },
    blur: { max: 24 },
    glassVar: "--dsh-uefi-glass-blur",
    desktopBlur: { dark: "boost" },
    wallpaper: {
      kind: "legacy-baked",
      placeholder: null
    },
    backgroundArt: { mime: "image/webp", url: BACKGROUND_ART2 },
    builtinAssets: {},
    // art 由工厂自 backgroundArt 派生（ADR-0014 B15 显式声明语义不变）
    // 用户+目标气泡描边：本皮肤只持描边色。
    decoration: { light: "101, 83, 216", dark: "169, 156, 255" },
    // 流式呼吸光条（ADR-0016 视觉窗口：静态版升级呼吸，衰减色 = 暗色品牌主色 @0.20，Q16）。
    streaming: { decay: "169, 156, 255" },
    tints: TINTS2,
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
      "\n\n\n\n"
    ]
  };
  function createUefiHarness({ jsx }) {
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
          jsx("path", { fill: "#DC0000", d: LOGO_RED })
        ]
      });
    }
    function UefiName() {
      return jsx("span", {
        style: { display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 650, letterSpacing: ".02em", whiteSpace: "nowrap" },
        children: [
          jsx("span", { children: "UEFI" }),
          jsx("span", {
            style: { border: "1px solid currentColor", borderRadius: "4px", padding: "0 5px", fontSize: "10px", lineHeight: "16px", letterSpacing: ".08em" },
            children: "STUDIO"
          })
        ]
      });
    }
    return defineSkin({ ...SPEC3, Mark: UefiMark, Name: UefiName });
  }

  // src/client/index.js
  window.__ModuleLoader__.load({
    // MUST equal the package.json `name` (and the roster row `name` in
    // cordis.patch.yml): the boot page emits __DSH_BOOT__ entries keyed by the
    // package name, and dsh-client-modules rejects a bundle whose registration
    // does not match its graph-row id ("loaded without registering …").
    id: "@iasiv5/dsh-skins",
    factory: (require2) => {
      const jsxRuntime = require2("react/jsx-runtime");
      const react = require2("react");
      const reactDom = require2("react-dom");
      const profile = window.location?.protocol === "dsh-app:" && window.location?.hostname === "app" ? "desktop" : "web";
      const runtime = createSkinRuntime({ profile });
      const skinById = /* @__PURE__ */ new Map();
      for (const factory of [createOpenBmcHarness, createUefiHarness, createMeirenzhiSkin]) {
        const skin = factory(jsxRuntime);
        skinById.set(skin.id, skin);
        runtime.register(skin);
      }
      const configClient = typeof fetch === "function" ? createConfigClient({ profile, contextActive: () => runtime.active() }) : null;
      if (configClient !== null) {
        const assetResolver = (ref) => {
          if (ref.kind === "builtin") {
            const asset = skinById.get(ref.skinId)?.builtinAssets?.[ref.assetKey];
            return asset ? { url: asset.url, mime: asset.mime } : null;
          }
          const meta = configClient.getState().library.find((entry) => entry.id === ref.id);
          return meta ? { url: configClient.assetUrl(meta), mime: meta.mime } : null;
        };
        const metaProvider = (id) => configClient.getState().library.find((entry) => entry.id === id) ?? null;
        runtime.setPersonalization({
          getOverrides: (skinId) => configClient.effectiveOverrides(skinId),
          assetResolver,
          metaProvider
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
            skinsById: (id) => skinById.get(id) ?? null
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
        hotUpdate: runtime.updateActive
      };
      return {
        apply,
        inject,
        selectSkin: runtime.select,
        listSkins: runtime.list
      };
    }
  });
})();
