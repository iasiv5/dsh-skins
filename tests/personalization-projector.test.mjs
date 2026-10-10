import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEffects, projectSkin } from "../src/client/personalization/projector.js";
import { defaultsFor } from "../src/shared/personalization/catalog.js";

/** Static fixture palette since the simplification (colors are baked, not fields). */
const PALETTE = {
  accent: { light: "#C3272B", dark: "#E0564A" },
  bubble: { light: "#C3272B", dark: "#8E2A2F" },
};

/** A meirenzhi-like fixture: custom projector mapping values → effects. */
function fixtureSkin() {
  return {
    id: "meirenzhi",
    bodyAttr: "dshMeirenzhiSkin",
    project(values, assets) {
      // Mirrors the real meirenzhi projector: one translucency knob derives the
      // scrim alpha and blur quadratically (ruling #15 amendment).
      const scrimAlpha = (Math.round(30 * (values.panelOpacity / 100) ** 2) / 100).toFixed(3);
      return {
        bodyAttribute: "dshMeirenzhiSkin",
        slogans: values.slogan,
        titleBrand: "美人志",
        favicon: { href: assets.favicon?.url ?? "data:image/svg+xml,x", mime: assets.favicon?.mime ?? "image/svg+xml" },
        backdrop: {
          imageLight: `url("${assets.wallpaper?.url ?? "about:blank"}")`,
          imageDark: `url("${assets.wallpaper?.url ?? "about:blank"}")`,
          overlayLight: `rgba(0,0,0,${scrimAlpha})`,
          overlayDark: `rgba(0,0,0,${scrimAlpha})`,
          blur: Math.round(12 * (values.panelOpacity / 100) ** 2),
        },
        tokenOverrides: {
          "--dsw-alias-accent": PALETTE.accent,
          "--dsw-specific-bubble": PALETTE.bubble,
        },
        cssVariables: {
          "--dsh-panel-alpha": { light: `${values.panelOpacity}%`, dark: `${values.panelOpacity}%` },
        },
        staticCss: "body[data-dsh-meirenzhi-skin] .x{color:red}",
        decorations: [{ key: "lanterns", css: "body[data-dsh-meirenzhi-skin]::after{opacity:.5}" }],
      };
    },
  };
}

function resolver(ref) {
  if (ref.kind === "builtin") return { url: `builtin://${ref.skinId}/${ref.assetKey}`, mime: "image/svg+xml" };
  return { url: `/dsh-skins/assets/${ref.id}.png`, mime: "image/png" };
}

test("projection with overrides succeeds without degradation", () => {
  const result = projectSkin(fixtureSkin(), {
    slogan: { zh: "自定义", en: "Custom" },
    panelOpacity: 50,
  }, { assetResolver: resolver });
  assert.equal(result.degraded, "none");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.effects.slogans, { zh: "自定义", en: "Custom" });
  assert.equal(result.effects.backdrop.blur, 3);
  assert.equal(result.effects.backdrop.overlayLight, "rgba(0,0,0,0.080)");
  assert.equal(result.effects.backdrop.overlayDark, "rgba(0,0,0,0.080)", "one scrim alpha drives both overlays");
  assert.equal(result.effects.tokenOverrides["--dsw-alias-accent"].light, "#C3272B");
  assert.equal(result.effects.staticCss, "body[data-dsh-meirenzhi-skin] .x{color:red}");
  assert.equal(result.effects.decorations[0].key, "lanterns");
});

