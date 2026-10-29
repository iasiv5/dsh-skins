/**
 * paint-metrics contract: the PNG decoder and luminance metrics shared by
 * both live-host repro gates (ADR-0021). The decoder bugs of 2026-10-30
 * (wrong magic constant, Average-filter formula, chunk stride, RGBA stride)
 * are each pinned here with hand-computed golden bytes — a fresh private
 * copy of the decoder must never be created again; import this module.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { countBrightPixels, decodePng, edgeActivity, lum } from "../scripts/lib/paint-metrics.mjs";

// ---- minimal PNG writer (no deps): hand-rolled CRC32 keeps the test free of
// Node zlib.crc32 version floors. -------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngFromRows(colorType, rows) {
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const width = (rows[0].length - 1) / channels; // row = filter byte + width*channels
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[12] = 0; // non-interlaced
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// One bright (200,200,200) + one dark (10,10,10) pixel per row, RGB. Golden
// delta bytes below are hand-computed per filter type:
//   f0 None    : raw = value
//   f1 Sub     : x0 delta = 200; x1 delta = (10-200)&0xff = 66
//   f2 Up      : up row == this row → both deltas 0
//   f3 Average : x0 pred=floor((0+200)/2)=100 → delta 100;
//                x1 pred=floor((200+10)/2)=105 → (10-105)&0xff = 161
//   f4 Paeth   : x0 a=0,b=200,c=0 → pred=b=200 → delta 0;
//                x1 a=200,b=10,c=200 → pa=190,pb=0,pc=190 → pred=b=10 → delta 0
const BRIGHT = [200, 200, 200];
const DARK = [10, 10, 10];
const RGB_FILTER_ROWS = [
  Buffer.from([0, ...BRIGHT, ...DARK]),
  Buffer.from([1, ...BRIGHT, ...DARK.map((v) => (v - 200) & 0xff)]),
  Buffer.from([2, 0, 0, 0, 0, 0, 0]),
  Buffer.from([3, 100, 100, 100, 161, 161, 161]),
  Buffer.from([4, 0, 0, 0, 0, 0, 0]),
];

test("decodePng: all five filter types decode to identical pixels (RGB)", () => {
  const image = decodePng(pngFromRows(2, RGB_FILTER_ROWS));
  assert.equal(image.width, 2);
  assert.equal(image.height, 5);
  for (let y = 0; y < 5; y += 1) {
    const o = y * 2 * 4;
    assert.deepEqual([...image.data.slice(o, o + 4)], [...BRIGHT, 255], `row ${y} bright pixel`);
    assert.deepEqual([...image.data.slice(o + 4, o + 8)], [...DARK, 255], `row ${y} dark pixel`);
  }
});

test("decodePng: RGBA rows keep per-pixel alpha; bright count ignores alpha (matches every gate verdict)", () => {
  const image = decodePng(pngFromRows(6, [Buffer.from([0, ...BRIGHT, 255]), Buffer.from([0, ...DARK, 128])]));
  assert.equal(image.data[3], 255);
  assert.equal(image.data[7], 128);
  assert.equal(countBrightPixels(image), 1);
});

test("decodePng: gray (colorType 0) expands to opaque RGB", () => {
  const image = decodePng(pngFromRows(0, [Buffer.from([0, 200])]));
  assert.deepEqual([...image.data], [200, 200, 200, 255]);
  assert.equal(countBrightPixels(image), 1);
});

test("countBrightPixels: default threshold 60 separates the gates' bright/dark constants", () => {
  assert.equal(countBrightPixels({ width: 2, height: 1, data: Buffer.from([...BRIGHT, 255, ...DARK, 255]) }), 1);
  assert.equal(lum(...DARK) <= 60, true);
  assert.equal(lum(...BRIGHT) > 60, true);
});

test("edgeActivity: one bright→dark column edge inside the margins counts once per inner row", () => {
  const width = 12;
  const height = 12;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const v = x < 6 ? 255 : 0;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  // Inner loop rows y=4..7 and columns x=4..6 → exactly one transition (x=5→6) per row.
  assert.equal(edgeActivity({ width, height, data }), 4);
});

test("decodePng: rejects non-PNG bytes loudly", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG/);
});
