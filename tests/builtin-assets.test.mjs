import assert from "node:assert/strict";
import test from "node:test";
import { builtinAssetUrl } from "../src/client/builtin-assets.js";

test("builtinAssetUrl builds route URLs with the fallback rev when unbundled", () => {
  assert.equal(
    builtinAssetUrl("meirenzhi", "yuntai"),
    "/dsh-skins/assets/b_meirenzhi_yuntai.webp?v=0",
  );
  assert.equal(
    builtinAssetUrl("uefi-harness", "art"),
    "/dsh-skins/assets/b_uefi-harness_art.webp?v=0",
  );
});

test("builtinAssetUrl propagates an injected globalThis rev (the bundle form)", () => {
  globalThis.__DSH_SKINS_ASSET_REV__ = "1.5.21";
  try {
    assert.equal(
      builtinAssetUrl("meirenzhi", "yinyue"),
      "/dsh-skins/assets/b_meirenzhi_yinyue.webp?v=1.5.21",
    );
  } finally {
    delete globalThis.__DSH_SKINS_ASSET_REV__;
  }
});

test("builtinAssetUrl rejects characters outside the builtin-ref charset", () => {
  for (const args of [
    ["meiren_zhi", "yuntai"],
    ["Meirenzhi", "yuntai"],
    ["meirenzhi", "yun_tai"],
    ["meirenzhi", "yuntai/evil"],
    ["../etc", "yuntai"],
  ]) {
    assert.throws(() => builtinAssetUrl(...args), undefined, JSON.stringify(args));
  }
});
