/**
 * Translucency contract — dual-factory-point golden fence (ADR-0013, plan
 * Task 1). Pins the projection behaviour of ALL THREE skins at the two
 * factory points (web anchor 55/55/35, desktop 66) plus the P=0/P=100
 * bounds and per-token monotonicity.
 *
 * The golden (rgb, baked) tables below are hand-copied verbatim from the
 * per-skin RIDING declaration tables (the only carrier since ADR-0017
 * retired the static riding CSS blocks; historically they were transcribed
 * from those baked blocks) — they are the INDEPENDENT baseline that
 * survives the translucency.js extraction. Do NOT regenerate them from
 * the code under test.
 *
 * The expected-value helpers re-implement the projection math on the test
 * side (pivot rebase, hinged blur curve, desktop boost) so a formula drift
 * in the kernel fails here even when table data matches.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";

const GOLD = {
  openbmc: {
    anchor: 55,
    glassVar: "--dsh-openbmc-glass-blur",
    blurMax: 24,
    desktopBoost: { rate: 55, dark: "none" },
    riding: {
      "--dsw-alias-bg-base": { light: ["247, 250, 252", 55], dark: ["12, 26, 38", 55] },
      "--dsw-alias-bg-module-platform": { light: ["240, 246, 250", 55], dark: ["22, 48, 67", 60] },
      "--dsw-alias-bg-layer-1": { light: ["255, 255, 255", 48], dark: ["18, 38, 53", 55] },
      "--dsw-alias-bg-layer-2": { light: ["255, 255, 255", 56], dark: ["22, 48, 67", 60] },
      "--dsw-alias-bg-layer-3": { light: ["255, 255, 255", 62], dark: ["26, 58, 80", 64] },
      "--dsw-specific-sidebar-fill": { light: ["238, 246, 251", 60], dark: ["13, 30, 44", 72] },
      "--dsw-specific-input-major": { light: ["255, 255, 255", 60], dark: ["18, 42, 60", 65] },
      "--dsw-specific-login-input": { light: ["255, 255, 255", 60], dark: ["18, 42, 60", 65] },
    },
    scrimStops: {
      light: [["247, 250, 252", 15], ["240, 246, 250", 28]],
      dark: [["7, 14, 22", 10], ["4, 9, 14", 24]],
    },
  },
  uefi: {
    anchor: 55,
    glassVar: "--dsh-uefi-glass-blur",
    blurMax: 24,
    desktopBoost: { rate: 55, dark: "boost" },
    riding: {
      "--dsw-alias-bg-base": { light: ["248, 247, 255", 55], dark: ["23, 18, 45", 55] },
      "--dsw-alias-bg-module-platform": { light: ["241, 238, 255", 55], dark: ["39, 31, 73", 60] },
      "--dsw-alias-bg-layer-1": { light: ["255, 255, 255", 48], dark: ["31, 25, 59", 55] },
      "--dsw-alias-bg-layer-2": { light: ["247, 245, 255", 56], dark: ["39, 31, 73", 60] },
      "--dsw-alias-bg-layer-3": { light: ["241, 238, 255", 62], dark: ["48, 38, 88", 64] },
      "--dsw-specific-sidebar-fill": { light: ["238, 235, 255", 60], dark: ["25, 20, 48", 72] },
      "--dsw-specific-input-major": { light: ["255, 255, 255", 62], dark: ["42, 34, 78", 55] },
    },
    scrimStops: {
      light: [["248, 247, 255", 10], ["238, 234, 255", 22]],
      dark: [["23, 18, 45", 8], ["16, 12, 34", 20]],
    },
  },
  meirenzhi: {
    anchor: 35,
    glassVar: "--dsh-mrz-glass-blur",
    blurMax: 12,
    desktopBoost: { rate: 55, dark: "boost" },
    riding: {
      "--dsw-alias-bg-base": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 35] },
      "--dsw-specific-sidebar-fill": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 52] },
      "--dsw-alias-bg-module-platform": { light: ["250, 249, 246", 35], dark: ["18, 18, 26", 40] },
      "--dsw-specific-input-major": { light: ["250, 249, 246", 40], dark: ["18, 18, 26", 45] },
    },
    overlayScrim: { coefficient: 30, light: "252, 250, 246", dark: "16, 16, 26" },
  },
};

// Test-side independent re-implementation of the projection math.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const alpha2 = (P, baked, anchor) => (clamp(P + baked - anchor, 0, 100) / 100).toFixed(2);
const expectedBlurPx = (P, anchor, max) => Math.round(max * Math.max(0, (P - anchor) / (100 - anchor)) ** 2);
const expectedDesktopBlur = (P, blurPx, boost) => {
  const boosted = Math.min(24, blurPx + P / boost.rate);
  return boost.dark === "none" ? { light: boosted, dark: blurPx } : { light: boosted, dark: boosted };
};
const expectedScrimPrefix = (P, spec, mode) => {
  const [a, b] = spec.scrimStops[mode];
  return `linear-gradient(rgba(${a[0]}, ${alpha2(P, a[1], spec.anchor)}) 0%, rgba(${b[0]}, ${alpha2(P, b[1], spec.anchor)}) 100%)`;
};
const expectedOverlayScrim = (P, spec, mode) => {
  const t = clamp(P / 100, 0, 1);
  const s = (Math.round(spec.overlayScrim.coefficient * t * t) / 100).toFixed(3);
  const rgb = spec.overlayScrim[mode];
  return `linear-gradient(rgba(${rgb}, ${s}) 0%, rgba(${rgb}, ${s}) 100%)`;
};

const FACTORIES = {
  openbmc: () => createOpenBmcHarness({ jsx: () => null }),
  uefi: () => createUefiHarness({ jsx: () => null }),
  meirenzhi: () => createMeirenzhiSkin({ jsx: () => null }),
};

function projectorFor(id) {
  const skin = FACTORIES[id]();
  const assets = id === "meirenzhi" ? { wallpaper: { url: "data:image/webp;base64,AAAA" } } : null;
  return (P) => skin.project({ panelOpacity: P, slogan: { zh: "测", en: "t" } }, assets);
}

function assertRiding(fx, P, spec) {
  for (const [token, modes] of Object.entries(spec.riding)) {
    for (const mode of ["light", "dark"]) {
      const [rgb, baked] = modes[mode];
      assert.equal(
        fx.tokenOverrides[token][mode],
        `rgba(${rgb}, ${alpha2(P, baked, spec.anchor)})`,
        `${id()} ${token} ${mode} @P=${P}`,
      );
    }
  }
}
const currentId = { value: "?" };
const id = () => currentId.value;

function assertBlurAndGlass(fx, P, spec) {
  const blur = expectedBlurPx(P, spec.anchor, spec.blurMax);
  assert.equal(fx.backdrop.blur, blur, `${id()} blur @P=${P}`);
  assert.deepEqual(fx.backdrop.desktopBlur, expectedDesktopBlur(P, blur, spec.desktopBoost), `${id()} desktopBlur @P=${P}`);
  if (blur > 0) {
    assert.deepEqual(fx.cssVariables, { [spec.glassVar]: { light: `${blur}px`, dark: `${blur}px` } }, `${id()} glass var @P=${P}`);
    assert.ok(fx.staticCss.includes(`backdrop-filter:blur(var(${spec.glassVar},0px))`), `${id()} GLASS_RULE shipped @P=${P}`);
  } else {
    assert.equal(fx.cssVariables, null, `${id()} no glass var @P=${P}`);
    assert.ok(!fx.staticCss.includes(`backdrop-filter:blur(var(${spec.glassVar},0px))`), `${id()} GLASS_RULE withheld @P=${P}`);
  }
}

for (const [skinId, spec] of Object.entries(GOLD)) {
  currentId.value = skinId;
  const at = projectorFor(skinId);
  const legacy = spec.scrimStops !== undefined; // twins bake the scrim into the image

  test(`${skinId}: web factory anchor P=${spec.anchor} — riding equals baked gold, zero blur, no glass`, () => {
    const fx = at(spec.anchor);
    assertRiding(fx, spec.anchor, spec);
    assertBlurAndGlass(fx, spec.anchor, spec);
  });

  test(`${skinId}: desktop factory P=66 — riding = anchor+11, blur/glass/desktopBlur gold`, () => {
    const fx = at(66);
    assertRiding(fx, 66, spec);
    assertBlurAndGlass(fx, 66, spec);
    if (legacy) {
      const light = expectedScrimPrefix(66, spec, "light");
      const dark = expectedScrimPrefix(66, spec, "dark");
      assert.ok(fx.backdrop.imageLight.startsWith(light), `${skinId} P=66 scrim light prefix`);
      assert.ok(fx.backdrop.imageDark.startsWith(dark), `${skinId} P=66 scrim dark prefix`);
      assert.ok(fx.backdrop.imageLight.includes(", url(data:image/webp"), `${skinId} art layer present`);
    } else {
      assert.deepEqual(fx.backdrop.overlayLight, expectedOverlayScrim(66, spec, "light"));
      assert.deepEqual(fx.backdrop.overlayDark, expectedOverlayScrim(66, spec, "dark"));
      assert.equal(fx.backdrop.imageLight, 'url("data:image/webp;base64,AAAA")');
      assert.equal(fx.backdrop.imageDark, 'url("data:image/webp;base64,AAAA")');
    }
  });

  test(`${skinId}: P=0 floor — residual alphas clamp at zero only below anchor`, () => {
    const fx = at(0);
    assertRiding(fx, 0, spec);
    assertBlurAndGlass(fx, 0, spec);
    if (legacy) {
      // Plan Task 6 will lean on these prefixes when projector stops reading
      // skin.art; pin them here against the independent gold.
      assert.ok(fx.backdrop.imageLight.startsWith(expectedScrimPrefix(0, spec, "light")), `${skinId} P=0 scrim light prefix`);
      assert.ok(fx.backdrop.imageDark.startsWith(expectedScrimPrefix(0, spec, "dark")), `${skinId} P=0 scrim dark prefix`);
      assert.ok(fx.backdrop.imageLight.includes(", url(data:image/webp"), `${skinId} art layer present`);
    } else {
      assert.deepEqual(fx.backdrop.overlayLight, expectedOverlayScrim(0, spec, "light"));
      assert.deepEqual(fx.backdrop.overlayDark, expectedOverlayScrim(0, spec, "dark"));
    }
  });

  test(`${skinId}: P=100 clamp — riding clamps at 1.00 only for baked>=anchor, blur at max, desktop boost capped`, () => {
    const fx = at(100);
    for (const [token, modes] of Object.entries(spec.riding)) {
      for (const mode of ["light", "dark"]) {
        assert.equal(
          fx.tokenOverrides[token][mode],
          `rgba(${modes[mode][0]}, ${alpha2(100, modes[mode][1], spec.anchor)})`,
          `${skinId} ${token} ${mode} @P=100`,
        );
      }
    }
    assertBlurAndGlass(fx, 100, spec);
    if (!legacy) {
      assert.deepEqual(fx.backdrop.overlayLight, expectedOverlayScrim(100, spec, "light"));
      assert.deepEqual(fx.backdrop.overlayDark, expectedOverlayScrim(100, spec, "dark"));
    }
  });

  test(`${skinId}: monotonicity — per-token alpha (light AND dark) and blur never decrease (P=0..100 step 5)`, () => {
    let prevBlur = -1;
    const prevAlpha = {};
    for (let P = 0; P <= 100; P += 5) {
      const fx = at(P);
      assert.ok(fx.backdrop.blur >= prevBlur, `${skinId} blur monotone @P=${P}`);
      prevBlur = fx.backdrop.blur;
      for (const token of Object.keys(spec.riding)) {
        for (const mode of ["light", "dark"]) {
          const key = `${token}|${mode}`;
          const value = Number.parseFloat(fx.tokenOverrides[token][mode].slice(-5));
          if (prevAlpha[key] !== undefined) assert.ok(value >= prevAlpha[key], `${skinId} ${token} ${mode} monotone @P=${P}`);
          prevAlpha[key] = value;
        }
      }
    }
  });

  test(`${skinId}: golden-table spot literals (transcription guard)`, () => {
    const anchor = spec.anchor;
    // A handful of exact strings, independent of the table above, copied from
    // the baked CSS lines themselves.
    if (skinId === "openbmc") {
      assert.equal(at(anchor).tokenOverrides["--dsw-alias-bg-base"].light, "rgba(247, 250, 252, 0.55)");
      assert.equal(at(anchor).tokenOverrides["--dsw-alias-bg-layer-2"].light, "rgba(255, 255, 255, 0.56)");
      assert.equal(at(0).tokenOverrides["--dsw-alias-bg-layer-2"].light, "rgba(255, 255, 255, 0.01)");
      assert.equal(at(0).tokenOverrides["--dsw-alias-bg-layer-3"].light, "rgba(255, 255, 255, 0.07)");
      assert.equal(at(100).tokenOverrides["--dsw-alias-bg-layer-1"].light, "rgba(255, 255, 255, 0.93)", "baked<anchor does NOT clamp to 1.00");
      assert.equal(at(100).tokenOverrides["--dsw-alias-bg-base"].light, "rgba(247, 250, 252, 1.00)", "baked=anchor clamps to 1.00");
      assert.equal(at(66).tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(13, 30, 44, 0.83)");
      assert.equal(at(0).tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(13, 30, 44, 0.17)");
      assert.deepEqual(at(66).backdrop.desktopBlur, { light: 1 + 66 / 55, dark: 1 });
    }
    if (skinId === "uefi") {
      assert.equal(at(anchor).tokenOverrides["--dsw-specific-input-major"].dark, "rgba(42, 34, 78, 0.55)");
      assert.equal(at(anchor).tokenOverrides["--dsw-specific-input-major"].light, "rgba(255, 255, 255, 0.62)");
      assert.equal(at(0).tokenOverrides["--dsw-specific-input-major"].light, "rgba(255, 255, 255, 0.07)");
      assert.equal(at(0).tokenOverrides["--dsw-specific-input-major"].dark, "rgba(42, 34, 78, 0.00)");
      assert.equal(at(100).tokenOverrides["--dsw-alias-bg-layer-1"].light, "rgba(255, 255, 255, 0.93)", "baked<anchor does NOT clamp to 1.00");
      assert.equal(at(66).tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(25, 20, 48, 0.83)");
      assert.deepEqual(at(66).backdrop.desktopBlur, { light: 1 + 66 / 55, dark: 1 + 66 / 55 });
    }
    if (skinId === "meirenzhi") {
      assert.equal(at(anchor).tokenOverrides["--dsw-alias-bg-base"].light, "rgba(250, 249, 246, 0.35)");
      assert.equal(at(anchor).tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(18, 18, 26, 0.52)");
      assert.equal(at(66).tokenOverrides["--dsw-alias-bg-base"].light, "rgba(250, 249, 246, 0.66)");
      assert.equal(at(66).tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(18, 18, 26, 0.83)");
      assert.equal(at(anchor).backdrop.overlayLight, "linear-gradient(rgba(252, 250, 246, 0.040) 0%, rgba(252, 250, 246, 0.040) 100%)");
      assert.equal(at(66).backdrop.overlayLight, "linear-gradient(rgba(252, 250, 246, 0.130) 0%, rgba(252, 250, 246, 0.130) 100%)");
      assert.equal(at(0).backdrop.overlayDark, "linear-gradient(rgba(16, 16, 26, 0.000) 0%, rgba(16, 16, 26, 0.000) 100%)");
      assert.equal(at(100).backdrop.overlayDark, "linear-gradient(rgba(16, 16, 26, 0.300) 0%, rgba(16, 16, 26, 0.300) 100%)");
      assert.deepEqual(at(66).backdrop.desktopBlur, { light: 3 + 66 / 55, dark: 3 + 66 / 55 });
      assert.deepEqual(at(100).backdrop.desktopBlur, { light: 12 + 100 / 55, dark: 12 + 100 / 55 });
    }
  });
}

// ---- ADR-0017: reverse pin — riding tokens are table-channel ONLY ----------------
// The static riding interpolation block (the ADR-0004 byte-equality
// carrier) is retired: tokenOverrides → ThemePresenter inline style is the
// single channel (meirenzhi-proven in production). Successor of the retired
// count pins — from "constructed equality" to "constructed absence": no skin
// may ever bake a P-dependent token declaration back into staticCss.
test("ADR-0017 reverse pin: no riding token declarations in any skin's staticCss", () => {
  for (const [skinId, spec] of Object.entries(GOLD)) {
    const fx = projectorFor(skinId)(spec.anchor);
    for (const token of Object.keys(spec.riding)) {
      assert.ok(
        !fx.staticCss.includes(`${token}:`),
        `${skinId} staticCss must not declare riding token ${token} (ADR-0017: table channel only)`,
      );
    }
  }
});

// ---- ADR-0016 C1: constant tokens live in the declaration table -----------------
// The golden below is the removed-lines list: every non-riding declaration
// that used to live hand-written in the openbmc CSS template (③ light/dark
// constant blocks, ④ font stack, ⑥ bubble light fill, ⑦ scrollbar). At the
// factory anchor the projection's tokenOverrides must carry each value
// verbatim — same computed style through the table channel (meirenzhi-proven).

const OPENBMC_FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';
const OPENBMC_FONT_CODE = '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace';
const OPENBMC_CONSTANT_TOKENS = {
  "--dsw-alias-brand-primary": { light: "#0083b0", dark: "#3ec1e8" },
  "--dsw-alias-brand-primary-invert": { light: "#ffffff", dark: "#06222e" },
  "--dsw-alias-brand-text": { light: "#007197", dark: "#5ec8e8" },
  "--dsw-alias-bg-overlay": { light: "rgba(250, 252, 253, 0.82)", dark: "rgba(10, 22, 32, 0.88)" },
  "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(231, 241, 248, 0.90)", dark: "rgba(18, 41, 58, 0.90)" },
  "--dsw-specific-sidebar-nav-item-active": { light: "rgba(220, 235, 245, 0.90)", dark: "rgba(20, 47, 68, 0.90)" },
  "--dsw-specific-sidebar-nav-item-active-accent": { light: "#9cc8e0", dark: "#29526f" },
  "--dsw-specific-selector": { light: "rgba(227, 239, 247, 0.85)", dark: "rgba(16, 40, 64, 0.85)" },
  "--dsw-specific-tip": { light: "rgba(240, 246, 250, 0.90)", dark: "rgba(12, 30, 44, 0.92)" },
  "--dsw-alias-label-primary": { light: "#16262e", dark: "#dde9ee" },
  "--dsw-alias-label-secondary": { light: "#3f5a66", dark: "#9fb4bd" },
  "--dsw-alias-label-dimmed": { light: "#6b838e", dark: "#69818c" },
  "--dsw-alias-interactive-bg-hover": { light: "rgba(0, 138, 191, 0.08)", dark: "rgba(62, 193, 232, 0.10)" },
  "--dsw-alias-interactive-bg-active": { light: "rgba(0, 138, 191, 0.14)", dark: "rgba(62, 193, 232, 0.16)" },
  "--dsw-alias-interactive-bg-hover-accent": { light: "rgba(140, 206, 63, 0.14)", dark: "rgba(165, 212, 64, 0.16)" },
  "--dsw-specific-bubble": { light: "rgba(0, 138, 191, 0.10)", dark: "rgba(20, 41, 60, 0.90)" },
  "--dsw-specific-bubble-highlight": { light: "rgba(0, 138, 191, 0.18)", dark: "rgba(29, 61, 85, 0.90)" },
  "--dsw-font-family": { light: OPENBMC_FONT_UI, dark: OPENBMC_FONT_UI },
  "--ds-font-family-code": { light: OPENBMC_FONT_CODE, dark: OPENBMC_FONT_CODE },
  "--dsh-scrollbar-thumb": { light: "var(--dsw-alias-scrollbar-bg-l2)", dark: "var(--dsw-alias-scrollbar-bg-l2)" },
  "--dsh-scrollbar-thumb-hover": { light: "var(--dsw-alias-scrollbar-hover-l2)", dark: "var(--dsw-alias-scrollbar-hover-l2)" },
};

test("openbmc C1: constant tokens live in the declaration table, values verbatim (ADR-0016)", () => {
  const fx = projectorFor("openbmc")(GOLD.openbmc.anchor);
  for (const [token, modes] of Object.entries(OPENBMC_CONSTANT_TOKENS)) {
    for (const mode of ["light", "dark"]) {
      assert.equal(fx.tokenOverrides[token]?.[mode], modes[mode], `openbmc ${token} ${mode} @anchor`);
    }
  }
});

// ---- ADR-0016 C1 (uefi): removed-lines golden -------------------------------
const UEFI_FONT_UI = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
const UEFI_CONSTANT_TOKENS = {
  "--dsw-alias-brand-primary": { light: "#6553d8", dark: "#a99cff" },
  "--dsw-alias-brand-primary-invert": { light: "#ffffff", dark: "#1b143a" },
  "--dsw-alias-brand-text": { light: "#5846c2", dark: "#b7acff" },
  "--dsw-alias-bg-overlay": { light: "rgba(252, 251, 255, 0.82)", dark: "rgba(27, 21, 54, 0.88)" },
  "--dsw-specific-sidebar-nav-item-hover": { light: "rgba(101, 83, 216, 0.09)", dark: "rgba(169, 156, 255, 0.10)" },
  "--dsw-specific-sidebar-nav-item-active": { light: "rgba(101, 83, 216, 0.15)", dark: "rgba(169, 156, 255, 0.17)" },
  "--dsw-specific-sidebar-nav-item-active-accent": { light: "#8b7cff", dark: "#6657a8" },
  "--dsw-specific-selector": { light: "rgba(232, 228, 255, 0.78)", dark: "rgba(51, 40, 96, 0.78)" },
  "--dsw-specific-tip": { light: "rgba(244, 242, 255, 0.88)", dark: "rgba(34, 27, 65, 0.90)" },
  "--dsw-alias-label-primary": { light: "#211c36", dark: "#f0edff" },
  "--dsw-alias-label-secondary": { light: "#554d74", dark: "#b9b1d6" },
  "--dsw-alias-label-dimmed": { light: "#81799e", dark: "#827a9f" },
  "--dsw-alias-interactive-bg-hover": { light: "rgba(101, 83, 216, 0.09)", dark: "rgba(169, 156, 255, 0.11)" },
  "--dsw-alias-interactive-bg-active": { light: "rgba(101, 83, 216, 0.15)", dark: "rgba(169, 156, 255, 0.18)" },
  "--dsw-specific-bubble": { light: "rgba(101, 83, 216, 0.11)", dark: "rgba(60, 48, 108, 0.90)" },
  "--dsw-specific-bubble-highlight": { light: "rgba(101, 83, 216, 0.18)", dark: "rgba(78, 63, 138, 0.92)" },
  "--dsw-font-family": { light: UEFI_FONT_UI, dark: UEFI_FONT_UI },
};

test("uefi C1: constant tokens live in the declaration table, values verbatim (ADR-0016)", () => {
  const fx = projectorFor("uefi")(GOLD.uefi.anchor);
  for (const [token, modes] of Object.entries(UEFI_CONSTANT_TOKENS)) {
    for (const mode of ["light", "dark"]) {
      assert.equal(fx.tokenOverrides[token]?.[mode], modes[mode], `uefi ${token} ${mode} @anchor`);
    }
  }
});
