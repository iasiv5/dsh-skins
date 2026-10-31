/**
 * Pure-function tests for the select()-time wallpaper preload (ADR-0023 Q14).
 * The wiring inside runtime.select() is three best-effort lines guarded by
 * typeof Image; everything falsifiable lives in resolvePreloadUrl.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreloadUrl } from "../src/client/runtime.js";
import { defaultWallpaperRef } from "../src/shared/personalization/catalog.js";

const ROUTED = (key) => `/dsh-skins/assets/b_meirenzhi_${key}.webp?v=1`;

function makeSkins() {
  return new Map([
    ["meirenzhi", { builtinAssets: {
      yuntai: { url: ROUTED("yuntai") },
      yinyue: { url: ROUTED("yinyue") },
    } }],
    ["openbmc", { builtinAssets: {
      art: { url: "data:image/webp;base64,AAAA" }, // factory skin stays inline (B9)
    } }],
  ]);
}

test("no override: the catalog default's route URL is preloaded", () => {
  const url = resolvePreloadUrl(makeSkins(), null, "meirenzhi", defaultWallpaperRef("meirenzhi"));
  assert.equal(url, ROUTED("yuntai"));
});

test("builtin override wins over the default", () => {
  const personalization = { getOverrides: () => ({ wallpaper: "builtin:meirenzhi:yinyue" }) };
  const url = resolvePreloadUrl(makeSkins(), personalization, "meirenzhi", defaultWallpaperRef("meirenzhi"));
  assert.equal(url, ROUTED("yinyue"));
});

test("user library ref, inline factory art, official and unknown skins preload nothing", () => {
  const skins = makeSkins();
  const withOverride = (wallpaper) => ({ getOverrides: () => ({ wallpaper }) });
  assert.equal(resolvePreloadUrl(skins, withOverride("u_0123456789abcdef0123456789abcdef"), "meirenzhi", defaultWallpaperRef("meirenzhi")), null, "user ref");
  assert.equal(resolvePreloadUrl(skins, null, "openbmc", defaultWallpaperRef("openbmc")), null, "factory inline art");
  assert.equal(resolvePreloadUrl(skins, null, "official", undefined), null, "official");
  assert.equal(resolvePreloadUrl(skins, null, "nosuch-skin", defaultWallpaperRef("nosuch-skin")), null, "unknown skin");
});

test("a throwing getOverrides falls back to the catalog default", () => {
  const personalization = { getOverrides: () => { throw new Error("config not booted"); } };
  const url = resolvePreloadUrl(makeSkins(), personalization, "meirenzhi", defaultWallpaperRef("meirenzhi"));
  assert.equal(url, ROUTED("yuntai"));
});
