import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPersonalizationStore } from "../src/host/personalization/store.js";

// Write audit log: every committed state change appends one JSON line to
// <dataDir>/audit.jsonl (source, revisions, field diff, library ids). The log is
// best-effort — it must never block or fail a committed write — and it rotates
// to audit.jsonl.1 past its size cap.

function tempDir() {
  return mkdtempSync(join(tmpdir(), "dsh-skins-audit-"));
}

function makeStore(dir, options = {}) {
  return createPersonalizationStore({ dataDir: dir, profile: "web", ...options });
}

function pngBytes(width = 10, height = 10, padding = 0) {
  const header = Buffer.alloc(24);
  header.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.alloc(padding)]);
}

function auditLines(dir) {
  const file = join(dir, "audit.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function setOverride(store, skinId, key, value) {
  await store.applyOperations({
    baseRevision: store.snapshot().revision,
    operations: [{ op: "set", skinId, key, value }],
  });
}

test("each committed field write appends one audit line with its source, revisions and field diff", async () => {
  const dir = tempDir();
  const store = makeStore(dir);
  await setOverride(store, "meirenzhi", "panelOpacity", 55);
  await setOverride(store, "meirenzhi", "panelOpacity", 60);
  const lines = auditLines(dir);
  assert.deepEqual(lines.map((line) => line.source), ["install", "operations", "operations"]);
  const last = lines[2];
  assert.equal(last.prevRevision, 1);
  assert.equal(last.revision, 2);
  assert.deepEqual(last.ops, ["set"]);
  assert.deepEqual(last.skins, [{ skin: "meirenzhi", key: "panelOpacity", from: 55, to: 60 }]);
  assert.deepEqual(last.libraryAdded, []);
  assert.deepEqual(last.libraryRemoved, []);
  assert.equal(typeof last.ts, "string");
});

test("uploads and deletes are audited with the library ids they touch", async () => {
  const dir = tempDir();
  const store = makeStore(dir);
  const { asset } = await store.uploadAsset(pngBytes(64, 64, 512), { displayName: "wall" });
  await store.deleteAsset(asset.id);
  const lines = auditLines(dir);
  const upload = lines.find((line) => line.source === "upload");
  const remove = lines.find((line) => line.source === "delete");
  assert.deepEqual(upload.libraryAdded, [asset.id]);
  assert.deepEqual(remove.libraryRemoved, [asset.id]);
  assert.equal(JSON.stringify(lines).includes("wall"), false, "display names are not written to the audit log");
});

test("normalization records the invalid value it removed, with the revision it advanced", async () => {
  const dir = tempDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({
    configVersion: 1,
    revision: 5,
    skins: { meirenzhi: { wallpaper: "builtin:meirenzhi:nope" } },
    library: {},
  }));
  const store = makeStore(dir);
  store.snapshot();
  const normalize = auditLines(dir).find((line) => line.source === "normalize");
  assert.ok(normalize, "normalization commit is audited");
  assert.equal(normalize.prevRevision, 5);
  assert.equal(normalize.revision, 6);
  assert.deepEqual(normalize.skins, [{ skin: "meirenzhi", key: "wallpaper", from: "builtin:meirenzhi:nope", to: null }]);
});

test("audit failures never block the committed write", async () => {
  const dir = tempDir();
  const store = makeStore(dir);
  mkdirSync(join(dir, "audit.jsonl")); // a directory where the log file should be: every append fails
  await setOverride(store, "meirenzhi", "panelOpacity", 42);
  const snapshot = store.snapshot();
  assert.equal(snapshot.skins.meirenzhi.panelOpacity, 42);
  assert.equal(snapshot.revision, 1);
});

test("the audit log rotates to audit.jsonl.1 once it passes its size cap", async () => {
  const dir = tempDir();
  const store = makeStore(dir, { auditMaxBytes: 200 });
  for (let value = 11; value <= 16; value += 1) await setOverride(store, "meirenzhi", "panelOpacity", value);
  assert.ok(existsSync(join(dir, "audit.jsonl.1")), "rotated file exists");
  assert.ok(statSync(join(dir, "audit.jsonl")).size < 200 + 400, "the active log restarted after rotation");
});
