/** Host error presentation — the stable Host error code → dictionary key map
 * plus the localized-text resolvers shared by the update panel and the
 * personalization panel. */

/**
 * Stable Host error code → dictionary key. Every user-facing Host error
 * carries `code` (and optionally `params`); the update panel renders the
 * localized template when the code is known and falls back to the Host's
 * message otherwise.
 */
export const HOST_ERROR_KEYS = {
  RESTART_UNAVAILABLE: "host.restart.unavailable",
  NO_PENDING_UPDATE: "host.restart.noPending",
  RESTART_SAFETY_UNKNOWN: "update.restart.unknown",
  AGENTS_RUNNING: "update.restart.blocked",
  UPDATE_LINK_PROTECTED: "host.update.linkProtected",
  UPDATE_SOURCE_UNSUPPORTED: "host.update.sourceUnsupported",
  UPDATE_ALREADY_LATEST: "host.update.alreadyLatest",
  UPDATE_SOURCE_CHANGED: "host.update.sourceChanged",
  UPDATE_COMMAND_FAILED: "host.update.commandFailed",
  UPDATE_COMMAND_TIMEOUT: "host.update.commandTimeout",
  REGISTRY_CHECK_FAILED: "host.registry.checkFailed",
  REGISTRY_NAME_MISMATCH: "host.registry.nameMismatch",
  REGISTRY_VERSION_INVALID: "host.registry.versionInvalid",
  REGISTRY_INTEGRITY_MISSING: "host.registry.integrityMissing",
  RELEASE_MANIFEST_MISSING: "host.release.manifestMissing",
  RELEASE_NAME_MISMATCH: "host.release.nameMismatch",
  RELEASE_VERSION_MISMATCH: "host.release.versionMismatch",
  RELEASE_REPOSITORY_MISMATCH: "host.release.repoMismatch",
  RELEASE_NOT_WEB_PLUGIN: "host.release.notWebPlugin",
  RELEASE_NO_BUNDLE_PATCH: "host.release.noBundlePatch",
  PROFILE_NOT_PINNED: "host.profile.notPinned",
  PROFILE_BUNDLE_MISSING: "host.profile.bundleMissing",
  ROLLBACK_LOCKFILE_MISMATCH: "host.rollback.lockfileMismatch",
  ROLLBACK_BUNDLE_MISSING: "host.rollback.bundleMissing",
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
 * wins, otherwise the raw Host text is shown unchanged. Accepts the plain
 * strings and Error shapes that never went through the Host fence.
 */
export function resolveHostErrorText(value, tr) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  const key = value.code === undefined ? undefined : HOST_ERROR_KEYS[value.code];
  if (key !== undefined) {
    const text = safeTr(tr, key, value.params ?? {});
    if (text !== key) return text;
  }
  return value.text ?? value.message ?? String(value);
}

/**
 * Localize a failed update operation's message, composing the automatic
 * rollback suffix (with its own nested code) when a rollback also failed.
 */
export function resolveFailedOperationText(operation, tr) {
  if (operation === null || operation === undefined) return "";
  const base = resolveHostErrorText({ code: operation.code, params: operation.params, text: operation.message }, tr);
  const rollback = operation.rollbackError;
  if (rollback === null || rollback === undefined) return base;
  const reason = resolveHostErrorText(rollback, tr);
  const suffix = safeTr(tr, "host.update.rollbackSuffix", { reason });
  return suffix === "host.update.rollbackSuffix"
    ? `${base}；自动回滚失败：${reason}`
    : base + suffix;
}
