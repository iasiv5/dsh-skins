#!/usr/bin/env node
/**
 * Old/new delivery-channel A/B (ADR-0023 Task 11).
 *
 * The repo has NO self-served rendering fixture (the repro gates are
 * live-host clients, smoke is a fake DOM, routes tests are fake req/res), so
 * this script builds its own: one http.Server per tree serving a host page
 * plus that tree's lib/client.js, with the NEW tree additionally serving its
 * builtin assets through the very same createBuiltinAssetServer the Host
 * uses (src/host/builtin-assets.js + the shipped assets/manifest.json).
 * The host page stubs window.__ModuleLoader__ and the module ctx with the
 * same contract smoke-test.cjs exercises, but runs in a real browser DOM.
 *
 * Stub fidelity only affects ABSOLUTE pixels, never the DIFF: both trees
 * render through the same page and the same stubs, so the verdict — per-pixel
 * δmax per skin × mode cell — isolates the delivery channel.
 *
 * Negative control: --abort-builtin-assets routes-aborts every b_ request on
 * the new tree. Expectation: (a) δ≠0 vs the old tree becomes DETERMINISTIC
 * (wallpaper absent), and (b) fail-open proves itself offline — meirenzhi
 * (overlay scrim) keeps its ::after gradient + body base color, uefi (baked
 * scrim) keeps the linear-gradient first layer of background-image.
 *
 * Usage: node scripts/ab-delivery-compare.mjs --old <dir> --new <dir> [--abort-builtin-assets]
 * Exit: 0 all cells pass · 1 any cell failed.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { decodePng } from "./lib/paint-metrics.mjs";
import { awaitWallpaperSettled } from "./lib/wallpaper-settled.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : resolve(args[index + 1]);
};
const oldDir = option("--old", null);
const newDir = option("--new", resolve("."));
const abortBuiltinAssets = args.includes("--abort-builtin-assets");
if (oldDir === null) {
  console.error("ab-delivery-compare: --old <dir> is required (the v1.5.21 worktree)");
  process.exit(1);
}

const SKINS = ["openbmc", "uefi-harness", "meirenzhi"];
const MODES = ["light", "dark"];

// ---- host page (same template for both trees; skin/mode via query) --------

const HOST_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>DeepSeek Harness</title>
<style>
  /* ADR-0017 纪要③ freeze + animation freeze (meirenzhi breathe/fireflies
     are infinite animations — arbitrary screenshot times would differ). */
  *, *::before, *::after { transition: none !important; animation: none !important; }
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
</style></head>
<body>
<script>
  (function () {
    const params = new URLSearchParams(location.search);
    const skinId = params.get("skin");
    const dark = params.get("mode") === "dark";
    // Deterministic per-cell state: storage keys are rewritten every load.
    localStorage.setItem("dsh-skins:active", skinId);
    localStorage.setItem("dsh-skins:theme-preference", dark ? "dark" : "light");
    if (dark) document.body.setAttribute("data-ds-dark-theme", "");

    // Module loader + require stubs — the contract shape smoke-test.cjs runs.
    const registrations = {};
    const h = (type, props) => ({ $$el: true, type, props: props ?? {} });
    const require = (spec) => {
      if (spec === "react/jsx-runtime") return { jsx: h, jsxs: (t, p) => h(t, p), Fragment: "Fragment" };
      if (spec === "react") return {
        useState: (init) => [typeof init === "function" ? init() : init, () => {}],
        useEffect: () => {}, useLayoutEffect: () => {}, useCallback: (fn) => fn, useRef: (v) => ({ current: v }),
      };
      if (spec === "react-dom") return { createPortal: (children) => ({ $$portal: true, children }) };
      throw new Error("unexpected require: " + spec);
    };
    window.__ModuleLoader__ = { load(reg) { registrations[reg.id] = reg.factory(require); } };

    // ctx stub (ported from smoke-test.cjs; fidelity affects absolute pixels,
    // never the A/B diff — both trees get the identical stub).
    const eventListeners = new Map();
    let themeSnapshot = { preference: dark ? "dark" : "light", active: { id: dark ? "dark" : "light" }, themes: [], revision: 0 };
    const ctx = {
      slots: {
        _injected: [],
        register(opts, comp) { if (!this._injected.includes(opts.name)) throw new Error("undeclared slot " + opts.name); return () => {}; },
        inject(key, callback) { this._injected.push(key); try { const d = callback(); return typeof d === "function" ? d : () => {}; } finally { this._injected.pop(); } },
      },
      locale: {
        dicts: new Map(), active: "zh",
        register: (ns, dicts) => { ctx.locale.dicts.set(ns, dicts); return () => {}; },
        getLocale: () => ({ active: ctx.locale.active }),
        translate: (ns, key, params) => {
          const dict = ctx.locale.dicts.get(ns);
          const template = (dict && (dict[ctx.locale.active] || dict.en) || {})[key] ?? key;
          return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll("{" + name + "}", String(value)), template);
        },
      },
      connection: { isLoopback: false },
      theme: {
        getTheme: () => themeSnapshot,
        setTheme(id) { themeSnapshot = { ...themeSnapshot, preference: id, active: { id: id === "system" ? "light" : id }, revision: themeSnapshot.revision + 1 }; },
        _layers: new Map(),
        overrideTokens(source, tokens) { this._layers.set(source, tokens); return () => this._layers.delete(source); },
      },
      on(event, fn) {
        const list = eventListeners.get(event) ?? [];
        list.push(fn);
        eventListeners.set(event, list);
        return () => eventListeners.set(event, list.filter((item) => item !== fn));
      },
      effect(setup) { setup(); },
    };

    window.addEventListener("error", (e) => { window.__AB_PAGE_ERROR__ = String(e.message); });

    const bootTimer = setInterval(() => {
      const mod = registrations["@iasiv5/dsh-skins"];
      if (mod === undefined) return;
      clearInterval(bootTimer);
      try {
        mod.apply(ctx);
        window.__AB_READY__ = true;
      } catch (error) {
        window.__AB_PAGE_ERROR__ = String(error && error.stack || error);
        window.__AB_READY__ = true; // surface the error via the probe below
      }
    }, 10);
  })();
