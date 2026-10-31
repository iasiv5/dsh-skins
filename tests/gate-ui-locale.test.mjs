/**
 * Gate UI-language guard (retro 2026-11-01, item 1). A gate cannot pin the
 * host language (see scripts/lib/ui-locale.mjs), so every UI lookup in the
 * gate scripts must hold in both languages. This file is the deterministic
 * check: it runs under `pnpm test`, hence inside `pnpm run check` and CI.
 *
 * The detector is line-based: a selector split across lines is not seen.
 * Its own rules are proven first, on known bad and good forms (red/green),
 * before it is trusted on the real scripts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { UI, exactLabelRegex, labelRegex } from "../scripts/lib/ui-locale.mjs";

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const CJK = /[\u4e00-\u9fff]/;
const LATIN = /[A-Za-z]/;
// Suffixes built by code (`${label} (${locale.toUpperCase()})`), not translated text.
const LOCALE_MARKERS = new Set(["(ZH)", "(EN)"]);

// Single-locale forms: each one names a UI string in one language only.
const SINGLE_LOCALE_RULES = [
  { id: "label-equality", re: /(?:aria-label|\.title|textContent|innerText)[^;]*?===\s*["'`]/ },
  { id: "string-hastext", re: /hasText:\s*["'`]/ },
  { id: "has-text-pseudo", re: /:has-text\(\s*["'`]/ },
  { id: "string-accessible-name", re: /(?:name:\s*|getByText\(\s*|getByLabel\(\s*|getByTitle\(\s*)["'`]/ },
];
const ATTRIBUTE_LITERAL = /\[aria-label[~|^$*]?=\\?["']([^"'\\\]]*)\\?["']\]/g;
// A regex used for UI text must carry both a Latin and a CJK alternative.
const REGEX_SITE = /(?:hasText:\s*|getByText\(\s*|name:\s*)\/((?:\\\/|[^/\n])+)\/[gimsuy]*/g;

export function violationsIn(source) {
  const hits = [];
  source.split("\n").forEach((line, index) => {
    const where = index + 1;
    for (const rule of SINGLE_LOCALE_RULES) {
      if (rule.re.test(line)) hits.push({ line: where, rule: rule.id });
    }
    for (const match of line.matchAll(ATTRIBUTE_LITERAL)) {
      if (!LOCALE_MARKERS.has(match[1])) hits.push({ line: where, rule: "attribute-literal" });
    }
    for (const match of line.matchAll(REGEX_SITE)) {
      if (!(CJK.test(match[1]) && LATIN.test(match[1]))) hits.push({ line: where, rule: "one-locale-regex" });
    }
  });
  return hits;
}

test("guard is red on the known single-locale forms and green on the bilingual forms", () => {
  const badForms = [
    '(el.getAttribute("aria-label") || el.title || "") === "Open right sidebar"',
    "page.locator('.dsh-skins-pz-panel button', { hasText: \"恢复默认\" })",
    "page.locator('button:has-text(\"新会话\")')",
    "page.locator('[aria-label=\"新建会话\"]')",
    "page.locator('button', { hasText: /Dark/ })",
    "page.getByRole('button', { name: 'New session' })",
  ];
  const goodForms = [
    "labels.includes(el.getAttribute('aria-label') || el.title || '')",
    "page.locator('.dsh-skins-theme-grid button', { hasText: /Dark|深色/ })",
    "page.locator('.dsh-skins-pz-panel input[aria-label$=\"(ZH)\"]')",
    "page.getByRole('button', { name: exactLabelRegex(UI.newSession) })",
    "page.locator('.dsh-skins-pz-panel button', { hasText: labelRegex(UI.restoreDefaults) })",
  ];
  for (const line of badForms) {
    assert.ok(violationsIn(line).length > 0, `expected a violation: ${line}`);
  }
  for (const line of goodForms) {
    assert.deepEqual(violationsIn(line), [], `unexpected violation: ${line}`);
  }
});

test("UI label table: every entry lists both a CJK and a Latin label", () => {
  for (const [key, labels] of Object.entries(UI)) {
    assert.ok(labels.length >= 2, `${key}: needs at least two labels`);
    assert.ok(labels.some((label) => CJK.test(label)), `${key}: no zh label`);
    assert.ok(labels.some((label) => LATIN.test(label)), `${key}: no en label`);
  }
});

test("exact accessible-name matching rejects per-row variants", () => {
  const exact = exactLabelRegex(UI.newSession);
  assert.ok(exact.test("New session"));
  assert.ok(exact.test("新建会话"));
  assert.equal(exact.test("在“项目A”中新建会话"), false, "per-workspace variant must not match");
});

test("gate scripts: no single-locale UI lookup (retro item 1)", () => {
  const files = fs.readdirSync(scriptsDir).filter((name) => /^(?:repro-|capture-).*\.mjs$/.test(name));
  assert.ok(files.length >= 4, "guard must see the gate scripts");
  const offenders = files.flatMap((name) => violationsIn(fs.readFileSync(path.join(scriptsDir, name), "utf8"))
    .map((hit) => `${name}:${hit.line} ${hit.rule}`));
  assert.deepEqual(offenders, []);
});
