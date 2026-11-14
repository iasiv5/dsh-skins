#!/usr/bin/env node
// verify:contrast — 文字对比度硬门禁（ADR-0027 D7 / Task 3）。
//
// 三类输入（计划「架构快照」口径）：
//   ① 数学独立重实现：本文件内的投影/合成/比值公式，禁 import src 公式代码；
//   ② 背景侧 = 三皮 SPEC 现值（import { SPEC }，Task 3 载体）+ Task 2 壁纸 fixture
//      （scripts/fixtures/wallpaper-luminance.json，含 sha256 防陈旧）；
//   ③ 文字侧 = TEXT_FLOOR 手抄金值表 + 阈值常量（本文件；手抄纪律同
//      tests/translucency-contract.test.mjs 头注先例，禁从被测代码生成）。
//
// 合成模型（sRGB 逐通道，自底向上；层栈与出处 = Task 1/活体取证实证，见
// .dsh-research/scratch/skins-contrast/exec-log.md「门禁合成模型研究」）：
//   boot 底 rgb(21,21,23)（#151517，宿主 boot 样式）
//   → 壁纸灰代理（fixture 分区 p95 亮度 → 逆 WCAG → 灰；opacity 取 1.0 =
//     dsh-mrz-breathe 呼吸上界，亮色保守向；暗色残差见下）
//   → 纱：overlay s = round(coef·t²)/100（t=P/100）| baked-gradient
//     α = pt(baked)/100 按分区中心 y 在两站间线性插值
//   → bg-base riding token ×2 层（body + frame；活体取证实证）
//   → 表面 fill：sidebar-fill ×2（侧栏 root+col）| input-major ×1（composer
//     card）| hero 无 fill
//   → WCAG 相对亮度 → 与 TEXT_FLOOR 色求比 → ≥ 阈值断言。
// riding α = max(pt(baked), floor)/100，pt = clamp(P + baked − anchor, 0, 100)，
// floor 缺省 0；P/baked/anchor/floor 均整数 → alpha 恒两位小数（ADR-0004:16 沿用）。
// 分区中心 y（梯度插值用）：sidebar_strip 0.255 / hero_band 0.385 / composer_area 0.48。
//
// 残差申报：暗色壳壁纸可见度模型偏高（±10 sRGB，实测 45-47 vs 模型 35-36——
// 呼吸相位与氛围球未建模；暗色文字行余量 2-3× 阈值，不构成翻转风险）；
// 亮色 ±1-2 sRGB。氛围球（#root::before/::after 动画径向）不建模。
// brand 行仅 meirenzhi（基线 brand 失败族 = mrz 字标；openbmc/uefi 品牌无基线
// 对应行，SKIP 申报）。composer_border 初版 = null（现役无边框，基线 1.00x）→
// 断言红，Task 6 textfloor 常量边框落地后转绿。
// 断言面 = 出厂态：web P（mrz 35 / openbmc 55 / uefi 55）+ desktop P 66
// （catalog.js:83「55/55/35 web, 66 desktop」）。用户上传壁纸不在覆盖内（D7 尾巴）。
//
// 退出码：0 全绿；1 有断言失败（红名单逐行打印）；2 结构异常（fixture 缺失/
// SPEC 缺键——停下排查，不是红灯）。
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "scripts", "fixtures", "wallpaper-luminance.json");

// ---- ② 背景侧：SPEC 现值（Task 3 载体）----
import { SPEC as SPEC_MRZ } from "../src/client/skins/meirenzhi/index.js";
import { SPEC as SPEC_OBMC } from "../src/client/skins/openbmc-harness/index.js";
import { SPEC as SPEC_UEFI } from "../src/client/skins/uefi-harness/index.js";
const SPECS = {
  meirenzhi: SPEC_MRZ,
  "openbmc-harness": SPEC_OBMC,
  "uefi-harness": SPEC_UEFI,
};

// ---- 出厂 P（手抄，catalog.js:83 官方口径；live 已核）----
const FACTORY_P = {
  web: { meirenzhi: 35, "openbmc-harness": 55, "uefi-harness": 55 },
  desktop: { meirenzhi: 66, "openbmc-harness": 66, "uefi-harness": 66 },
};

// ---- 分区中心 y（梯度插值）----
const REGION_CENTER_Y = { sidebar_strip: 0.255, hero_band: 0.385, composer_area: 0.48 };
const REGION_CENTER_Y_DESKTOP = { hero_band: 0.385, composer_area: 0.48 };

