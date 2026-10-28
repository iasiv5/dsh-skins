/**
 * Runtime effect-transaction tests (N1 regression surface). These drive the
 * REAL runtime with a DOM stub because the 9c19d5c regression (hot-updates
 * tearing down the live skin through shared node identities) was invisible
 * to every existing suite.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSkinRuntime, shellAlignment, buildFullscreenBaseCss, PRODUCTION_FIELDS } from "../src/client/runtime.js";
import { createOpenBmcHarness } from "../src/client/skins/openbmc-harness/index.js";
import { createMeirenzhiSkin } from "../src/client/skins/meirenzhi/index.js";
import { createUefiHarness } from "../src/client/skins/uefi-harness/index.js";

// ---- minimal DOM stub --------------------------------------------------------

function makeNode(tag) {
  return {
    tagName: tag,
    children: [],
    parentElement: null,
    dataset: {},
    removed: false,
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    append(child) { this.appendChild(child); },
    remove() {
      this.removed = true;
      if (this.parentElement !== null) {
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
      }
    },
    querySelectorAll(selector) {
      const rel = /link\[rel="(icon|shortcut icon)"\]/.test(selector);
      return this.children.filter((child) => rel && child.tagName === "link");
    },
    querySelector(selector) {
      const match = /style\[data-plugin-css="(.+)"\]/.exec(selector);
      if (match === null) return null;
      return this.children.find((child) => child.tagName === "style" && child.dataset.pluginCss === match[1]) ?? null;
    },
  };
}

function installDom() {
  const head = makeNode("head");
  const body = makeNode("body");
  const document = {
    head,
    body,
    title: "DeepSeek Harness",
    createElement: (tag) => makeNode(tag),
    querySelector: (selector) => head.querySelector(selector),
  };
  const observers = [];
  const events = [];
  let observeFailuresLeft = 0;
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {
      if (observeFailuresLeft > 0) {
        observeFailuresLeft -= 1; // one-shot: only the next build fails
        throw new Error("injected observe failure");
      }
      observers.push(this);
    }
    disconnect() {
      const index = observers.indexOf(this);
      if (index >= 0) observers.splice(index, 1);
    }
  }
  const storage = new Map();
  globalThis.document = document;
  globalThis.window = {
    dispatchEvent: (event) => events.push(event),
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { search: "" },
  };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.MutationObserver = MutationObserver;
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  };
  return {
    document, events, observers,
    storage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    },
    injectObserveFailure: (count = 1) => { observeFailuresLeft = count; },
    styleTag: (id) => head.children.find((child) => child.tagName === "style" && child.dataset.pluginCss === id && !child.removed) ?? null,
    favicon: () => [...head.children].filter((child) => child.tagName === "link" && !child.removed).at(-1) ?? null,
  };
}

function makeCtx() {
  const layers = new Map();
  const zh = { "hero.headline": "官方标语" };
  const en = { "hero.headline": "Official" };
  return {
    layers,
    slots: {
      inject: (key, callback) => callback() ?? (() => {}),
      register: () => () => {},
    },
    locale: {
      getLocale: () => ({ active: "zh" }),
      dicts: new Map([["conversation", new Map([["zh", zh], ["en", en]])]]),
    },
    theme: {
      overrideTokens: (source, tokens) => {
        layers.set(source, tokens);
        return () => layers.delete(source);
      },
    },
  };
}

const stubJsx = { jsx: () => null };

function personalizationFor(skinsById) {
  return {
    getOverrides: () => ({}),
    assetResolver: (ref) => {
      if (ref.kind === "builtin") {
        const asset = skinsById.get(ref.skinId)?.builtinAssets?.[ref.assetKey];
        return asset ? { url: asset.url, mime: asset.mime } : null;
      }
      return null;
    },
  };
}

function bootMeirenzhi(dom) {
  const runtime = createSkinRuntime();
  const meirenzhi = createMeirenzhiSkin(stubJsx);
  const openbmc = createOpenBmcHarness(stubJsx); // 工厂自带 builtinAssets（ADR-0014/B15）
  runtime.register(openbmc);
  runtime.register(meirenzhi);
  const ctx = makeCtx();
  const dispose = runtime.apply(ctx); // apply() mounts order[0]; meirenzhi is selected explicitly below
  runtime.setPersonalization(personalizationFor(new Map([["meirenzhi", meirenzhi], ["openbmc", openbmc]])));
  runtime.select("meirenzhi");
  dom.document.title = "标题实验 — DeepSeek Harness";
  for (const observer of [...dom.observers]) observer.callback();
  return { runtime, ctx, dispose, meirenzhi };
}

function bootOpenBmcWithDesktopBlur(desktopBlur) {
  const dom = installDom();
  const runtime = createSkinRuntime();
  const openbmc = createOpenBmcHarness(stubJsx); // 工厂自带 builtinAssets（ADR-0014/B15）
  const project = openbmc.project;
  openbmc.project = (values, assets) => {
    const effects = project(values, assets);
    return { ...effects, backdrop: { ...effects.backdrop, desktopBlur } };
  };
  runtime.register(openbmc);
  runtime.setPersonalization(personalizationFor(new Map([["openbmc", openbmc]])));
  const dispose = runtime.apply(makeCtx());
  return { dom, dispose };
}

test("Desktop backdrop override is Windows-marker scoped and leaves the Web base rule intact", () => {
  const { dom, dispose } = bootOpenBmcWithDesktopBlur({ light: 2.5, dark: 0 });
  const css = dom.styleTag("dsh-skins/openbmc.backdrop.css").textContent;
  const [webRule] = css.split('\n');

  assert.ok(webRule.startsWith('body[data-dsh-openbmc-skin]::before{'));
  assert.ok(webRule.endsWith("background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;}"));
  assert.doesNotMatch(webRule, /filter:blur|transform:scale/);
  assert.ok(css.includes("html[data-windows-titlebar] body[data-dsh-openbmc-skin]:not([data-ds-dark-theme])::before{filter:blur(2.5px);transform:scale(1.02);}"));
  assert.equal(css.includes('html[data-windows-titlebar] body[data-dsh-openbmc-skin][data-ds-dark-theme]::before{filter:'), false);
  assert.doesNotMatch(css, /centerCol/);
  dispose();
});

test("zero Desktop blur adds no filter, transform, or marker rule", () => {
  const { dom, dispose } = bootOpenBmcWithDesktopBlur({ light: 0, dark: 0 });
  const css = dom.styleTag("dsh-skins/openbmc.backdrop.css").textContent;
  assert.equal(css.includes('filter:blur'), false);
  assert.equal(css.includes('transform:scale'), false);
  assert.equal(css.includes('html[data-windows-titlebar]'), false);
  dispose();
});

test("shell-frame alignment: solid chrome rules + opaque token + wallpaper-in-content mount with the skin (ADR-0009 v6)", () => {
  const { dom, dispose } = bootOpenBmcWithDesktopBlur({ light: 0, dark: 0 });
  const tag = dom.styleTag("dsh-skins/openbmc.shell.css");
  assert.ok(tag, "shell alignment tag must mount with the skin");
  const lines = tag.textContent.split("\n");
  assert.equal(lines.length, 12, "comment + 3 paint rules + 2 token rules + 2 content-wallpaper rules + 2 right-panel rules + 2 pane rules");
  assert.equal(lines[0], "/* dsh-skins shell-frame alignment (ADR-0009): solid chrome + wallpaper in the conversation area on Windows desktop */");
  assert.equal(lines[1], 'html[data-windows-titlebar] [class*="_frame"]:has(> [class*="_sidebarCol"])::before{background:0 0}');
  assert.equal(lines[2], 'html[data-windows-titlebar] [class*="_frame"] > [class*="_sidebarCol"]{background:0 0}');
  assert.equal(lines[3], 'html[data-windows-titlebar] [class*="_sidebarCol"] > [class*="_root"]{background:0 0}');
  assert.equal(lines[4], 'html[data-windows-titlebar] body[data-dsh-openbmc-skin]{--dsw-specific-sidebar-fill:rgb(238, 246, 251)!important}');
  assert.equal(lines[5], 'html[data-windows-titlebar] body[data-dsh-openbmc-skin][data-ds-dark-theme]{--dsw-specific-sidebar-fill:rgb(13, 30, 44)!important}');
  const contentPrefix = 'html[data-windows-titlebar] body[data-dsh-openbmc-skin] [class*="_centerCol"]{background-image:';
  assert.ok(lines[6].startsWith(contentPrefix + "linear-gradient(rgba(247, 250, 252, 0.15) 0%, rgba(240, 246, 250, 0.28) 100%), url(data:image/webp;base64,"), "light content rule carries the scrim+art backdrop");
  assert.ok(lines[6].endsWith("background-size:cover;background-position:center;background-repeat:no-repeat}"));
  assert.ok(lines[7].startsWith('html[data-windows-titlebar] body[data-dsh-openbmc-skin][data-ds-dark-theme] [class*="_centerCol"]{background-image:linear-gradient('), "dark content rule present");
  assert.equal(lines[8], 'html[data-windows-titlebar] body[data-dsh-openbmc-skin] [data-rightbar-col] > *{background-color:rgb(238, 246, 251)!important}');
  assert.equal(lines[9], 'html[data-windows-titlebar] body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-rightbar-col] > *{background-color:rgb(13, 30, 44)!important}');
  const stripImage = (line) => line.slice(line.indexOf("{") + 1).replace(/}$/, "").replace(/^background-image:/, "").replace(/;background-size:cover;background-position:center;background-repeat:no-repeat$/, "");  assert.equal(tag.textContent, shellAlignment.buildShellAlignmentCss("dshOpenbmcSkin", {
    light: "rgb(238, 246, 251)",
    dark: "rgb(13, 30, 44)",
  }, {
    imageLight: stripImage(lines[6]),
    imageDark: stripImage(lines[7]),
  }), "runtime emission and the exported builder must agree");
  assert.doesNotMatch(tag.textContent, /centerCol[^\"]/, "the content column is only ever targeted structurally");
  const fullscreenTag = dom.styleTag("dsh-skins/openbmc.fullscreen.css");
  assert.ok(fullscreenTag, "fullscreen frost base must mount with the skin");
  assert.equal(
    fullscreenTag.textContent,
    buildFullscreenBaseCss("dshOpenbmcSkin", { light: "rgb(238, 246, 251)", dark: "rgb(13, 30, 44)" }),
    "runtime emission and the exported builder must agree",
  );
  dispose();
  assert.equal(dom.styleTag("dsh-skins/openbmc.shell.css"), null, "shell tag must unmount with the skin");
  assert.equal(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), null, "fullscreen tag must unmount with the skin");
});