test("the translucency sweep spans its endpoints (ruling #15 amendment)", () => {
  // Quadratic growth keeps mid-range usable: P=50 → blur 3, scrim 8%.
  const mid = projectSkin(fixtureSkin(), { panelOpacity: 50 }, { assetResolver: resolver });
  assert.equal(mid.effects.backdrop.blur, 3);
  assert.equal(mid.effects.backdrop.overlayLight, "rgba(0,0,0,0.080)");
  // P=100 hides the wallpaper completely (tint 1.0 + max scrim + max blur).
  const ceiling = projectSkin(fixtureSkin(), { panelOpacity: 100 }, { assetResolver: resolver });
  assert.equal(ceiling.effects.backdrop.blur, 12);
  assert.equal(ceiling.effects.backdrop.overlayLight, "rgba(0,0,0,0.300)");
  // P=0 is the pure-wallpaper floor: every derived layer zeroes out.
  const floor = projectSkin(fixtureSkin(), { panelOpacity: 0 }, { assetResolver: resolver });
  assert.equal(floor.effects.backdrop.blur, 0);
  assert.equal(floor.effects.backdrop.overlayLight, "rgba(0,0,0,0.000)");
  // P=35 (factory default since 1.0.0; ruling #17 pinned 30) → scrim 4, blur 1.
  const current = projectSkin(fixtureSkin(), {}, { assetResolver: resolver });
  assert.equal(current.effects.backdrop.blur, 1);
  assert.equal(current.effects.backdrop.overlayLight, "rgba(0,0,0,0.040)");
});

test("layer-1 field fallback keeps projection healthy with bad overrides", () => {
  const result = projectSkin(fixtureSkin(), {
    panelOpacity: 999, // out of range → field default
  }, { assetResolver: resolver });
  assert.equal(result.degraded, "none");
  assert.deepEqual(result.issues.map((issue) => issue.key).sort(), ["panelOpacity"]);
  assert.equal(result.effects.backdrop.overlayLight, "rgba(0,0,0,0.040)"); // catalog default 35
  assert.equal(result.effects.backdrop.blur, 1); // catalog default
});

test("a crashing projector triggers the defaults-only retry (layer 2)", () => {
  const skin = fixtureSkin();
  // Crash only when the override is present; defaults project cleanly.
  skin.project = (values) => {
    if (values.panelOpacity === 20) throw new Error("boom");
    return {
      bodyAttribute: "dshMeirenzhiSkin",
      slogans: defaultsFor("meirenzhi").slogan,
      titleBrand: "美人志",
      backdrop: null,
    };
  };
  const result = projectSkin(skin, { panelOpacity: 20 }, { assetResolver: resolver });
  assert.equal(result.degraded, "defaults");
  assert.deepEqual(result.effects.slogans, defaultsFor("meirenzhi").slogan);
  assert.equal(result.effects.backdrop, null);
});

test("a projector that always fails degrades to fail-closed (layer 3)", () => {
  const skin = fixtureSkin();
  skin.project = () => {
    throw new Error("always broken");
  };
  const result = projectSkin(skin, {}, { assetResolver: resolver });
  assert.equal(result.degraded, "failed");
  assert.equal(result.effects, null);
});

test("malformed effects shapes are rejected by normalizeEffects", () => {
  assert.equal(normalizeEffects(null), null);
  assert.equal(normalizeEffects("nope"), null);
  assert.equal(normalizeEffects({ bodyAttribute: "data-skin-meirenzhi" }), null, "dashed dataset key is invalid");
  assert.equal(normalizeEffects({ bodyAttribute: "ok", backdrop: { blur: 99 } }), null, "blur out of range");
  assert.equal(normalizeEffects({
    bodyAttribute: "ok",
    tokenOverrides: { accent: { light: "#fff" } }, // missing dark
  }), null);
  assert.equal(normalizeEffects({
    bodyAttribute: "ok",
    decorations: [{ key: "", css: "x" }], // empty key
  }), null);
  const clean = normalizeEffects({ bodyAttribute: "ok" });
  assert.deepEqual(clean, {
    bodyAttribute: "ok", slogans: null, titleBrand: null, favicon: null,
    backdrop: null, tokenOverrides: null, cssVariables: null, staticCss: null, decorations: null,
  });
});

