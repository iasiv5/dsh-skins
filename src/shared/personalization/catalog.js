/**
 * Personalization catalog — the single source of truth for per-skin
 * personalization fields, shared verbatim by the Host (store + routes) and
 * the client (panel + projector). Pure data and pure functions only: no
 * React, DOM, filesystem, or host APIs may leak in here.
 *
 * Value model (design §2–§3): every field has a `type` (control + value
 * validation) and an orthogonal `scope` (persistence shape):
 *   single       → scalar            (panelOpacity: 70)
 *   locale       → { zh, en }        (slogan)
 *   colorScheme  → { light, dark }   (no shipped field uses it since the
 *                                     simplification; machinery stays for
 *                                     future skins)
 * LWW granularity is the WHOLE scope object: clients must submit complete
 * objects; nothing merges sub-keys implicitly.
 */

export const CONFIG_VERSION = 1;

export const FIELD_TYPES = ["text", "color", "image", "select", "range"];
export const SCOPES = ["single", "locale", "colorScheme"];

const LEGAL_COMBOS = new Set([
  "text:single",
  "text:locale",
  "color:colorScheme",
  "image:single",
  "select:single",
  "range:single",
  "range:colorScheme",
]);

/** Global ingest invariants (design §6/§8): every asset, regardless of field. */
export const GLOBAL_MAX_BYTES = 20 * 1024 * 1024;
export const GLOBAL_MAX_PIXELS = 40_000_000;
/** GIF (animated or not) is tightened globally: covers 4K stills (8.3MP),
 * caps the worst single decoded frame at ~48MB RGBA. */
export const GIF_MAX_PIXELS = 12_000_000;

/** User asset ids: `u_` + 32 hex chars (randomUUID, hyphens stripped).
 * One exported pattern consumed by DELETE/assets routes, the store
 * validator, ZIP manifests, config image refs, GC and tests alike. */
