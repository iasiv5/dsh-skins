/**
 * Generator failure-hygiene tests (execution-review Y2): the wallpaper build
 * script must never leak its mkdtemp work dir or same-dir temp output — not
 * on single-image drift-guard failure, not on total-guard failure — and its
 * success path must emit the machine-readable markers as standalone lines.
 *
 * The tests shim ffmpeg/ffprobe through PATH, so no real media tooling (and
 * no real wallpaper sources) is needed: fixture JPEGs are arbitrary bytes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const SCRIPT = resolve("scripts/build-meirenzhi-wallpapers.mjs");
const SOURCES = [
  "001.jpg",
  "005慕沛灵.jpg", "006紫灵.jpg", "007南宫婉.jpg", "008南宫阙.jpg",
  "009银月.jpg",
];

function makeWorkspace(t) {
  const root = mkdtempSync(join(tmpdir(), "mrz-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // Fixture sources: the script only checks existence + hashes the bytes.
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  for (const name of SOURCES) writeFileSync(join(srcDir, name), `jpeg-bytes-${name}`);

  // ffmpeg/ffprobe shims as plain Node scripts, invoked through the script's
  // FFMPEG_BIN/FFPROBE_BIN JSON seam (["node", shim]) — no shebang, exec bit
  // or PATH rewriting needed, so the fixture is hermetic on every OS.
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const ffmpegShim = join(binDir, "ffmpeg-shim.mjs");
  writeFileSync(ffmpegShim, `import fs from "node:fs";
const out = process.argv[process.argv.length - 1];
fs.writeFileSync(out, Buffer.alloc(Number(process.env.FAKE_WEBP_BYTES), 7));
`);
  const ffprobeShim = join(binDir, "ffprobe-shim.mjs");
  writeFileSync(ffprobeShim, `console.log("2560x1440");
`);

  // Controlled temp dir (TMPDIR plus the Windows TEMP/TMP aliases) so the
  // test can prove no mrz-wallpapers-* dir leaks.
  const controlledTmp = join(root, "tmp");
  mkdirSync(controlledTmp, { recursive: true });

  return {
    srcDir,
    ffmpegBin: JSON.stringify([process.execPath, ffmpegShim]),
    ffprobeBin: JSON.stringify([process.execPath, ffprobeShim]),
    controlledTmp,
    outPath: join(root, "wallpapers.js"),
    assetsDir: join(root, "assets"),
  };
}

function runBuilder({ srcDir, ffmpegBin, ffprobeBin, controlledTmp, outPath, assetsDir }, fakeBytes) {
  return spawnSync(process.execPath, [SCRIPT, "--src", srcDir, "--out", outPath, "--assets", assetsDir], {
    encoding: "utf8",
    env: {
      ...process.env,
      FFMPEG_BIN: ffmpegBin,
      FFPROBE_BIN: ffprobeBin,
      TMPDIR: controlledTmp,
      TEMP: controlledTmp,
      TMP: controlledTmp,
      FAKE_WEBP_BYTES: String(fakeBytes),
    },
  });
}

function leakedWorkDirs(controlledTmp) {
  return readdirSync(controlledTmp).filter((name) => name.startsWith("mrz-wallpapers-"));
}

test("single-image drift guard fails cleanly: no temp work dir, no half-written output", (t) => {
  const ws = makeWorkspace(t);
  const result = runBuilder(ws, 640_001); // just over the 640,000 single-image guard

  assert.equal(result.status, 1, "exit code must be 1");
  assert.ok(result.stderr.includes("drift guard"), "stderr must explain the drift guard");
  assert.deepEqual(leakedWorkDirs(ws.controlledTmp), [], "mkdtemp work dir must be cleaned up on failure");
  assert.equal(existsSync(ws.outPath), false, "failure must not leave an output file");
});

test("total drift guard fails cleanly: no temp work dir, sentinel output untouched", (t) => {
  const ws = makeWorkspace(t);
  writeFileSync(ws.outPath, "SENTINEL"); // an existing module must never be touched
  const result = runBuilder(ws, 600_000); // 6 × 600,000 = 3.6M > the 2.3M total guard

  assert.equal(result.status, 1, "exit code must be 1");
  assert.ok(result.stderr.includes("drift guard"), "stderr must explain the drift guard");
  assert.deepEqual(leakedWorkDirs(ws.controlledTmp), [], "mkdtemp work dir must be cleaned up on failure");
  assert.equal(readFileSync(ws.outPath, "utf8"), "SENTINEL", "existing output must not be truncated or replaced");
});

test("success path emits webp files + URL-table module + manifest (ADR-0023)", (t) => {
  const ws = makeWorkspace(t);
  const result = runBuilder(ws, 100_000); // 6 × 100,000 = 600,000, inside both guards

  assert.equal(result.status, 0, "exit code must be 0");

  // Module: URL table — imports the helper, zero inline data, zero markers.
  const text = readFileSync(ws.outPath, "utf8");
  assert.ok(text.includes(`import { builtinAssetUrl } from "../builtin-assets.js";`), "imports the URL helper");
  assert.equal(text.includes("data:image"), false, "no inline data URLs");
  assert.equal(/^\/\/ TOTAL_WEBP_BYTES=/m.test(text), false, "old marker lines are gone (guards moved to manifest)");
  const urlLines = [...text.matchAll(/^export const WALLPAPER_[A-Z]+ = builtinAssetUrl\("meirenzhi", "[a-z]+"\);$/gm)];
  assert.equal(urlLines.length, 6, "six wallpaper URL exports");
  assert.ok(text.includes("Per-image provenance"), "provenance header preserved");
  assert.ok(text.includes("TOTAL        600000 bytes"), "provenance total preserved");

  // Assets: six webp files with the shim's exact bytes.
  const keys = ["yuntai", "mupeiling", "ziling", "nangongwan", "nangongque", "yinyue"];
  const skinDir = join(ws.assetsDir, "meirenzhi");
  for (const key of keys) {
    const bytes = readFileSync(join(skinDir, `b_meirenzhi_${key}.webp`));
    assert.equal(bytes.length, 100_000, `b_meirenzhi_${key}.webp byte count`);
    assert.ok(bytes.every((b) => b === 7), `b_meirenzhi_${key}.webp shim payload`);
  }

  // Manifest: six entries, sha256 over the shim payload.
  const manifest = JSON.parse(readFileSync(join(ws.assetsDir, "manifest.json"), "utf8"));
  const mrz = manifest.entries.filter((entry) => entry.skinId === "meirenzhi");
  assert.equal(mrz.length, 6, "six manifest entries");
  const sha = createHash("sha256").update(Buffer.alloc(100_000, 7)).digest("hex");
  for (const entry of mrz) {
    assert.equal(entry.bytes, 100_000, `manifest bytes for ${entry.assetKey}`);
    assert.equal(entry.sha256, sha, `manifest sha256 for ${entry.assetKey}`);
    assert.equal(entry.mime, "image/webp", `manifest mime for ${entry.assetKey}`);
  }

  assert.deepEqual(leakedWorkDirs(ws.controlledTmp), [], "success must clean up the temp work dir too");
});