test("normalizeEffects keeps an optional finite Desktop blur pair and rejects invalid values", () => {
  const absent = normalizeEffects({ bodyAttribute: "ok", backdrop: { blur: 0 } });
  assert.equal(absent.backdrop.desktopBlur, null, "missing Desktop override normalizes to no override");

  const valid = normalizeEffects({
    bodyAttribute: "ok",
    backdrop: { blur: 1, desktopBlur: { light: 3.5, dark: 0 } },
  });
  assert.deepEqual(valid.backdrop.desktopBlur, { light: 3.5, dark: 0 });
  assert.equal(Object.isFrozen(valid.backdrop.desktopBlur), true);

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.01, 24.01]) {
    assert.equal(normalizeEffects({
      bodyAttribute: "ok",
      backdrop: { blur: 0, desktopBlur: { light: value, dark: 0 } },
    }), null, `invalid light Desktop blur ${value} must be rejected`);
    assert.equal(normalizeEffects({
      bodyAttribute: "ok",
      backdrop: { blur: 0, desktopBlur: { light: 0, dark: value } },
    }), null, `invalid dark Desktop blur ${value} must be rejected`);
  }

  assert.equal(normalizeEffects({
    bodyAttribute: "ok",
    backdrop: { blur: 0, desktopBlur: { light: 1 } },
  }), null, "both scheme values are required");
  assert.equal(normalizeEffects({
    bodyAttribute: "ok",
    backdrop: { blur: 0, desktopBlur: "1px" },
  }), null, "Desktop blur must be a pair object");
});

test("skins outside the catalog fail closed with no effects", () => {
  const result = projectSkin({ id: "mystery", project: () => ({ bodyAttribute: "x" }) }, {}, {});
  assert.equal(result.degraded, "failed");
  assert.equal(result.effects, null);
});

// ---- review-round regressions: freeze, resolver fallback, real factories ----

test("normalized effects are deeply frozen", () => {
  const result = projectSkin(fixtureSkin(), {}, { assetResolver: resolver });
  assert.equal(Object.isFrozen(result.effects), true);
  assert.equal(Object.isFrozen(result.effects.slogans), true);
  assert.equal(Object.isFrozen(result.effects.tokenOverrides), true);
  assert.equal(Object.isFrozen(result.effects.tokenOverrides["--dsw-alias-accent"]), true);
  assert.equal(Object.isFrozen(result.effects.backdrop), true);
  assert.throws(() => { result.effects.titleBrand = "mutate"; }, TypeError);
});

test("a null asset resolution fails closed instead of dropping the effect", () => {
  const brokenResolver = () => null; // every ref fails, including defaults
  const failing = projectSkin(fixtureSkin(), { blur: 20 }, { assetResolver: brokenResolver });
  assert.equal(failing.degraded, "failed");
  assert.equal(failing.effects, null);
});

test("a user wallpaper that cannot resolve falls back to the default builtin", () => {
  const semiResolver = (ref) => (ref.kind === "builtin" ? resolver(ref) : null);
  const result = projectSkin(fixtureSkin(), { wallpaper: "u_0123456789abcdef0123456789abcdef" }, {
    assetResolver: semiResolver,
  });
  assert.equal(result.degraded, "defaults");
  assert.equal(result.effects.backdrop.imageLight.includes("builtin://meirenzhi/yuntai"), true, "fallback lands on the factory default builtin");
});

