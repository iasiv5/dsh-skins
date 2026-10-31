#!/usr/bin/env node
// repro-stale-grid-paint.mjs — ADR-0021 acceptance harness.
//
// Headless reproduction/verification for the sidebar paint-order regression:
// after a runtime skin switch on a narrow viewport (collapsed rail), the
// compositor could paint the center column over the sidebar column — layout
// and hit-testing stayed correct while the rail (base + icons) went visually
// missing. The fix pins the sidebar column one explicit stacking step up
// (style tag `dsh-skins/<id>.paintorder.css`, symbol "paintorder").
//
// Modes:
//   (default)          fingerprint + cold-baseline sanity + switch flow + verdict
//   --fingerprint-only served-bundle symbol probe only (hot-deploy effect check)
//   --no-fingerprint   skip the served-bytes probe (red-baseline runs only)
//   --gate             for the `test` pipeline: if --url is unreachable, print
//                      an explicit SKIP line and exit 0 (CI has no live host)
//
// Exit codes: 0 PASS / SKIP · 1 FAIL · 2 REVIEW · 3 INVALID (baseline/bundle)
// Artifacts: repro-rail.png next to the script's CWD.
//
// Usage:
//   node scripts/repro-stale-grid-paint.mjs [--url http://127.0.0.1:3080]
//        [--viewport 422x800] [--skin-id openbmc-harness] [--collapse-expand]
//        [--no-fingerprint] [--fingerprint-only] [--gate]

import fs from "node:fs";
import { chromium } from "playwright-core";
import { countBrightPixels, decodePng, edgeActivity, lum } from "./lib/paint-metrics.mjs";
import { observedLocale } from "./lib/ui-locale.mjs";

// ---- args --------------------------------------------------------------------

const args = process.argv.slice(2);
function argOf(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const has = (name) => args.includes(name);

const URL_DEFAULT = "http://127.0.0.1:3080";
const baseUrl = argOf("--url") ?? URL_DEFAULT;
const viewport = (() => {
  const raw = argOf("--viewport") ?? "422x800";
  const [w, h] = raw.split("x").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 200 || h < 200) {
    throw new Error(`bad --viewport: ${raw}`);
  }
  return { width: w, height: h };
})();
const skinId = argOf("--skin-id") ?? "openbmc-harness";
const collapseExpand = has("--collapse-expand");
const fingerprintOnly = has("--fingerprint-only");
const noFingerprint = has("--no-fingerprint");
const gate = has("--gate");
const SYMBOL = "paintorder"; // fix marker inside the served client bundle
const SKIN_STORAGE_KEY = "dsh-skins:active"; // runtime.js persistence key
// Red-baseline fallback: old bundles predate the data-skin-id hook (R21), so
// card lookup falls back to known label text (current UI language either way).
const LABEL_FALLBACK = {
  official: /DeepSeek Harness/i,
  "openbmc-harness": /OpenBMC Studio/i,
  meirenzhi: /凡人修仙传|Mortal's Journey|美人志/i,
  "uefi-harness": /UEFI Studio/i,
};

// PNG decode + lum + edgeActivity come from ./lib/paint-metrics.mjs (shared,
// golden-byte-pinned — no private copies).

async function brightPixels(page, rect, shotPath) {
  const clip = {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  };
  const buffer = await page.screenshot({ clip, type: "png" });
  if (shotPath) fs.writeFileSync(shotPath, buffer);
  const image = decodePng(buffer);
  return { count: countBrightPixels(image), image };
}

/** Fraction of pixels whose luminance moved more than 12 (0–1). Reviewer
 * evidence: broken-vs-cold diffs measured 25.9%/34.9% on this strip, healthy
 * re-renders land near 0 — 10% separates them cleanly. */
function diffFraction(imageA, imageB) {
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) return 1;
  let differing = 0;
  const total = imageA.width * imageA.height;
  for (let index = 0; index < total; index += 1) {
    const o = index * 4;
    const delta = Math.abs(
      lum(imageA.data[o], imageA.data[o + 1], imageA.data[o + 2])
      - lum(imageB.data[o], imageB.data[o + 1], imageB.data[o + 2]),
    );
    if (delta > 12) differing += 1;
  }
  return differing / total;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- helpers -----------------------------------------------------------------