test("shell-frame alignment: no caption tag is emitted (superseded by the opaque shell token, ADR-0009 v4)", () => {
  const dom = installDom();
  const { runtime, dispose } = bootMeirenzhi(dom);
  assert.equal(dom.styleTag("dsh-skins/meirenzhi.caption.css"), null, "the caption sampler machinery is gone");
  runtime.select("official");
  assert.equal(dom.styleTag("dsh-skins/meirenzhi.shell.css"), null, "official must drop the alignment so the untouched host paints stand alone");
  dispose();
});

test("shell-frame alignment: builder without backdrop or fill override ships the paint rules only", () => {
  const minimal = shellAlignment.buildShellAlignmentCss("data-dsh-x-skin", null, null);
  assert.equal(minimal.split("\n").length, 4, "paint rules only — no token or content-wallpaper lines");
  const noFill = shellAlignment.buildShellAlignmentCss("data-dsh-x-skin", null, { imageLight: "url(x)", imageDark: "url(y)" });
  assert.equal(noFill.split("\n").length, 6, "paint rules + content-wallpaper rules without token lines");
  assert.deepEqual(shellAlignment.parseRgbaChannels("rgba(250, 249, 246, 0.40)"), { r: 250, g: 249, b: 246, a: 0.4 });
  assert.deepEqual(shellAlignment.parseRgbaChannels("rgba(13, 30, 44, 0.72)"), { r: 13, g: 30, b: 44, a: 0.72 });
  assert.equal(shellAlignment.parseRgbaChannels("rgb(13, 30, 44)"), null, "alpha is required — the skins always emit rgba");
});

