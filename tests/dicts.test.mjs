import assert from "node:assert/strict";
import test from "node:test";
import { DICTS, formatTemplate } from "../src/client/dicts.js";
import { HOST_ERROR_KEYS } from "../src/client/host-errors.js";

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

test("zh and en dictionaries carry exactly the same key set", () => {
  const zhKeys = Object.keys(DICTS.zh).sort();
  const enKeys = Object.keys(DICTS.en).sort();
  assert.deepEqual(
    zhKeys.filter((key) => !(key in DICTS.en)),
    [],
    "keys missing from en",
  );
  assert.deepEqual(
    enKeys.filter((key) => !(key in DICTS.zh)),
    [],
    "keys missing from zh",
  );
  assert.ok(zhKeys.length > 0);
});

test("every entry uses the same placeholders in zh and en", () => {
  for (const [key, zhText] of Object.entries(DICTS.zh)) {
    assert.deepEqual(placeholders(zhText), placeholders(DICTS.en[key]), `placeholder mismatch for "${key}"`);
  }
});

test("every host error code resolves to an existing dictionary key", () => {
  for (const [code, key] of Object.entries(HOST_ERROR_KEYS)) {
    assert.ok(key in DICTS.zh, `code ${code} points at missing zh key ${key}`);
    assert.ok(key in DICTS.en, `code ${code} points at missing en key ${key}`);
  }
});

test("formatTemplate substitutes params and leaves unknown placeholders intact", () => {
  assert.equal(formatTemplate("v{current} → v{latest}", { current: "0.4.0", latest: "0.5.0" }), "v0.4.0 → v0.5.0");
  assert.equal(formatTemplate("exit {exitCode}", { exitCode: 1 }), "exit 1");
  assert.equal(formatTemplate("keep {unknown}", {}), "keep {unknown}");
});

test("meirenzhi wallpaper labels are localized with the factory-default marker", () => {
  const keys = [
    "yuntai", "mupeiling", "ziling",
    "nangongwan", "nangongque", "yinyue",
  ];
  for (const key of keys) {
    const dictKey = `personalization.meirenzhi.${key}`;
    assert.ok(DICTS.zh[dictKey]?.length > 0, `zh missing ${dictKey}`);
    assert.ok(DICTS.en[dictKey]?.length > 0, `en missing ${dictKey}`);
  }
  assert.ok(DICTS.zh["personalization.meirenzhi.yuntai"].includes("默认壁纸"));
  assert.ok(DICTS.en["personalization.meirenzhi.yuntai"].includes("default"));
});
