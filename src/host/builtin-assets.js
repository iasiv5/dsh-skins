/**
 * Builtin asset delivery (ADR-0023): the non-factory skins' bundled artwork
 * lives in the package's assets/ directory and is served over the same
 * /dsh-skins/assets/ prefix as user gallery uploads — one seam, two adapters.
 *
 * Trust discipline mirrors store.serveAsset: the request URL is stripped of
 * its query, the single segment after the prefix is matched against a strict
 * b_<skinId>_<assetKey>.webp pattern (character set aligned with
 * BUILTIN_REF_PATTERN — neither skin ids nor asset keys contain underscores,
 * so the split is unambiguous), and the file is located ONLY through the
 * shipped manifest (assets/manifest.json, generated at build time) — paths
 * are rebuilt from trusted metadata, never from raw request bytes.
 *
 * Fail-open (ADR-0023 Decision 6): any miss — unknown key, malformed shape,
 * manifest/file drift, unreadable file — returns null so the route 404s and
 * the client renders base colors + scrim, never a crash.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const BUILTIN_FILE_PATTERN = /^b_([a-z0-9][a-z0-9-]*)_([a-z0-9][a-z0-9-]*)\.webp$/;
const ASSETS_PREFIX_PATTERN = /\/dsh-skins\/assets\/([^/]+)$/;

export function createBuiltinAssetServer({ assetsDir, manifest }) {
  const byName = new Map();
  for (const entry of manifest?.entries ?? []) {
    const name = `b_${entry.skinId}_${entry.assetKey}.webp`;
    if (BUILTIN_FILE_PATTERN.test(name)) byName.set(name, entry);
  }
  return {
    serveBuiltinAsset(url) {
      if (typeof url !== "string") return null;
      const prefixMatch = ASSETS_PREFIX_PATTERN.exec(url.split("?")[0]);
      if (prefixMatch === null) return null;
      const entry = byName.get(prefixMatch[1]);
      if (entry === undefined) return null;
      // The requested filename must be exactly the manifest-declared file's
      // basename — a mismatch means manifest and assets drifted.
      if (entry.file.split("/").pop() !== prefixMatch[1]) return null;
      try {
        const buffer = readFileSync(join(assetsDir, entry.file));
        return { buffer, meta: { mime: entry.mime, byteLength: buffer.length, sha256: entry.sha256 } };
      } catch {
        return null;
      }
    },
  };
}