test("shell-frame alignment: A→B switch swaps the tag; official restores the untouched host paints", () => {
  const dom = installDom();
  const { runtime } = bootMeirenzhi(dom);
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.shell.css"));
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.fullscreen.css"), "meirenzhi fullscreen base must mount");
  runtime.select("openbmc");
  assert.equal(dom.styleTag("dsh-skins/meirenzhi.shell.css"), null, "old skin shell tag must go");
  assert.equal(dom.styleTag("dsh-skins/meirenzhi.fullscreen.css"), null, "old skin fullscreen tag must go");
  assert.ok(dom.styleTag("dsh-skins/openbmc.shell.css"), "new skin shell tag must mount");
  assert.ok(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), "new skin fullscreen tag must mount");
  runtime.select("official");
  assert.equal(dom.styleTag("dsh-skins/openbmc.shell.css"), null, "official must drop the alignment so opaque host paints stand alone");
  assert.equal(dom.styleTag("dsh-skins/openbmc.fullscreen.css"), null, "official must drop the fullscreen base");
});

test("fullscreen base: uefi column mounts with its own fills (three-skin parity, impl-review B2)", () => {
  const dom = installDom();
  const runtime = createSkinRuntime();
  const uefi = createUefiHarness(stubJsx);
  runtime.register(uefi);
  runtime.setPersonalization(personalizationFor(new Map([["uefi-harness", uefi]])));
  const dispose = runtime.apply(makeCtx()); // apply() mounts order[0] = uefi
  const tag = dom.styleTag("dsh-skins/uefi-harness.fullscreen.css");
  assert.ok(tag, "uefi fullscreen base must mount with the skin");
  assert.equal(
    tag.textContent,
    buildFullscreenBaseCss("dshUefiHarness", { light: "rgb(238, 235, 255)", dark: "rgb(25, 20, 48)" }),
    "uefi emission and the exported builder must agree",
  );
  dispose();
  assert.equal(dom.styleTag("dsh-skins/uefi-harness.fullscreen.css"), null, "uefi fullscreen tag must unmount with the skin");
});

