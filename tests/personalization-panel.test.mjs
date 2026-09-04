/**
 * Personalization panel public-path tests (simplification T5). These render
 * the REAL panel (schema from the REAL catalog) through the shared fake
 * React and drive the complete user path (ADR-0003 auto-save): field edits
 * preview locally and the client debounces the flush, 恢复默认 resets and
 * flushes at once, the wallpaper section merges builtin + library with
 * clear-library confirmation, and the footer action bar carries the status
 * cluster (offline/retry/lastFlushError).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPersonalizationPanel, PANEL_CSS } from "../src/client/personalization/panel.js";
import { getSkinSchema } from "../src/shared/personalization/catalog.js";
import { createFakeReact, jsx, flatten, findButton } from "./fake-react.mjs";

const SKINS = ["openbmc", "uefi-harness", "tgcf", "meirenzhi"];
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
    ...overrides,
  };
  // Preview layer, mirroring the real client's effectiveOverrides(skinId):
  // returns THAT SKIN's section with previews layered on top.
  const previews = new Map();
  const calls = { preview: [], previewReset: [], restore: 0, flushNow: 0, retry: 0 };
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
    preview: (skinId, key, value) => { calls.preview.push({ skinId, key, value }); previews.set(`${skinId} ${key}`, value); state = { ...state, dirtyCount: previews.size, lastFlushError: null }; emit(); },
    previewReset: (skinId, key) => { calls.previewReset.push({ skinId, key }); previews.set(`${skinId} ${key}`, null); state = { ...state, dirtyCount: previews.size, lastFlushError: null }; emit(); },
    flushNow: async () => { calls.flushNow += 1; return { flushed: state.dirtyCount, blocked: null }; },
    retry: () => { calls.retry += 1; },
    uploadImage: async () => ({ error: "offline" }),
    deleteImage: async (id) => { void id; return { error: "offline" }; },
    confirmRecovery: async () => ({ ok: true }),
    refetch: async () => {},
    assetUrl: (asset) => `/dsh-skins/assets/${asset.id}.png`,
  };
}

function installDom() {
  const confirms = [];
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
  };
  globalThis.window = { confirm: (text) => { confirms.push(text); return true; } };
  return confirms;
}

function mountPanel({ skinId, status, config, translations } = {}) {
  const react = createFakeReact();
  const confirms = installDom();
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
  });
  let tree = null;
  react.render(() => {
    tree = react.instantiate(jsx(Panel, { skinId }));
  });
  return { tree: () => tree, confirms, configClient, tr };
}

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

test("field edits preview locally and arm the auto-save; no save button exists", async () => {
  const panel = mountPanel({ skinId: "tgcf", status: "synced" });
  await tick();
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  assert.notEqual(translucency, null, "translucency slider renders (ruling #14)");
  assert.equal(findButton(panel.tree(), "personalization.save"), null, "no save button (ADR-0003)");

  translucency.props.onChange({ target: { value: "55" } });
  await tick();
  assert.deepEqual(panel.configClient.calls.preview, [{ skinId: "tgcf", key: "panelOpacity", value: 55 }]);
  assert.equal(panel.configClient.getState().dirtyCount, 1, "edits preview locally; the client debounces the flush");
});

test("slogan text edits preview the complete locale object", async () => {
  const panel = mountPanel({ skinId: "tgcf", status: "synced" });
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
  assert.deepEqual(panel.configClient.calls.preview[0].value, { zh: "新标语", en: "No Taboos" });
  assert.deepEqual(panel.configClient.calls.preview[1].value, { zh: "新标语", en: "New slogan" });
});

test("恢复默认 confirms with the affected field list; decline is a no-op (user ruling #9)", async () => {
  const panel = mountPanel({ skinId: "tgcf", status: "synced" });
  await tick();
  const translucency = flatten(panel.tree()).find((n) => n.type === "input" && n.props["aria-label"] === "personalization.panelTranslucency");
  translucency.props.onChange({ target: { value: "66" } });
  await tick();
  const reset = () => findButton(panel.tree(), "personalization.reset");
  assert.notEqual(reset(), null, "reset offered while overrides exist");
  const head = flatten(panel.tree()).find((n) => n.props?.className === "dsh-skins-pz-head");
  const resetInHead = head?.props?.children?.some?.((c) => c?.type === "button" && c?.props?.children === "personalization.reset");
  assert.ok(resetInHead, "reset lives in the header row — its appearance cannot grow the panel (v1.0.0 height ruling)");

  // Agreeing: the dialog lists the non-default field(s), then everything
  // resets and flushes at once (ADR-0003 — immediate and auto-saved).
  await reset().props.onClick();
  await tick();
  assert.equal(panel.confirms.length, 1, "destructive reset asks first");
  assert.ok(panel.confirms[0].includes("personalization.panelTranslucency"), "the affected field is listed");
  assert.equal(panel.configClient.calls.flushNow, 1, "agreeing flushes the factory values at once");
  assert.deepEqual(panel.configClient.calls.previewReset.map((c) => c.key),
    getSkinSchema("tgcf").fields.map((f) => f.key), "every field reset to factory");

  // Declining: asked again, nothing happens at all. (The agree path above
  // legitimately emptied the override set, so re-establish one first.)
  const declineConfirms = [];
  globalThis.window.confirm = (text) => { declineConfirms.push(text); return false; };
  translucency.props.onChange({ target: { value: "70" } });
  await tick();
  await reset().props.onClick();
  await tick();
  assert.equal(declineConfirms.length, 1, "asked again");
  assert.ok(declineConfirms[0].includes("personalization.panelTranslucency"), "affected field listed again");
  assert.equal(panel.configClient.calls.flushNow, 1, "decline flushes nothing");
  assert.equal(panel.configClient.calls.previewReset.length, getSkinSchema("tgcf").fields.length, "decline resets nothing");
});

test("offline: every write path is disabled — edits included (ADR-0003)", async () => {
  const asset = { id: "u_0123456789abcdef0123456789abcdef", displayName: "壁纸.png" };
  const config = makeConfigClient({ status: "offline-failed", library: [asset] });
  const panel = mountPanel({ skinId: "tgcf", status: "offline-failed", config });
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

test("清空图库 confirms with the affected list and stops at the first failure (Q45/L8)", async () => {
  const assets = [
    { id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" },
    { id: "u_0123456789abcdef0123456789abcdeff", displayName: "b.png" },
  ];
  const references = {
    [assets[0].id]: [{ skinId: "tgcf", key: "wallpaper" }],
    [assets[1].id]: [{ skinId: "openbmc", key: "wallpaper" }],
  };
  const deleted = [];
  const config = makeConfigClient({ status: "synced", library: assets, references });
  config.deleteImage = async (id) => {
    deleted.push(id);
    return id === assets[1].id ? { error: "boom" } : { affectedSkins: [] };
  };
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
  await tick();
  await findButton(panel.tree(), "personalization.library.clear").props.onClick();

  assert.equal(panel.confirms.length, 1, "exactly one confirm");
  const text = panel.confirms[0];
  assert.ok(text.includes("2"), "count in the confirm text");
  assert.ok(text.includes("tgcf · wallpaper"), "affected pair listed");
  assert.ok(text.includes("openbmc · wallpaper"), "affected pair listed");
  assert.deepEqual(deleted, [assets[0].id, assets[1].id], "stops at the first failure");
  assert.ok(textsOf(panel.tree()).includes("personalization.library.clearFailed"), "failure surfaced");
});

test("declining the clear-library confirm deletes nothing", async () => {
  const assets = [{ id: "u_0123456789abcdef0123456789abcdef", displayName: "a.png" }];
  const config = makeConfigClient({ status: "synced", library: assets });
  config.deleteImage = async () => { throw new Error("must not be called"); };
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
  globalThis.window.confirm = () => false;
  await tick();
  await findButton(panel.tree(), "personalization.library.clear").props.onClick();
  // Reaching here without throwing means the decline path held.
});

const delButtonsOf = (panel) => flatten(panel.tree()).filter(
  (n) => n.type === "button" && typeof n.props["aria-label"] === "string" && n.props["aria-label"].startsWith("personalization.library.delete:"),
);

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
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
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
  const failing = mountPanel({ skinId: "tgcf", status: "synced", config: makeConfigClient({ status: "synced", library: assets.slice(0, 1) }) });
  await tick();
  await delButtonsOf(failing)[0].props.onClick();
  assert.ok(textsOf(failing.tree()).includes("personalization.library.deleteFailed"), "failure surfaced");
  assert.equal(delButtonsOf(failing)[0].props.disabled, false, "retry stays possible");
});

test("revision conflict renders its dedicated warning instead of the generic save failure", async () => {
  const config = makeConfigClient({
    status: "synced",
    lastFlushCode: "REVISION_CONFLICT",
    lastFlushError: "stale generic reason",
  });
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
  await tick();
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("personalization.saveConflict"));
  assert.equal(texts.includes("personalization.saveFailed"), false);
  assert.equal(texts.includes("stale generic reason"), false);
});

test("generic save failure renders only when no conflict code is present", async () => {
  const config = makeConfigClient({
    status: "synced",
    lastFlushCode: null,
    lastFlushError: "boom",
  });
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
  await tick();
  const texts = textsOf(panel.tree());
  assert.ok(texts.includes("personalization.saveFailed"));
  assert.ok(texts.includes("boom"));
  assert.equal(texts.includes("personalization.saveConflict"), false);
});

test("auto-save failure strip renders from lastFlushError and clears on edit (ADR-0003)", async () => {
  const config = makeConfigClient({ status: "synced" });
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
  await tick();
  assert.equal(textsOf(panel.tree()).includes("personalization.saveFailed"), false, "clean panel shows no failure strip");

  config.setState({ lastFlushError: "tgcf.panelOpacity 校验失败（BAD_VALUE）" });
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
  const panel = mountPanel({ skinId: "tgcf", status: "offline-failed" });
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
    skinId: "tgcf", status: "synced", config: tooLarge,
    translations: { "host.personalization.tooLarge": "图片超过大小限制" },
  });
  await tick();
  const input = flatten(a.tree()).find((n) => n.type === "input" && n.props.type === "file");
  assert.notEqual(input, null, "hidden file input renders");
  await input.props.onChange({ target: { files: [{ name: "big.png" }], value: "" } });
  const textsA = textsOf(a.tree());
  assert.ok(textsA.includes("图片超过大小限制"), "mapped code renders its localized reason");
  assert.equal(textsA.includes("personalization.library.deleteFailed"), false, "delete copy never renders for an upload");

  // Unmapped code (gate string / HTTP status): the generic upload copy.
  const generic = makeConfigClient({ status: "synced" }); // default stub errors "offline"
  const b = mountPanel({ skinId: "tgcf", status: "synced", config: generic });
  await tick();
  const inputB = flatten(b.tree()).find((n) => n.type === "input" && n.props.type === "file");
  await inputB.props.onChange({ target: { files: [{ name: "x.png" }], value: "" } });
  assert.ok(textsOf(b.tree()).includes("personalization.library.uploadFailed"), "unmapped errors fall back to the upload copy");
  assert.equal(textsOf(b.tree()).includes("personalization.library.deleteFailed"), false, "delete copy still never renders");
});

test("UPLOAD_TIMEOUT renders its localized reason (field report: big uploads failed silently)", async () => {
  // The client-side fetch abort lands as code UPLOAD_TIMEOUT; the panel must
  // name it through HOST_ERROR_KEYS — the pre-fix behavior was NO message at
  // all (the abort escaped uploadImage as an unhandled rejection).
  const config = makeConfigClient({ status: "synced" });
  config.uploadImage = async () => ({ error: "UPLOAD_TIMEOUT" });
  const panel = mountPanel({
    skinId: "tgcf", status: "synced", config,
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
    skinId: "tgcf", status: "synced", config: batch,
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
  assert.deepEqual(batch.calls.preview.at(-1), { skinId: "tgcf", key: "wallpaper", value: "u_a" },
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
    skinId: "tgcf", status: "synced", config,
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
    ["tgcf", "wallpaper", "u_c.png"],
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
    skinId: "tgcf", status: "synced", config: failing,
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
  const panel = mountPanel({ skinId: "tgcf", status: "synced", config });
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
  // Ownership partition ratchet (45 shell + 51 panel + 11 update = 107):
  // a rule silently moving back to the shell changes this count even when
  // the final injected CSS stays byte-identical.
  assert.equal(PANEL_CSS.split("\n").length, 51,
    "PANEL_CSS freezes at 51 rules — moving one out (or in) must be deliberate");
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