// ---- ③ 文字侧：TEXT_FLOOR 手抄金值表（初版 = 现行色）----
// 色源依据（Task 1 preflight 裁决表）：label-tertiary/label-primary 为宿主
// token（constantTokens 通道）；composer_placeholder 为渲染型占位字形测量推导
// 值（Task 1 申报）；brand = mrz 金渐变最亮止色 #D9B45C（组件源码 index.js
// MeiRenZhiName）。dark 侧 sidebar/footer = label-tertiary dark（bluish-400）。
const T = {
  sidebar_text: [[102, 105, 112], [173, 178, 184]],
  // footer 行 = tertiary 代理（底栏与侧栏列同 fill 面，评审 O2：代理保守向无害）
  sidebar_footer: [[102, 105, 112], [173, 178, 184]],
  // 占位字形 = caption token 覆写值（实施评审 B1 勘误：DraftEditor 兄弟元素
  // .placeholder{color:var(--dsw-alias-label-caption)}——可骑 token，constantTokens
  // 覆写即生效；初版「不可骑 token」裁决系 ::placeholder 探针误判，已勘误）
  composer_placeholder: [[102, 105, 112], [173, 178, 184]],
  hero_slogan: [[15, 17, 21], [249, 250, 251]],
  brand_mrz: [[140, 104, 45], [217, 180, 92]], // Task 7 终版：亮色止色暗化（#8C682D，L 0.157 ≤ 反解帽 0.1706）；dark 经 cssSegments !important 恢复原亮金 #D9B45C
  composer_border: [[110, 113, 120], [196, 199, 206]], // Task 6 终版：对壁纸 p95 ≥3:1 反解（light 最严 nangongwan 0.6872→≤124 灰；dark 最严 mupeiling 0.1395→≥192 灰）
};
const THRESHOLD = { text: 4.5, hero: 3.0, border: 3.0 }; // B8 口径：正文/大字/1.4.11 边界

