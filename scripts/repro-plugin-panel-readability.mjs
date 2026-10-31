#!/usr/bin/env node
// repro-plugin-panel-readability.mjs — ADR-0022 acceptance harness.
//
// Headless reproduction/verification for the plugin-panel bleed-through: on a
// skin, the plugin panel route container (section[data-plugin-panel="true"],
// hosting the Installed/Market tabs and every settings sub-page) paints fully
// transparent, so text sits on a "translucent bg token × wallpaper" composite
// (live-DOM evidence 2026-10-30: whole chain rgba(0,0,0,0), only the frame
// token fills — web openbmc dark P=55 measured rgba(12,26,38,0.55)). The
// ADR-0022 reading base paints the container solid; the official theme paints
// an opaque token here, so solid matches the official look.
//
// Unlike ADR-0021 the disease IS visible in computed styles (the 0021
// paint-order bug was not), so the primary criterion is computed-style based:
// exactly one panel container, ≥60% viewport wide, computed background alpha
// === 1, and its rgb channels equal to the skin's current
// --dsw-specific-sidebar-fill channels (mode-adaptive — the custom property
// resolves per active theme). No bright-pixel counting needed.
//
// Flow: cold-load → detect active skin (official ⇒ nothing to verify) → open
// the Plugins page → assert. PASS = solid + token-channel match + unique
// container; FAIL = transparent/mismatched base (the disease, e.g. old lib);
// INVALID = page/panel not reachable (harness problem, not a verdict).
//
// Modes:
//   (default)          skin detection + plugin-page criteria + verdict
//   --fingerprint-only served runtime-tag probe only (hot-deploy effect check)
//   --no-fingerprint   accepted no-op (the main run never gates on tag
//                      presence; criteria are self-sufficient)
//   --gate             for the `test` pipeline: if --url is unreachable, print
//                      an explicit SKIP line and exit 0 (CI has no live host)
//
// Exit codes: 0 PASS / SKIP · 1 FAIL · 2 REVIEW · 3 INVALID (baseline/bundle)
// Artifacts: repro-reading-<n>.png next to the script's CWD.
//
// Usage:
//   node scripts/repro-plugin-panel-readability.mjs [--url http://127.0.0.1:3080]
//        [--viewport 1920x1080] [--fingerprint-only] [--no-fingerprint] [--gate]

import { chromium } from "playwright-core";

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
const fingerprintOnly = has("--fingerprint-only");
const gate = has("--gate");

const READING_TAG_SELECTOR = 'style[data-plugin-css$=".reading.css"]';
const PANEL_SELECTOR = '[data-plugin-panel="true"]';

function verdict(code, label, detail) {
  console.log(`${label}: ${detail}`);
  process.exit(code);
}

// ---- main --------------------------------------------------------------------