async function gotoSettled(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function fingerprint(page) {
  // Primary (know-how 037 §5.2 canonical probe): runtime style tags emitted by
  // the client bundle — the paint-order tag only exists in fixed bundles, and
  // its presence proves the LIVE page runs the fix. The client JS itself is
  // bundled into merged entries, so URL-based byte scans miss it.
  const runtimeTag = await page.evaluate(() => {
    const tags = [...document.querySelectorAll('style[data-plugin-css]')]
      .map((tag) => tag.dataset.pluginCss);
    return { hit: tags.some((id) => id.endsWith(".paintorder.css")), tags };
  });
  if (runtimeTag.hit) return { ok: true, via: "runtime-style-tag" };
  // Fallback (e.g. official persisted — no skin active, no paintorder tag):
  // fetch every script and look for the symbol in served bytes.
  const fetched = await page.evaluate(async (symbol) => {
    const urls = [...document.scripts].map((script) => script.src).filter(Boolean);
    for (const url of urls) {
      try {
        const text = await (await fetch(url)).text();
        if (text.includes(symbol)) return { ok: true, url };
      } catch {}
    }
    return { ok: false, scanned: urls.length };
  }, SYMBOL);
  if (fetched.ok) return { ok: true, via: `served-bytes (${fetched.url})` };
  console.error(`runtime paintorder tags: ${JSON.stringify(runtimeTag.tags)}`);
  return { ok: false, scanned: fetched.scanned ?? 0 };
}

async function openSwitcher(page) {
  await page.locator(".dsh-skins-switcher-btn").first().click();
  await page.waitForTimeout(500);
}

/** Normalize the session to the DARK signature (matches the reporter's phone;
 * the anonymous loopback workspace's persisted theme flipped to light after
 * the 2026-10-29 11:39 restart — under investigation separately). Uses the
 * product's own Dark theme card, so the write is the normal durable
 * preference write and is reversible from the same UI. Verifies the resolved
 * attribute, because the whole brightness/edge verdict assumes dark-fill
 * rails where icon pixels are the bright ones. */
async function ensureDarkSignature(page) {
  const dark = () => page.evaluate(() => document.body.hasAttribute("data-ds-dark-theme"));
  if (await dark()) return;
  await openSwitcher(page);
  await page.locator(".dsh-skins-theme-grid button", { hasText: /Dark|深色/ }).first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  if (!(await dark())) {
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [SKIN_STORAGE_KEY, skinId]);
    await gotoSettled(page);
  }
  if (!(await dark())) {
    console.error("INVALID: could not reach the dark signature (theme card click had no effect)");
    process.exit(3);
  }
  console.log("signature: dark theme resolved");
}

async function pickSkin(page, id) {
  const hooked = page.locator(`[data-skin-id="${id}"]`);
  if (await hooked.count()) {
    await hooked.first().click();
  } else {
    // Old bundle (red baseline): no data-skin-id — fall back to label text.
    const pattern = LABEL_FALLBACK[id];
    if (!pattern) throw new Error(`no label fallback for skin "${id}"`);
    await page.locator(".dsh-skins-pop-card", { hasText: pattern }).first().click();
  }
  await page.waitForTimeout(1000);
}

async function collapseExpandOnce(page) {
  // ADR-0021/B4②: drive the real collapse/expand transition so the switch
  // lands on a frame that just animated (the old nudge path needed this;
  // the paint-order rule must survive it). Toggle = the sidebar's first
  // icon button (host class *_toggle).
  const toggle = page.locator('[class*="_toggle"]').first();
  await toggle.click();
  await page.waitForTimeout(600);
  await toggle.click();
  await page.waitForTimeout(800);
}

async function measureColumn(page, shotPath) {
  const rect = await page.evaluate(() => {
    const column = document.querySelector('[class*="_sidebarCol"]');
    if (column === null) return null;
    const box = column.getBoundingClientRect();
    const frame = document.querySelector('[class*="_frame"]');
    return {
      x: box.x, y: box.y, width: box.width, height: box.height,
      gtc: frame === null ? null : frame.style.gridTemplateColumns,
    };
  });
  if (rect === null) return null;
  const { count, image } = await brightPixels(page, rect, shotPath);
  return { ...rect, bright: count, image, edges: edgeActivity(image) };
}

