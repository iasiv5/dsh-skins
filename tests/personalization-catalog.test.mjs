import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_ID_PATTERN,
  BUILTIN_REF_PATTERN,
  GIF_MAX_PIXELS,
  GLOBAL_MAX_PIXELS,
  SKINS,
  defaultsFor,
  getField,
  getSkinSchema,
  listAssetFields,
  mergeValues,
  resolveImageRef,
  validateCatalogInvariants,
  validateOverride,
} from "../src/shared/personalization/catalog.js";

const USER_ID = "u_" + "0123456789abcdef0123456789abcdef";

test("catalog self-invariants hold for every shipped skin", () => {
  assert.deepEqual(validateCatalogInvariants(), []);
});

test("shipped skins are exactly meirenzhi, openbmc and uefi-harness", () => {
  assert.deepEqual(Object.keys(SKINS).sort(), ["meirenzhi", "openbmc", "uefi-harness"]);
});

test("the removed tgcf skin is no longer personalizable (v1.4.0 removal)", () => {
  assert.equal(getSkinSchema("tgcf"), null);
  assert.deepEqual(validateOverride("tgcf", "slogan", { zh: "千灯", en: "Lights" }), { ok: false, code: "UNKNOWN_FIELD" });
  assert.deepEqual(mergeValues("tgcf", { slogan: { zh: "千灯", en: "Lights" } }), { values: {}, issues: [] });
});