test("N1: a successful hot-update keeps the live skin fully intact", () => {
  const dom = installDom();
  const { runtime, ctx } = bootMeirenzhi(dom);

  const before = {
    css: dom.styleTag("dsh-skins/meirenzhi.css"),
    backdrop: dom.styleTag("dsh-skins/meirenzhi.backdrop.css"),
    shell: dom.styleTag("dsh-skins/meirenzhi.shell.css"),
    attr: dom.document.body.dataset.dshMeirenzhiSkin !== undefined,
    slogan: ctx.locale.dicts.get("conversation").get("zh")["hero.headline"],
    layer: ctx.layers.get("dsh-skins/meirenzhi"),
    title: dom.document.title,
  };
  assert.ok(before.css && before.backdrop && before.attr && before.layer && before.shell);
  assert.equal(before.slogan, "风起凡尘 · 红颜问道");
  assert.equal(before.title, "标题实验 — 美人志");

  // The production wiring fires this on every config sync (page load).
  const result = runtime.updateActive();
  assert.equal(result.applied, true);
  assert.equal(result.degraded, "none");
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.css"), "skin css tag must survive");
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.backdrop.css"), "backdrop tag must survive");
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.shell.css"), "shell alignment tag must survive");
  assert.equal(dom.document.body.dataset.dshMeirenzhiSkin !== undefined, true, "body scope attr must survive");
  assert.equal(ctx.locale.dicts.get("conversation").get("zh")["hero.headline"], "风起凡尘 · 红颜问道");
  assert.ok(ctx.layers.get("dsh-skins/meirenzhi"), "token layer must survive");
  assert.equal(dom.document.title, "标题实验 — 美人志");
  assert.equal(runtime.active(), "meirenzhi");
});

test("N1: a direct A→B switch rebrands the title without an official detour", () => {
  const dom = installDom();
  const { runtime } = bootMeirenzhi(dom);
  runtime.select("openbmc");
  assert.equal(runtime.active(), "openbmc");
  assert.equal(dom.document.title, "标题实验 — OpenBMC Studio");
  assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, undefined);
  assert.equal(dom.document.body.dataset.dshOpenbmcSkin, "");
  // And back — still no official detour.
  runtime.select("meirenzhi");
  assert.equal(dom.document.title, "标题实验 — 美人志");
});

test("N1: a failed same-skin rebuild restores the previous effects", () => {
  const dom = installDom();
  const { runtime, ctx } = bootMeirenzhi(dom);
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.backdrop.css"));

  dom.injectObserveFailure(1); // exactly the next build fails; the restore build must succeed
  const result = runtime.updateActive();
  assert.equal(result.applied, false);
  assert.equal(result.reason, "mount-failed");


  // The previous meirenzhi effects were RE-PROJECTED and remounted.
  assert.equal(runtime.active(), "meirenzhi");
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.css"));
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.backdrop.css"));
  assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, "");
  assert.equal(ctx.locale.dicts.get("conversation").get("zh")["hero.headline"], "风起凡尘 · 红颜问道");
  assert.ok(ctx.layers.get("dsh-skins/meirenzhi"));
});

