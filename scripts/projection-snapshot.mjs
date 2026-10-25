#!/usr/bin/env node
/**
 * ADR-0019 迁移期投影快照工具（Task 1；随 Task 8 收口退役）。
 *
 *   --out <file>     生成基线：三皮 × P∈[0,100] 步进 1 的 project() 九键输出
 *                    + builtinAssets + Mark({size:24})/Name() 渲染树（记录式
 *                    jsx stub），JSON 逐字序列化（保留键序，键序漂移即可比对出）。
 *   --compare <file> 与基线逐皮逐点逐键字节比对；全等输出
 *                    `PROJECTION-BYTES-EQUAL 606`（3 皮 × 101 P × 明暗 2
 *                    mode-points）并 exit 0；任何不等打印首个差异（皮/点位/
 *                    键 + 双侧前 200 字符）并 exit 1。
 *
 * 入参夹具逐字仿 tests/translucency-contract.test.mjs：values =
 * {panelOpacity: P, slogan: {zh: "测", en: "t"}}；meirenzhi 传
 * {wallpaper: {url: "data:image/webp;base64,AAAA"}}，其余皮 assets = null
 * （legacy-baked 用户自传图分支不在快照域，见实施计划覆盖度声明）。
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";

/** 记录式 jsx stub：返回纯记录对象，不执行任何副作用（B5 JSX 半边判据）。 */
const recordingJsx = (type, props, ...kids) => ({ type, props: props ?? null, kids });

const FACTORIES = {
  openbmc: () => createOpenBmcHarness({ jsx: recordingJsx }),
  uefi: () => createUefiHarness({ jsx: recordingJsx }),
  meirenzhi: () => createMeirenzhiSkin({ jsx: recordingJsx }),
};

function capture() {
  const out = {};
  for (const [id, factory] of Object.entries(FACTORIES)) {
    const skin = factory();
    const assets = id === "meirenzhi" ? { wallpaper: { url: "data:image/webp;base64,AAAA" } } : null;
    const points = [];
    for (let P = 0; P <= 100; P += 1) {
      points.push({
        P,
        fx: skin.project({ panelOpacity: P, slogan: { zh: "测", en: "t" } }, assets),
      });
    }
    out[id] = {
      builtinAssets: skin.builtinAssets,
      markTree: skin.Mark({ size: 24 }),
      nameTree: skin.Name(),
      points,
    };
  }
  return out;
}

const clip = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

function fail(id, where, key, base, cur) {
  console.error(`DIFF ${id} ${where} key=<${key}>`);
  console.error(`  baseline: ${clip(base)}`);
  console.error(`  current : ${clip(cur)}`);
  process.exit(1);
}

function compare(baseline) {
  const current = capture();
  if (JSON.stringify(baseline) === JSON.stringify(current)) {
    console.log(`PROJECTION-BYTES-EQUAL ${Object.keys(FACTORIES).length * 101 * 2}`);
    process.exit(0);
  }
  let located = false;
  for (const id of Object.keys(FACTORIES)) {
    const b = baseline[id];
    const c = current[id];
    if (b === undefined || c === undefined) fail(id, "-", "skin-record", JSON.stringify(b), JSON.stringify(c));
    for (const part of ["builtinAssets", "markTree", "nameTree"]) {
      if (JSON.stringify(b[part]) !== JSON.stringify(c[part])) {
        located = true;
        fail(id, "-", part, b[part], c[part]);
      }
    }
    if (b.points.length !== c.points.length) fail(id, "-", "points.length", b.points.length, c.points.length);
    for (let i = 0; i < b.points.length; i += 1) {
      const pb = b.points[i];
      const pc = c.points[i];
      if (pb.P !== pc.P) fail(id, `#${i}`, "P", pb.P, pc.P);
      const keys = Object.keys(pb.fx);
      if (JSON.stringify(keys) !== JSON.stringify(Object.keys(pc.fx))) {
        located = true;
        fail(id, `P=${pb.P}`, "fx:key-order", keys.join(","), Object.keys(pc.fx).join(","));
      }
      for (const key of keys) {
        if (JSON.stringify(pb.fx[key]) !== JSON.stringify(pc.fx[key])) {
          located = true;
          fail(id, `P=${pb.P}`, key, pb.fx[key], pc.fx[key]);
        }
      }
    }
  }
  // 整体串不等但逐键走查未定位：结构级漂移（键序/嵌套形状）。
  if (!located) {
    console.error("DIFF structure-level drift: whole-JSON differs but no per-key diff located (key order or nesting).");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const mode = args[0];
const path = args[1];
if (mode === "--out" && path) {
  writeFileSync(path, JSON.stringify(capture()));
  console.log(`SNAPSHOT-WRITTEN ${path}`);
} else if (mode === "--compare" && path) {
  compare(JSON.parse(readFileSync(path, "utf8")));
} else {
  console.error("usage: projection-snapshot.mjs --out <file> | --compare <file>");
  process.exit(2);
}