// ---- 数学独立重实现 ----
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pt = (P, anchor, baked) => clamp(P + baked - anchor, 0, 100);
const alphaOf = (P, anchor, entry, floorOverride) => {
  const baked = entry[1];
  const floor = floorOverride ?? (entry.length >= 3 ? entry[2] : 0);
  return clamp(Math.max(pt(P, anchor, baked), floor), 0, 100) / 100;
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const srgbFromL = (L) => {
  const c = L <= 0.0031308 ? L * 12.92 : 1.055 * Math.pow(L, 1 / 2.4) - 0.05;
  return Math.round(clamp(c, 0, 1) * 255);
};
const ratio = (fgL, bgL) => { const [hi, lo] = fgL > bgL ? [fgL, bgL] : [bgL, fgL]; return (hi + 0.05) / (lo + 0.05); };
const blend = (below, top, alpha) => below.map((v, i) => top[i] * alpha + v * (1 - alpha));

/** 分区合成底色（sRGB）。surfaces: sidebar(compose sidebarFill×2) / composer(inputMajor×1) / hero(none) */
function compositeBg({ spec, mode, P, wallL, regionKind, surface }) {
  const anchor = spec.anchor;
  // 壁纸灰代理（fixture p95 亮度 → 灰）
  let rgb = [srgbFromL(wallL), srgbFromL(wallL), srgbFromL(wallL)];
  // 纱
  const scrim = spec.scrim;
  if (scrim.kind === "overlay") {
    const t = clamp(P / 100, 0, 1);
    const s = Math.round(scrim.coefficient * t * t) / 100;
    const veilRgb = (mode === "light" ? scrim.light : scrim.dark).split(",").map((x) => parseInt(x.trim(), 10));
    rgb = blend(rgb, veilRgb, s);
  } else {
    const stops = mode === "light" ? scrim.stops.light : scrim.stops.dark;
    const y = REGION_CENTER_Y[regionKind] ?? REGION_CENTER_Y_DESKTOP[regionKind];
    const aTop = alphaOf(P, anchor, stops[0]);
    const aBot = alphaOf(P, anchor, stops[1]);
    const a = aTop + (aBot - aTop) * y;
    const topRgb = stops[0][0].split(",").map((x) => parseInt(x.trim(), 10));
    const botRgb = stops[1][0].split(",").map((x) => parseInt(x.trim(), 10));
    const veilRgb = topRgb.map((v, i) => v + (botRgb[i] - v) * y);
    rgb = blend(rgb, veilRgb, a);
  }
  // bg-base ×2（body + frame）
  const baseEntry = spec.riding["--dsw-alias-bg-base"][mode];
  const baseRgb = baseEntry[0].split(",").map((x) => parseInt(x.trim(), 10));
  const baseA = alphaOf(P, anchor, baseEntry);
  rgb = blend(blend(rgb, baseRgb, baseA), baseRgb, baseA);
  // 表面 fill
  if (surface === "sidebar") {
    const e = spec.riding["--dsw-specific-sidebar-fill"][mode];
    const fillRgb = e[0].split(",").map((x) => parseInt(x.trim(), 10));
    const a = alphaOf(P, anchor, e);
    rgb = blend(blend(rgb, fillRgb, a), fillRgb, a);
  } else if (surface === "composer") {
    const e = spec.riding["--dsw-specific-input-major"][mode];
    const fillRgb = e[0].split(",").map((x) => parseInt(x.trim(), 10));
    const a = alphaOf(P, anchor, e);
    rgb = blend(rgb, fillRgb, a);
  } // hero：无 fill
  return rgb;
}

// ---- 断言矩阵 ----
async function main() {
  if (!existsSync(FIXTURE)) { console.error(`STRUCTURE FAIL: fixture missing: ${FIXTURE}`); process.exit(2); }
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  // fixture 防陈旧：全量 sha256 复核（模块引用形态经 import 取真值字节）
  const shaFail = [];
  let obmcArtBytes = null;
  for (const [key, wp] of Object.entries(fixture.wallpapers)) {
    let bytes = null;
    if (wp.source.includes("#")) {
      const [modPath, exportName] = wp.source.split("#");
      const mod = await import(join(ROOT, modPath));
      const dataUrl = mod[exportName];
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/webp;base64,")) { shaFail.push(`${key}: module export not a webp data URL`); continue; }
      bytes = Buffer.from(dataUrl.slice("data:image/webp;base64,".length), "base64");
    } else {
      const file = join(ROOT, wp.source);
      if (!existsSync(file)) { shaFail.push(`${key}: source file missing ${wp.source}`); continue; }
      bytes = readFileSync(file);
    }
    if (bytes && createHash("sha256").update(bytes).digest("hex") !== wp.sha256) shaFail.push(`${key}: sha256 drift`);
  }
  if (shaFail.length) { console.error("STRUCTURE FAIL: fixture sha drift（壁纸字节已变，重跑 capture-wallpaper-stats.mjs）"); for (const s of shaFail) console.error("  " + s); process.exit(2); }

  const rows = [];
  for (const skin of ["meirenzhi", "openbmc-harness", "uefi-harness"]) {
    const spec = SPECS[skin];
    if (!spec || !spec.riding || !spec.anchor) { console.error(`STRUCTURE FAIL: SPEC incomplete for ${skin}`); process.exit(2); }
    const wallKeys = Object.keys(fixture.wallpapers).filter((k) => k.startsWith(skin + ":"));
    if (wallKeys.length === 0) { console.error(`STRUCTURE FAIL: no fixture wallpapers for ${skin}`); process.exit(2); }
    for (const mode of ["light", "dark"]) {
      for (const profile of ["web", "desktop"]) {
        const P = FACTORY_P[profile][skin];
        const regions = profile === "web" ? fixture.wallpapers[wallKeys[0]].web : fixture.wallpapers[wallKeys[0]].desktop;
        const surfaces = profile === "web"
          ? [["sidebar_text", "sidebar_strip", "sidebar", "text"], ["sidebar_footer", "sidebar_strip", "sidebar", "text"],
             ["composer_placeholder", "composer_area", "composer", "text"], ["composer_border", "composer_area", "composer", "border"],
             ["hero_slogan", "hero_band", "hero", "hero"],
             ...(skin === "meirenzhi" ? [["brand", "sidebar_strip", "sidebar", "text"]] : [])]
          : [["composer_placeholder", "composer_area", "composer", "text"], ["composer_border", "composer_area", "composer", "border"], ["hero_slogan", "hero_band", "hero", "hero"]];
        for (const wallKey of wallKeys) {
          const wp = fixture.wallpapers[wallKey];
          for (const [surface, region, chain, kind] of surfaces) {
            const wallL = wp[profile][region].p95;
            const bg = compositeBg({ spec, mode, P, wallL, regionKind: region, surface: chain });
            const bgL = lum(bg);
            const fg = T[skin === "meirenzhi" && surface === "brand" ? "brand_mrz" : surface][mode === "light" ? 0 : 1];
            const threshold = THRESHOLD[kind];
            if (fg === null) {
              rows.push({ skin, mode, profile, wall: wallKey.split(":")[1], surface, verdict: "FAIL", reason: "border absent（初版）", threshold });
              continue;
            }
            const r = ratio(lum(fg), bgL);
            rows.push({ skin, mode, profile, wall: wallKey.split(":")[1], surface, bg: bg.map((v) => Math.round(v)), bgL: +bgL.toFixed(4), fg: fg.join(","), ratio: +r.toFixed(2), threshold, verdict: r >= threshold ? "PASS" : "FAIL" });
          }
        }
      }
    }
  }

  const fails = rows.filter((r) => r.verdict === "FAIL");
  const skips = rows.filter((r) => r.verdict === "SKIP");
  // 逐行打印（红名单 + 全表摘要）
  for (const r of fails) {
    console.error(`FAIL ${r.skin}/${r.mode}/${r.profile}/${r.wall}/${r.surface}: ${r.reason ?? `ratio=${r.ratio} < ${r.threshold}（fg=${r.fg}, bg=${r.bg.join(",")}, bgL=${r.bgL}）`}`);
  }
  const passCount = rows.length - fails.length - skips.length;
  console.log(`verify:contrast — rows=${rows.length} pass=${passCount} fail=${fails.length} skip=${skips.length}`);
  const byFamily = {};
  for (const r of fails) {
    const key = `${r.skin}/${r.mode}/${r.surface}`;
    byFamily[key] = (byFamily[key] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(byFamily).sort()) console.log(`  FAIL-family ${k}: ${n} 行`);
  process.exit(fails.length === 0 ? 0 : 1);
}

await main();
