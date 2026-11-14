#!/usr/bin/env node
// 内置壁纸分区亮度统计采集（ADR-0027 Task 2；门禁 verify:contrast 的唯一壁纸数据源）。
//
// 方法：参考视口 1912×948，每张内置壁纸按 cover-fit 居中裁切（整数源偏移）绘入 canvas，
//   对各分区取 WCAG 相对亮度像素分布的 p50/p95（最近邻秩，4 位小数）。
// 分区（计划门禁口径）：web sidebar_strip/hero_band/composer_area；
//   desktop hero_band/composer_area 同 y 带映到 x0.175–1.0。
// 数据源（写死，本脚本自证）：
//   meirenzhi      assets/meirenzhi/b_meirenzhi_<id>.webp（ADR-0023 外置，6 张）
//   uefi-harness   assets/uefi-harness/b_uefi-harness_art.webp（1 张）
//   openbmc-harness src/client/skins/openbmc-harness/background-art.js #BACKGROUND_ART（内联 data URL）
// 确定性：同机同浏览器重跑输出逐字节一致（fixtures/wallpaper-luminance.json 提交入库；
//   判据自证：`--check` 对已提交文件重算比对——改任一数值或壁纸字节 → 红（报 sha/数值失配）→ 还原 → 绿）。
// 用法：node scripts/capture-wallpaper-stats.mjs            # 重算并写 fixture
//       node scripts/capture-wallpaper-stats.mjs --check    # 重算并与已提交 fixture 比对（不写）
// 退出码：0 一致；1 失配/缺文件；2 采集异常。console 输出经外层 tee 落执行日志。
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "scripts", "fixtures", "wallpaper-luminance.json");
const VW = 1912, VH = 948;
const CHECK = process.argv.includes("--check");

const REGIONS = {
  web: {
    sidebar_strip: { x0: 0.015, y0: 0.165, x1: 0.115, y1: 0.345 },
    hero_band: { x0: 0.48, y0: 0.36, x1: 0.68, y1: 0.41 },
    composer_area: { x0: 0.36, y0: 0.425, x1: 0.72, y1: 0.535 },
  },
  desktop: {
    hero_band: { x0: 0.175, y0: 0.36, x1: 1.0, y1: 0.41 },
    composer_area: { x0: 0.175, y0: 0.425, x1: 1.0, y1: 0.535 },
  },
};

const r4 = (v) => Math.round(v * 10000) / 10000;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ---- 壁纸枚举（固定顺序 = skin 字典序 + id 字典序）----
async function enumerateWallpapers() {
  const list = [];
  const mrzDir = join(ROOT, "assets", "meirenzhi");
  for (const f of readdirSync(mrzDir).filter((f) => f.endsWith(".webp")).sort()) {
    const id = f.replace(/^b_meirenzhi_/, "").replace(/\.webp$/, "");
    const buf = readFileSync(join(mrzDir, f));
    list.push({ key: `meirenzhi:${id}`, source: `assets/meirenzhi/${f}`, bytes: buf });
  }
  const uefiPath = join(ROOT, "assets", "uefi-harness", "b_uefi-harness_art.webp");
  if (!existsSync(uefiPath)) throw new Error("fixture source missing: uefi-harness art");
  list.push({ key: "uefi-harness:art", source: "assets/uefi-harness/b_uefi-harness_art.webp", bytes: readFileSync(uefiPath) });
  // openbmc：内联 data URL 经模块 import 取真值（拼接串正则易漏段）
  const { BACKGROUND_ART } = await import(join(ROOT, "src", "client", "skins", "openbmc-harness", "background-art.js"));
  if (typeof BACKGROUND_ART !== "string" || !BACKGROUND_ART.startsWith("data:image/webp;base64,")) {
    throw new Error("openbmc BACKGROUND_ART is not an inline webp data URL — script assumption broken, stop");
  }
  const b64 = BACKGROUND_ART.slice("data:image/webp;base64,".length);
  list.push({ key: "openbmc-harness:art", source: "src/client/skins/openbmc-harness/background-art.js#BACKGROUND_ART", bytes: Buffer.from(b64, "base64") });
  list.sort((a, b) => (a.key < b.key ? -1 : 1));
  return list;
}

