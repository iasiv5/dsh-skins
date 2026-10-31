#!/usr/bin/env node
// repro-fullscreen-collapse.mjs — ADR-0021 amendment 四 acceptance harness.
//
// Headless reproduction/verification for the collapse-from-fullscreen blank:
// on the skin, entering right-panel fullscreen and then collapsing the right
// sidebar leaves a STALE fullscreen sheet mounted (data-sidebar-right-panel
// stays "fullscreen", inline width:100vw stays, real pane content stays
// hosted) while the host clears data-sidebar-right-open. The ADR-0020 solid
// fullscreen rules keyed on the stale attribute then paint the sheet solid
// over the restored conversation — block backgrounds paint, message text and
// wallpaper go blank (field evidence 2026-10-29/30, user screenshots +
// headless bright-pixel probes: docked ≈ 44839, broken ≈ 942/4420; removing
// fullscreen.css or hiding the sheet heals to ≈ 48203; no other tag churns
// matter; style churn does NOT heal — live rule, not a stale frame).
//
// Fix: gate the sheet rules on [data-sidebar-right-open="true"] (the host
// reliably clears it on collapse and keeps it true in real fullscreen).
//
// Flow: cold-load skin → docked baseline (center column bright px) → open
// right sidebar → visible-mode-button fullscreen (rp must become fullscreen)
// → collapse via "Collapse right sidebar" → measure. PASS = bright stays
// ≥ 50% of the docked baseline; FAIL = the blank. Two cycles.
//
// Modes:
//   (default)          baseline + fullscreen/collapse cycles + verdict
//   --fingerprint-only served runtime-tag probe only (hot-deploy effect check)
//   --no-fingerprint   skip the fix-marker probe (red-baseline runs)
//   --gate             for the `test` pipeline: if --url is unreachable, print
//                      an explicit SKIP line and exit 0 (CI has no live host)
//
// Exit codes: 0 PASS / SKIP · 1 FAIL · 2 REVIEW · 3 INVALID (baseline/bundle)
// Artifacts: repro-collapse-<n>.png next to the script's CWD.
//
// Usage:
//   node scripts/repro-fullscreen-collapse.mjs [--url http://127.0.0.1:3080]
//        [--viewport 1920x1080] [--skin-id openbmc-harness]
//        [--no-fingerprint] [--fingerprint-only] [--gate]

import fs from "node:fs";
import { chromium } from "playwright-core";
import { countBrightPixels, decodePng } from "./lib/paint-metrics.mjs";

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
  const raw = argOf("--viewport") ?? "1920x1080";
  const [w, h] = raw.split("x").map(Number);
  if (!Number.isFinite(w) || !h || w < 800 || h < 600) {
    throw new Error(`bad --viewport: ${raw}`);
  }
  return { width: w, height: h };
})();
const skinId = argOf("--skin-id") ?? "openbmc-harness";
const fingerprintOnly = has("--fingerprint-only");
const noFingerprint = has("--no-fingerprint");
const gate = has("--gate");
const SKIN_STORAGE_KEY = "dsh-skins:active"; // runtime.js persistence key
const GATE_MARKER = 'data-sidebar-right-open="true"'; // fix marker inside the emitted fullscreen.css

// PNG decode + bright counting come from ./lib/paint-metrics.mjs (shared,
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
  return countBrightPixels(decodePng(buffer));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- helpers -----------------------------------------------------------------

async function gotoSettled(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
}

async function fingerprint(page) {
  // The emitted fullscreen.css tag only exists on skin-mounted pages and its
  // content carries the fix marker — proves the LIVE page runs the gate.
  return page.evaluate((marker) => {
    const tags = [...document.querySelectorAll('style[data-plugin-css$=".fullscreen.css"]')]
      .map((tag) => tag.textContent ?? "");
    return { hit: tags.some((text) => text.includes(marker)), tags: tags.length };
  }, GATE_MARKER);
}

async function ensureDark(page) {
  const dark = () => page.evaluate(() => document.body.hasAttribute("data-ds-dark-theme"));
  if (await dark()) return;
  await page.locator(".dsh-skins-switcher-btn").first().click();
  await page.waitForTimeout(500);
  await page.locator(".dsh-skins-theme-grid button", { hasText: /Dark|深色/ }).first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  if (!(await dark())) throw new Error("could not reach the dark signature (theme card click had no effect)");
}

async function openSession(page) {
  // Content-rich session: the paint verdict needs a text-heavy conversation.
  try {
    await page.locator('[class*="searchButton"]').first().click();
    await page.waitForTimeout(800);
    await page.locator("input:visible").first().fill("OpenBMC");
    await page.waitForTimeout(1200);
    await page.locator("text=OpenBMC皮肤侧栏图标不可见").first().click();
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  } catch (error) {
    console.warn(`session-open fallback (${String(error).slice(0, 80)}) — continuing with the last-open session`);
  }
}

const rpMode = (page) => page.evaluate(() => document.querySelector('[data-sidebar-right-panel]')?.getAttribute("data-sidebar-right-panel") ?? null);