test("the REAL openbmc and uefi factories project their baked defaults verbatim", async () => {
  const { createOpenBmcHarness } = await import("../src/client/skins/openbmc-harness/index.js");
  const { createUefiHarness } = await import("../src/client/skins/uefi-harness/index.js");
  const stubJsx = { jsx: () => null };
  for (const factory of [createOpenBmcHarness, createUefiHarness]) {
    const skin = factory(stubJsx);
    const resolverFor = (ref) => ({
      url: `builtin://${ref.skinId}/${ref.assetKey}`,
      mime: "image/webp",
    });
    const result = projectSkin(skin, {}, { assetResolver: resolverFor });
    assert.equal(result.degraded, "none", skin.id);
    // Byte-equivalence against the factory's own baked strings (design §9).
    assert.equal(result.effects.backdrop.imageLight, skin.art === "" ? skin.placeholderLight : skin.scrimLight);
    assert.equal(result.effects.backdrop.imageDark, skin.art === "" ? skin.placeholderDark : skin.scrimDark);
    assert.deepEqual(result.effects.slogans, skin.slogans);
    assert.equal(result.effects.titleBrand, skin.title);
    assert.equal(result.effects.favicon.href, skin.favicon);
    assert.equal(result.effects.staticCss, skin.css);
    assert.equal(result.effects.bodyAttribute, skin.bodyAttr);
  }
});

test("openbmc projects baked defaults through its own curve (ADR-0004)", async () => {
  const { createOpenBmcHarness } = await import("../src/client/skins/openbmc-harness/index.js");
  const skin = createOpenBmcHarness({ jsx: () => null });
  const USER = "u_0123456789abcdef0123456789abcdef";
  const project = (overrides) => projectSkin(skin, overrides, { assetResolver: resolver });

  // Default P=55 anchors the derived projection to the baked alpha strings:
  // every derived rgba must equal the baked literal byte-for-byte.
  const def = project({});
  assert.equal(def.degraded, "none");
  assert.deepEqual(def.effects.tokenOverrides["--dsw-alias-bg-base"], {
    light: "rgba(247, 250, 252, 0.55)",
    dark: "rgba(12, 26, 38, 0.55)",
  });
  assert.deepEqual(def.effects.tokenOverrides["--dsw-specific-sidebar-fill"], {
    light: "rgba(238, 246, 251, 0.60)",
    dark: "rgba(13, 30, 44, 0.72)",
  });
  assert.equal("--dsw-alias-bg-overlay" in def.effects.tokenOverrides, false, "floating layers stay fixed (tgcf ruling #16 analogue)");
  assert.equal(def.effects.backdrop.blur, 0, "no frost at the default anchor");
  assert.equal(def.effects.cssVariables, null);
  assert.equal(def.effects.staticCss, skin.css, "byte-equal static css — no glass rule at default");

  // P=0 floors the riding family at 0 points (alpha string "0.00").
  const floor = project({ panelOpacity: 0 });
  assert.equal(floor.effects.tokenOverrides["--dsw-alias-bg-base"].light, "rgba(247, 250, 252, 0.00)");
  assert.equal(
    floor.effects.backdrop.imageLight,
    "linear-gradient(rgba(247, 250, 252, 0.00) 0%, rgba(240, 246, 250, 0.00) 100%), url(" + skin.art + ")",
  );

  // Blur ramps quadratically from the P=55 anchor: P=77 → 6, P=100 → 24 (cap).
  const mid = project({ panelOpacity: 77 });
  assert.equal(mid.effects.backdrop.blur, 6);
  const ceiling = project({ panelOpacity: 100 });
  assert.equal(ceiling.effects.backdrop.blur, 24);
  assert.equal(
    ceiling.effects.staticCss,
    skin.css + "\n" + 'body[data-dsh-openbmc-skin] [id="root"]{backdrop-filter:blur(var(--dsh-openbmc-glass-blur,0px))}',
  );
  assert.deepEqual(ceiling.effects.cssVariables["--dsh-openbmc-glass-blur"], { light: "24px", dark: "24px" });

  // Slogan overrides ride the locale field; invalid P falls back to the default.
  const custom = project({ slogan: { zh: "甲", en: "Z" } });
  assert.deepEqual(custom.effects.slogans, { zh: "甲", en: "Z" });
  const bad = project({ panelOpacity: 101 });
  assert.equal(bad.effects.tokenOverrides["--dsw-alias-bg-base"].light, "rgba(247, 250, 252, 0.55)");
  assert.deepEqual(bad.issues.map((issue) => issue.key), ["panelOpacity"]);

  // User wallpapers keep the legacy semantics: bare url, no scrim gradient.
  const customWallpaper = project({ wallpaper: USER });
  assert.equal(customWallpaper.effects.backdrop.imageLight, `url("/dsh-skins/assets/${USER}.png")`);
  assert.equal(customWallpaper.effects.backdrop.imageDark, `url("/dsh-skins/assets/${USER}.png")`);
  assert.equal(customWallpaper.effects.backdrop.imageLight.includes("linear-gradient"), false);
});

