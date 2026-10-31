#!/usr/bin/env node
/**
 * Builds assets/manifest.json by scanning the assets tree for b_*.webp
 * files (ADR-0023 B3/B9).
 *
 * The manifest is the host's trusted-metadata source for builtin asset
 * serving (src/host/builtin-assets.js): filenames are re-derived into
 * skinId/assetKey via the strict b_ pattern, sha256/bytes are computed over
 * the actual file bytes, and any file belonging to a factory skin is a hard
 * failure — the factory skin's default artwork stays inline in the bundle
 * (ADR-0023 Decision 2).
 *
 * CLI:  node scripts/build-builtin-manifest.mjs [--assets <dir>]   (default: assets)
 * API:  writeManifest(assetsDir) — imported by build-meirenzhi-wallpapers.mjs
 *       so a wallpaper regeneration refreshes the manifest in the same run.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const BUILTIN_FILE_PATTERN = /^b_([a-z0-9][a-z0-9-]*)_([a-z0-9][a-z0-9-]*)\.webp$/;

// ADR-0023 Decision 2: factory skins' default visual assets stay INLINE in
// the client bundle. A b_ file for one of these skins means the rule was
// violated — fail closed instead of silently double-shipping.
const FACTORY_SKIN_IDS = new Set(["openbmc"]);

export function buildManifestEntries(assetsDir) {
  const entries = [];
  const walk = (dir) => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        walk(full);
      } else if (dirent.isFile()) {
        const match = BUILTIN_FILE_PATTERN.exec(dirent.name);
        if (match === null) continue;
        const [, skinId, assetKey] = match;
        if (FACTORY_SKIN_IDS.has(skinId)) {
          throw new Error(
            `builtin asset for factory skin "${skinId}" must stay inline (ADR-0023 Decision 2): ${dirent.name}`,
          );
        }
        const buffer = readFileSync(full);
        entries.push({
          skinId,
          assetKey,
          file: relative(assetsDir, full).split("\\").join("/"),
          mime: "image/webp",
          bytes: buffer.length,
          sha256: createHash("sha256").update(buffer).digest("hex"),
        });
      }
    }
  };
  walk(assetsDir);
  entries.sort((a, b) => `${a.skinId}:${a.assetKey}`.localeCompare(`${b.skinId}:${b.assetKey}`));
  return entries;
}

export function writeManifest(assetsDir) {
  const entries = buildManifestEntries(assetsDir);
  const out = join(assetsDir, "manifest.json");
  writeFileSync(out, `${JSON.stringify({ generator: "scripts/build-builtin-manifest.mjs", entries }, null, 2)}\n`);
  return { out, entries };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const assetsDir = resolve(args[args.indexOf("--assets") + 1] ?? "assets");
  const { out, entries } = writeManifest(assetsDir);
  const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`✓ manifest: ${entries.length} entries, ${total} bytes -> ${out}`);
}