async function measureCenter(page, label, shotPath) {
  const rect = await page.evaluate(() => {
    const column = document.querySelector('[class*="_centerCol"]');
    if (column === null) return null;
    const box = column.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  if (rect === null) return null;
  const bright = await brightPixels(page, rect, shotPath);
  console.log(`${label}: rect=${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)} bright=${bright}`);
  return bright;
}

async function openSidebarIfNeeded(page) {
  const width = await page.evaluate(() => Math.round(document.querySelector('[class*="_rightbarCol"]')?.getBoundingClientRect().width ?? -1));
  if (width !== 0) return true;
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll("button")].find((el) => (el.getAttribute("aria-label") || el.title || "") === "Open right sidebar");
    if (hit) hit.click();
  });
  await page.waitForTimeout(1800);
  return true;
}

async function enterFullscreen(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const hit = [...document.querySelectorAll('button[data-sidebar-right-mode="fullscreen"]')].find((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= innerWidth && box.y + box.height <= innerHeight;
      });
      if (!hit) return false;
      const box = hit.getBoundingClientRect();
      hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
      return true;
    });
    if (clicked) {
      await page.waitForTimeout(1800);
      if ((await rpMode(page)) === "fullscreen") return true;
    }
    // Coordinate fallback: the topbar icon cluster sits at the right edge once
    // the sidebar is open (Fullscreen button around x≈1850 at 1920 viewport).
    for (const x of [1858, 1822]) {
      await page.mouse.click(x, 25);
      await page.waitForTimeout(1500);
      if ((await rpMode(page)) === "fullscreen") return true;
    }
  }
  return false;
}

async function collapseSidebar(page) {
  return page.evaluate(() => {
    const hit = [...document.querySelectorAll("button")].find((el) =>
      (el.getAttribute("aria-label") || el.title || "") === "Collapse right sidebar" && el.getBoundingClientRect().width > 0);
    if (!hit) return false;
    hit.click();
    return true;
  });
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
    console.log(`SKIP repro-fullscreen-collapse (no live host at ${baseUrl})`);
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
    if (!probe.hit) {
      console.error(`ERROR: fix marker not observable on the live page (${probe.tags} fullscreen.css tag(s) lack "${GATE_MARKER}") — deploy did not take effect`);
      process.exit(3);
    }
    console.log(`fingerprint: open-gate marker present (${probe.tags} fullscreen tag)`);
  }
  if (fingerprintOnly) {
    console.log("PASS: fingerprint-only mode");
    process.exit(0);
  }

  await ensureDark(page);
  await openSession(page);

  // Cold-load the target skin (per-browser localStorage; the user's own
  // browser state is untouched).
  await page.evaluate(([key, id]) => localStorage.setItem(key, id), [SKIN_STORAGE_KEY, skinId]);
  await gotoSettled(page);
  await ensureDark(page);
  await openSession(page);

  const rightbarClosed = await page.evaluate(() => Math.round(document.querySelector('[class*="_rightbarCol"]')?.getBoundingClientRect().width ?? -1) === 0);
  if (rightbarClosed) await openSidebarIfNeeded(page);
  await page.waitForTimeout(500);

  const baseline = await measureCenter(page, "baseline(docked)");
  if (baseline === null) fail("center column vanished from the DOM");
  if (baseline < 1000) {
    console.error("INVALID: docked baseline unhealthy (<1000 bright px) — session has no measurable content");
    process.exit(3);
  }

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    if (!(await enterFullscreen(page))) {
      console.error("INVALID: could not reach right-panel fullscreen (button surface drifted)");
      process.exit(3);
    }
    await page.waitForTimeout(800);
    await measureCenter(page, `cycle${cycle} fullscreen`);
    if (!(await collapseSidebar(page))) fail(`cycle ${cycle}: no "Collapse right sidebar" control found`);
    await page.waitForTimeout(2000);
    const rp = await rpMode(page);
    const after = await measureCenter(page, `cycle${cycle} after-collapse`, cycle === 2 ? "repro-collapse.png" : undefined);
    if (after === null) fail(`cycle ${cycle}: center column vanished after collapse`);
    // The stale marker is the documented host behavior, not the verdict.
    console.log(`cycle ${cycle}: rp-after-collapse=${rp} (stale fullscreen expected on unfixed AND fixed builds)`);
    if (after < 0.5 * baseline) {
      fail(`cycle ${cycle}: conversation blank after fullscreen→collapse (bright=${after} < 50% of baseline ${baseline}) — see repro-collapse.png`);
    }
    if (after < 0.7 * baseline) {
      console.error(`REVIEW: cycle ${cycle} lost >30% bright px (${after}/${baseline})`);
      process.exit(2);
    }
    // Re-open for the next cycle.
    if (cycle < 2) {
      await openSidebarIfNeeded(page);
      await page.waitForTimeout(800);
    }
  }

  console.log(`PASS: fullscreen→collapse keeps the conversation painted (baseline=${baseline}, both cycles ≥70%)`);
  process.exit(0);
} finally {
  await browser.close();
}
