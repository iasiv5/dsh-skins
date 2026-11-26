/** Host error presentation — the stable Host error code → dictionary key map
 * plus the localized-text resolver used by the personalization panel. */

/**
 * Stable Host error code → dictionary key. Every user-facing Host error
 * carries `code` (and optionally `params`); the personalization panel renders
 * the localized template when the code is known and a localized generic
 * naming the code otherwise — the Host's own message text never reaches
 * users (it carries the Host's source language and would leak across
 * locales).
 */
export const HOST_ERROR_KEYS = {
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
  UNKNOWN_SKIN: "host.personalization.unknownSkin",
};

/** tr() guarded: returns the key itself when no translator is available. */
function safeTr(tr, key, params) {
  if (typeof tr !== "function") return key;
  const text = tr(key, params);
  return typeof text === "string" ? text : key;
}

/**
 * Localize a Host-reported error. The Host attaches a stable `code` (and
 * optional `params`) to every user-facing error and keeps a zh fallback
 * message; when the code maps to a dictionary key the localized template
 * wins, otherwise the localized unknown-error template names the code —
 * the raw Host text is never user-visible while a code is present. Plain
 * strings and Error shapes that never went through the Host fence keep
 * their own (already client-side) text.
 */
export function resolveHostErrorText(value, tr) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  const params = value.params ?? {};
  const key = value.code === undefined ? undefined : HOST_ERROR_KEYS[value.code];
  if (value.code !== undefined) {
    const template = key ?? "host.personalization.unknownError";
    const text = safeTr(tr, template, key === undefined ? { ...params, code: value.code } : params);
    if (text !== template) return text;
  }
  return value.text ?? value.message ?? String(value);
}
