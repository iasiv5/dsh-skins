/**
 * Builtin asset URL construction (ADR-0023 Decision 5): the single source
 * for `/dsh-skins/assets/b_<skinId>_<assetKey>.<ext>?v=<rev>` URLs.
 *
 * The rev comes from the esbuild define key `globalThis.__DSH_SKINS_ASSET_REV__`
 * (injected from package.json at build time — esbuild only substitutes the
 * fully-qualified property-access key, so the define MUST use the
 * `globalThis.` prefix). Unbundled direct runs (unit tests) fall back to "0";
 * in the built bundle the fallback is replaced away by the literal version.
 * The ?v= suffix busts the immutable HTTP cache across plugin upgrades.
 *
 * Charset discipline mirrors BUILTIN_REF_PATTERN (catalog.js): skin ids and
 * asset keys never contain underscores, so the b_<skin>_<key> filename split
 * is unambiguous on the host side.
 */

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function builtinAssetUrl(skinId, assetKey, extension = "webp") {
  if (typeof skinId !== "string" || !SEGMENT_PATTERN.test(skinId)) {
    throw new RangeError(`builtinAssetUrl: invalid skinId ${JSON.stringify(skinId)}`);
  }
  if (typeof assetKey !== "string" || !SEGMENT_PATTERN.test(assetKey)) {
    throw new RangeError(`builtinAssetUrl: invalid assetKey ${JSON.stringify(assetKey)}`);
  }
  if (typeof extension !== "string" || !/^[a-z0-9]+$/.test(extension)) {
    throw new RangeError(`builtinAssetUrl: invalid extension ${JSON.stringify(extension)}`);
  }
  const rev = globalThis.__DSH_SKINS_ASSET_REV__ ?? "0";
  return `/dsh-skins/assets/b_${skinId}_${assetKey}.${extension}?v=${rev}`;
}
