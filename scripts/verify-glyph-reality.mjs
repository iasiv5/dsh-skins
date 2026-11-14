#!/usr/bin/env node
// verify:glyph-reality — TEXT_FLOOR↔现实交叉探针（ADR-0027 门禁开环缺口的闭合线，
// 实施评审 O1/B1 教训：verify:contrast 断言手抄契约值，若宿主渲染机制漂移
// （如 .placeholder 色源换掉 var），契约依旧全绿而现实已背离——本探针把
// 「渲染 == 契约」钉成可执行判据。
//
// 方法：活体 loopback DSH（亮/暗两态，亮色经 settings 拦截改写——与活体取证
// 同款零写入姿势）读 composer 占位字形 `[data-composer-placeholder]` 的
// computed color，与 TEXT_FLOOR.composer_placeholder（自 verify-contrast.mjs
// 单源导出）逐值比对。宿主不可达或前端缺字形锚 → SKIP exit 0（repro 门禁
// 同款先例：CI 无活宿主不判失败）。
//
// 退出码：0 全等或 SKIP；1 现实≠契约（真实红，非结构性失败）。
import { chromium } from "playwright-core";
import { TEXT_FLOOR } from "./verify-contrast.mjs";

const BASE = process.env.GLYPH_REALITY_BASE || "http://127.0.0.1:3080";
const TIMEOUT_MS = 30000;

async function hostReachable() {
  try {
    const res = await fetch(`${BASE}/dsh-skins/config`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function installLightRewrite(context) {
  await context.route("**/*", async (route) => {
    try {
      const req = route.request();
      if (req.resourceType() === "document" && new URL(req.url()).pathname === "/") {
        const resp = await route.fetch();
        const body = (await resp.text()).replace(/data-ds-theme-source="dark"/g, 'data-ds-theme-source="light"');
        const headers = { ...resp.headers(), "content-type": "text/html" };
        delete headers["content-length"];
        return route.fulfill({ response: resp, body, headers });
      }
      if (/\/(sidebar\/)?api\/settings\//.test(req.url())) {
        const resp = await route.fetch();
        const body = await resp.json();
        const walk = (o) => {
          if (Array.isArray(o)) return o.forEach(walk);
          if (o && typeof o === "object") {
            for (const [k, v] of Object.entries(o)) {
              if (k === "preference" && (v === "dark" || v === "system")) o[k] = "light";
              else walk(v);
            }
          }
        };
        walk(body);
        const headers = { ...resp.headers(), "content-type": "application/json" };
        delete headers["content-length"];
        return route.fulfill({ response: resp, body: JSON.stringify(body), headers });
      }
    } catch {}
    return route.continue();
  });
}

// 无活宿主（CI / 未起 DSH）→ 先于 chromium 启动即 SKIP exit 0。release.yml 的 check 链在 CI
// 既无宿主、也未必装 chromium，此处不得因浏览器启动失败而判红（发版前阻断修复）。
if (!(await hostReachable())) {
  console.log(`REALITY SKIP: no live DSH host at ${BASE} (CI / no-host = not judged)`);
  process.exit(0);
}
const browser = await chromium.launch({ headless: true });
const out = [];
let judged = false;
for (const scheme of ["light", "dark"]) {
  const idx = scheme === "light" ? 0 : 1;
  const expected = TEXT_FLOOR.composer_placeholder[idx];
  const context = await browser.newContext({ viewport: { width: 1912, height: 948 }, colorScheme: scheme });
  if (scheme === "light") await installLightRewrite(context);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/?skin=meirenzhi`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  } catch (e) {
    console.error(`REALITY SKIP: page load failed (${String(e).slice(0, 80)})`);
    await context.close();
    await browser.close();
    process.exit(0);
  }
  try { await page.waitForSelector("body[data-dsh-meirenzhi-skin]", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(3000);
  const probe = await page.evaluate(() => {
    const glyph = document.querySelector("[data-composer-placeholder]");
    return glyph ? getComputedStyle(glyph).color : null;
  });
  if (probe === null) {
    console.error(`REALITY FAIL (${scheme}): glyph anchor [data-composer-placeholder] not found in live DOM`);
    out.push({ scheme, verdict: "FAIL", reason: "glyph anchor missing" });
    judged = true;
  } else {
    const verdict = probe === `rgb(${expected.join(", ")})` ? "PASS" : "FAIL";
    out.push({ scheme, rendered: probe, expected: `rgb(${expected.join(", ")})`, verdict });
    judged = true;
  }
  await context.close();
}
await browser.close();
for (const r of out) console.log(`${r.verdict} ${r.scheme}: rendered=${r.rendered ?? r.reason} expected=${r.expected ?? "-"}`);
const allPass = out.length > 0 && out.every((r) => r.verdict === "PASS");
if (!judged) { console.log("glyph-reality: nothing judged (host unreachable)"); process.exit(0); }
console.log(`glyph-reality: ${allPass ? "REALITY == CONTRACT ✓" : "REALITY ≠ CONTRACT ✗（TEXT_FLOOR 或渲染机制漂移——先查渲染，再查手抄）"}`);
process.exit(allPass ? 0 : 1);
