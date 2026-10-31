#!/usr/bin/env node
/**
 * Bundle guard (ADR-0023改形): assets can never enter the client bundle.
 *
 * History: through 1.5.21 this guard enforced a GROWTH formula —
 *   lib/client.js ≤ 776,360 (code baseline, ratcheted at 1.0.1 → 770,785 and
 *   1.2.3 → 776,360) + ceil(ΣWebP × 4/3) + 20,480 slack
 * blessing a bundle that tracked the wallpaper total (3,375,471 bytes at
 * 1.5.21, 94.4% inline image data). ADR-0023 externalized the non-factory
 * artwork to assets/ + the host asset route, so the ceiling becomes FIXED:
 *
 *   1. lib/client.js ≤ 351,737 (= 331,257 measured at the 1.5.22 externalized
 *      build + 20,480 accidental-growth slack; ratchet down with future
 *      shrinkage, never up for asset reasons — assets belong in assets/).
 *   2. No single line may exceed 150,000 bytes (the inline openbmc art line
 *      is ~139,458; a mega-string regression trips this before the ceiling).
 *   3. assets/manifest.json drift checks: unique entries, files exist and
 *      match their declared bytes, per-file sha256 recomputed over the actual
 *      bytes (content-level — same-length tampering is detectable), single
 *      file ≤ 640,000, meirenzhi total ≤ 2,300,000 (plan-B guardrails,
 *      values inherited verbatim from build-meirenzhi-wallpapers.mjs), the
 *      uefi art pinned to the literal golden below (three-way: recomputed vs
 *      manifest vs this literal), and no factory-skin (openbmc) entries —
 *      the factory skin's default art stays inline (ADR-0023 Decision 2).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT = "lib/client.js";
const MANIFEST = "assets/manifest.json";
const ASSETS_DIR = "assets";
const MAX_CLIENT_BYTES = 351_737;
const MAX_LINE_BYTES = 150_000;
const MAX_SINGLE_WEBP_BYTES = 640_000;
const MAX_MEIRENZHI_TOTAL_BYTES = 2_300_000;
// Golden pin for the one hand-migrated asset (Task 4 of the ADR-0023 plan):
// lives HERE, in guard source — a manifest-vs-manifest comparison would be
// tautological.
const UEFI_ART_SHA256 = "5b4509ce32e5f7b90a1e8456ed1f8aee257c1b629d23b05b6d8d3129b97ce006";

const problems = [];

const clientBytes = readFileSync(CLIENT).length;
if (clientBytes > MAX_CLIENT_BYTES) {
  problems.push(`lib/client.js ${clientBytes} exceeds the fixed ceiling ${MAX_CLIENT_BYTES} (asset bytes belong in assets/, not the bundle)`);
}

let longest = 0;
let longestLine = 0;
const lines = readFileSync(CLIENT, "utf8").split("\n");
for (let index = 0; index < lines.length; index += 1) {
  if (lines[index].length > longest) {
    longest = lines[index].length;
    longestLine = index + 1;
  }
}
if (longest > MAX_LINE_BYTES) {
  problems.push(`lib/client.js line ${longestLine} is ${longest} bytes (>${MAX_LINE_BYTES}) — inline mega-string regression`);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const seen = new Set();
const totals = new Map();
for (const entry of manifest.entries ?? []) {
  const id = `${entry.skinId}:${entry.assetKey}`;
  if (seen.has(id)) {
    problems.push(`manifest: duplicate entry ${id}`);
    continue;
  }
  seen.add(id);
  if (entry.skinId === "openbmc") {
    problems.push(`manifest: factory-skin entry ${id} must stay inline (ADR-0023 Decision 2)`);
  }
  let buffer;
  try {
    buffer = readFileSync(`${ASSETS_DIR}/${entry.file}`);
  } catch {
    problems.push(`manifest: file missing for ${id}: assets/${entry.file}`);
    continue;
  }
  if (buffer.length !== entry.bytes) {
    problems.push(`manifest: bytes mismatch for ${id}: file ${buffer.length} !== manifest ${entry.bytes}`);
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (sha256 !== entry.sha256) {
    problems.push(`manifest: sha256 mismatch for ${id} (content-level check)`);
  }
  if (entry.bytes > MAX_SINGLE_WEBP_BYTES) {
    problems.push(`manifest: ${id} is ${entry.bytes} bytes (> ${MAX_SINGLE_WEBP_BYTES} single-file guard)`);
  }
  if (entry.skinId === "meirenzhi") {
    totals.set(entry.skinId, (totals.get(entry.skinId) ?? 0) + entry.bytes);
  }
  if (id === "uefi-harness:art" && sha256 !== UEFI_ART_SHA256) {
    problems.push(`manifest: uefi art sha256 ${sha256} !== golden pin ${UEFI_ART_SHA256}`);
  }
}
const mrzTotal = totals.get("meirenzhi") ?? 0;
if (mrzTotal > MAX_MEIRENZHI_TOTAL_BYTES) {
  problems.push(`manifest: meirenzhi total ${mrzTotal} exceeds the ${MAX_MEIRENZHI_TOTAL_BYTES}-byte guard`);
}
if (!seen.has("uefi-harness:art")) {
  problems.push("manifest: uefi-harness:art entry missing (golden pin has nothing to guard)");
}

// Reverse drift check (ADR-0023 review R-1): the forward pass above is
// entry-driven — an asset file on disk WITHOUT a manifest entry would never
// be inspected (dropped from delivery, silently unguarded). Walk the assets
// tree and require every b_*.webp to be registered; factory-skin files are
// reported with the inline-rule reason.
const BUILTIN_FILE_PATTERN = /^b_([a-z0-9][a-z0-9-]*)_([a-z0-9][a-z0-9-]*)\.webp$/;
const registeredFiles = new Set([...seen].map((id) => {
  const [skinId, assetKey] = id.split(":");
  return `b_${skinId}_${assetKey}.webp`;
}));
const walkAssets = (dir) => {
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) walkAssets(full);
    else if (BUILTIN_FILE_PATTERN.test(dirent.name)) {
      const factory = dirent.name.startsWith("b_openbmc_");
      if (!registeredFiles.has(dirent.name)) {
        problems.push(`assets: ${dirent.name} is not registered in ${MANIFEST}${factory ? " (factory-skin art must stay inline, ADR-0023 Decision 2)" : ""}`);
      }
    }
  }
};
walkAssets(ASSETS_DIR);

if (problems.length > 0) {
  for (const problem of problems) console.error(`bundle-guard: ${problem}`);
  process.exit(1);
}
console.log(
  `✓ bundle guard OK: lib/client.js ${clientBytes} ≤ ${MAX_CLIENT_BYTES} (longest line ${longest}); `
  + `manifest ${seen.size} entries, meirenzhi Σ ${mrzTotal} ≤ ${MAX_MEIRENZHI_TOTAL_BYTES}, uefi pin verified, assets tree fully registered`,
);