test("uefi-harness projects baked defaults through its own curve (ADR-0004)", async () => {
  const { createUefiHarness } = await import("../src/client/skins/uefi-harness/index.js");
  const skin = createUefiHarness({ jsx: () => null });
  const USER = "u_0123456789abcdef0123456789abcdef";
  const project = (overrides) => projectSkin(skin, overrides, { assetResolver: resolver });

  // Default P=55 anchors the derived projection to the baked alpha strings.
  const def = project({});
  assert.equal(def.degraded, "none");
  assert.deepEqual(def.effects.tokenOverrides["--dsw-alias-bg-base"], {
    light: "rgba(248, 247, 255, 0.55)",
    dark: "rgba(23, 18, 45, 0.55)",
  });
  assert.deepEqual(def.effects.tokenOverrides["--dsw-specific-sidebar-fill"], {
    light: "rgba(238, 235, 255, 0.60)",
    dark: "rgba(25, 20, 48, 0.72)",
  });
  assert.equal("--dsw-alias-bg-overlay" in def.effects.tokenOverrides, false, "floating layers stay fixed (tgcf ruling #16 analogue)");
  assert.equal(def.effects.backdrop.blur, 0, "no frost at the default anchor");
  assert.equal(def.effects.cssVariables, null);
  assert.equal(def.effects.staticCss, skin.css, "byte-equal static css — no glass rule at default");

  // P=0 floors the riding family at 0 points (alpha string "0.00").
  const floor = project({ panelOpacity: 0 });
  assert.equal(floor.effects.tokenOverrides["--dsw-alias-bg-base"].light, "rgba(248, 247, 255, 0.00)");
  assert.equal(
    floor.effects.backdrop.imageLight,
    "linear-gradient(rgba(248, 247, 255, 0.00) 0%, rgba(238, 234, 255, 0.00) 100%), url(" + skin.art + ")",
  );

  // Blur ramps quadratically from the P=55 anchor: P=77 → 6, P=100 → 24 (cap).
  const mid = project({ panelOpacity: 77 });
  assert.equal(mid.effects.backdrop.blur, 6);
  const ceiling = project({ panelOpacity: 100 });
  assert.equal(ceiling.effects.backdrop.blur, 24);
  assert.equal(
    ceiling.effects.staticCss,
    skin.css + "\n" + 'body[data-dsh-uefi-harness] [id="root"]{backdrop-filter:blur(var(--dsh-uefi-glass-blur,0px))}',
  );
  assert.deepEqual(ceiling.effects.cssVariables["--dsh-uefi-glass-blur"], { light: "24px", dark: "24px" });

  // Slogan overrides ride the locale field; invalid P falls back to the default.
  const custom = project({ slogan: { zh: "甲", en: "Z" } });
  assert.deepEqual(custom.effects.slogans, { zh: "甲", en: "Z" });
  const bad = project({ panelOpacity: 101 });
  assert.equal(bad.effects.tokenOverrides["--dsw-alias-bg-base"].light, "rgba(248, 247, 255, 0.55)");
  assert.deepEqual(bad.issues.map((issue) => issue.key), ["panelOpacity"]);

  // User wallpapers keep the legacy semantics: bare url, no scrim gradient.
  const customWallpaper = project({ wallpaper: USER });
  assert.equal(customWallpaper.effects.backdrop.imageLight, `url("/dsh-skins/assets/${USER}.png")`);
  assert.equal(customWallpaper.effects.backdrop.imageDark, `url("/dsh-skins/assets/${USER}.png")`);
  assert.equal(customWallpaper.effects.backdrop.imageLight.includes("linear-gradient"), false);
});