function rectHealthy(rect) {
  // Expanded columns are wide; rail columns are 54–58px. Both start at x≈0.
  return rect !== null && rect.x >= -2 && rect.x <= 2 && rect.width >= 40;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ---- main --------------------------------------------------------------------

if (gate) {
  let reachable = false;
  try {
    const probe = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    reachable = probe.ok;
  } catch {}
  if (!reachable) {
    console.log(`SKIP repro-stale-grid-paint (no live host at ${baseUrl})`);
    process.exit(0);
  }
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await gotoSettled(page);

  if (!noFingerprint) {
    const probe = await fingerprint(page);
    if (!probe.ok) {
      console.error(`ERROR: fix not observable on the live page (no paintorder tag, served bytes lack symbol; scanned ${probe.scanned ?? 0} urls) — deploy did not take effect`);
      process.exit(3);
    }
    console.log(`fingerprint: symbol-present (via ${probe.via})`);
  }
  if (fingerprintOnly) {
    console.log("PASS: fingerprint-only mode");
    process.exit(0);
  }

  // Cold baseline for the TARGET skin: persist the choice, reload, verify the
  // baseline is itself healthy (R20 — cold load may be broken; never assume).
  // Health = dark signature + icon edges present (≥30) + bright ≥ 100; the
  // light-theme cold-broken family shows bright=full-strip with edges=0,
  // which this check rejects instead of silently gating on.
  let brightCold = 0;
  let imageCold = null;
  let rectCold = null;
  let coldOk = false;
  for (let attempt = 0; attempt < 4 && !coldOk; attempt += 1) {
    if (attempt > 0) {
      await ensureDarkSignature(page);
    } else {
      await ensureDarkSignature(page);
    }
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [SKIN_STORAGE_KEY, skinId]);
    await gotoSettled(page);
    const measured = await measureColumn(page, attempt === 0 ? "repro-cold.png" : undefined);
    if (measured !== null && rectHealthy(measured) && measured.bright >= 100 && measured.edges >= 30) {
      coldOk = true;
      brightCold = measured.bright;
      imageCold = measured.image;
      rectCold = measured;
    } else {
      console.warn(`cold baseline attempt ${attempt + 1} unhealthy (rect ${JSON.stringify(measured && { x: Math.round(measured.x), w: Math.round(measured.width) })}, bright ${measured?.bright ?? "n/a"}, edges ${measured?.edges ?? "n/a"})`);
    }
  }
  if (!coldOk) {
    console.error("INVALID: baseline unhealthy after 3 attempts (environment state, not the fix verdict)");
    process.exit(3);
  }
  console.log(`baseline: brightCold=${brightCold} rect=${Math.round(rectCold.x)},${Math.round(rectCold.y)} ${Math.round(rectCold.width)}x${Math.round(rectCold.height)} gtc="${rectCold.gtc}"`);
  console.log(`ui locale observed: ${await observedLocale(page)}`);

  if (collapseExpand) await collapseExpandOnce(page);

  // Switch protocol (K hops): the regression is intermittent (~60% per switch
  // on an unfixed build — reviewer diag4 3/5, our runs 1/3), so a single hop
  // would let red slip through. K=6 hops with every hop required clean puts
  // the red false-green rate at ~(1-repro)^6 ≈ 0.4%, while the static
  // paint-order rule makes every green hop clean deterministically.
  const HOPS = 6;
  const hopResults = [];
  for (let hop = 0; hop < HOPS; hop += 1) {
    await openSwitcher(page);
    await pickSkin(page, "official");
    await pickSkin(page, skinId);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    const after = await measureColumn(page, hop === HOPS - 1 ? "repro-rail.png" : undefined);
    if (after === null) fail(`hop ${hop + 1}: sidebarCol vanished from the DOM after the switch`);
    const widthDelta = Math.abs(after.width - rectCold.width);
    const ratio = brightCold > 0 ? after.bright / brightCold : 0;
    const diff = diffFraction(imageCold, after.image);
    const edgeRatio = rectCold.edges > 0 ? after.edges / rectCold.edges : 1;
    console.log(`hop ${hop + 1}/${HOPS}: bright=${after.bright} (${(ratio * 100).toFixed(1)}%) pixelDiff=${(diff * 100).toFixed(2)}% edges=${after.edges} (${(edgeRatio * 100).toFixed(0)}% of baseline ${rectCold.edges}) gtc="${after.gtc}"`);

    const rectOk = rectHealthy(after) && widthDelta <= 2;
    if (!rectOk) {
      console.error(`FAIL: hop ${hop + 1} — sidebar column geometry unhealthy (see repro-rail.png)`);
      process.exit(1);
    }
    // Per-hop verdict: any signal flagging broken = FAIL; a small residual
    // band (rendering noise) = REVIEW-only for this hop.
    let verdict = "PASS";
    if (diff >= 0.2 || after.bright < 0.5 * brightCold || (rectCold.edges >= 30 && edgeRatio < 0.25)) {
      verdict = "FAIL";
    } else if (diff >= 0.1 || after.bright < 0.7 * brightCold || after.bright > 3 * brightCold
      || (rectCold.edges >= 30 && edgeRatio < 0.5) || (after.gtc ?? "") === "") {
      verdict = "REVIEW";
    }
    hopResults.push(verdict);
    if (verdict === "FAIL") {
      fail(`hop ${hop + 1}: rail regression (pixelDiff=${(diff * 100).toFixed(2)}%, brightAfter=${after.bright} vs ${brightCold}, edges ${after.edges} vs ${rectCold.edges})`);
    }
  }

  if (hopResults.some((verdict) => verdict !== "PASS")) {
    console.error(`REVIEW: hops did not cleanly pass — ${hopResults.map((v, i) => `${i + 1}:${v}`).join(" ")} (see repro-rail.png)`);
    process.exit(2);
  }
  console.log(`PASS: ${HOPS}/${HOPS} hops clean (brightness/pixelDiff/edges/gtc)`);
  process.exit(0);
} finally {
  await browser.close();
}
