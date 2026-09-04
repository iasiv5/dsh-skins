/**
 * Coded errors for everything the Host can report into the web UI.
 *
 * The Host has no reliable view of the browser's UI language, so instead of
 * guessing a locale it attaches a stable machine `code` (plus template
 * `params`) to every user-facing error and keeps a human-readable zh
 * `message` as the fallback for logs and non-UI consumers. The client maps
 * the code to a localized template via HOST_ERROR_KEYS (src/client/host-errors.js)
 * and falls back to the raw message for unknown codes.
 */

/**
 * Attach a stable code (and template params) to an error.
 * @param {string} code - stable machine code, e.g. "AGENTS_RUNNING".
 * @param {string|Error} message - fallback message, or an existing error to tag.
 * @param {Record<string, unknown>} [params] - template params for the client.
 * @returns {Error} the tagged error.
 */
export function codedError(code, message, params) {
  const error = message instanceof Error ? message : new Error(message);
  error.code = code;
  if (params !== undefined) error.params = params;
  return error;
}

/**
 * Serialize a caught error for an HTTP JSON error body, carrying `code` and
 * `params` through so the browser can localize the text.
 * @param {unknown} error - anything thrown.
 * @returns {{ error: string, code?: string, params?: Record<string, unknown> }}
 */
export function publicError(error) {
  const value = {
    error: error instanceof Error ? error.message : String(error),
  };
  if (error !== null && error !== undefined && error.code !== undefined) value.code = error.code;
  if (error !== null && error !== undefined && error.params !== undefined) value.params = error.params;
  return value;
}
