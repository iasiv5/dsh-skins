/**
 * Capture README preview shots from the live DSH Web GUI.
 *
 * Privacy protocol (see README contribution docs):
 *   1. UI forced to zh-CN; every workspace row in the sidebar is collapsed
 *      into its folder (aria-expanded=false) before shooting;
 *   2. "New Session" is clicked so the conversation area is an empty session —
 *      no conversation content ever enters the frame;
 *   3. foreign banners (e.g. the dsh-auth "internal testing" notice) are
 *      hidden — they belong to other plugins, not to this skin;
 *   4. the switcher close-up frames the popover AND its trigger button
 *      together (the update row stays visible; its text depends on the
 *      install source — acceptable per maintainer decision).
 *
 * Side-effect care: switching the appearance card writes the host-scoped
 * theme preference, so the originally selected card is restored at the end.
 *
 * Usage:
 *   node scripts/capture-previews.mjs --probe                 # inspect only
 *   node scripts/capture-previews.mjs                         # full capture
 *   node scripts/capture-previews.mjs --skin tgcf --gate      # release gate assertions, local evidence
 *   node scripts/capture-previews.mjs --skin tgcf --out docs/assets # intentional docs update
 * Options:
 *   --url <base>   default http://127.0.0.1:3080
 *   --out <dir>    explicit output override; full captures default to
 *                  docs/assets, while --gate defaults to the versioned,
 *                  gitignored .artifacts/release-gates/v<package version>
 *   --skin <id>    default openbmc (output names follow the skin id)
 *   --gate         run the semi-automated release-gate assertions and exit
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCaptureOutDir } from "./capture-output.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const baseUrl = option("--url", "http://127.0.0.1:3080");
const skin = option("--skin", "openbmc");
const probe = flag("--probe");
const gate = flag("--gate");
const packageVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const outDir = resolveCaptureOutDir({
  gate,
  explicitOut: option("--out", undefined),
  packageVersion,
});

const VIEWPORT = { width: 1600, height: 1000 };
const WEBP_QUALITY = 0.82;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
mkdirSync(outDir, { recursive: true });
console.log(`${gate ? "release-gate evidence" : "capture output"} -> ${outDir}`);

/** Convert a PNG buffer to WebP through an in-page canvas (no extra deps). */
async function toWebp(page, pngBuffer, quality = WEBP_QUALITY) {
  const dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  const out = await page.evaluate(async ({ dataUrl, quality }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", quality);
  }, { dataUrl, quality });
  return Buffer.from(out.split(",", 2)[1], "base64");
}

/** Dismiss the official first-visit "internal testing" notice dialog. */
async function dismissNotices(page) {
  const modal = page.locator('div[role="presentation"]:has(button:has-text("继续"))').first();
  if (await modal.count() === 0) return false;
  await modal.locator("button").last().click();
  try {
    await page.waitForSelector('div[class*="_mask_"]', { state: "detached", timeout: 5_000 });
  } catch {}
  await page.waitForTimeout(600);
  return true;
}

async function newPage(colorScheme) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme,
    locale: "zh-CN", // screenshots use the Chinese UI (primary audience)
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?skin=${skin}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dsh-skins-switcher-btn", { timeout: 30_000 });
  await page.waitForTimeout(2_500); // let React settle and the backdrop paint
  await dismissNotices(page);
  return { context, page };
}

/** Click "New Session" so the conversation area is a fresh empty session. */
async function startEmptySession(page) {
  for (const selector of ['button[class*="newSession"]', '[aria-label="新建会话"]', 'button:has-text("新会话")']) {
    const button = page.locator(selector).first();
    if (await button.count() >= 1 && await button.isVisible()) {
      await button.click();
      await page.waitForTimeout(1_500);
      return true;
    }
  }
  return false;
}

/** Collapse every expanded workspace row; returns still-expanded count. */
async function collapseWorkspaces(page) {
  for (let round = 0; round < 5; round += 1) {
    const expanded = await page.locator('[class*="projectRow"][aria-expanded="true"]').all();
    if (expanded.length === 0) return 0;
    for (const row of expanded) {
      // click the row's own text (not the action buttons) to toggle the folder
      await row.locator('[class*="projectText"]').first().click();
      await page.waitForTimeout(350);
    }
  }
  return await page.locator('[class*="projectRow"][aria-expanded="true"]').count();
}