test("N1: selecting a skin that cannot project keeps the current skin", () => {
  const dom = installDom();
  const runtime = createSkinRuntime();
  const good = createMeirenzhiSkin(stubJsx);
  const broken = createOpenBmcHarness(stubJsx);
  broken.project = () => { throw new Error("always broken"); };
  runtime.register(broken);
  runtime.register(good);
  runtime.apply(makeCtx());
  runtime.setPersonalization(personalizationFor(new Map([["meirenzhi", good], ["openbmc", broken]])));
  runtime.select("meirenzhi");
  dom.document.title = "标题实验 — DeepSeek Harness";
  for (const observer of [...dom.observers]) observer.callback();

  runtime.select("openbmc");
  assert.equal(runtime.active(), "meirenzhi", "failed selection must not change the active skin");
  assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, "");
  assert.ok(dom.styleTag("dsh-skins/meirenzhi.backdrop.css"));
});

// Product promise under test: making openbmc the FIRST registered skin (v1.0.6
// default switch, meirenzhi before it) only affects users with NO stored choice.
// Each case boots a FRESH DOM/storage/runtime (apply's official branch never
// unmounts a previous mount, so cases must not share a runtime — execution-
// review N1) and calls apply() ONCE, the way a real browser boot would.
function bootWithStoredChoice(stored) {
  const dom = installDom();
  const runtime = createSkinRuntime();
  const openbmc = createOpenBmcHarness(stubJsx); // 工厂自带 builtinAssets（ADR-0014/B15）
  const meirenzhi = createMeirenzhiSkin(stubJsx);
  runtime.register(openbmc);
  runtime.register(meirenzhi);
  runtime.setPersonalization(personalizationFor(new Map([["openbmc", openbmc], ["meirenzhi", meirenzhi]])));
  dom.storage.setItem("dsh-skins:active", stored);
  const dispose = runtime.apply(makeCtx());
  return { dom, runtime, dispose };
}

test("stored selections survive the factory-skin switch (resolveSelectedId contract)", () => {
  // A user who already chose meirenzhi keeps it — meirenzhi really mounts,
  // even though openbmc is now the factory default.
  {
    const { dom, runtime, dispose } = bootWithStoredChoice("meirenzhi");
    assert.equal(runtime.active(), "meirenzhi");
    assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, "");
    assert.ok(dom.styleTag("dsh-skins/meirenzhi.css"), "meirenzhi must be the mounted skin");
    dispose();
    assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, undefined, "dispose removes the scope attr");
  }

  // A stored canonical `official` choice wins over the factory skin and
  // mounts NOTHING custom (the legacy alias is `default`, normalized inside
  // resolveSelectedId; `official` itself is the canonical id).
  {
    const { dom, runtime, dispose } = bootWithStoredChoice("official");
    assert.equal(runtime.active(), "official");
    assert.equal(dom.document.body.dataset.dshMeirenzhiSkin, undefined);
    assert.equal(dom.document.body.dataset.dshOpenbmcSkin, undefined);
    assert.equal(dom.styleTag("dsh-skins/meirenzhi.css"), null, "no meirenzhi style tag on official boot");
    assert.equal(dom.styleTag("dsh-skins/openbmc.css"), null, "no openbmc style tag on official boot");
    dispose();
  }

  // Only a stale/invalid stored value falls through to the factory skin.
  {
    const { dom, runtime, dispose } = bootWithStoredChoice("not-a-skin");
    assert.equal(runtime.active(), "openbmc");
    assert.equal(dom.document.body.dataset.dshOpenbmcSkin, "");
    assert.ok(dom.styleTag("dsh-skins/openbmc.css"), "openbmc must be the mounted skin");
    dispose();
    assert.equal(dom.document.body.dataset.dshOpenbmcSkin, undefined, "dispose removes the scope attr");
  }
});

// ---- production surface (ADR-0014) -----------------------------------------

test("register fails closed on unknown fields — the surface is exactly seven (ADR-0014)", () => {
  const runtime = createSkinRuntime();
  const skin = createOpenBmcHarness(stubJsx);
  const fat = { ...skin, css: "/* legacy packaging field */" };
  assert.throws(() => runtime.register(fat), /unknown skin field "css"/);
});

test("a minimal seven-field skin registers (ADR-0014)", () => {
  const runtime = createSkinRuntime();
  runtime.register({
    id: "minimal",
    label: "Minimal",
    description: { zh: "最小", en: "Minimal" },
    Mark: () => null,
    Name: () => null,
    project: () => ({ bodyAttribute: "minimalSkin" }),
    builtinAssets: {},
  });
  assert.deepEqual(runtime.list().map((s) => s.id), ["minimal"]);
});

test("PRODUCTION_FIELDS pins the whitelist content (ADR-0014)", () => {
  assert.deepEqual([...PRODUCTION_FIELDS].sort(), [
    "Mark", "Name", "builtinAssets", "description", "id", "label", "project",
  ]);
});
