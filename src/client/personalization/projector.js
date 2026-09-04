/**
 * SkinProjector — the single projection pipeline (design §1/§3).
 *
 *   catalog merge (layer-1 field fallbacks)
 *     → assetResolver resolves image refs
 *       → skin.project(values, resolvedAssets) maps values to effects
 *         → normalizeEffects validates and freezes the SkinEffects shape
 *
 * Three-layer fallback semantics (design §3, frozen):
 *   degraded:"none"     projection succeeded with the user's overrides
 *   degraded:"defaults" pipeline failed (resolver/project/shape) → the whole
 *                       projection re-ran on catalog defaults
 *   degraded:"failed"   even defaults failed → effects:null; the RUNTIME
 *                       fails closed (restore previous effects / official)
 *
 * Every catalog skin owns its `project` (ADR-0004): legacy adapters are
 * gone. A catalog skin without a `project` fails closed through the
 * three-layer fallback (pipeline error → defaults → effects:null).
 */

import {
  defaultsFor,
  getSkinSchema,
  mergeValues,
  resolveImageRef,
} from "../../shared/personalization/catalog.js";

const DATASET_KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined; // undefined = invalid
}

/**
 * Validate and freeze a SkinEffects draft. The draft is cloned first (the
 * caller's objects are never shared or frozen), validated, and returned as a
 * recursively IMMUTABLE structure — or null when structurally invalid
 * (triggers layer-2 fallback).
 */
export function normalizeEffects(draft) {
  let source;
  try {
    source = structuredClone(draft);
  } catch {
    return null;
  }
  if (!isPlainObject(source)) return null;
  if (typeof source.bodyAttribute !== "string" || !DATASET_KEY.test(source.bodyAttribute)) return null;

  const slogans = source.slogans ?? null;
  if (slogans !== null && (!isPlainObject(slogans)
    || typeof slogans.zh !== "string" || typeof slogans.en !== "string")) return null;

  const titleBrand = optionalString(source.titleBrand);
  if (titleBrand === undefined) return null;

  const favicon = source.favicon ?? null;
  if (favicon !== null && (!isPlainObject(favicon)
    || typeof favicon.href !== "string" || favicon.href.length === 0
    || typeof favicon.mime !== "string")) return null;

  const backdrop = source.backdrop ?? null;
  if (backdrop !== null) {
    if (!isPlainObject(backdrop)) return null;
    for (const key of ["imageLight", "imageDark", "overlayLight", "overlayDark"]) {
      const value = backdrop[key] ?? null;
      if (value !== null && typeof value !== "string") return null;
    }
    const blur = backdrop.blur ?? 0;
    if (typeof blur !== "number" || !(blur >= 0 && blur <= 24)) return null;
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
  if (staticCss === undefined) return null;

  const decorations = source.decorations ?? null;
  if (decorations !== null) {
    if (!Array.isArray(decorations)) return null;
    for (const decoration of decorations) {
      if (!isPlainObject(decoration) || typeof decoration.key !== "string"
        || decoration.key.length === 0 || typeof decoration.css !== "string") return null;
    }
  }

  return deepFreeze({
    bodyAttribute: source.bodyAttribute,
    slogans,
    titleBrand,
    favicon,
    backdrop: backdrop === null ? null : {
      imageLight: backdrop.imageLight ?? null,
      imageDark: backdrop.imageDark ?? null,
      overlayLight: backdrop.overlayLight ?? null,
      overlayDark: backdrop.overlayDark ?? null,
      blur: backdrop.blur ?? 0,
    },
    tokenOverrides,
    cssVariables,
    staticCss,
    decorations,
  });
}

/**
 * Project a skin. `context` supplies:
 *   assetResolver(ref) → { url, mime } | null   (builtin table / asset route)
 *   metaProvider(id)   → AssetMeta | null       (trusted library metadata)
 */
export function projectSkin(skin, rawOverrides, context = {}) {
  const schema = getSkinSchema(skin.id);
  if (schema === null) {
    // Skin outside the catalog: no personalization contract at all.
    return { effects: null, issues: [], degraded: "failed" };
  }
  const project = skin.project;

  const attempt = (overrides) => {
    const { values, issues } = mergeValues(skin.id, overrides, context.metaProvider);
    const resolvedAssets = {};
    for (const field of schema.fields) {
      if (field.type !== "image") continue;
      const ref = resolveImageRef(values[field.key]);
      if (ref === null) continue;
      const resolved = context.assetResolver?.(ref) ?? null;
      if (resolved === null || typeof resolved.url !== "string" || resolved.url.length === 0) {
        // Resolution failure is a PIPELINE failure (design §3): the whole
        // projection re-runs on defaults instead of silently dropping the
        // effect (and fails closed when even defaults cannot resolve).
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

  // Layer 2: whole-pipeline retry on catalog defaults.
  const second = safeAttempt(defaultsFor(skin.id));
  if (second.normalized !== null) return { effects: second.normalized, issues: first.issues, degraded: "defaults" };

  // Layer 3: fail closed — the runtime restores the previous valid effects
  // (or falls back to official on first mount) and reports the error.
  return { effects: null, issues: first.issues, degraded: "failed" };
}