/** Hide banners owned by other plugins (dsh-auth internal-testing notice). */
async function hideForeignBanners(page) {
  return page.evaluate(() => {
    const hidden = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while ((node = walker.nextNode())) {
      const textOnly = node.childNodes.length > 0 && [...node.childNodes].every((n) => n.nodeType === Node.TEXT_NODE);
      const text = textOnly ? node.textContent.trim() : "";
      if (text !== "" && /内测|Internal Testing/i.test(text)) {
        let target = node;
        for (let i = 0; i < 3 && target.parentElement; i += 1) {
          const rect = target.getBoundingClientRect();
          if (rect.width > 600 && rect.height < 90) break;
          target = target.parentElement;
        }
        target.style.display = "none";
        hidden.push(text.slice(0, 30));
      }
    }
    return hidden;
  });
}

/** Selected appearance card index: 0 light, 1 dark, 2 system. */
async function selectedThemeIndex(page) {
  return page.locator('.dsh-skins-pop .dsh-skins-theme-card[aria-pressed="true"]').evaluateAll(
    (nodes) => nodes.map((node, i) => node.getAttribute("aria-pressed") === "true" ? i : -1).filter((i) => i >= 0)[0] ?? null,
  );
}

async function openSwitcher(page) {
  await page.click(".dsh-skins-switcher-btn");
  await page.waitForSelector(".dsh-skins-pop", { timeout: 10_000 });
  await page.waitForTimeout(600);
}

async function closeSwitcher(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

async function clickThemeCard(page, index) {
  await openSwitcher(page);
  await page.locator(".dsh-skins-pop .dsh-skins-theme-card").nth(index).click();
  await page.waitForTimeout(700);
  await closeSwitcher(page);
}

/** Privacy gate: assert no session title can leak into the frame. */
async function privacyCheck(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="projectRow"]')].map((row) => ({
      name: row.textContent.trim().slice(0, 24),
      expanded: row.getAttribute("aria-expanded"),
    }));
    return { workspaces: rows, expandedCount: rows.filter((r) => r.expanded === "true").length };
  });
}

async function writeShot(name, buffer) {
  const file = join(outDir, name);
  writeFileSync(file, buffer);
  console.log(`${name}: ${(buffer.length / 1024).toFixed(0)} KiB`);
}

/** Wait until the docked personalization layout is visibly settled, not merely
 * mounted in the DOM. This keeps release evidence from capturing the narrow
 * list-only frame during the shell's width sweep. */
async function waitForPersonalizationFrame(page) {
  await page.waitForFunction(() => {
    const shell = document.querySelector(".dsh-skins-pop.dsh-skins-wide");
    const panel = document.querySelector(".dsh-skins-pz-panel");
    if (shell === null || panel === null) return false;
    const shellRect = shell.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const opacity = Number.parseFloat(getComputedStyle(panel).opacity);
    return shellRect.width >= 600 && panelRect.width >= 240 && opacity >= 0.99;
  }, undefined, { timeout: 5_000 });
  return page.evaluate(() => {
    const shell = document.querySelector(".dsh-skins-pop.dsh-skins-wide").getBoundingClientRect();
    const panel = document.querySelector(".dsh-skins-pz-panel").getBoundingClientRect();
    return { shellWidth: Math.round(shell.width), panelWidth: Math.round(panel.width) };
  });
}

if (probe) {
  const { context, page } = await newPage("dark");
  const started = await startEmptySession(page);
  const remaining = await collapseWorkspaces(page);
  await hideForeignBanners(page);
  const privacy = await privacyCheck(page);
  console.log(`new-session clicked: ${started}; expanded workspace rows: ${privacy.expandedCount}`);
  console.log("workspace rows:", JSON.stringify(privacy.workspaces));
  const webp = await toWebp(page, await page.screenshot(), 0.9);
  writeFileSync("/tmp/dsh-skins-probe.webp", webp);
  console.log(`probe shot -> /tmp/dsh-skins-probe.webp (${(webp.length / 1024).toFixed(0)} KiB)`);
  await context.close();
  await browser.close();
  process.exit(0);
}

