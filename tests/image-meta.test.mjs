import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  detectImageMeta,
  extensionForMime,
} from "../src/host/personalization/image-meta.js";

/** Minimal 1×1 fixtures with valid headers (content need not decode). */
function png(bytes = 64) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR"),
    (() => { const b = Buffer.alloc(bytes); b.writeUInt32BE(1920, 0); b.writeUInt32BE(1080, 4); return b; })(),
  ]);
}

function gif() {
  const b = Buffer.alloc(10);
  b.write("GIF89a", 0, "latin1");
  b.writeUInt16LE(800, 6);
  b.writeUInt16LE(600, 8);
  return b;
}

function jpeg(sizes = []) {
  const parts = [Buffer.from([0xff, 0xd8])];
  // One APP0 segment first (length includes itself).
  parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]));
  // SOF0 marker with height/width payload.
  parts.push(Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x38, 0x07, 0x80]));
  if (sizes.length > 0) parts.push(Buffer.from(sizes));
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function webpVp8x(flags = 0x10) {
  const b = Buffer.alloc(34);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b[20] = flags;
  b.writeUIntLE(3839, 24, 3); // width-1 → 3840
  b.writeUIntLE(2159, 27, 3); // height-1 → 2160
  return b;
}

test("PNG signature and IHDR dimensions", () => {
  const meta = detectImageMeta(png());
  assert.deepEqual(meta, { mime: "image/png", width: 1920, height: 1080, animated: false });
});

test("GIF logical screen dimensions", () => {
  assert.deepEqual(detectImageMeta(gif()), { mime: "image/gif", width: 800, height: 600, animated: null });
});

test("JPEG SOF dimensions with a leading APP segment", () => {
  const meta = detectImageMeta(jpeg());
  assert.deepEqual(meta, { mime: "image/jpeg", width: 1920, height: 1080, animated: false });
});

test("WebP VP8X canvas size and animation flag", () => {
  const still = detectImageMeta(webpVp8x(0x10));
  assert.deepEqual(still, { mime: "image/webp", width: 3840, height: 2160, animated: false });
  const animated = detectImageMeta(webpVp8x(0x12));
  assert.equal(animated.animated, true);
});

test("WebP VP8L (lossless) dimensions", () => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(18, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8L", 12, "latin1");
  b.writeUInt32LE(6, 16);
  b[20] = 0x2f;
  const bits = ((1079 << 14) | 1919) >>> 0; // width-1=1919, height-1=1079
  b.writeUInt32LE(bits, 21);
  const meta = detectImageMeta(b);
  assert.deepEqual(meta, { mime: "image/webp", width: 1920, height: 1080, animated: false });
});

test("unsupported bytes, truncated buffers and svg are rejected", () => {
  assert.equal(detectImageMeta(Buffer.from("<svg xmlns=...")), null);
  assert.equal(detectImageMeta(Buffer.alloc(8)), null);
  assert.equal(detectImageMeta(Buffer.from("")), null);
  assert.equal(detectImageMeta("string"), null);
  // PNG magic but truncated before IHDR payload.
  assert.equal(detectImageMeta(png().subarray(0, 20)), null);
  // Randomized bytes after a JPEG SOI must not crash the walker.
  const junk = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40, 0xab)]);
  assert.equal(detectImageMeta(junk), null);
});

test("extension mapping", () => {
  assert.equal(extensionForMime("image/png"), "png");
  assert.equal(extensionForMime("image/jpeg"), "jpg");
  assert.equal(extensionForMime("image/webp"), "webp");
  assert.equal(extensionForMime("image/gif"), "gif");
  assert.equal(extensionForMime("image/svg+xml"), null);
});

// deflate import is intentionally exercised: keeps the dependency surface
// honest for future compressed fixtures (store-only ZIP rejects deflate).
test("deflate roundtrip sanity for test fixtures", () => {
  const original = Buffer.from("dsh-skins");
  assert.equal(deflateSync(original).length > 0, true);
});

test("WebP VP8 (simple lossy) start code sits after the 3-byte frame tag", () => {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8 ", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b[20] = 0x30; b[21] = 0x01; b[22] = 0x00; // frame tag
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; // start code
  b.writeUInt16LE(1920, 26);
  b.writeUInt16LE(1080, 28);
  assert.deepEqual(detectImageMeta(b), { mime: "image/webp", width: 1920, height: 1080, animated: false });
  // A start code at the WRONG offset (the old bug) must not validate.
  const shifted = Buffer.from(b);
  shifted[23] = 0; shifted[24] = 0; shifted[25] = 0;
  assert.equal(detectImageMeta(shifted), null);
});

test("zero dimensions and inconsistent containers are rejected", () => {
  const zero = png();
  zero.writeUInt32BE(0, 16);
  assert.equal(detectImageMeta(zero), null);
  const badIhdr = png();
  badIhdr.writeUInt32BE(99, 8); // IHDR length must be 13
  assert.equal(detectImageMeta(badIhdr), null);
  const badRiff = webpVp8x(0x10);
  badRiff.writeUInt32LE(10_000_000, 4); // RIFF size exceeds the buffer
  assert.equal(detectImageMeta(badRiff), null);
});