export const ASSET_ID_PATTERN = /^u_[0-9a-f]{32}$/;
export const ASSET_ID_PREFIX = "u_";
/** Builtin refs are compile-time, read-only, and skin-scoped. */
export const BUILTIN_REF_PATTERN = /^builtin:([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;

export const USER_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// ---------------------------------------------------------------------------
// Catalog data
// ---------------------------------------------------------------------------

const WALLPAPER_FIELD = {
  key: "wallpaper",
  type: "image",
  scope: "single",
  labelKey: "personalization.wallpaper",
  default: null, // filled per skin below
  allowedUserMime: USER_IMAGE_MIMES,
  maxBytes: GLOBAL_MAX_BYTES,
  maxWidth: 16384,
  maxHeight: 16384,
  maxPixels: GLOBAL_MAX_PIXELS,
};

export const SKINS = {
  tgcf: {
    builtinAssets: {
      // Registry mirrors the grid: the factory default (moonlit) leads.
      moonlit: { mime: "image/webp", labelKey: "personalization.tgcf.moonlit" },
      crimson: { mime: "image/webp", labelKey: "personalization.tgcf.crimson" },
      pale: { mime: "image/webp", labelKey: "personalization.tgcf.pale" },
      "seal-favicon": { mime: "image/webp" },
    },
    fields: [
      // Factory default rides moonlit (花怜 · 月下同伞) since the 1.0.0
      // wallpaper addition; it leads the grid (user ruling) and its label
      // carries the （默认壁纸） suffix. crimson/pale remain selectable, and
      // stored overrides are untouched by the default flip.
      { ...WALLPAPER_FIELD, default: "builtin:tgcf:moonlit", builtinChoices: ["moonlit", "crimson", "pale"] },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "百无禁忌", en: "No Taboos" },
      },
      {
        // Ruling #14: ONE translucency knob. It drives the panel tint, the
        // wallpaper scrim and the blur as one combined visual (the curve
        // lives in the tgcf projector, calibrated through the historical
        // defaults P=82 → scrim 30 / blur 12); the blur/scrim fields are
        // retired — pre-1.0.0 there are no external users to migrate.
        // Ruling #15: factory default 10; ruling #17 re-tunes it to 30 —
        // a faint veil so menus read while the wallpaper still leads;
        // 1.0.0 re-tunes it to 35 (user) for a touch more panel presence.
        key: "panelOpacity",
        type: "range",
        scope: "single",
        labelKey: "personalization.panelTranslucency",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        default: 35,
      },
    ],
  },

  // ADR-0004 (reversing design §9a): every catalog skin declares the same
  // standard field set. The legacy skins' catalog slogan defaults are
  // same-source with their factories' static `slogans`, and panelOpacity
  // default 55 anchors the derived projection to the baked alpha strings —
  // the byte-equivalence invariant is pinned by the projector tests.
  // Legacy wallpaper semantics (scrim never applies to user images,
  // placeholder branch) live inside each skin's project() branches.
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
        default: { zh: "察于未萌 · 治于未乱", en: "Govern before the storm" },
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
        default: 55,
      },
    ],
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
        default: { zh: "启于固件 · 行于万象", en: "Boot before everything" },
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
        default: 55,
      },
    ],
  },

  // 美人志（出厂皮肤，注册顺序第一位）：6 张内置精选，出厂默认 yuntai
  // （001合照）领头并对齐 tgcf 的「出厂默认领先」惯例；panelOpacity 锚定
  // tgcf 二次曲线（projector 数学见 skins/meirenzhi/index.js）。
  meirenzhi: {
    builtinAssets: {
      yuntai: { mime: "image/webp", labelKey: "personalization.meirenzhi.yuntai" },
      mupeiling: { mime: "image/webp", labelKey: "personalization.meirenzhi.mupeiling" },
      ziling: { mime: "image/webp", labelKey: "personalization.meirenzhi.ziling" },
      nangongwan: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongwan" },
      nangongque: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongque" },
      yinyue: { mime: "image/webp", labelKey: "personalization.meirenzhi.yinyue" },
    },
    fields: [
      {
        ...WALLPAPER_FIELD,
        default: "builtin:meirenzhi:yuntai",
        builtinChoices: [
          "yuntai", "mupeiling", "ziling",
          "nangongwan", "nangongque", "yinyue",
        ],
      },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" },
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
        default: 35,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getSkinSchema(skinId) {
  const entry = SKINS[skinId];
  if (entry === undefined) return null;
  return { skinId, fields: entry.fields, builtinAssets: entry.builtinAssets };
}

export function getField(skinId, key) {
  return SKINS[skinId]?.fields.find((field) => field.key === key) ?? null;
}

export function listAssetFields(skinId) {
  return SKINS[skinId]?.fields.filter((field) => field.type === "image") ?? [];
}

export function defaultsFor(skinId) {
  const values = {};
  for (const field of SKINS[skinId]?.fields ?? []) values[field.key] = field.default;
  return values;
}

/** Structural equality for override values (v1.0.0 ruling "a value equal to
 *  the factory default is not an override"): primitives compare by identity,
 *  plain objects (locale / colorScheme scopes) key-by-key and recursively.
 *  Defaults are rebuilt per defaultsFor() call, so reference equality can
 *  never hold for objects — comparison must be structural. */
export function isSameOverrideValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object"
    || Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  return keysA.length === Object.keys(b).length
    && keysA.every((key) => Object.hasOwn(b, key) && isSameOverrideValue(a[key], b[key]));
}

// ---------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------

/** Parse an image field value into a typed reference, or null if malformed. */
export function resolveImageRef(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.startsWith("builtin:")) {
    const match = BUILTIN_REF_PATTERN.exec(value);
    return match === null ? null : { kind: "builtin", skinId: match[1], assetKey: match[2] };
  }
  if (ASSET_ID_PATTERN.test(value)) return { kind: "user", id: value };
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function scopeKeys(scope) {
  if (scope === "locale") return ["zh", "en"];
  if (scope === "colorScheme") return ["light", "dark"];
  return null;
}

function validScopeObject(value, scope, checkMember) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = scopeKeys(scope);
  // Exact key set: no missing members, no extra members (Y6 — one canonical
  // persistence shape per scope).
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
  // Step grid: every persisted value sits on the declared step lattice.
  if (field.step !== undefined && field.step > 0) {
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

/**
 * Validate a single field member (scalar) against the per-type rules.
 * `meta` is the trusted AssetMeta from state.library for user assets.
 */
function validateImageRef(value, field, skinId, meta) {
  const ref = resolveImageRef(value);
  if (ref === null) return false;
  if (ref.kind === "builtin") {
    // Builtin refs must belong to the owning skin's registered assets.
    if (ref.skinId !== skinId) return false;
    return SKINS[skinId]?.builtinAssets[ref.assetKey] !== undefined;
  }
  if (meta === undefined || meta === null) return true;
  // Field-level constraints from trusted metadata (design §6).
  return metaSatisfiesField(field, meta);
}

/** Field-level asset constraints against trusted AssetMeta (design §6). */
export function metaSatisfiesField(field, meta) {
  if (typeof meta.mime !== "string" || !field.allowedUserMime.includes(meta.mime)) return false;
  if (meta.byteLength > field.maxBytes) return false;
  if (meta.width > field.maxWidth || meta.height > field.maxHeight) return false;
  const maxPixels = meta.mime === "image/gif"
    ? Math.min(field.maxPixels, GIF_MAX_PIXELS)
    : field.maxPixels;
  return meta.width * meta.height <= maxPixels;
}

/**
 * Validate one override value for a field.
 * Returns `{ ok: true }` or `{ ok: false, code }` with stable codes:
 *   UNKNOWN_FIELD / BAD_SHAPE / BAD_VALUE / BAD_ASSET / MISSING_ASSET
 *
 * `metaProvider(id) → AssetMeta | null` supplies trusted library metadata.
 * When omitted (client-side projection without library state), user-asset
 * existence and per-field asset constraints are skipped — the Host always
 * validates them on the write path.
 */
export function validateOverride(skinId, key, value, metaProvider) {
  const field = getField(skinId, key);
  if (field === null) return { ok: false, code: "UNKNOWN_FIELD" };
  const provider = typeof metaProvider === "function" ? metaProvider : undefined;

  if (field.scope === "single") {
    if (field.type === "image") {
      const ref = resolveImageRef(value);
      if (ref === null) return { ok: false, code: "BAD_SHAPE" };
      if (ref.kind === "builtin") {
        if (!validateImageRef(value, field, skinId, undefined)) return { ok: false, code: "BAD_ASSET" };
        return { ok: true };
      }
      if (provider !== undefined) {
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

/**
 * Pure merge (design §1): catalog defaults + user overrides, with layer-1
 * fallback — an invalid override falls back to the field default and is
 * reported in `issues`; unknown keys are ignored by projection (the store
 * normalizes them away at load, design §5.5).
 *
 * `metaProvider(refId) → AssetMeta | null` lets image fields validate
 * against trusted library metadata without importing storage.
 */
export function mergeValues(skinId, overrides, metaProvider) {
  const schema = getSkinSchema(skinId);
  if (schema === null) return { values: {}, issues: [] };
  const provider = typeof metaProvider === "function" ? metaProvider : undefined;
  const values = {};
  const issues = [];
  for (const field of schema.fields) {
    const override = overrides?.[field.key];
    if (override === undefined) {
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

/**
 * Catalog self-invariants (design §10). Exported for tests; cheap enough to
 * run at build time if desired.
 */
export function validateCatalogInvariants() {
  const problems = [];
  for (const [skinId, entry] of Object.entries(SKINS)) {
    if (!/^([a-z0-9][a-z0-9-]*)$/.test(skinId)) problems.push(`skin id "${skinId}" malformed`);
    const seenKeys = new Set();
    for (const field of entry.fields) {
      const tag = `${skinId}.${field.key}`;
      if (!FIELD_TYPES.includes(field.type)) problems.push(`${tag}: unknown type ${field.type}`);
      if (!SCOPES.includes(field.scope)) problems.push(`${tag}: unknown scope ${field.scope}`);
      if (!LEGAL_COMBOS.has(`${field.type}:${field.scope}`)) problems.push(`${tag}: illegal type×scope`);
      if (seenKeys.has(field.key)) problems.push(`${tag}: duplicate key`);
      seenKeys.add(field.key);
      if (typeof field.labelKey !== "string" || field.labelKey.length === 0) problems.push(`${tag}: missing labelKey`);
      if (field.type === "select") {
        const values = field.options.map((option) => option.value);
        if (new Set(values).size !== values.length) problems.push(`${tag}: duplicate option values`);
        for (const option of field.options) {
          if (typeof option.labelKey !== "string" || option.labelKey.length === 0) {
            problems.push(`${tag}: option ${option.value} missing labelKey`);
          }
        }
      }
      if (field.type === "range" && field.min > field.max) problems.push(`${tag}: min > max`);
      if (field.type === "image") {
        for (const mime of field.allowedUserMime) {
          if (mime === "image/svg+xml") problems.push(`${tag}: user SVG forbidden`);
        }
        if (field.maxBytes > GLOBAL_MAX_BYTES) problems.push(`${tag}: maxBytes exceeds global`);
        if (field.maxPixels > GLOBAL_MAX_PIXELS) problems.push(`${tag}: maxPixels exceeds global`);
        const ref = resolveImageRef(field.default);
        if (ref === null || ref.kind !== "builtin" || ref.skinId !== skinId
          || entry.builtinAssets[ref.assetKey] === undefined) {
          problems.push(`${tag}: default must be a registered builtin of this skin`);
        }
      }
      // Defaults must satisfy their own constraints.
      const verdict = validateOverride(skinId, field.key, field.default, null);
      if (!verdict.ok) problems.push(`${tag}: default invalid (${verdict.code})`);
    }
  }
  return problems;
}