// ---- gate: semi-automated release assertions (design §13) ----
// Run against a GUI with the candidate plugin installed:
//   node scripts/capture-previews.mjs --skin tgcf --gate
/** Privacy gate shared by --gate and the full capture (R13): every captured
 *  evidence frame must pass through this preparation. */
async function preparePrivateCapture(page) {
  const started = await startEmptySession(page);
  if (!started) console.warn("WARN: New Session button not found — conversation area may show existing content.");
  const remaining = await collapseWorkspaces(page);
  if (remaining > 0) throw new Error(`privacy gate failed: ${remaining} workspace row(s) still expanded`);
  const banners = await hideForeignBanners(page);
  if (banners.length > 0) console.log("hidden foreign banner(s):", banners);
  const privacy = await privacyCheck(page);
  return privacy;
}

if (gate) {
  const failures = [];
  const check = (ok, label) => {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failures.push(label);
  };
  const { context: gctx, page: gpage } = await newPage("dark");
  await preparePrivateCapture(gpage);

  // 1. Every catalog skin card exposes a keyboard-focusable gear.
  // `runtime.list()` returns ONLY the extension skins (official is prepended
  // by the switcher at render time), so gear count === list length and the
  // gear NodeList order === the extension list order. `--skin` now REALLY
  // decides which skin's panel the gate exercises (the old `.last()` always
  // hit the last card regardless of --skin).
  await openSwitcher(gpage);
  const gears = gpage.locator(".dsh-skins-pz-gear");
  const skinIds = await gpage.evaluate(() => window.__DSH_SKINS__.list().map((item) => item.id));
  check(await gears.count() === skinIds.length, `personalization gear on all ${skinIds.length} catalog skins (got ${await gears.count()})`);
  const targetIndex = skinIds.indexOf(skin);
  if (targetIndex < 0) throw new Error(`unknown or non-personalizable gate skin: ${skin}`);
  const targetGear = gears.nth(targetIndex);
  await targetGear.focus();
  check(await targetGear.evaluate((node) => node === document.activeElement), "gear is keyboard focusable");

  // 2. Gear docks the panel column; Escape closes the WHOLE combined shell.
  await gpage.keyboard.press("Enter");
  await gpage.waitForSelector(".dsh-skins-pz-panel", { timeout: 5_000 });
  check(true, "personalization panel docks beside the list");
  await gpage.keyboard.press("Escape");
  await gpage.waitForTimeout(300);
  check(await gpage.locator(".dsh-skins-pop").count() === 0, "Escape closes the combined shell");

  // 3. Auto-save flow (ADR-0003): edit the slogan → the debounced flush
  //    persists it with NO save action; it survives a reload. Then
  //    恢复默认 restores the factory slogan automatically (no dirty data
  //    is left behind on the release machine, M4). The tab title is a
  //    static skin asset since v2.4.1 #5, so the slogan carries this
  //    flow; persistence is asserted through the panel's own synced
  //    input, independent of host DOM.
  // Slogan input: match on the "(ZH)" suffix — the label text itself
  // ("标语 Slogan") is dict copy and may be reworded.
  const sloganInput = () => gpage.locator('.dsh-skins-pz-panel input[aria-label$="(ZH)"]');
  // Factory slogans per gate skin: 恢复默认 must land back on the skin's OWN
  // catalog default (complete map — every --skin target is covered).
  const FACTORY_SLOGANS_ZH = {
    meirenzhi: "风起凡尘 · 红颜问道",
    openbmc: "察于未萌 · 治于未乱",
    "uefi-harness": "启于固件 · 行于万象",
    tgcf: "百无禁忌",
  };
  const openPanel = async () => {
    await openSwitcher(gpage);
    await targetGear.click();
    await gpage.waitForSelector(".dsh-skins-pz-panel", { timeout: 5_000 });
  };
  await openPanel();
  await sloganInput().fill("验收实验标语");
  await gpage.waitForTimeout(1200); // 400ms debounce + PATCH + refetch
  check(await sloganInput().inputValue() === "验收实验标语", "auto-save keeps the edited slogan in the synced panel");
  await gpage.reload();
  await preparePrivateCapture(gpage);
  await openPanel();
  check(await sloganInput().inputValue() === "验收实验标语", "auto-save persists across reload");
  // Cleanup: 恢复默认 flushes the factory values automatically. Since user
  // ruling #9 it guards with a window.confirm listing the affected fields —
  // playwright auto-DISMISSES native dialogs, which would silently no-op the
  // reset, so accept it explicitly.
  gpage.once("dialog", (dialog) => dialog.accept());
  await gpage.locator('.dsh-skins-pz-panel button', { hasText: "恢复默认" }).click();
  await gpage.waitForTimeout(1200);
  await gpage.reload();
  await preparePrivateCapture(gpage);
  await openPanel();
  check(await sloganInput().inputValue() === FACTORY_SLOGANS_ZH[skin], "恢复默认 restores the factory slogan");

  // 4. Static branding: the target skin's favicon is a fixed skin asset.
  const favicon = await gpage.locator('link[rel="icon"]').first().getAttribute("href");
  check(typeof favicon === "string" && favicon.length > 0, "static skin favicon present");

  // 5. Personalization panel shot for records (under the resolved output directory).
  // Lifecycle: the panel from step 3's openPanel() is STILL OPEN here — the
  // old code unconditionally called openSwitcher() again, which TOGGLED the
  // shell closed (the trigger is a toggle) and raced the gear click against
  // the unmounting node. Reuse the open panel instead.
  await gpage.waitForSelector(".dsh-skins-pz-panel", { timeout: 5_000 });
  const frame = await waitForPersonalizationFrame(gpage);
  check(true, `personalization evidence frame settled (shell ${frame.shellWidth}px, panel ${frame.panelWidth}px)`);
  await writeShot(`${skin}-personalize.webp`, await toWebp(gpage, await gpage.screenshot()));
  await closeSwitcher(gpage);

  await gctx.close();
  await browser.close();
  if (failures.length > 0) {
    console.error(`GATE FAILED: ${failures.length} assertion(s)`);
    process.exit(1);
  }
  console.log("GATE PASSED");
  process.exit(0);
}

