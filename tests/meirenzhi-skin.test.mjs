import assert from "node:assert/strict";
import test from "node:test";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";
import { getSkinSchema } from "../src/shared/personalization/catalog.js";

const skin = createMeirenzhiSkin({ jsx: (component, props) => ({ component, props }) });
const WALLPAPER_URL = "data:image/webp;base64,AAAA";
const project = (values) =>
  skin.project(
    { wallpaper: "builtin:meirenzhi:yuntai", slogan: { zh: "测", en: "t" }, ...values },
    { wallpaper: { url: WALLPAPER_URL } },
  );

test("skin contract: identity, slots and 12 builtin assets", () => {
  assert.equal(skin.id, "meirenzhi");
  assert.equal(skin.bodyAttr, "dshMeirenzhiSkin");
  assert.deepEqual(skin.label, { zh: "凡人修仙传 · 美人志", en: "Mortal's Journey · Beauty Chronicle" });
  assert.equal(typeof skin.Mark, "function");
  assert.equal(typeof skin.Name, "function");
  assert.ok(skin.favicon.startsWith("data:image/webp;base64,"));
  assert.equal(skin.faviconMime, "image/webp");
  assert.equal(skin.title, "美人志");
  assert.deepEqual(
    Object.keys(skin.builtinAssets),
    getSkinSchema("meirenzhi").fields.find((f) => f.key === "wallpaper").builtinChoices,
  );
  for (const asset of Object.values(skin.builtinAssets)) {
    assert.equal(asset.mime, "image/webp");
    assert.ok(asset.url.startsWith("data:image/webp;base64,"));
  }
});

test("brand contract: bundled mark, gradient name and badge inversion are pinned", () => {
  // Mark = user-provided 掌天瓶 icon, transcoded to WebP (96px q75) and
  // inlined as a data URL — the image itself is the source of truth now.
  const mark = skin.Mark({});
  assert.ok(String(mark.props.src).startsWith("data:image/webp;base64,"));
  assert.ok(String(mark.props.src).length > 1500, "bundled bottle webp must be present");
  assert.equal(mark.props["aria-hidden"], "true");
  // Name = the original gradient-clipped text (brush letterform SVG was tried
  // and reverted as unreadable, 2026-09-01).
  const name = skin.Name({});
  assert.equal(name.props.children[0].props.children, "凡人修仙传");
  assert.equal(name.props.children[0].props.style.background, "linear-gradient(120deg, #A87B2F, #D9B45C 45%, #B8433F)");
  assert.equal(name.props.children[1].props.children, "BEAUTY");
  const css = skin.css;
  assert.ok(css.includes("body[data-dsh-meirenzhi-skin][data-ds-dark-theme] .dsh-mrz-badge{background:#FAF9F6;color:#12121A}"));
  assert.ok(css.includes("@keyframes dsh-mrz-drift-a"));
  assert.ok(css.includes("@keyframes dsh-mrz-drift-b"));
  assert.ok(css.includes("prefers-reduced-motion:reduce"));
  assert.ok(css.includes("#root::before") && css.includes("#root::after"));
  // 泡泡边框（openbmc 同款）：明暗各一套品牌色描边 + 轻投影，框出用户输入区。
  assert.ok(css.includes("body[data-dsh-meirenzhi-skin] .gdEzaW_bubble{border:1px solid rgba(184, 67, 63, 0.38);box-shadow:0 1px 4px rgba(184, 67, 63, 0.10)}"));
  assert.ok(css.includes("body[data-dsh-meirenzhi-skin][data-ds-dark-theme] .gdEzaW_bubble{border-color:rgba(229, 138, 128, 0.38);box-shadow:0 1px 6px rgba(229, 138, 128, 0.10)}"));
});

test("project at factory P=35: riding alphas, constants, scrim and blur", () => {
  const fx = project({ panelOpacity: 35 });
  assert.equal(fx.bodyAttribute, "dshMeirenzhiSkin");
  assert.equal(fx.titleBrand, "美人志");
  assert.deepEqual(fx.slogans, { zh: "测", en: "t" });
  assert.equal(fx.backdrop.imageLight, `url("${WALLPAPER_URL}")`);
  assert.equal(fx.backdrop.imageDark, `url("${WALLPAPER_URL}")`);
  assert.equal(fx.backdrop.blur, 1);
  assert.ok(fx.backdrop.overlayLight.includes("rgba(252, 250, 246, 0.040)"));
  assert.ok(fx.backdrop.overlayDark.includes("rgba(16, 16, 26, 0.040)"));
  const t = fx.tokenOverrides;
  assert.equal(t["--dsw-alias-bg-base"].light, "rgba(250, 249, 246, 0.35)");
  assert.equal(t["--dsw-alias-bg-base"].dark, "rgba(18, 18, 26, 0.35)");
  assert.equal(t["--dsw-specific-sidebar-fill"].light, "rgba(250, 249, 246, 0.40)");
  assert.equal(t["--dsw-specific-sidebar-fill"].dark, "rgba(18, 18, 26, 0.52)");
  assert.equal(t["--dsw-alias-bg-module-platform"].dark, "rgba(18, 18, 26, 0.40)");
  assert.equal(t["--dsw-specific-input-major"].dark, "rgba(18, 18, 26, 0.45)");
  assert.equal(t["--dsw-alias-brand-primary"].light, "#B8433F");
  assert.equal(t["--dsw-alias-brand-primary"].dark, "#E58A80");
  assert.equal(t["--dsw-alias-brand-text"].dark, "#D9B45C");
  assert.equal(t["--dsw-alias-bg-overlay"].light, "rgba(252, 250, 246, 0.85)");
  assert.equal(t["--dsw-alias-bg-overlay"].dark, "rgba(24, 24, 34, 0.88)");
  assert.equal(t["--dsw-specific-bubble"].light, "rgba(184, 67, 63, 0.10)");
  assert.equal(t["--dsw-specific-bubble"].dark, "rgba(24, 24, 34, 0.90)");
  assert.equal(t["--dsw-specific-bubble-highlight"].light, "rgba(184, 67, 63, 0.18)");
  assert.equal(t["--dsw-specific-bubble-highlight"].dark, "rgba(40, 40, 56, 0.92)");
  assert.deepEqual(fx.cssVariables, { "--dsh-mrz-glass-blur": { light: "1px", dark: "1px" } });
  assert.ok(fx.staticCss.includes("dsh-mrz-badge"));
  assert.equal(fx.decorations, null);
});

test("project at P=0: pure wallpaper, no blur layer; at P=100 alphas clamp to 1.00", () => {
  const zero = project({ panelOpacity: 0 });
  assert.equal(zero.backdrop.blur, 0);
  assert.equal(zero.cssVariables, null);
  assert.equal(zero.tokenOverrides["--dsw-alias-bg-base"].light, "rgba(250, 249, 246, 0.00)");
  assert.ok(zero.backdrop.overlayLight.includes("rgba(252, 250, 246, 0.000)"));
  const full = project({ panelOpacity: 100 });
  assert.equal(full.tokenOverrides["--dsw-specific-sidebar-fill"].dark, "rgba(18, 18, 26, 1.00)");
  assert.equal(full.backdrop.blur, 12);
});

test("project falls back to factory slogan when the field is missing", () => {
  const fx = skin.project(
    { wallpaper: "builtin:meirenzhi:yuntai", panelOpacity: 35 },
    { wallpaper: { url: WALLPAPER_URL } },
  );
  assert.deepEqual(fx.slogans, { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" });
});