test("meirenzhi ships 6 builtin wallpapers with yuntai as the factory default", () => {
  const schema = getSkinSchema("meirenzhi");
  const field = (key) => schema.fields.find((f) => f.key === key);
  assert.equal(field("wallpaper").default, "builtin:meirenzhi:yuntai");
  assert.deepEqual(field("wallpaper").builtinChoices, [
    "yuntai", "mupeiling", "ziling",
    "nangongwan", "nangongque", "yinyue",
  ]);
  assert.deepEqual(field("slogan").default, { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" });
  assert.equal(field("panelOpacity").default, 35);
});

test("meirenzhi catalog builtinAssets keys equal the wallpaper choices (cross-layer lock)", () => {
  const schema = getSkinSchema("meirenzhi");
  const choices = schema.fields.find((f) => f.key === "wallpaper").builtinChoices;
  assert.deepEqual(Object.keys(schema.builtinAssets), choices);
});

test("asset id pattern accepts hyphenless 32-hex and rejects uuid/other shapes", () => {
  assert.ok(ASSET_ID_PATTERN.test(USER_ID));
  assert.ok(!ASSET_ID_PATTERN.test("u_550e8400-e29b-41d4-a716-446655440000"), "hyphenated UUID must not match");
  assert.ok(!ASSET_ID_PATTERN.test("u_0123456789abcdef0123456789abcdeg"), "non-hex rejected");
  assert.ok(!ASSET_ID_PATTERN.test("builtin:meirenzhi:yuntai"));
  assert.ok(!ASSET_ID_PATTERN.test(""));
});

test("builtin ref pattern parses skin and asset key", () => {
  const match = BUILTIN_REF_PATTERN.exec("builtin:meirenzhi:mupeiling");
  assert.equal(match?.[1], "meirenzhi");
  assert.equal(match?.[2], "mupeiling");
  assert.equal(BUILTIN_REF_PATTERN.test("builtin:meirenzhi:"), false);
  assert.equal(BUILTIN_REF_PATTERN.test("builtin::lanterns"), false);
});

test("resolveImageRef classifies builtin, user and malformed refs", () => {
  assert.deepEqual(resolveImageRef("builtin:openbmc:art"), { kind: "builtin", skinId: "openbmc", assetKey: "art" });
  assert.deepEqual(resolveImageRef(USER_ID), { kind: "user", id: USER_ID });
  assert.equal(resolveImageRef("u_short"), null);
  assert.equal(resolveImageRef(42), null);
  assert.equal(resolveImageRef(""), null);
});

test("validateOverride: unknown skin fields are rejected", () => {
  assert.deepEqual(validateOverride("meirenzhi", "nope", "x"), { ok: false, code: "UNKNOWN_FIELD" });
  assert.deepEqual(validateOverride("unknown-skin", "slogan", "x"), { ok: false, code: "UNKNOWN_FIELD" });
});

test("titleBrand is no longer personalizable (v2.4.1 #5)", () => {
  assert.deepEqual(validateOverride("meirenzhi", "titleBrand", "美人志"), { ok: false, code: "UNKNOWN_FIELD" });
});

test("validateOverride: locale text requires complete {zh,en} objects", () => {
  assert.equal(validateOverride("meirenzhi", "slogan", { zh: "红颜", en: "Beauty" }).ok, true);
  assert.deepEqual(validateOverride("meirenzhi", "slogan", { zh: "只有中文" }), { ok: false, code: "BAD_SHAPE" });
  assert.deepEqual(validateOverride("meirenzhi", "slogan", { zh: "a", en: "b".repeat(41) }), { ok: false, code: "BAD_SHAPE" });
  assert.deepEqual(validateOverride("meirenzhi", "slogan", "flat string"), { ok: false, code: "BAD_SHAPE" });
});

test("validateOverride: colors need 6-digit hex in both schemes", () => {
  // The simplification removed every shipped color field; the generic
  // color validation stays covered through the catalog type machinery.
  assert.equal(getField("meirenzhi", "accent"), null);
  assert.equal(getField("meirenzhi", "gold"), null);
  assert.equal(getField("meirenzhi", "bubbleColor"), null);
  assert.deepEqual(validateOverride("meirenzhi", "accent", { light: "#C3272B", dark: "#E0564A" }), { ok: false, code: "UNKNOWN_FIELD" });
});

test("validateOverride: ranges clamp to min/max in single scopes", () => {
  assert.equal(validateOverride("meirenzhi", "panelOpacity", 82).ok, true);
  assert.deepEqual(validateOverride("meirenzhi", "panelOpacity", 101), { ok: false, code: "BAD_VALUE" });
  assert.equal(validateOverride("meirenzhi", "panelOpacity", 0).ok, true, "ruling #14: 0% is the pure-wallpaper floor");
  assert.deepEqual(validateOverride("meirenzhi", "panelOpacity", "82"), { ok: false, code: "BAD_VALUE" });
  assert.deepEqual(validateOverride("meirenzhi", "blur", 5), { ok: false, code: "UNKNOWN_FIELD" }, "blur field retired by ruling #14");
  assert.deepEqual(validateOverride("meirenzhi", "scrim", 30), { ok: false, code: "UNKNOWN_FIELD" }, "scrim field retired by ruling #14");
});

test("validateOverride: image builtin refs must belong to the owning skin", () => {
  assert.equal(validateOverride("meirenzhi", "wallpaper", "builtin:meirenzhi:mupeiling").ok, true);
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", "builtin:meirenzhi:lanterns"), { ok: false, code: "BAD_ASSET" }, "unknown asset keys are rejected");
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", "builtin:openbmc:art"), { ok: false, code: "BAD_ASSET" });
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", "builtin:meirenzhi:missing"), { ok: false, code: "BAD_ASSET" });
  assert.deepEqual(validateOverride("openbmc", "wallpaper", "builtin:openbmc:art").ok, true);
});

test("validateOverride: user refs skip asset checks without a metadata provider", () => {
  assert.equal(validateOverride("meirenzhi", "wallpaper", USER_ID).ok, true);
});

test("validateOverride: provider metadata enforces existence, mime, bytes and pixels", () => {
  const okWallpaper = { mime: "image/png", byteLength: 1024, width: 1000, height: 1000 };
  assert.equal(validateOverride("meirenzhi", "wallpaper", USER_ID, () => okWallpaper).ok, true);
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", USER_ID, () => null), { ok: false, code: "MISSING_ASSET" });
  // SVG never enters the user library, but the validator must still reject it.
  assert.deepEqual(
    validateOverride("meirenzhi", "wallpaper", USER_ID, () => ({ ...okWallpaper, mime: "image/svg+xml" })),
    { ok: false, code: "BAD_ASSET" },
  );
  // Favicon field removed by the simplification: its id is now unknown.
  assert.deepEqual(
    validateOverride("meirenzhi", "favicon", USER_ID, () => ({ mime: "image/png", byteLength: 1024, width: 64, height: 64 })),
    { ok: false, code: "UNKNOWN_FIELD" },
  );
  // GIF pixels are tightened to GIF_MAX_PIXELS even below the field cap.
  const gifWide = { mime: "image/gif", byteLength: 1024, width: 5000, height: 3000 }; // 15MP > 12MP
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", USER_ID, () => gifWide), { ok: false, code: "BAD_ASSET" });
  const pngWide = { mime: "image/png", byteLength: 1024, width: 5000, height: 8000 }; // 40MP == global cap
  assert.equal(validateOverride("meirenzhi", "wallpaper", USER_ID, () => pngWide).ok, true);
  const pngOver = { mime: "image/png", byteLength: 1024, width: 5001, height: 8000 }; // > 40MP
  assert.deepEqual(validateOverride("meirenzhi", "wallpaper", USER_ID, () => pngOver), { ok: false, code: "BAD_ASSET" });
});

test("mergeValues: defaults fill untouched fields, overrides win when valid", () => {
  const { values, issues } = mergeValues("meirenzhi", {
    slogan: { zh: "改", en: "Changed" },
    panelOpacity: 60,
  });
  assert.deepEqual(issues, []);
  assert.deepEqual(values.slogan, { zh: "改", en: "Changed" });
  assert.equal(values.panelOpacity, 60);
  // Factory wallpaper rides yuntai (001合照), which leads the grid; the
  // default only reaches fields without an override.
  assert.equal(values.wallpaper, "builtin:meirenzhi:yuntai");
  // Retired blur/scrim keys never appear in merged values (ruling #14).
  assert.equal("blur" in values, false);
  assert.equal("scrim" in values, false);
});

test("mergeValues: layer-1 fallback swaps invalid overrides for defaults and reports issues", () => {
  const { values, issues } = mergeValues("meirenzhi", {
    panelOpacity: 500,
    blur: 5, // retired field: silently ignored, NOT an issue (ruling #14)
    unknownFutureKey: { any: "shape" },
  });
  assert.equal(values.panelOpacity, 35);
  assert.deepEqual(issues.map((issue) => issue.key).sort(), ["panelOpacity"]);
  // Unknown keys are ignored by projection (the store normalizes them away at load).
  assert.equal("unknownFutureKey" in values, false);
  assert.equal("blur" in values, false);
});

test("mergeValues: image overrides validate against trusted metadata when provided", () => {
  const meta = { [USER_ID]: { mime: "image/png", byteLength: 10, width: 10, height: 10 } };
  const ok = mergeValues("meirenzhi", { wallpaper: USER_ID }, (id) => meta[id] ?? null);
  assert.equal(ok.values.wallpaper, USER_ID);
  assert.deepEqual(ok.issues, []);

  const missing = mergeValues("meirenzhi", { wallpaper: USER_ID }, () => null);
  assert.equal(missing.values.wallpaper, "builtin:meirenzhi:yuntai");
  assert.deepEqual(missing.issues, [{ key: "wallpaper", code: "MISSING_ASSET" }]);
});

test("mergeValues: unknown skin yields empty values without throwing", () => {
  assert.deepEqual(mergeValues("nope", { a: 1 }), { values: {}, issues: [] });
});

test("accessors expose schema, fields, asset fields and defaults", () => {
  const schema = getSkinSchema("meirenzhi");
  assert.equal(schema.fields.length, 3);
  assert.deepEqual(schema.fields.map((field) => field.key), ["wallpaper", "slogan", "panelOpacity"]);
  // Six curated pieces; yuntai leads the grid (user ruling) and is the
  // factory default.
  const wallpaperField = getField("meirenzhi", "wallpaper");
  assert.deepEqual(wallpaperField.builtinChoices, [
    "yuntai", "mupeiling", "ziling",
    "nangongwan", "nangongque", "yinyue",
  ]);
  assert.equal(wallpaperField.default, "builtin:meirenzhi:yuntai");
  assert.deepEqual(Object.keys(schema.builtinAssets), [
    "yuntai", "mupeiling", "ziling", "nangongwan", "nangongque", "yinyue",
  ]);
  assert.equal(schema.builtinAssets.yuntai.labelKey, "personalization.meirenzhi.yuntai");
  assert.equal(getSkinSchema("openbmc").builtinAssets.art.labelKey, "personalization.openbmc.art");
  assert.equal(getSkinSchema("uefi-harness").builtinAssets.art.labelKey, "personalization.uefi.art");
  assert.equal(getField("meirenzhi", "blur"), null, "blur field retired by ruling #14");
  assert.equal(getField("meirenzhi", "panelOpacity").default, 35);
  assert.deepEqual(listAssetFields("meirenzhi").map((field) => field.key), ["wallpaper"]);
  assert.deepEqual(listAssetFields("openbmc").map((field) => field.key), ["wallpaper"]);
  assert.equal(defaultsFor("meirenzhi").titleBrand, undefined);
  assert.equal(defaultsFor("meirenzhi").wallpaper, "builtin:meirenzhi:yuntai");
  assert.equal(defaultsFor("uefi-harness").wallpaper, "builtin:uefi-harness:art");
});

test("pixel budgets stay coherent with the design contract", () => {
  assert.equal(GLOBAL_MAX_PIXELS, 40_000_000);
  assert.equal(GIF_MAX_PIXELS, 12_000_000);
});

test("range values must sit on the declared step grid", () => {
  assert.equal(validateOverride("meirenzhi", "panelOpacity", 70).ok, true);
  assert.deepEqual(validateOverride("meirenzhi", "panelOpacity", 70.5), { ok: false, code: "BAD_VALUE" });
});

test("scope objects must carry exactly their canonical keys", () => {
  assert.deepEqual(validateOverride("meirenzhi", "slogan", { zh: "一", en: "One", fr: "Un" }), { ok: false, code: "BAD_SHAPE" });
});

test("legacy skin catalog defaults are same-source with the factories' static dictionaries (ADR-0004)", async () => {
  const { createOpenBmcHarness } = await import("../src/client/skins/openbmc-harness/index.js");
  const { createUefiHarness } = await import("../src/client/skins/uefi-harness/index.js");
  const stubJsx = { jsx: () => null };
  for (const [skinId, factory] of [["openbmc", createOpenBmcHarness], ["uefi-harness", createUefiHarness]]) {
    const skin = factory(stubJsx);
    const slogan = getField(skinId, "slogan");
    assert.notEqual(slogan, null, `${skinId} must declare a slogan field`);
    assert.deepEqual(slogan.default, skin.slogans, `${skinId} slogan default must be same-source with the factory's static slogans`);
    assert.equal(slogan.maxLength, 40);
    const panelOpacity = getField(skinId, "panelOpacity");
    assert.notEqual(panelOpacity, null, `${skinId} must declare a panelOpacity field`);
    assert.equal(panelOpacity.default, 55, "default P anchors the baked visuals");
    assert.equal(panelOpacity.min, 0);
    assert.equal(panelOpacity.max, 100);
    assert.equal(panelOpacity.step, 1);
  }
});