// ---- full capture: <skin> dark / light + switcher close-up ----
const { context, page } = await newPage("dark");

const privacy = await preparePrivateCapture(page);
console.log("workspace rows:", JSON.stringify(privacy.workspaces));

await openSwitcher(page);
const originalTheme = await selectedThemeIndex(page);
console.log(`original appearance card index: ${originalTheme}`);
await closeSwitcher(page);

// 1. <skin>, dark
await clickThemeCard(page, 1);
await writeShot(`${skin}-dark.webp`, await toWebp(page, await page.screenshot()));

// 2. <skin>, light
await clickThemeCard(page, 0);
await writeShot(`${skin}-light.webp`, await toWebp(page, await page.screenshot()));

// 3. Switcher close-up (dark): popover AND its 皮肤切换 trigger button in one frame
await clickThemeCard(page, 1);
await openSwitcher(page);
const pop = await page.locator(".dsh-skins-pop").boundingBox();
const btn = await page.locator(".dsh-skins-switcher-btn").boundingBox();
const pad = 24;
const clip = {
  x: Math.max(0, Math.floor(Math.min(pop.x, btn.x) - pad)),
  y: Math.max(0, Math.floor(Math.min(pop.y, btn.y) - pad)),
};
clip.width = Math.min(VIEWPORT.width, Math.ceil(Math.max(pop.x + pop.width, btn.x + btn.width) + pad)) - clip.x;
clip.height = Math.min(VIEWPORT.height, Math.ceil(Math.max(pop.y + pop.height, btn.y + btn.height) + pad)) - clip.y;
const inside = (box) => box.x >= clip.x && box.y >= clip.y && box.x + box.width <= clip.x + clip.width && box.y + box.height <= clip.y + clip.height;
console.log(`close-up clip ${JSON.stringify(clip)}; pop in frame: ${inside(pop)}, button in frame: ${inside(btn)}`);
if (!inside(pop) || !inside(btn)) throw new Error("close-up framing failed: popover or trigger button outside the clip");
await writeShot(`${skin}-switcher-dark.webp`, await toWebp(page, await page.screenshot({ clip })));
await closeSwitcher(page);

// restore the appearance the user had before we touched it
if (originalTheme !== null && originalTheme !== 1) await clickThemeCard(page, originalTheme);

await context.close();
await browser.close();
console.log("done.");
