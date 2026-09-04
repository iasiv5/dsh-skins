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
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  // ffmpeg/ffprobe shims: ffmpeg writes `fakeBytes` of filler to its last arg
  // (the output path); ffprobe prints a fixed WIDTHxHEIGHT pair.
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const ffmpeg = join(binDir, "ffmpeg");
  writeFileSync(ffmpeg, `#!/usr/bin/env node
const fs = require("node:fs");
const out = process.argv[process.argv.length - 1];
fs.writeFileSync(out, Buffer.alloc(Number(process.env.FAKE_WEBP_BYTES), 7));
`);
  const ffprobe = join(binDir, "ffprobe");
  writeFileSync(ffprobe, `#!/usr/bin/env node
console.log("2560x1440");
`);
  chmodSync(ffmpeg, 0o755);
  chmodSync(ffprobe, 0o755);

  // Controlled TMPDIR so the test can prove no mrz-wallpapers-* dir leaks.
  const controlledTmp = join(root, "tmp");
  mkdirSync(controlledTmp, { recursive: true });

  return { srcDir, binDir, controlledTmp, outPath: join(root, "wallpapers.js") };
}

function runBuilder({ srcDir, binDir, controlledTmp, outPath }, fakeBytes) {
  return spawnSync(process.execPath, [SCRIPT, "--src", srcDir, "--out", outPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      TMPDIR: controlledTmp,
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

test("success path writes the module with standalone machine-readable markers", (t) => {
  const ws = makeWorkspace(t);
  const result = runBuilder(ws, 100_000); // 6 × 100,000 = 600,000, inside both guards

  assert.equal(result.status, 0, "exit code must be 0");
  const text = readFileSync(ws.outPath, "utf8");
  const total = [...text.matchAll(/^\/\/ TOTAL_WEBP_BYTES=(\d+)$/gm)].map((m) => Number(m[1]));
  assert.deepEqual(total, [600_000], "exactly one standalone TOTAL_WEBP_BYTES marker");
  assert.ok(/^\/\/ ENCODE_WIDTH=2560$/m.test(text), "standalone ENCODE_WIDTH marker");
  assert.ok(/^\/\/ ENCODE_QUALITY=80$/m.test(text), "standalone ENCODE_QUALITY marker");
  assert.deepEqual(leakedWorkDirs(ws.controlledTmp), [], "success must clean up the temp work dir too");
});
