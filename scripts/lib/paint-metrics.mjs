// paint-metrics.mjs — shared PNG decode + luminance metrics for the
// live-host repro gates (ADR-0021). Single source of truth: both gates used
// to carry private copies, and the 2026-10-30 fresh copy shipped three
// decoder bugs (wrong magic constant, Average-filter formula, chunk stride)
// that cost two debug runs before this module landed. Scope: 8-bit
// non-interlaced RGB / RGBA / Gray — the only shapes Chromium screenshots
// produce. Behavior contract pinned by tests/paint-metrics.test.mjs.
import { inflateSync } from "node:zlib";

export function decodePng(buffer) {
  const b = Buffer.from(buffer);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < b.length) {
    const length = b.readUInt32BE(offset);
    const type = b.toString("ascii", offset + 4, offset + 8);
    const data = b.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0) throw new Error("unsupported PNG (need 8-bit, non-interlaced)");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) throw new Error(`unsupported color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1);
    const filter = raw[base];
    const line = Buffer.from(raw.subarray(base + 1, base + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
      line[x] = value;
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (colorType === 2) {
        out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255;
      } else if (colorType === 6) {
        out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3];
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = line[x]; out[o + 3] = 255;
      } else {
        throw new Error(`unsupported color type ${colorType}`);
      }
    }
    previous = line;
  }
  return { width, height, data: out };
}

export const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Pixels brighter than the threshold (default 60 — the gates' verdict
 * constant; alpha is ignored, matching every verdict ever issued). */
export function countBrightPixels(image, threshold = 60) {
  let count = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const o = index * 4;
    if (lum(image.data[o], image.data[o + 1], image.data[o + 2]) > threshold) count += 1;
  }
  return count;
}

/** Icon-edge activity inside the strip (ADR-0021 detector #3): transitions
 * between neighboring pixels. Reviewer evidence on this exact regression:
 * healthy rail activity=166, broken=0 — the sharpest of the three signals
 * (brightness is theme-dependent; pixel diff misses icon-only loss on light
 * themes half the time). Inner margins skip the column border lines. */
export function edgeActivity(image) {
  let edges = 0;
  for (let y = 4; y < image.height - 4; y += 1) {
    for (let x = 4; x < image.width - 5; x += 1) {
      const o = (y * image.width + x) * 4;
      const o1 = o + 4;
      if (Math.abs(lum(image.data[o], image.data[o + 1], image.data[o + 2])
        - lum(image.data[o1], image.data[o1 + 1], image.data[o1 + 2])) > 16) edges += 1;
    }
  }
  return edges;
}
