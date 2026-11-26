/**
 * Personalization panel public-path tests (simplification T5). These render
 * the REAL panel (schema from the REAL catalog) through the shared fake
 * React and drive the complete user path (ADR-0003 auto-save): field edits
 * preview locally and the client debounces the flush, 恢复默认 resets and
 * flushes at once, the wallpaper section merges builtin + library with
 * clear-library confirmation, and the footer action bar carries the status
 * cluster (offline/refetch/error notice).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPersonalizationPanel, PANEL_CSS } from "../src/client/personalization/panel.js";
import { DICTS } from "../src/client/dicts.js";
import { getSkinSchema } from "../src/shared/personalization/catalog.js";
import { createFakeReact, jsx, flatten, findButton } from "./fake-react.mjs";

const SKINS = ["openbmc", "uefi-harness", "meirenzhi"];
const STATUSES = ["synced", "offline-failed"];

function makeConfigClient(overrides = {}) {
  const listeners = new Set();
  let state = {
    status: "synced",
    revision: 7,
    mode: "normal",
    skins: {},
    library: [],
    references: {},
    dirtyCount: 0,
    notices: [],
    ...overrides,
  };
  // Preview layer, mirroring the real client's effectiveOverrides(skinId):
  // returns THAT SKIN's section with previews layered on top.
  const previews = new Map();
  const calls = { preview: [], previewReset: [], restore: 0, flushNow: 0, refetch: 0, clearLibrary: 0 };
  const emit = () => { for (const l of [...listeners]) l(state); };
  return {
    calls,
    getState: () => state,
    setState: (next) => { state = { ...state, ...next }; emit(); },
    onStateChange: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    effectiveOverrides: (skinId) => {
      const section = structuredClone(state.skins[skinId] ?? {});
      for (const [composite, value] of previews) {
        const [owner, key] = composite.split(" ");
        if (owner !== skinId) continue;
        if (value === null) delete section[key];
        else section[key] = value;
      }
      return section;
    },
    preview: (skinId, key, value) => { calls.preview.push({ skinId, key, value }); previews.set(`${skinId} ${key}`, value); state = { ...state, dirtyCount: previews.size, notices: state.notices.filter((n) => n.kind === "reverted") }; emit(); },
    previewReset: (skinId, key) => { calls.previewReset.push({ skinId, key }); previews.set(`${skinId} ${key}`, null); state = { ...state, dirtyCount: previews.size, notices: state.notices.filter((n) => n.kind === "reverted") }; emit(); },
    referencesFor: (assetId) => [
      ...(state.references[assetId] ?? []).map((entry) => ({ ...entry, layer: "persisted" })),
      ...[...previews.entries()]
        .filter(([, value]) => value !== null && value === assetId)
        .map(([composite]) => { const [skinId, key] = composite.split(" "); return { skinId, key, layer: "preview" }; }),
    ],
    flushNow: async () => { calls.flushNow += 1; return { flushed: state.dirtyCount, blocked: null }; },
    refetch: () => { calls.refetch += 1; },
    canWrite: () => state.status === "synced" && state.mode !== "recovery",
    uploadImage: async () => ({ error: "offline" }),
    deleteImage: async (id) => { void id; return { error: "offline" }; },
    clearLibrary: async () => { calls.clearLibrary += 1; return { affectedSkins: [] }; },
    confirmRecovery: async () => ({ ok: true }),
    assetUrl: (asset) => `/dsh-skins/assets/${asset.id}.png`,
  };
}

function installDom({ desktop, confirmResponse }) {
  const confirms = [];
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
  };
  globalThis.location = desktop
    ? { protocol: "dsh-app:", hostname: "app" }
    : { protocol: "http:", hostname: "127.0.0.1" };
  globalThis.window = { confirm: (text) => {
    if (desktop) throw new Error("never invoke window.confirm in Desktop");
    confirms.push(text);
    return confirmResponse;
  } };
  return confirms;
}

function mountPanel({ skinId, status, config, translations, desktop = true, confirmResponse = true, localeOf } = {}) {
  const react = createFakeReact();
  const confirms = installDom({ desktop, confirmResponse });
  const configClient = config ?? makeConfigClient({ status });
  // Mirrors the real locale runtime: template lookup + {placeholder}
  // substitution. Tests assert on the substituted params, so append them.
  // `translations` overrides specific keys with real copy so code→key→text
  // resolution (resolveHostErrorText) can be observed end to end.
  const tr = (key, params = {}) => {
    if (translations && typeof translations[key] === "string") {
      return Object.entries(params).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        translations[key],
      );
    }
    const suffix = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ");
    return suffix === "" ? key : `${key} ${suffix}`;
  };
  const Panel = createPersonalizationPanel({
    jsx, react, configClient, tr,
    builtinAssetsFor: () => ({}),
    labelFor: (id) => id,
    localeOf,
  });
  let tree = null;
  react.render(() => {
    tree = react.instantiate(jsx(Panel, { skinId }));
  });
  return { tree: () => tree, confirms, configClient, tr };
}

const dialogOf = (panel) => flatten(panel.tree()).find((n) => n.type === "dialog") ?? null;
const confirmDialog = async (panel) => {
  const button = findButton(dialogOf(panel), "personalization.confirm");
  assert.ok(button, "confirmation action exists");
  button.props.onClick();
  await tick();
};
const cancelDialog = async (panel) => {
  const button = findButton(dialogOf(panel), "personalization.cancel");
  assert.ok(button, "cancel action exists");
  button.props.onClick();
  await tick();
};

const textsOf = (tree) => flatten(tree).map((n) => n.props?.children).filter((c) => typeof c === "string");
const tick = () => new Promise((r) => setTimeout(r, 0));

for (const skinId of SKINS) {
  for (const status of STATUSES) {
    test(`panel renders per catalog schema for ${skinId} in ${status}`, async () => {
      const panel = mountPanel({ skinId, status });
      await tick();
      const tree = panel.tree();
      assert.notEqual(tree, null);

      const texts = textsOf(tree);
      for (const gone of ["personalization.favicon", "personalization.accent", "personalization.gold", "personalization.bubble", "personalization.back", "personalization.theme.export", "personalization.theme.import"]) {
        assert.equal(texts.includes(gone), false, `${gone} must not render`);
      }
      for (const field of getSkinSchema(skinId).fields) {
        assert.ok(texts.includes(field.labelKey), `${field.labelKey} renders`);
      }
      const actions = flatten(tree).find((n) => n.props?.className?.includes("dsh-skins-pz-actions"));
      assert.equal(findButton(tree, "personalization.save"), null, "no save button (ADR-0003 auto-save)");
      assert.equal(findButton(tree, "personalization.restore"), null, "no revert button (ADR-0003)");
      assert.equal(findButton(tree, "personalization.reset"), null, "clean skin: no reset control (v1.0.0 height ruling)");
      if (status === "offline-failed") {
        assert.notEqual(actions, undefined, "offline banner renders in the footer status bar");
        assert.ok(texts.includes("personalization.status.offline"), "offline banner in the footer");
        assert.notEqual(findButton(tree, "personalization.status.retry"), null, "retry offered");
      } else if (status === "synced") {
        assert.ok(actions === undefined,
          "no footer strip without status content — the panel's resting height never depends on state (v1.0.0 ruling)");
      } else {
        assert.notEqual(actions, undefined, "loading/readonly statuses keep their transient strip");
      }
    });
  }
}

test("the offline retry button drives refetch (retry is gone from the api)", async () => {
  const config = makeConfigClient({});
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  config.setState({ status: "offline-failed" });
  await tick();
  const retry = findButton(panel.tree(), "personalization.status.retry");
  assert.notEqual(retry, null, "retry offered while offline");
  retry.props.onClick();
  assert.equal(config.calls.refetch, 1, "the button re-points to refetch, not the deleted retry member");
});

test("meirenzhi slider renders Desktop factory 66 and Web factory 35, including after reset", async () => {
  for (const [desktop, expected] of [[true, "66%"], [false, "35%"]]) {
    const config = makeConfigClient({ skins: { meirenzhi: { panelOpacity: 70 } } });
    const panel = mountPanel({ skinId: "meirenzhi", config, desktop });
    await tick();
    findButton(panel.tree(), "personalization.reset").props.onClick();
    if (desktop) { await tick(); await confirmDialog(panel); }
    await tick();
    const output = flatten(panel.tree()).find((node) => node.type === "output");
    assert.equal(output.props.children, expected);
    assert.deepEqual(config.calls.previewReset.map((call) => call.key),
      getSkinSchema("meirenzhi").fields.map((field) => field.key));
  }
});

test("field edits preview locally and arm the auto-save; no save button exists", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced" });
  await tick();
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  assert.notEqual(translucency, null, "translucency slider renders (ruling #14)");
  assert.equal(findButton(panel.tree(), "personalization.save"), null, "no save button (ADR-0003)");

  translucency.props.onChange({ target: { value: "55" } });
  await tick();
  assert.deepEqual(panel.configClient.calls.preview, [{ skinId: "meirenzhi", key: "panelOpacity", value: 55 }]);
  assert.equal(panel.configClient.getState().dirtyCount, 1, "edits preview locally; the client debounces the flush");
});

test("slogan text edits preview the complete locale object", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced" });
  await tick();
  const tree = panel.tree();
  const zh = flatten(tree).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.slogan (ZH)");
  const en = flatten(tree).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.slogan (EN)");
  assert.notEqual(zh, null);
  zh.props.onChange({ target: { value: "新标语" } });
  await tick();
  // Re-query from the re-rendered tree — the en input's handler must see the
  // fresh locale value (exactly like typing into the re-rendered DOM).
  const enFresh = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.slogan (EN)");
  enFresh.props.onChange({ target: { value: "New slogan" } });
  await tick();
  assert.equal(panel.configClient.calls.preview.length, 2);
  assert.deepEqual(panel.configClient.calls.preview[0].value, { zh: "新标语", en: "From mortal dust, immortals bloom" });
  assert.deepEqual(panel.configClient.calls.preview[1].value, { zh: "新标语", en: "New slogan" });
});

test("恢复默认 confirms with the affected field list; decline is a no-op (user ruling #9)", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced" });
  await tick();
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  translucency.props.onChange({ target: { value: "66" } });
  await tick();
  const reset = () => findButton(panel.tree(), "personalization.reset");
  assert.notEqual(reset(), null, "reset offered while overrides exist");
  const head = flatten(panel.tree()).find((n) => n.props?.className === "dsh-skins-pz-head");
  const resetInHead = head?.props?.children?.some?.((c) => c?.type === "button" && c?.props?.children === "personalization.reset");
  assert.ok(resetInHead, "reset lives in the header row — its appearance cannot grow the panel (v1.0.0 height ruling)");

  // The renderer-owned HTML dialog opens before any destructive write.
  reset().props.onClick();
  await tick();
  assert.equal(dialogOf(panel)?.open, true, "showModal places the confirmation in the renderer top layer");
  assert.ok(textsOf(panel.tree()).some((text) => text.includes("personalization.panelTranslucency")), "affected field is listed");
  assert.equal(panel.configClient.calls.flushNow, 0, "opening a dialog never saves");
  await confirmDialog(panel);
  assert.equal(dialogOf(panel), null, "accept removes the dialog");
  assert.equal(panel.configClient.calls.flushNow, 1, "agreeing flushes the factory values at once");
  assert.deepEqual(panel.configClient.calls.previewReset.map((c) => c.key),
    getSkinSchema("meirenzhi").fields.map((f) => f.key), "every field reset to factory");

  // Declining: asked again, nothing happens at all. (The agree path above
  // legitimately emptied the override set, so re-establish one first.)
  translucency.props.onChange({ target: { value: "70" } });
  await tick();
  reset().props.onClick();
  await tick();
  assert.ok(textsOf(panel.tree()).some((text) => text.includes("personalization.panelTranslucency")), "affected field listed again");
  await cancelDialog(panel);
  assert.equal(dialogOf(panel), null, "cancel dismisses without a native dialog");
  assert.equal(panel.configClient.calls.flushNow, 1, "decline flushes nothing");
  assert.equal(panel.configClient.calls.previewReset.length, getSkinSchema("meirenzhi").fields.length, "decline resets nothing");
});

test("Desktop reset highlights exactly the affected fields as individual semantic tags", async () => {
  const config = makeConfigClient({ skins: { meirenzhi: {
    wallpaper: "builtin:meirenzhi:mupeiling",
    slogan: { zh: "改过的标语", en: "Custom slogan" },
    panelOpacity: 68,
  } } });
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  findButton(panel.tree(), "personalization.reset").props.onClick();
  await tick();
  const dialog = dialogOf(panel);
  const tags = flatten(dialog).filter((node) => node.type === "li" && node.props.className === "dsh-skins-pz-dialog-tag");
  assert.equal(dialog.open, true);
  assert.deepEqual(tags.map((node) => node.props.children), [
    "personalization.wallpaper", "personalization.slogan", "personalization.panelTranslucency",
  ], "three catalog-ordered tags, never one comma-delimited text selection");
  assert.equal(flatten(dialog).find((node) => node.type === "ul")?.props.className, "dsh-skins-pz-dialog-tags");
  assert.ok(textsOf(dialog).includes("personalization.resetConfirmIntro"));
  assert.ok(textsOf(dialog).includes("personalization.resetConfirmOutro"));
  assert.equal(config.calls.flushNow, 0, "highlighting a field does not reset it");
  await cancelDialog(panel);
  assert.equal(config.calls.flushNow, 0);

  const one = mountPanel({ skinId: "meirenzhi", config: makeConfigClient({ skins: { meirenzhi: { panelOpacity: 68 } } }) });
  await tick();
  findButton(one.tree(), "personalization.reset").props.onClick();
  await tick();
  assert.deepEqual(flatten(dialogOf(one)).filter((node) => node.type === "li").map((node) => node.props.children),
    ["personalization.panelTranslucency"], "only overridden fields receive tags");
});

test("Web profile keeps native reset confirmation and never mounts the HTML dialog", async () => {
  const config = makeConfigClient({ skins: { meirenzhi: { panelOpacity: 66 } } });
  const web = mountPanel({ skinId: "meirenzhi", config, desktop: false, translations: DICTS.zh });
  await tick();
  findButton(web.tree(), DICTS.zh["personalization.reset"]).props.onClick();
  await tick();
  assert.equal(web.confirms.length, 1, "Web still calls window.confirm once");
  assert.equal(web.confirms[0], "以下设置将恢复为出厂默认：\n\n• 通透度\n\n此操作立即生效，确认继续吗？",
    "Web native confirmation shows one affected field on its own bullet line");
  assert.equal(dialogOf(web), null, "Web does not mount the Desktop HTML dialog");
  assert.equal(config.calls.flushNow, 1, "approval preserves Web reset behavior");
  const cancelConfig = makeConfigClient({ skins: { meirenzhi: { panelOpacity: 66 } } });
  const canceled = mountPanel({ skinId: "meirenzhi", config: cancelConfig, desktop: false, confirmResponse: false });
  await tick();
  findButton(canceled.tree(), "personalization.reset").props.onClick();
  assert.equal(canceled.confirms.length, 1);
  assert.equal(cancelConfig.calls.flushNow, 0, "decline remains a no-op");
});

test("Web native reset confirmation lists all three changed fields on separate lines in zh/en", async () => {
  const skins = { meirenzhi: {
    wallpaper: "builtin:meirenzhi:mupeiling",
    slogan: { zh: "自定义标语", en: "Custom slogan" },
    panelOpacity: 68,
  } };
  for (const [translations, expected] of [
    [DICTS.zh, "以下设置将恢复为出厂默认：\n\n• 壁纸\n• 标语\n• 通透度\n\n此操作立即生效，确认继续吗？"],
    [DICTS.en, "These settings will be reset to factory defaults:\n\n• Wallpaper\n• Slogan\n• Translucency\n\nThis takes effect immediately. Continue?"],
  ]) {
    const config = makeConfigClient({ skins });
    const web = mountPanel({ skinId: "meirenzhi", config, desktop: false, translations, confirmResponse: false });
    await tick();
    findButton(web.tree(), translations["personalization.reset"]).props.onClick();
    assert.deepEqual(web.confirms, [expected]);
    assert.equal(dialogOf(web), null, "Web still never mounts the Desktop HTML dialog");
    assert.equal(config.calls.flushNow, 0, "cancel does not reset anything");
  }
});

test("offline: every write path is disabled — edits included (ADR-0003)", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "壁纸.png" };
  const config = makeConfigClient({ status: "offline-failed", library: [asset] });
  const panel = mountPanel({ skinId: "meirenzhi", status: "offline-failed", config });
  await tick();
  const tree = panel.tree();
  assert.equal(findButton(tree, "personalization.save"), null, "no save button at all");
  assert.equal(findButton(tree, "personalization.library.upload").props.disabled, true, "upload disabled offline");
  const del = flatten(tree).find((n) => n.type === "button" && typeof n.props["aria-label"] === "string" && n.props["aria-label"].startsWith("personalization.library.delete:"));
  assert.equal(del.props.disabled, true, "per-asset delete disabled offline");
  assert.equal(findButton(tree, "personalization.library.clear").props.disabled, true, "清空图库 disabled offline");
  // Auto-save cannot persist offline — edits are disabled outright (no queue).
  const translucency = flatten(tree).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  assert.equal(translucency.props.disabled, true, "field controls disabled offline");
});

// G0 exception ② (ADR-0015 plan): rewritten — 清空图库 is ONE atomic op now;
// the loop-and-stop-at-first-failure choreography was the ruled-out behavior.
test("清空图库 confirms with the affected list and clears via one atomic op (ADR-0015)", async () => {
  const assets = [
    { id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" },
    { id: "u_0123456789abcdef0123456789abcdeff", displayName: "b.png" },
  ];
  const references = {
    [assets[0].id]: [{ skinId: "meirenzhi", key: "wallpaper" }],
    [assets[1].id]: [{ skinId: "openbmc", key: "wallpaper" }],
  };
  const deleted = [];
  const config = makeConfigClient({ status: "synced", library: assets, references });
  config.deleteImage = async (id) => {
    deleted.push(id);
    return { affectedSkins: [] };
  };
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  findButton(panel.tree(), "personalization.library.clear").props.onClick();
  await tick();
  const text = textsOf(panel.tree()).find((value) => value.includes("personalization.library.clearConfirm"));
  assert.equal(dialogOf(panel)?.open, true, "one modal confirmation opens");
  assert.equal(flatten(dialogOf(panel)).filter((node) => node.type === "li").length, 0,
    "gallery confirmations keep their original plain-text presentation");
  assert.ok(text.includes("count=2"), "count in the confirm text");
  assert.ok(text.includes("meirenzhi · personalization.wallpaper"), "affected pair listed");
  assert.ok(text.includes("openbmc · personalization.wallpaper"), "affected pair listed");
  assert.deepEqual(deleted, [], "no per-asset delete is issued");
  assert.equal(config.calls.clearLibrary, 0, "nothing before approval");
  await confirmDialog(panel);
  assert.equal(config.calls.clearLibrary, 1, "exactly one atomic clear op");
  assert.deepEqual(deleted, [], "the N-delete loop is gone — one op replaced it");

  const failing = makeConfigClient({ status: "synced", library: assets, references });
  failing.clearLibrary = async () => ({ error: "boom" });
  const failPanel = mountPanel({ skinId: "meirenzhi", status: "synced", config: failing });
  await tick();
  findButton(failPanel.tree(), "personalization.library.clear").props.onClick();
  await tick();
  await confirmDialog(failPanel);
  assert.ok(textsOf(failPanel.tree()).includes("personalization.library.clearFailed"), "failure surfaced");
});

test("declining the clear-library confirm deletes nothing", async () => {
  const assets = [{ id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" }];
  const config = makeConfigClient({ status: "synced", library: assets });
  config.clearLibrary = async () => { throw new Error("must not be called"); };
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  findButton(panel.tree(), "personalization.library.clear").props.onClick();
  await tick();
  await cancelDialog(panel);
  assert.equal(dialogOf(panel), null, "cancel removes the HTML dialog");
  assert.equal(config.calls.clearLibrary, 0, "the throwing stub proves cancellation cleared nothing");
});

test("Web profile retains native gallery confirmations for clear and referenced deletion", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "used.png" };
  const options = {
    library: [asset], references: { [asset.id]: [{ skinId: "meirenzhi", key: "wallpaper" }] },
  };
  // G0 exception ② (ADR-0015): the clear path now rides ONE clearLibrary op.
  const clearConfig = makeConfigClient(options);
  const clearedOps = [];
  clearConfig.clearLibrary = async () => { clearedOps.push("clear"); return { affectedSkins: [] }; };
  const clearPanel = mountPanel({ skinId: "meirenzhi", config: clearConfig, desktop: false });
  await tick();
  findButton(clearPanel.tree(), "personalization.library.clear").props.onClick();
  await tick();
  assert.equal(clearPanel.confirms.length, 1);
  assert.ok(clearPanel.confirms[0].includes("meirenzhi · personalization.wallpaper"));
  assert.deepEqual(clearedOps, ["clear"], "one atomic op after the native confirmation");
  assert.equal(dialogOf(clearPanel), null);

  const deleteConfig = makeConfigClient(options);
  const deleted = [];
  deleteConfig.deleteImage = async (id) => { deleted.push(id); return { deleted: id }; };
  const deletePanel = mountPanel({ skinId: "meirenzhi", config: deleteConfig, desktop: false, confirmResponse: false });
  await tick();
  const deleteButton = flatten(deletePanel.tree()).find((node) =>
    node.type === "button" && String(node.props["aria-label"] ?? "").includes("used.png"));
  deleteButton.props.onClick();
  await tick();
  assert.equal(deletePanel.confirms.length, 1);
  assert.ok(deletePanel.confirms[0].includes("meirenzhi · personalization.wallpaper"));
  assert.deepEqual(deleted, [], "declining the native confirmation still preserves the image");
  assert.equal(dialogOf(deletePanel), null);
});

const delButtonsOf = (panel) => flatten(panel.tree()).filter(
  (n) => n.type === "button" && typeof n.props["aria-label"] === "string" && n.props["aria-label"].startsWith("personalization.library.delete:"),
);

test("referenced image deletion requires renderer confirmation; Escape cancels and double accept is idempotent", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "used.png" };
  const config = makeConfigClient({
    library: [asset], references: { [asset.id]: [{ skinId: "meirenzhi", key: "wallpaper" }] },
  });
  const deleted = [];
  config.deleteImage = async (id) => { deleted.push(id); return { deleted: id }; };
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  delButtonsOf(panel)[0].props.onClick();
  await tick();
  assert.equal(dialogOf(panel)?.open, true, "referenced image asks first");
  assert.ok(textsOf(panel.tree()).some((text) => text.includes("meirenzhi · personalization.wallpaper")));
  let prevented = false;
  dialogOf(panel).props.onCancel({ preventDefault: () => { prevented = true; } });
  await tick();
  assert.equal(prevented, true, "native HTML dialog Escape is consumed");
  assert.equal(dialogOf(panel), null);
  assert.deepEqual(deleted, [], "Escape never deletes the referenced image");
  delButtonsOf(panel)[0].props.onClick();
  await tick();
  const accept = findButton(dialogOf(panel), "personalization.confirm").props.onClick;
  accept();
  accept();
  await tick();
  assert.deepEqual(deleted, [asset.id], "double click cannot duplicate destructive requests");
});

test("confirmation remains fail-closed when synchronization is lost while open", async () => {
  const config = makeConfigClient({ skins: { meirenzhi: { panelOpacity: 66 } } });
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  findButton(panel.tree(), "personalization.reset").props.onClick();
  await tick();
  config.setState({ status: "offline-failed" });
  await tick();
  assert.equal(findButton(dialogOf(panel), "personalization.confirm").props.disabled, true);
  // A stale captured handler must still refuse the write even if called directly.
  findButton(dialogOf(panel), "personalization.confirm").props.onClick();
  await tick();
  assert.equal(config.calls.flushNow, 0);
  assert.deepEqual(config.calls.previewReset, []);
});

test("confirmation stays fail-closed in recovery mode (canWrite absorbs the recovery gate)", async () => {
  const config = makeConfigClient({ skins: { meirenzhi: { panelOpacity: 66 } } });
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  findButton(panel.tree(), "personalization.reset").props.onClick();
  await tick();
  // Recovery mode blocks writes while status stays synced — the dimension
  // only the client's own gate used to miss and the panel had to compensate.
  config.setState({ mode: "recovery" });
  await tick();
  assert.equal(config.getState().status, "synced", "still synced — recovery is not an offline state");
  assert.equal(findButton(dialogOf(panel), "personalization.confirm").props.disabled, true);
  findButton(dialogOf(panel), "personalization.confirm").props.onClick();
  await tick();
  assert.equal(config.calls.flushNow, 0);
  assert.deepEqual(config.calls.previewReset, []);
});

test("single delete: busy in flight, outcome always surfaced, retry after failure", async () => {
  const assets = [
    { id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" },
    { id: "u_0123456789abcdef0123456789abcdeff", displayName: "b.png" },
  ];
  let resolveDelete = null;
  const config = makeConfigClient({ status: "synced", library: assets });
  config.deleteImage = (id) => new Promise((resolve) => {
    resolveDelete = () => resolve({ affectedSkins: [], deleted: id });
  });
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  const buttons = () => delButtonsOf(panel);
  assert.equal(buttons().length, 2);
  assert.equal(buttons()[0].props.disabled, false, "enabled before the flight");

  const flight = buttons()[0].props.onClick();
  await tick();
  // In flight: the clicked cell shows a spinner (not "×") and every delete
  // button is disabled — no double DELETEs, no silent window.
  assert.equal(typeof buttons()[0].props.children, "object", "busy cell renders a spinner");
  assert.equal(buttons()[0].props.disabled, true, "busy delete disabled");
  assert.equal(buttons()[1].props.disabled, true, "other deletes queue behind the flight");

  resolveDelete();
  await flight;
  await tick();
  const note = textsOf(panel.tree()).find((t) => typeof t === "string" && t.startsWith("personalization.library.deleted"));
  assert.ok(note, "success is announced, never silent");
  assert.ok(note.includes("name=a.png"), "the deleted asset is named");
  assert.equal(buttons()[0].props.disabled, false, "flight over: buttons re-enabled");

  // Failure path: the default stub errors — message shown, retry possible.
  const failing = mountPanel({ skinId: "meirenzhi", status: "synced", config: makeConfigClient({ status: "synced", library: assets.slice(0, 1) }) });
  await tick();
  await delButtonsOf(failing)[0].props.onClick();
  assert.ok(textsOf(failing.tree()).includes("personalization.library.deleteFailed"), "failure surfaced");
  assert.equal(delButtonsOf(failing)[0].props.disabled, false, "retry stays possible");
});

test("revision conflict renders its dedicated warning instead of the generic save failure", async () => {
  const config = makeConfigClient({
    status: "synced",
    notices: [{ kind: "error", message: "stale generic reason" }, { kind: "conflict" }],
  });
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("personalization.saveConflict"));
  assert.equal(texts.includes("personalization.saveFailed"), false);
  assert.equal(texts.includes("stale generic reason"), false);
});

test("generic save failure renders only when no conflict code is present", async () => {
  const config = makeConfigClient({
    status: "synced",
    notices: [{ kind: "error", message: "boom" }],
  });
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("personalization.saveFailed"));
  assert.ok(texts.includes("boom"));
  assert.equal(texts.includes("personalization.saveConflict"), false);
});

test("auto-save failure strip renders from the error notice and clears on edit (ADR-0003)", async () => {
  const config = makeConfigClient({ status: "synced" });
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  assert.equal(textsOf(panel.tree()).includes("personalization.saveFailed"), false, "clean panel shows no failure strip");

  config.setState({ notices: [{ kind: "error", message: "meirenzhi.panelOpacity 校验失败（BAD_VALUE）" }] });
  await tick();
  assert.ok(textsOf(panel.tree()).includes("personalization.saveFailed"), "failure strip renders");
  assert.ok(textsOf(panel.tree()).some((t) => typeof t === "string" && t.includes("BAD_VALUE")), "the server's reason is surfaced");

  // A fresh edit always clears the strip.
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  translucency.props.onChange({ target: { value: "10" } });
  await tick();
  assert.equal(textsOf(panel.tree()).includes("personalization.saveFailed"), false, "editing clears the strip");
});

test("恢复默认 is disabled while offline (auto-save cannot persist, ADR-0003)", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "offline-failed" });
  await tick();
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  translucency.props.onChange({ target: { value: "66" } });
  await tick();
  // Offline: the panel ignored the edit (writes gated) — hmm, it previews...
  // The REAL gate is on the client; here the strip-level check is that the
  // reset button (when rendered) is disabled offline.
  const reset = findButton(panel.tree(), "personalization.reset");
  if (reset !== null) assert.equal(reset.props.disabled, true, "reset disabled offline");
});

test("no theme UI and no theme keys remain anywhere (⑦)", () => {
  const panelSource = readFileSync("src/client/personalization/panel.js", "utf8");
  const dictsSource = readFileSync("src/client/dicts.js", "utf8");
  for (const banned of ["personalization.theme.", "personalization.back"]) {
    assert.equal(panelSource.includes(banned), false, `panel must not reference ${banned}`);
    assert.equal(dictsSource.includes(banned), false, `dicts must not define ${banned}`);
  }
  assert.ok(dictsSource.includes('"personalization.library.uploading"'), "uploading key exists");
  assert.ok(dictsSource.includes('"personalization.panelLabel"'), "panelLabel key exists");
  assert.ok(dictsSource.includes('"personalization.collapse"'), "collapse key exists (v1.0.0 header ruling)");
  assert.ok(dictsSource.includes('"personalization.openbmc.art"'), "openbmc art label key exists");
  assert.ok(dictsSource.includes('"personalization.uefi.art"'), "uefi art label key exists");
  // Direction pin (field report: the chevrons shipped pointing right, which
  // reads as "expand" — collapse travels left, the way the panel's edge moves;
  // and the compact `M11 6-6 …` path form rendered as a garbled bar in
  // Chromium, so the pin also guards the explicit-command spelling).
  assert.ok(panelSource.includes('d: "M17 6 L11 12 L17 18 M11 6 L5 12 L11 18"'),
    "collapse glyph points LEFT (double left-chevron) spelled with explicit L commands");
});

test("a rejected upload surfaces the server's reason — never the delete copy", async () => {
  // Field report: a failed upload rendered 删除失败 (deleteFailed), sending
  // the bug hunt the wrong way. The upload path must map the server's code
  // through HOST_ERROR_KEYS and fall back to its own generic copy.
  const tooLarge = makeConfigClient({ status: "synced" });
  tooLarge.uploadImage = async () => ({ error: "UPLOAD_TOO_LARGE" });
  const a = mountPanel({
    skinId: "meirenzhi", status: "synced", config: tooLarge,
    translations: { "host.personalization.tooLarge": "图片超过大小限制" },
  });
  await tick();
  const input = flatten(a.tree()).find((n) => n.type === "input" && n.props.type === "file");
  assert.notEqual(input, null, "hidden file input renders");
  await input.props.onChange({ target: { files: [{ name: "big.png" }], value: "" } });
  const textsA = textsOf(a.tree());
  assert.ok(textsA.includes("图片超过大小限制"), "mapped code renders its localized reason");
  assert.equal(textsA.includes("personalization.library.deleteFailed"), false, "delete copy never renders for an upload");

  // Unmapped code (gate string / HTTP status): the localized unknown-error
  // copy naming the code (fix H) — never the Host's raw text, never a bare key.
  const generic = makeConfigClient({ status: "synced" }); // default stub errors "offline"
  const b = mountPanel({ skinId: "meirenzhi", status: "synced", config: generic });
  await tick();
  const inputB = flatten(b.tree()).find((n) => n.type === "input" && n.props.type === "file");
  await inputB.props.onChange({ target: { files: [{ name: "x.png" }], value: "" } });
  assert.ok(textsOf(b.tree()).includes("host.personalization.unknownError code=offline"),
    "unmapped codes render the localized generic naming the code");
  assert.equal(textsOf(b.tree()).includes("personalization.library.deleteFailed"), false, "delete copy still never renders");
});

test("UPLOAD_TIMEOUT renders its localized reason (field report: big uploads failed silently)", async () => {
  // The client-side fetch abort lands as code UPLOAD_TIMEOUT; the panel must
  // name it through HOST_ERROR_KEYS — the pre-fix behavior was NO message at
  // all (the abort escaped uploadImage as an unhandled rejection).
  const config = makeConfigClient({ status: "synced" });
  config.uploadImage = async () => ({ error: "UPLOAD_TIMEOUT" });
  const panel = mountPanel({
    skinId: "meirenzhi", status: "synced", config,
    translations: { "host.personalization.uploadTimeout": "上传超时，请检查网络后重试" },
  });
  await tick();
  const input = flatten(panel.tree()).find((n) => n.type === "input" && n.props.type === "file");
  await input.props.onChange({ target: { files: [{ name: "big.png" }], value: "" } });
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("上传超时，请检查网络后重试"), "the timeout code renders its localized reason");
  assert.equal(texts.includes("personalization.library.deleteFailed"), false, "delete copy never renders for a timeout");

  // Batch path: a timeout among successes surfaces through the summary
  // (all-fail batches show the bare reason — see the all-fail test below).
  const batch = makeConfigClient({ status: "synced" });
  batch.uploadImage = async (file) => (
    file.name === "a.png" ? { asset: { id: "u_a" } } : { error: "UPLOAD_TIMEOUT" }
  );
  const batchPanel = mountPanel({
    skinId: "meirenzhi", status: "synced", config: batch,
    translations: {
      "host.personalization.uploadTimeout": "上传超时，请检查网络后重试",
      "personalization.library.uploadSomeFailed": "已上传 {ok} 张，{failed} 张失败（{reason}）",
    },
  });
  await tick();
  const inputB = flatten(batchPanel.tree()).find((n) => n.type === "input" && n.props.type === "file");
  await inputB.props.onChange({ target: { files: [{ name: "a.png" }, { name: "b.png" }], value: "" } });
  const batchTexts = textsOf(batchPanel.tree());
  assert.ok(batchTexts.some((t) => t.includes("已上传 1 张，1 张失败")), "the batch summary counts the timeout");
  assert.ok(batchTexts.some((t) => t.includes("上传超时")), "the timeout reason is surfaced in the batch summary");
  assert.deepEqual(batch.calls.preview.at(-1), { skinId: "meirenzhi", key: "wallpaper", value: "u_a" },
    "selection still lands on the last success");
});

test("batch upload (Q43 reversal): sequential, lands on the last success, summarizes failures", async () => {
  const dictsSource = readFileSync("src/client/dicts.js", "utf8");
  assert.ok(dictsSource.includes('"personalization.library.uploadingBatch"'), "uploadingBatch key exists");
  assert.ok(dictsSource.includes('"personalization.library.uploadSomeFailed"'), "uploadSomeFailed key exists");

  // Partial failure: 2 of 3 land; the picker order is preserved; selection
  // lands on the LAST SUCCESSFUL upload; the summary names the count and the
  // first rejection reason.
  const config = makeConfigClient({ status: "synced" });
  const seen = [];
  config.uploadImage = async (file) => {
    seen.push(file.name);
    if (file.name === "bad.png") return { error: "UPLOAD_TOO_LARGE" };
    return { asset: { id: `u_${file.name}` } };
  };
  const panel = mountPanel({
    skinId: "meirenzhi", status: "synced", config,
    translations: {
      "host.personalization.tooLarge": "图片超过大小限制",
      "personalization.library.uploadingBatch": "正在上传 {done}/{total}…",
      "personalization.library.uploadSomeFailed": "已上传 {ok} 张，{failed} 张失败（{reason}）",
    },
  });
  await tick();
  const input = flatten(panel.tree()).find((n) => n.type === "input" && n.props.type === "file");
  assert.equal(input.props.multiple, true, "the picker accepts multiple files");

  await input.props.onChange({ target: { files: [{ name: "a.png" }, { name: "bad.png" }, { name: "c.png" }], value: "" } });
  assert.deepEqual(seen, ["a.png", "bad.png", "c.png"], "files upload one by one in pick order");
  const preview = config.calls.preview.at(-1);
  assert.deepEqual(
    [preview.skinId, preview.key, preview.value],
    ["meirenzhi", "wallpaper", "u_c.png"],
    "selection lands on the last successful upload, never the failed one",
  );
  const texts = textsOf(panel.tree());
  assert.ok(texts.some((t) => t.includes("已上传 2 张，1 张失败")), "the partial-failure summary renders");
  assert.ok(texts.some((t) => t.includes("图片超过大小限制")), "the rejection reason is surfaced");
  assert.equal(texts.some((t) => t.includes("正在上传")), false, "the in-flight progress message never outlives the batch");

  // All-fail: the bare reason stands alone and nothing is selected.
  const failing = makeConfigClient({ status: "synced" });
  failing.uploadImage = async () => ({ error: "ANIMATION_UNSUPPORTED" });
  const allBad = mountPanel({
    skinId: "meirenzhi", status: "synced", config: failing,
    translations: { "host.personalization.animatedWebp": "动画 WebP 暂不支持" },
  });
  await tick();
  const inputB = flatten(allBad.tree()).find((n) => n.type === "input" && n.props.type === "file");
  await inputB.props.onChange({ target: { files: [{ name: "x.webp" }, { name: "y.webp" }], value: "" } });
  assert.deepEqual(failing.calls.preview, [], "an all-fail batch selects nothing");
  assert.ok(textsOf(allBad.tree()).includes("动画 WebP 暂不支持"), "all-fail shows the mapped reason");
  assert.equal(textsOf(allBad.tree()).some((t) => t.includes("已上传")), false, "no success count when nothing landed");
});

test("library pagination folds after three rows: 18 inline, the rest behind load-more (ruling #18)", async () => {
  const assets = Array.from({ length: 24 }, (_, i) => ({
    id: `u_${String(i).padStart(32, "0")}`,
    displayName: `img-${i + 1}.png`,
  }));
  const config = makeConfigClient({ status: "synced", library: assets });
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", config });
  await tick();
  const cellsOf = (tree) => flatten(tree).filter(
    (n) => n.type === "div" && typeof n.props.className === "string" && n.props.className.includes("dsh-skins-pz-cell"),
  );
  assert.equal(cellsOf(panel.tree()).length, 18, "exactly the first 18 assets render inline (3 × 6)");
  assert.notEqual(
    findButton(panel.tree(), "personalization.library.more count=6"),
    null,
    "the load-more button names the hidden remainder",
  );

  // Expanding reveals the rest; the button retires once nothing is hidden.
  await findButton(panel.tree(), "personalization.library.more count=6").props.onClick();
  assert.equal(cellsOf(panel.tree()).length, 24, "expanding reveals every remaining asset");
  assert.equal(findButton(panel.tree(), "personalization.library.more count=6"), null, "the button retires when nothing is hidden");
});

test("meirenzhi panel renders one wallpaper thumb per catalog builtinChoices (6)", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced" });
  await tick();
  const choices = getSkinSchema("meirenzhi").fields.find((f) => f.key === "wallpaper").builtinChoices;
  // The panel splits the wallpaper row into a BUILTIN thumbs container and a
  // LIBRARY thumbs container — count only the builtin group's thumbs. Token
  // match, because "dsh-skins-pz-thumbs" contains "dsh-skins-pz-thumb" as a
  // substring and would otherwise count the container itself.
  const hasToken = (node, token) => String(node.props?.className ?? "").split(/\s+/).includes(token);
  const containers = flatten(panel.tree()).filter((n) => hasToken(n, "dsh-skins-pz-thumbs"));
  const builtinThumbs = flatten(containers[0]).filter((n) => hasToken(n, "dsh-skins-pz-thumb"));
  assert.equal(builtinThumbs.length, choices.length, "one thumb per registered builtin choice");
  assert.equal(choices.length, 6, "meirenzhi registers exactly 6 builtins");
});

test("PANEL_CSS owns the panel visual interface", () => {
  // Ownership partition ratchet (45 shell + 60 panel = 105):
  // a rule silently moving back to the shell changes this count even when
  // the final injected CSS stays byte-identical.
  assert.equal(PANEL_CSS.split("\n").length, 60,
    "PANEL_CSS freezes at 60 rules — including the locale badges and confirmation tag styles");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-dialog::backdrop"), "modal backdrop belongs to the panel");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-dialog-tags{display:flex;flex-wrap:wrap"), "tags wrap on narrow windows");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-dialog-tag::before"), "a dot distinguishes each item beyond color alone");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-locale-tag{flex:none;align-self:center"),
    "the ZH/EN badges sit inline with their inputs, vertically centered (stable resting height)");
  // The wallpaper grid and its full-row helpers (migrated from the switcher
  // test with the style-ownership refactor — the panel's visual interface is
  // this module's interface, so its assertions live here).
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-thumbs{display:grid;grid-template-columns:repeat(6,1fr)"),
    "wallpaper grid shows 6 thumbnails per row");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-thumbs>.dsh-skins-pz-btn{grid-column:1/-1;justify-self:center;white-space:nowrap"),
    "the load-more button spans the full row centered — never wrapped inside one column track");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-thumbs>.dsh-skins-pz-muted{grid-column:1/-1;white-space:nowrap"),
    "the empty-library hint spans the full row — never wrapped inside one column track");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-thumbs{grid-template-columns:repeat(4,1fr)"),
    "stacked (<904px) mode falls back to 4 columns");
  assert.ok(PANEL_CSS.indexOf("repeat(6,1fr)") < PANEL_CSS.indexOf("repeat(4,1fr)"),
    "stacked 4-col reset must come after the 6-col base rule (cascade order inside the block)");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-fields-locale{flex-direction:row"),
    "locale inputs sit side by side in the wide panel");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-actions{position:sticky"),
    "the action bar stays in view while the panel scrolls (Q50)");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-del{position:absolute"),
    "library delete is a corner badge on the cell, not a button stacked below");
  assert.ok(PANEL_CSS.includes(".dsh-skins-pz-collapse{"),
    "the collapse control is styled in the gear's ghost language");
  // Shell-owned vocabulary must NOT live in the panel's block: the panel
  // column container is rendered by the shell (粘连外壳), and so is the gear.
  assert.ok(!PANEL_CSS.includes(".dsh-skins-pz-panel{box-sizing"),
    "the panel column container belongs to the shell's CSS");
  assert.ok(!PANEL_CSS.includes("dsh-skins-pz-gear"),
    "the gear belongs to the shell's CSS (rendered inside the skin cards)");
});

// ---- ADR-0015: named reversions, preview-layer references, rider ② ----------

test("dangling-preview reversions render a named notice strip (ADR-0015)", async () => {
  const config = makeConfigClient({
    notices: [{ kind: "reverted", fields: [{ skinId: "openbmc", key: "wallpaper" }] }],
  });
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("personalization.fieldReverted"), "the notice strip renders");
  assert.ok(texts.some((value) => typeof value === "string" && value.includes("openbmc · personalization.wallpaper")),
    "the fallen-back field is named");

  const clean = makeConfigClient({ notices: [] });
  const cleanPanel = mountPanel({ skinId: "meirenzhi", config: clean });
  await tick();
  assert.ok(!textsOf(cleanPanel.tree()).includes("personalization.fieldReverted"),
    "no notice when nothing was reverted");
});

test("delete confirm lists preview-layer references too, cross-skin (ADR-0015)", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "preview.png" };
  const config = makeConfigClient({ library: [asset] }); // zero persisted references
  config.preview("openbmc", "wallpaper", asset.id); // dirty preview on ANOTHER skin
  const panel = mountPanel({ skinId: "meirenzhi", config, desktop: false, confirmResponse: false });
  await tick();
  const deleteButton = flatten(panel.tree()).find((node) =>
    node.type === "button" && String(node.props["aria-label"] ?? "").includes("preview.png"));
  deleteButton.props.onClick();
  await tick();
  assert.equal(panel.confirms.length, 1, "a preview-only reference still opens the confirm");
  assert.ok(panel.confirms[0].includes("openbmc · personalization.wallpaper"), "the cross-skin preview ref is listed");
  assert.ok(panel.confirms[0].includes("personalization.library.previewRef"), "marked as unsaved");
});

test("clear-library confirm lists preview-layer references too (ADR-0015)", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "p.png" };
  const config = makeConfigClient({ library: [asset] }); // zero persisted references
  config.preview("openbmc", "wallpaper", asset.id); // will be excised+reverted by the clear
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  findButton(panel.tree(), "personalization.library.clear").props.onClick();
  await tick();
  const text = textsOf(panel.tree()).find((value) => value.includes("personalization.library.clearConfirm"));
  assert.ok(text.includes("openbmc · personalization.wallpaper"), "the preview-layer ref is listed in the clear confirm");
  assert.ok(text.includes("personalization.library.previewRef"), "marked as unsaved — same knowing consent as single delete");
});

test("unreferenced assets with no preview refs still delete without confirmation", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "free.png" };
  const deleted = [];
  const config = makeConfigClient({ library: [asset] });
  config.deleteImage = async (id) => { deleted.push(id); return { affectedSkins: [] }; };
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  const deleteButton = flatten(panel.tree()).find((node) =>
    node.type === "button" && String(node.props["aria-label"] ?? "").includes("free.png"));
  deleteButton.props.onClick();
  await tick();
  assert.deepEqual(deleted, [asset.id], "no confirm for a fully unreferenced asset");
  assert.equal(panel.confirms.length, 0);
});

test("single upload auto-applies and flushes immediately (ADR-0015 rider ②)", async () => {
  const config = makeConfigClient();
  config.uploadImage = async () => ({ asset: { id: "u_new00000000000000000000000000000f", displayName: "n.png" } });
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  const input = flatten(panel.tree()).find((node) => node.type === "input" && node.props.type === "file");
  await input.props.onChange({ target: { files: [{ name: "n.png", type: "image/png" }] } });
  assert.deepEqual(config.calls.preview.at(-1),
    { skinId: "meirenzhi", key: "wallpaper", value: "u_new00000000000000000000000000000f" },
    "the upload is auto-applied");
  assert.equal(config.calls.flushNow, 1, "the auto-applied preview saves at once — no debounce wait");
});

test("batch upload flushes once after the newest lands (ADR-0015 rider ②)", async () => {
  const config = makeConfigClient();
  const uploads = [];
  config.uploadImage = async () => {
    uploads.push(true);
    return { asset: { id: `u_${uploads.length}${"0".repeat(31)}`, displayName: "b.png" } };
  };
  const panel = mountPanel({ skinId: "meirenzhi", config });
  await tick();
  const input = flatten(panel.tree()).find((node) => node.type === "input" && node.props.type === "file");
  await input.props.onChange({ target: { files: [
    { name: "a.png", type: "image/png" },
    { name: "b.png", type: "image/png" },
  ] } });
  assert.equal(uploads.length, 2, "sequential batch uploads preserved (Q43)");
  assert.equal(config.calls.flushNow, 1, "exactly one flush after the batch lands");
  assert.equal(config.calls.preview.at(-1).value, `u_2${"0".repeat(31)}`, "the newest upload wins");
});

// ---- UX fix campaign: labels, badges, live regions, slider hint ------------

test("slogan inputs carry visible ZH/EN badges that are decorative to AT", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced" });
  await tick();
  const tags = flatten(panel.tree()).filter(
    (n) => typeof n.props?.className === "string" && n.props.className.includes("dsh-skins-pz-locale-tag"),
  );
  assert.deepEqual(tags.map((n) => n.props.children), ["ZH", "EN"], "one 2-char badge per locale input, inline");
  assert.equal(tags.every((n) => n.props["aria-hidden"] === "true"), true,
    "badges are decorative — the inputs' aria-labels already carry the locale");
  // The inputs keep their locale-suffixed accessible names (gate scripts
  // match the "(ZH)"/"(EN)" suffix).
  const zhInput = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.slogan (ZH)");
  const enInput = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.slogan (EN)");
  assert.notEqual(zhInput, null);
  assert.notEqual(enInput, null);
});

test("reference lists name fields by localized label and join per locale (fix C+D)", async () => {
  const assets = [
    { id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" },
    { id: "u_0123456789abcdef0123456789abcdeff", displayName: "b.png" },
  ];
  const references = {
    [assets[0].id]: [{ skinId: "meirenzhi", key: "wallpaper" }],
    [assets[1].id]: [{ skinId: "openbmc", key: "wallpaper" }],
  };
  // zh: localized field labels, joined with 、
  const zh = mountPanel({
    skinId: "meirenzhi", status: "synced",
    config: makeConfigClient({ status: "synced", library: assets, references }),
    translations: DICTS.zh, localeOf: () => "zh",
  });
  await tick();
  findButton(zh.tree(), DICTS.zh["personalization.library.clear"]).props.onClick();
  await tick();
  const zhText = textsOf(zh.tree()).find((t) => t.includes("meirenzhi · 壁纸"));
  assert.ok(zhText, "zh users see the localized field label, never the raw key");
  assert.ok(zhText.includes("openbmc · 壁纸"), "cross-skin references localize too");
  assert.ok(zhText.includes("壁纸、"), "zh lists join with 、");

  // en: the same list joins with ", "
  const en = mountPanel({
    skinId: "meirenzhi", status: "synced",
    config: makeConfigClient({ status: "synced", library: assets, references }),
    translations: DICTS.en, localeOf: () => "en",
  });
  await tick();
  findButton(en.tree(), DICTS.en["personalization.library.clear"]).props.onClick();
  await tick();
  const enText = textsOf(en.tree()).find((t) => t.includes("meirenzhi · Wallpaper"));
  assert.ok(enText, "en users see Wallpaper");
  assert.ok(enText.includes("openbmc · Wallpaper"), "cross-skin references localize too");
  assert.ok(enText.includes("Wallpaper, openbmc"), "en lists join with ', '");
});

test("reverted-field notice names the localized field (fix C)", async () => {
  const config = makeConfigClient({
    notices: [{ kind: "reverted", fields: [{ skinId: "openbmc", key: "wallpaper" }] }],
  });
  const panel = mountPanel({ skinId: "meirenzhi", config, translations: DICTS.zh });
  await tick();
  assert.ok(textsOf(panel.tree()).some((t) => typeof t === "string" && t.includes("openbmc · 壁纸")),
    "the notice names 壁纸, not the raw catalog key");
});

test("footer strips carry role=status for info and role=alert for warn/error content (fix F)", async () => {
  // Strip roots wrap their copy in child nodes — match the role by the text
  // found anywhere in the strip's subtree.
  const roleOf = (tree, text) => flatten(tree)
    .find((n) => n.props?.role !== undefined && flatten(n).some((c) => c?.props?.children === text))
    ?.props.role;

  const loading = mountPanel({ skinId: "meirenzhi", config: makeConfigClient({ status: "loading" }) });
  await tick();
  assert.equal(roleOf(loading.tree(), "personalization.status.loading"), "status", "loading is polite");

  const offline = mountPanel({ skinId: "meirenzhi", status: "offline-failed" });
  await tick();
  assert.equal(roleOf(offline.tree(), "personalization.status.offline"), "alert", "offline asserts");

  const conflict = mountPanel({
    skinId: "meirenzhi",
    config: makeConfigClient({ notices: [{ kind: "conflict" }, { kind: "error", message: "x" }] }),
  });
  await tick();
  assert.equal(roleOf(conflict.tree(), "personalization.saveConflict"), "alert", "conflict asserts");
  assert.equal(textsOf(conflict.tree()).includes("personalization.saveFailed"), false,
    "conflict and error stay kind-exclusive");

  const failure = mountPanel({
    skinId: "meirenzhi",
    config: makeConfigClient({ notices: [{ kind: "error", message: "boom" }] }),
  });
  await tick();
  assert.equal(roleOf(failure.tree(), "personalization.saveFailed"), "alert", "save failure asserts");

  // Review P1: the flush-path strip resolves host bodies through
  // resolveHostErrorText — mapped codes render their localized template,
  // unmapped codes render the localized generic + code, the host's own
  // prose never reaches the DOM, and only code-less failures keep the
  // bare HTTP status string.
  const leaky = mountPanel({
    skinId: "meirenzhi",
    translations: { "host.personalization.unknownError": "宿主返回未知错误（{code}）" },
    config: makeConfigClient({
      notices: [{ kind: "error", message: "operations 校验失败（zh 原文）", detail: { code: "STORE_WEIRD" } }],
    }),
  });
  await tick();
  const leakyText = textsOf(leaky.tree()).join("\n");
  assert.ok(leakyText.includes("宿主返回未知错误（STORE_WEIRD）"), "unmapped code renders the localized generic + code");
  assert.equal(leakyText.includes("operations 校验失败（zh 原文）"), false, "raw host prose suppressed");

  const mapped = mountPanel({
    skinId: "meirenzhi",
    translations: { "host.personalization.invalidConfig": "配置校验失败（INVALID_CONFIG）" },
    config: makeConfigClient({
      notices: [{ kind: "error", message: "校验失败（zh 原文）", detail: { code: "INVALID_CONFIG" } }],
    }),
  });
  await tick();
  const mappedText = textsOf(mapped.tree()).join("\n");
  assert.ok(mappedText.includes("配置校验失败（INVALID_CONFIG）"), "mapped code renders its localized template");
  assert.equal(mappedText.includes("校验失败（zh 原文）"), false, "raw host prose suppressed for mapped codes too");

  const plain = mountPanel({
    skinId: "meirenzhi",
    config: makeConfigClient({ notices: [{ kind: "error", message: "HTTP 500" }] }),
  });
  await tick();
  assert.ok(textsOf(plain.tree()).join("\n").includes("HTTP 500"), "code-less failure keeps the status fallback");

  const reverted = mountPanel({
    skinId: "meirenzhi",
    config: makeConfigClient({ notices: [{ kind: "reverted", fields: [{ skinId: "openbmc", key: "wallpaper" }] }] }),
  });
  await tick();
  assert.equal(roleOf(reverted.tree(), "personalization.fieldReverted"), "alert", "reversion asserts");

  // Library message strip: failure asserts, success is polite.
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" };
  const okDelete = makeConfigClient({ status: "synced", library: [asset] });
  okDelete.deleteImage = async () => ({ affectedSkins: [] });
  const del = mountPanel({ skinId: "meirenzhi", status: "synced", config: okDelete });
  await tick();
  await delButtonsOf(del)[0].props.onClick();
  const successStrip = flatten(del.tree()).find((n) => n.props?.role === "status");
  assert.ok(String(successStrip?.props?.children ?? "").startsWith("personalization.library.deleted"),
    "delete success strip is a polite status");

  const badDelete = mountPanel({
    skinId: "meirenzhi", status: "synced",
    config: makeConfigClient({ status: "synced", library: [asset] }),
  });
  await tick();
  await delButtonsOf(badDelete)[0].props.onClick();
  assert.equal(roleOf(badDelete.tree(), "personalization.library.deleteFailed"), "alert",
    "delete failure asserts");
});

test("translucency slider explains the veil floor and mirrors the readout as its value text (fix J)", async () => {
  const panel = mountPanel({ skinId: "meirenzhi", status: "synced", translations: DICTS.zh });
  await tick();
  const slider = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === DICTS.zh["personalization.panelTranslucency"]);
  assert.equal(slider.props.title, DICTS.zh["personalization.panelTranslucency.hint"],
    "the handle explains the 0% text-veil floor");
  assert.equal(slider.props["aria-valuetext"], "66%", "value text mirrors the visible readout");
  slider.props.onChange({ target: { value: "40" } });
  await tick();
  const moved = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === DICTS.zh["personalization.panelTranslucency"]);
  assert.equal(moved.props["aria-valuetext"], "40%", "value text follows the edit");
});