test("Desktop blur candidates follow P without changing the Web backdrop blur", async () => {
  const { createOpenBmcHarness } = await import("../src/client/skins/openbmc-harness/index.js");
  const { createUefiHarness } = await import("../src/client/skins/uefi-harness/index.js");
  const { createMeirenzhiSkin } = await import("../src/client/skins/meirenzhi/index.js");
  const openbmc = createOpenBmcHarness({ jsx: () => null });
  const uefi = createUefiHarness({ jsx: () => null });
  const meirenzhi = createMeirenzhiSkin({ jsx: () => null });
  const expectBlur = (skin, overrides, baseBlur, desktopBlur, label) => {
    const result = projectSkin(skin, overrides, { assetResolver: resolver });
    assert.equal(result.degraded, "none", label);
    assert.equal(result.effects.backdrop.blur, baseBlur, `${label}: preserve existing Web blur`);
    assert.deepEqual(result.effects.backdrop.desktopBlur, desktopBlur, `${label}: Desktop candidate`);
  };

  expectBlur(openbmc, {}, 0, { light: 1, dark: 0 }, "OpenBMC factory P55; dark remains the baseline");
  expectBlur(openbmc, { panelOpacity: 0 }, 0, { light: 0, dark: 0 }, "OpenBMC P0");
  expectBlur(openbmc, { panelOpacity: 55 }, 0, { light: 1, dark: 0 }, "OpenBMC P55");
  expectBlur(openbmc, { panelOpacity: 77 }, 6, { light: 7.4, dark: 6 }, "OpenBMC P77 keeps dark at base blur");
  expectBlur(openbmc, { panelOpacity: 100 }, 24, { light: 24, dark: 24 }, "OpenBMC P100 caps at 24px");

  expectBlur(uefi, {}, 0, { light: 1, dark: 1 }, "UEFI factory P55");
  expectBlur(uefi, { panelOpacity: 0 }, 0, { light: 0, dark: 0 }, "UEFI P0");
  expectBlur(uefi, { panelOpacity: 55 }, 0, { light: 1, dark: 1 }, "UEFI P55");
  expectBlur(uefi, { panelOpacity: 77 }, 6, { light: 7.4, dark: 7.4 }, "UEFI P77");
  expectBlur(uefi, { panelOpacity: 100 }, 24, { light: 24, dark: 24 }, "UEFI P100 caps at 24px");

  expectBlur(meirenzhi, {}, 1, { light: 1 + 35 / 55, dark: 1 + 35 / 55 }, "MeirenZhi factory P35");
  expectBlur(meirenzhi, { panelOpacity: 0 }, 0, { light: 0, dark: 0 }, "MeirenZhi P0");
  expectBlur(meirenzhi, { panelOpacity: 55 }, 4, { light: 5, dark: 5 }, "MeirenZhi P55");
  expectBlur(meirenzhi, { panelOpacity: 77 }, 7, { light: 8.4, dark: 8.4 }, "MeirenZhi P77");
  expectBlur(meirenzhi, { panelOpacity: 100 }, 12, { light: 12 + 100 / 55, dark: 12 + 100 / 55 }, "MeirenZhi P100");
});