</script>
<script src="/client.js"></script>
</body></html>`;

// ---- per-tree server -------------------------------------------------------

async function startTreeServer(treeDir, { serveBuiltinAssets }) {
  const clientJs = readFileSync(join(treeDir, "lib/client.js"));
  let builtin = null;
  if (serveBuiltinAssets) {
    const manifest = JSON.parse(readFileSync(join(treeDir, "assets/manifest.json"), "utf8"));
    const { createBuiltinAssetServer } = await import(`file://${join(treeDir, "src/host/builtin-assets.js").replace(/\\/g, "/")}`);
    builtin = createBuiltinAssetServer({ assetsDir: join(treeDir, "assets"), manifest });
  }
  const server = createServer((request, response) => {
    const path = String(request.url ?? "").split("?")[0];
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(HOST_PAGE);
    } else if (path === "/client.js") {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(clientJs);
    } else if (builtin !== null && path.startsWith("/dsh-skins/assets/")) {
      const blob = builtin.serveBuiltinAsset(String(request.url ?? ""));
      if (blob === null) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end('{"error":"asset not found"}');
      } else {
        response.writeHead(200, {
          "content-type": blob.meta.mime,
          "cache-control": "private, max-age=31536000, immutable",
          etag: `"${blob.meta.sha256}"`,
        });
        response.end(blob.buffer);
      }
    } else {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

// ---- probe + compare -------------------------------------------------------

async function captureCell(context, baseUrl, skinId, mode, { abort } = {}) {
  const page = await context.newPage();
  if (abort) {
    await page.route(/\/dsh-skins\/assets\/b_/, (route) => route.abort());
  }
  await page.goto(`${baseUrl}/?skin=${skinId}&mode=${mode}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(() => window.__AB_READY__ === true, null, { timeout: 10_000 });
  const pageError = await page.evaluate(() => window.__AB_PAGE_ERROR__ ?? null);
  if (pageError !== null) throw new Error(`page error for ${skinId}/${mode}: ${pageError}`);
  await awaitWallpaperSettled(page, { timeoutMs: 10_000 });
  await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => resolvePromise())));
  const computed = await page.evaluate(() => {
    const before = getComputedStyle(document.body, "::before");
    const after = getComputedStyle(document.body, "::after");
    return {
      bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
      beforeBackgroundImage: before.backgroundImage,
      beforeFilter: before.filter,
      afterBackgroundImage: after.backgroundImage,
      bodyAttrs: [...document.body.attributes].map((attribute) => attribute.name).sort(),
    };
  });
  const screenshot = await page.screenshot({ type: "png" });
  await page.close();
  return { computed, screenshot };
}

function pixelDelta(oldPng, newPng) {
  const a = decodePng(oldPng);
  const b = decodePng(newPng);
  if (a.width !== b.width || a.height !== b.height) return { deltaMax: 255, differing: a.width * a.height, size: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  let deltaMax = 0;
  let differing = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const channel = Math.max(
      Math.abs(a.data[index] - b.data[index]),
      Math.abs(a.data[index + 1] - b.data[index + 1]),
      Math.abs(a.data[index + 2] - b.data[index + 2]),
    );
    if (channel > deltaMax) deltaMax = channel;
    if (channel !== 0 || a.data[index + 3] !== b.data[index + 3]) differing += 1;
  }
  return { deltaMax, differing, size: `${a.width}x${a.height}` };
}

function computedDelta(oldComputed, newComputed) {
  const differences = [];
  for (const key of Object.keys(oldComputed)) {
    const before = JSON.stringify(oldComputed[key]);
    const after = JSON.stringify(newComputed[key]);
    if (before !== after) {
      differences.push({
        key,
        before: before.length > 90 ? `${before.slice(0, 90)}…` : before,
        after: after.length > 90 ? `${after.slice(0, 90)}…` : after,
        rawBefore: Array.isArray(oldComputed[key]) ? oldComputed[key].join("|") : oldComputed[key],
        rawAfter: Array.isArray(newComputed[key]) ? newComputed[key].join("|") : newComputed[key],
      });
    }
  }
  return differences;
}

// Mask url(...) payloads in a RAW computed value; the only tolerated drift is
// the wallpaper's url string itself (inline data URL vs routed http URL).
const maskUrls = (value) => String(value).replace(/url\("?([^")]+)"?\)/g, () => "url(<URL>)");
const urlOnly = (difference) => difference.key === "beforeBackgroundImage"
  && maskUrls(difference.rawBefore) === maskUrls(difference.rawAfter);

// ---- run -------------------------------------------------------------------

const browser = await chromium.launch();
let failed = false;
try {
  const oldTree = await startTreeServer(oldDir, { serveBuiltinAssets: false });
  const newTree = await startTreeServer(newDir, { serveBuiltinAssets: true });
  const oldContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const newContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  for (const skinId of SKINS) {
    for (const mode of MODES) {
      const oldCell = await captureCell(oldContext, oldTree.baseUrl, skinId, mode);
      const newCell = await captureCell(newContext, newTree.baseUrl, skinId, mode, { abort: abortBuiltinAssets });

      if (abortBuiltinAssets) {
        // Negative control: wallpaper absent on routed skins → deterministic δ≠0
        // + offline fail-open proof (ADR-0023 Decision 6 / R10 per-skin surface).
        const pixel = pixelDelta(oldCell.screenshot, newCell.screenshot);
        const routed = skinId !== "openbmc";
        const deltaNonZero = routed ? pixel.differing > 0 : pixel.differing === 0;
        let failOpenOk = true;
        if (routed) {
          if (skinId === "meirenzhi") {
            failOpenOk = newCell.computed.afterBackgroundImage.includes("linear-gradient")
              && newCell.computed.bodyBackgroundColor !== "";
          } else {
            failOpenOk = newCell.computed.beforeBackgroundImage.includes("linear-gradient(");
          }
        }
        const ok = deltaNonZero && failOpenOk;
        if (!ok) failed = true;
        console.log(`${ok ? "✓" : "✖"} abort ${skinId}/${mode}: δ pixels differ=${pixel.differing} (routed=${routed}), fail-open ${failOpenOk ? "holds" : "BROKEN"}`);
        continue;
      }

      const pixel = pixelDelta(oldCell.screenshot, newCell.screenshot);
      const differences = computedDelta(oldCell.computed, newCell.computed);
      const unexpected = differences.filter((difference) => !urlOnly(difference));
      const ok = pixel.deltaMax === 0 && unexpected.length === 0;
      if (!ok) failed = true;
      console.log(`${ok ? "✓" : "✖"} ${skinId}/${mode}: δmax=${pixel.deltaMax} differing=${pixel.differing}/${pixel.size.replace("x", "×")} computed-diff=[${differences.map((d) => d.key).join(",") || "none"}]${unexpected.length > 0 ? " UNEXPECTED: " + JSON.stringify(unexpected) : ""}`);
    }
  }

  oldTree.server.close();
  newTree.server.close();
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