// ---- 页内采集（cover-fit + 分区 p50/p95）----
const pageFn = async ({ dataUrl, regions, vw, vh }) => {
  const wcagLum = (r, g, b) => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("image decode failed")); img.src = dataUrl; });
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(vw / iw, vh / ih);
  // 整数源偏移（确定性裁切）：源上取整窗，绘满视口
  const sw = Math.round(vw / scale), sh = Math.round(vh / scale);
  const sx = Math.floor((iw - sw) / 2), sy = Math.floor((ih - sh) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, vw, vh);
  const out = { width: iw, height: ih };
  for (const [profile, defs] of Object.entries(regions)) {
    out[profile] = {};
    for (const [name, r] of Object.entries(defs)) {
      const x = Math.round(r.x0 * vw), y = Math.round(r.y0 * vh);
      const w = Math.round((r.x1 - r.x0) * vw), h = Math.round((r.y1 - r.y0) * vh);
      const data = ctx.getImageData(x, y, w, h).data;
      const lums = new Float64Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        lums[p] = wcagLum(data[i], data[i + 1], data[i + 2]);
      }
      const sorted = Float64Array.prototype.sort.call(lums);
      const pick = (q) => Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] * 10000) / 10000;
      out[profile][name] = { p50: pick(0.5), p95: pick(0.95) };
    }
  }
  return out;
};

const main = async () => {
  const wallpapers = await enumerateWallpapers();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  await page.goto("about:blank");
  const entries = {};
  for (const wp of wallpapers) {
    const dataUrl = `data:image/webp;base64,${wp.bytes.toString("base64")}`;
    const stats = await page.evaluate(pageFn, { dataUrl, regions: REGIONS, vw: VW, vh: VH });
    entries[wp.key] = {
      source: wp.source,
      sha256: sha256(wp.bytes),
      bytes: wp.bytes.length,
      width: stats.width,
      height: stats.height,
      web: stats.web,
      desktop: stats.desktop,
    };
    console.log(`captured ${wp.key} (${stats.width}x${stats.height}, ${wp.bytes.length}B)`);
  }
  await browser.close();
  const fixture = {
    meta: {
      viewport: [VW, VH],
      luminance: "wcag-relative",
      rounding: 4,
      coverFit: "center-crop, integer source offsets (floor)",
      percentile: "nearest-rank",
      regions: REGIONS,
    },
    wallpapers: entries,
  };
  const text = JSON.stringify(fixture, null, 2) + "\n";
  if (CHECK) {
    if (!existsSync(FIXTURE)) { console.error(`CHECK FAIL: fixture missing: ${FIXTURE}`); process.exit(1); }
    const committed = readFileSync(FIXTURE, "utf8");
    if (committed === text) { console.log("CHECK OK: recomputed fixture is byte-identical"); process.exit(0); }
    // 逐键定位失配（sha 或数值）
    try {
      const a = JSON.parse(committed), b = JSON.parse(text);
      const diffs = [];
      const walk = (x, y, path) => {
        if (path.split(".").includes("sha256")) {
          if (x !== y) diffs.push(`${path}: sha ${x} -> ${y}（壁纸字节漂移）`);
          return;
        }
        if (typeof x === "number" && typeof y === "number") { if (x !== y) diffs.push(`${path}: ${x} -> ${y}`); return; }
        if (x && y && typeof x === "object" && typeof y === "object") {
          for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
        } else if (x !== y) diffs.push(`${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
      };
      walk(a, b, "fixture");
      console.error(`CHECK FAIL: ${diffs.length} mismatch(es)`);
      for (const d of diffs.slice(0, 20)) console.error("  " + d);
    } catch (e) {
      console.error(`CHECK FAIL: fixture unparseable or structure diff: ${String(e).slice(0, 160)}`);
    }
    process.exit(1);
  }
  writeFileSync(FIXTURE, text);
  console.log(`FIXTURE OK: ${Object.keys(entries).length} wallpapers -> ${FIXTURE}`);
};

main().catch((e) => { console.error(`CAPTURE ERROR: ${String(e).slice(0, 300)}`); process.exit(2); });
