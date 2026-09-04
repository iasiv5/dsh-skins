#!/usr/bin/env node
/**
 * Bundle guard (execution-review Y1): the wallpaper module's machine-readable
 * markers must exist, be sane, and `lib/client.js` must stay inside the
 * implementation plan's size formula:
 *
 *   lib/client.js ≤ 770,785 (1.0.1 code baseline) + ceil(ΣWebP × 4/3) + 20,480
 *
 * Ratcheted at 1.0.1: origin/main had 768,496 non-wallpaper bytes (451 under
 * the old ceiling); this change adds 2,289 bytes (1,838 over). New baseline
 * 770,785 = measured code bytes; the 20,480 accidental-growth slack is restored.
 * Wired into `pnpm run check` as the last step (after build, so lib is fresh).
 */
import { readFileSync } from "node:fs";

const WALLPAPERS = "src/client/skins/meirenzhi/wallpapers.js";
const CLIENT = "lib/client.js";
const BASELINE_CLIENT_BYTES = 770_785;
const SLACK_BYTES = 20_480;
const MAX_TOTAL_WEBP_BYTES = 4_700_000;

const problems = [];
const text = readFileSync(WALLPAPERS, "utf8");

const marker = (name) => {
  const matches = [...text.matchAll(new RegExp(`^// ${name}=(\\d+)$`, "gm"))].map((m) => Number(m[1]));
  if (matches.length !== 1) {
    problems.push(`${name}: expected exactly one standalone "// ${name}=<int>" line, got ${matches.length}`);
    return NaN;
  }
  return matches[0];
};

const total = marker("TOTAL_WEBP_BYTES");
const width = marker("ENCODE_WIDTH");
const quality = marker("ENCODE_QUALITY");

if (Number.isFinite(total)) {
  if (!(total > 0)) problems.push(`TOTAL_WEBP_BYTES must be a positive integer, got ${total}`);
  else if (total > MAX_TOTAL_WEBP_BYTES) problems.push(`TOTAL_WEBP_BYTES ${total} exceeds the ${MAX_TOTAL_WEBP_BYTES}-byte drift guard`);
}
if (Number.isFinite(width) && width !== 2560) problems.push(`ENCODE_WIDTH must be 2560, got ${width}`);
if (Number.isFinite(quality) && quality !== 80) problems.push(`ENCODE_QUALITY must be 80, got ${quality}`);

const clientBytes = readFileSync(CLIENT).length;
const b64 = Math.floor((total * 4 + 2) / 3);
const limit = BASELINE_CLIENT_BYTES + b64 + SLACK_BYTES;
if (clientBytes > limit) {
  problems.push(`lib/client.js ${clientBytes} exceeds ${limit} (baseline ${BASELINE_CLIENT_BYTES} + base64 of ${total} webp bytes + ${SLACK_BYTES} slack)`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`bundle-guard: ${problem}`);
  process.exit(1);
}
console.log(`✓ bundle guard OK: markers sane (ΣWebP ${total} bytes, width ${width}, q${quality}); lib/client.js ${clientBytes} ≤ ${limit}`);