test("the REAL meirenzhi factory projects single scrim, static palette and static favicon", async () => {
  const { createMeirenzhiSkin } = await import("../src/client/skins/meirenzhi/index.js");
  // No-arg calls throw at the jsxRuntime destructure; stub it (review ③-4②).
  const skin = createMeirenzhiSkin({ jsx: () => null });
  const resolverFor = (ref) => ({ url: `builtin://${ref.skinId}/${ref.assetKey}`, mime: "image/webp" });
  const result = projectSkin(skin, {}, { assetResolver: resolverFor });
  assert.equal(result.degraded, "none");
  // Translucency curve at the factory default P=35 → scrim 4, blur 1
  // (tgcf 二次曲线沿用：30·t² / 12·t²)；one alpha drives BOTH overlays.
  assert.equal(result.effects.backdrop.overlayLight, "linear-gradient(rgba(252, 250, 246, 0.040) 0%, rgba(252, 250, 246, 0.040) 100%)");
  assert.equal(result.effects.backdrop.overlayDark, "linear-gradient(rgba(16, 16, 26, 0.040) 0%, rgba(16, 16, 26, 0.040) 100%)");
  assert.equal(result.effects.backdrop.blur, 1);
  assert.deepEqual(result.effects.cssVariables["--dsh-mrz-glass-blur"], { light: "1px", dark: "1px" });
  // Sidebar fill sits ABOVE the content base by the reference-skin deltas
  // (ruling #15: light +0.05, dark +0.17 — openbmc/uefi pattern).
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-bg-base"], { light: "rgba(250, 249, 246, 0.35)", dark: "rgba(18, 18, 26, 0.35)" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-specific-sidebar-fill"], { light: "rgba(250, 249, 246, 0.40)", dark: "rgba(18, 18, 26, 0.52)" });
  // Composer stays glass (1.0.0 user report): the input card is base +5/+10,
  // its embedded selector +0/+5 — never the host's solid input default.
  assert.deepEqual(result.effects.tokenOverrides["--dsw-specific-input-major"], { light: "rgba(250, 249, 246, 0.40)", dark: "rgba(18, 18, 26, 0.45)" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-bg-module-platform"], { light: "rgba(250, 249, 246, 0.35)", dark: "rgba(18, 18, 26, 0.40)" });
  assert.equal(result.effects.backdrop.imageLight, 'url("builtin://meirenzhi/yuntai")', "factory default rides yuntai (001合照)");
  // Favicon is a static skin asset — the 掌天瓶 mark (bundled WebP data URL).
  assert.equal(result.effects.favicon.href, skin.favicon);
  assert.equal(result.effects.favicon.mime, "image/webp");
  // Colors are baked into the skin (the fields are gone but the identity is not).
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-brand-primary"], { light: "#B8433F", dark: "#E58A80" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-brand-text"], { light: "#A87B2F", dark: "#D9B45C" });
  // User bubble: light mode drops to a soft wash (dark text on the pale glass)
  // while dark keeps the deep panel-family fill; highlight rides the same families.
  assert.deepEqual(result.effects.tokenOverrides["--dsw-specific-bubble"], { light: "rgba(184, 67, 63, 0.10)", dark: "rgba(24, 24, 34, 0.90)" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-specific-bubble-highlight"], { light: "rgba(184, 67, 63, 0.18)", dark: "rgba(40, 40, 56, 0.92)" });
  // Control states tint with the crimson family (ruling #16).
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-interactive-bg-hover"], { light: "rgba(184, 67, 63, 0.08)", dark: "rgba(229, 138, 128, 0.14)" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-alias-bg-overlay"], { light: "rgba(252, 250, 246, 0.85)", dark: "rgba(24, 24, 34, 0.88)" });
  assert.deepEqual(result.effects.tokenOverrides["--dsw-specific-sidebar-nav-item-active"], { light: "rgba(250, 249, 246, 0.9)", dark: "rgba(28, 28, 40, 0.9)" });
  // Glass rule rides staticCss at P>0; decorations stay null.
  assert.equal(result.effects.staticCss, skin.css + "\n" + 'body[data-dsh-meirenzhi-skin] [id="root"]{backdrop-filter:blur(var(--dsh-mrz-glass-blur,0px))}');
  assert.equal(result.effects.decorations, null);
  assert.deepEqual(result.effects.slogans, { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" });
  assert.equal(result.effects.titleBrand, "美人志");
  assert.equal(result.effects.bodyAttribute, "dshMeirenzhiSkin");
});