// Reachability probe BEFORE the browser launch (house pattern,
// repro-fullscreen-collapse.mjs): CI has neither a live host nor playwright
// browsers, so --gate runs must SKIP before touching chromium (release run
// 41179487722: launch-then-probe crashed the CI check in 22s).
let reachable = false;
try {
  const probe = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
  reachable = probe.ok;
} catch {}
if (!reachable) {
  if (gate) verdict(0, "SKIP", `no live host at ${baseUrl} — CI has no live host`);
  verdict(1, "FAIL", `host unreachable (${baseUrl})`);
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
} catch (error) {
  if (gate) verdict(0, "SKIP", `playwright browser unavailable — ${error.message.split("\n")[0]}`);
  verdict(1, "FAIL", `browser launch failed: ${error.message.split("\n")[0]}`);
}
let shotIndex = 0;
try {
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (error) {
    if (gate) verdict(0, "SKIP", `host unreachable (${baseUrl}) — CI has no live host`);
    verdict(1, "FAIL", `host unreachable (${baseUrl}): ${error.message.split("\n")[0]}`);
  }
  // Skin bundle injection is server-aggregated and can lag behind
  // domcontentloaded on a cold cache (field evidence 2026-10-31: the reading
  // tag flapped ABSENT→PRESENT across identical runs within one minute, and
  // one full run saw the tag ABSENT at +3s yet PASS after navigation). Poll
  // for the skin's own style tags + body scope attribute instead of a fixed
  // sleep; judge only after they have landed. Old libs settle the same way
  // (skin tags mount, reading.css never does) — the disease path is unaffected.
  let skinSettled = true;
  await page
    .waitForFunction(
      () => document.querySelector('style[data-plugin-css^="dsh-skins/"]') !== null
        && Object.keys(document.body.dataset).some((key) => /^dsh/.test(key)),
      undefined,
      { timeout: 20000 },
    )
    .catch(() => { skinSettled = false; });
  await page.waitForTimeout(500);

  const state = await page.evaluate((readingSelector) => ({
    skinKey: Object.keys(document.body.dataset).find((key) => /^dsh/.test(key)) ?? null,
    readingTag: document.querySelector(readingSelector) !== null,
  }), READING_TAG_SELECTOR);

  if (state.skinKey === null) {
    // No dsh-prefixed body scope attribute — three causes with different
    // verdicts (impl-review R2/R3/R4):
    //   partial injection — a dsh-skins style tag exists but the scope
    //     attribute never appeared (out-of-namespace skin or torn injection)
    //     → fail-closed INVALID, message names the observed signal shape;
    //   settled race — both signals landed at settle time but the attribute
    //     is gone at read time (millisecond unmount window) → INVALID;
    //   ZERO dsh signals after the full 20s budget — an official page and an
    //     active skin that never injected are indistinguishable via pure DOM
    //     probing (R2 residual window): print an explicit WARN and take the
    //     official chain per the plan's T5 spec. Never a green PASS here —
    //     the reachable verdicts are SKIP/REVIEW/FINGERPRINT-absent only.
    const signals = await page.evaluate(
      () => ({ skinTags: document.querySelector('style[data-plugin-css^="dsh-skins/"]') !== null }),
    );
    if (!skinSettled && signals.skinTags) {
      await page.screenshot({ path: `repro-reading-${++shotIndex}.png` });
      verdict(3, "INVALID", `partial skin-bundle injection on ${baseUrl}: dsh-skins style tag present but no body scope attribute matching /(^dsh)/ — out-of-namespace skin or torn injection; re-run / extend the detector`);
    }
    if (skinSettled && signals.skinTags) {
      await page.screenshot({ path: `repro-reading-${++shotIndex}.png` });
      verdict(3, "INVALID", `skin scope attribute matching /(^dsh)/ was present at settle but vanished by read time on ${baseUrl} — millisecond unmount race; re-run`);
    }
    console.warn(`WARN: zero dsh signals after the full 20s settle budget on ${baseUrl} — official state or an injection failure indistinguishable via DOM; official chain taken, human review advised (impl-review R2 residual window)`);
    if (fingerprintOnly) {
      verdict(1, "FINGERPRINT", `no active skin on ${baseUrl} — reading tag absent is expected (official state)`);
    }
    if (gate) verdict(0, "SKIP", `official skin active on ${baseUrl} — nothing to verify (mount a skin to exercise the reading base)`);
    verdict(2, "REVIEW", `official skin active on ${baseUrl} — the reading base is skin-scoped; mount a skin first`);
  }
  if (fingerprintOnly) {
    verdict(state.readingTag ? 0 : 1, "FINGERPRINT",
      state.readingTag
        ? `reading tag present on the live page (${baseUrl}) — deployed lib carries ADR-0022`
        : "reading tag ABSENT on the live page — deployed lib predates ADR-0022");
  }
  console.log(`skin: ${state.skinKey} (${state.readingTag ? "reading tag present" : "reading tag ABSENT — pre-ADR-0022 lib"})`);

  const nav = page.getByText(/^(插件|Plugins)$/, { exact: true }).first();
  try {
    await nav.click({ timeout: 10000 });
  } catch {
    await page.screenshot({ path: "repro-reading-nav-miss.png" });
    verdict(3, "INVALID", `plugin nav not found on ${baseUrl} — page layout or locale drifted`);
  }
  await page.waitForSelector(PANEL_SELECTOR, { timeout: 15000 }).catch(async () => {
    await page.screenshot({ path: `repro-reading-${++shotIndex}.png` });
    verdict(3, "INVALID", `panel container ${PANEL_SELECTOR} never appeared — plugin page structure drifted`);
  });
  await page.waitForTimeout(1500);

  const stat = await page.evaluate((selector) => {
    // Browser-context self-contained: helpers must live inside the evaluate
    // callback (Node-scope identifiers are not visible to page.evaluate).
    const parseRgbaChannels = (value) => {
      const match = /rgba?\(([^)]+)\)/.exec(value ?? "");
      if (match === null) return null;
      const parts = match[1].split(/[\s,/]+/).filter((piece) => piece !== "").map(Number);
      if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const sections = [...document.querySelectorAll(selector)];
    if (sections.length !== 1) {
      return { fail: `panel containers = ${sections.length}, expect exactly 1 (uniqueness nail, ADR-0022 Decision 5)` };
    }
    const el = sections[0];
    const rect = el.getBoundingClientRect();
    if (rect.width < innerWidth * 0.6) {
      return { invalid: `panel width ${Math.round(rect.width)} < 60% of ${innerWidth} — not the full-page container` };
    }
    const computed = getComputedStyle(el);
    const bg = parseRgbaChannels(computed.backgroundColor);
    if (bg === null) return { fail: `panel background unparseable: "${computed.backgroundColor}"` };
    if (bg.a !== 1) return { fail: `panel background alpha ${bg.a} — the bleed-through disease is live (expected solid)` };
    const fill = getComputedStyle(document.body).getPropertyValue("--dsw-specific-sidebar-fill");
    const channels = parseRgbaChannels(fill);
    if (channels === null) return { invalid: `--dsw-specific-sidebar-fill unparseable: "${fill}"` };
    if (bg.r !== channels.r || bg.g !== channels.g || bg.b !== channels.b) {
      return { fail: `panel rgb(${bg.r}, ${bg.g}, ${bg.b}) != sidebar-fill rgb(${channels.r}, ${channels.g}, ${channels.b})` };
    }
    return {
      ok: `bg=${computed.backgroundColor} fill=${fill.trim()} rect=${Math.round(rect.width)}x${Math.round(rect.height)}`,
    };
  }, PANEL_SELECTOR);

  await page.screenshot({ path: `repro-reading-${++shotIndex}.png` });

  if (stat.invalid !== undefined) verdict(3, "INVALID", stat.invalid);
  if (stat.fail !== undefined) verdict(1, "FAIL", `${stat.fail} (skin ${state.skinKey})`);
  verdict(0, "PASS", `plugin panel paints solid over the wallpaper (skin ${state.skinKey}) — ${stat.ok}`);
} finally {
  await browser.close();
}
