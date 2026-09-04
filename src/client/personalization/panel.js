/**
 * Personalization panel — schema-driven field controls rendered as the right
 * column of the combined switcher shell (design §7.2, simplification Q44/Q46).
 * The panel is generic: it reads field definitions from the shared catalog
 * and never knows a specific skin's business mapping.
 *
 * Interaction model (ADR-0003, v2.5 auto-save):
 *   - edits call configClient.preview/previewReset → local live projection
 *     plus a debounced auto-flush; the user never saves anything;
 *   - lastFlushError (from the client) renders the 保存失败 warning strip;
 *     the next edit clears it;
 *   - 恢复默认 resets every field to factory defaults and flushes at once;
 *   - the wallpaper section merges built-in choices and the user library in
 *     one grid; library add/remove is immediate (asset path, like all writes);
 *   - the header row hosts the reset control (only while the skin has
 *     overrides) and the collapse control (v1.0.0 rulings) at its right end;
 *     the reset folds fields back to factory defaults with a confirm, the
 *     collapse folds the panel back into the skin list — it never closes the
 *     shell itself, and focus returns to the gear that opened it (the
 *     switcher owns that move);
 *   - the footer strip is transient status only (recovery / loading /
 *     offline / readonly / save-failure), rendered just while non-empty, so
 *     the panel's resting height never depends on transient state;
 *   - the panel hosts no shell-close button and no save/dirty confirms.
 */

import {
  getSkinSchema,
  mergeValues,
} from "../../shared/personalization/catalog.js";
import { resolveHostErrorText } from "../host-errors.js";

/**
 * The personalization panel's own visual interface: every module-owned
 * class (root `.dsh-skins-pz` and below) is styled here. Shared atoms
 * (.dsh-skins-pop-title, .dsh-skins-update-spinner) carry their base
 * styles in the shell's CSS and are only contextually adapted here.
 * The switcher composes this into its single style tag — the class
 * vocabulary is therefore part of this module's interface to the shell
 * (the sweep rules in the shell target `.dsh-skins-pz-panel`, the shell-
 * rendered panel column, by name). Rules are copied verbatim from the
 * switcher's CSS array (style-ownership refactor); keep each rule a
 * single-line string — the parity check anchors on whole-line literals.
 */
export const PANEL_CSS = [
  // Panel header collapse control (v1.0.0 ruling): ghost icon button in the
  // gear's visual language; collapses the PANEL only, never the shell.
  // margin-left:auto keeps it alone at the header's far right — the reset
  // control stays by the title on the left, separated by the flexible gap,
  // so aiming for « cannot mis-fire a destructive reset.
  '.dsh-skins-pz-collapse{flex:none;align-self:center;margin-left:auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.75;transition:opacity .15s}',
  '.dsh-skins-pz-collapse:hover,.dsh-skins-pz-collapse:focus-visible{opacity:1;border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-skins-pz-collapse svg{width:14px;height:14px}',
  '.dsh-skins-pz{display:flex;flex-direction:column;gap:10px}',
  '.dsh-skins-pz-head{display:flex;align-items:center;gap:8px}',
  // Title does NOT grow (flex:0 1 auto): the reset control must sit right
  // after the title text on the header's LEFT side (v1.0.0 ruling) — a
  // growing title would push it to the right end, adjacent to the collapse
  // chevron, and aiming for « could mis-fire a destructive reset.
  '.dsh-skins-pz-head .dsh-skins-pop-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;outline:none}',
  '.dsh-skins-pz-row{display:flex;flex-direction:column;gap:6px}',
  '.dsh-skins-pz-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);font-weight:500}',
  '.dsh-skins-pz-fields{display:flex;flex-direction:column;gap:6px}',
  '.dsh-skins-pz-colors{flex-direction:row;gap:14px}',
  '.dsh-skins-pz-color{display:flex;align-items:center;gap:6px}',
  '.dsh-skins-pz-color input[type=color]{width:34px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer}',
  '.dsh-skins-pz-range{display:flex;align-items:center;gap:8px}',
  '.dsh-skins-pz-range input[type=range]{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}',
  '.dsh-skins-pz-range output{flex:none;min-width:44px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary)}',
  '.dsh-skins-pz-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
  '.dsh-skins-pz-btn{flex:none;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
  '.dsh-skins-pz-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-skins-pz-btn:disabled{opacity:.55;cursor:default}',
  '.dsh-skins-pz-group{display:flex;flex-direction:column;gap:6px}',
  '.dsh-skins-pz-thumbs{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}',
  // Grid helpers must span the full row: squeezed into one ~110px column
  // track, the "还有 N 张未显示" button and the empty-library hint wrapped
  // into multi-line stubs (field report). Centered full-row reads as the
  // load-more affordance; the hint stays left-aligned with its group label.
  '.dsh-skins-pz-thumbs>.dsh-skins-pz-btn{grid-column:1/-1;justify-self:center;white-space:nowrap}',
  '.dsh-skins-pz-thumbs>.dsh-skins-pz-muted{grid-column:1/-1;white-space:nowrap}',
  '.dsh-skins-pz-thumb{position:relative;aspect-ratio:4/3;padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
  '.dsh-skins-pz-thumb img{width:100%;height:100%;object-fit:cover}',
  '.dsh-skins-pz-thumb.on{border-color:var(--dsw-alias-brand-primary)}',
  '.dsh-skins-pz-thumb:disabled{opacity:.55;cursor:default}',
  '.dsh-skins-pz-muted{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
  '.dsh-skins-pz-strip{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px}',
  '.dsh-skins-pz-status{display:flex;align-items:center;gap:8px;justify-content:space-between}',
  '.dsh-skins-pz-warn{border-color:var(--dsw-alias-state-warning,#c77d00)}',
  '.dsh-skins-pz-asset{display:flex;align-items:center;gap:8px}',
  '.dsh-skins-pz-asset img{flex:none;width:44px;height:33px;border-radius:6px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-skins-pz-asset-copy{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-skins-pz-gallery{display:flex;flex-direction:column;gap:8px}',
  // field issue #2: library cell corner-badges and the sticky action bar
  // (the scroll-region half of the same ruling lives in the shell's CSS —
  // it styles the shell-rendered panel column).
  '.dsh-skins-pz-cell{position:relative;display:block}',
  '.dsh-skins-pz-cell .dsh-skins-pz-thumb{width:100%}',
  '.dsh-skins-pz-del{position:absolute;top:4px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font:inherit;font-size:14px;line-height:1;cursor:pointer}',
  '.dsh-skins-pz-del:hover{background:rgba(0,0,0,.78)}',
  '.dsh-skins-pz-del:disabled{opacity:.55;cursor:default}',
  '.dsh-skins-pz-del .dsh-skins-update-spinner{width:12px;height:12px;border-width:2px}',
  '.dsh-skins-pz-rowbtns{display:flex;gap:6px;flex-wrap:wrap}',
  '.dsh-skins-pz-actions{position:sticky;bottom:0;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:2px;padding:10px 2px 2px;background:var(--dsw-alias-bg-overlay);border-top:1px solid var(--dsw-alias-border-l2)}',
  '.dsh-skins-pz-cluster{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}',
  '.dsh-skins-pz-cluster-status{flex-direction:column;align-items:flex-start;gap:4px;flex-wrap:nowrap}',
  '.dsh-skins-pz-primary{background:var(--dsh-alias-brand-primary,#C3272B);border-color:transparent;color:#fff}',
  '.dsh-skins-pz-primary:hover{filter:brightness(1.06)}',
  '.dsh-skins-pz-danger{color:var(--dsw-alias-error-text,var(--dsw-static-red-500,#d33));border-color:var(--dsw-alias-error-text,var(--dsw-static-red-500,#d33))}',
  '.dsh-skins-pz-fields-locale{flex-direction:row;gap:6px}',
  '.dsh-skins-pz-fields-locale .dsh-skins-pz-input{flex:1;min-width:0}',
  // Stacked (<904px) resets MUST come after the rules they override — the
  // array order is the cascade order among equal-specificity selectors.
  '@media (max-width:904px){.dsh-skins-pz-thumbs{grid-template-columns:repeat(4,1fr)}}',
].join("\n");

// Library grid folds after three full rows (3 × 6 per row, user ruling #18):
// the first 18 assets render inline, the rest hide behind "还有 N 张未显示".
const PAGE_SIZE = 18;

export function createPersonalizationPanel({ jsx, react, configClient, tr, builtinAssetsFor, labelFor }) {
  const { useState, useEffect, useRef } = react;

  function useConfigState() {
    const [state, setState] = useState(() => configClient.getState());
    useEffect(() => configClient.onStateChange(() => setState(configClient.getState())), []);
    return state;
  }

  // ---- field controls -------------------------------------------------------

  function TextField({ field, value, onValue, disabled }) {
    const inputs = field.scope === "locale"
      ? ["zh", "en"].map((locale) => jsx("input", {
          key: locale, type: "text", className: "dsh-skins-pz-input",
          value: value?.[locale] ?? "", maxLength: field.maxLength,
          disabled, "aria-label": `${tr(field.labelKey)} (${locale.toUpperCase()})`,
          placeholder: field.default?.[locale] ?? "",
          onChange: (event) => onValue({ ...value, [locale]: event.target.value }),
        }, locale))
      : [jsx("input", {
          key: "single", type: "text", className: "dsh-skins-pz-input",
          value: value ?? "", maxLength: field.maxLength, disabled,
          "aria-label": tr(field.labelKey),
          placeholder: field.default ?? "",
          onChange: (event) => onValue(event.target.value),
        })];
    // Locale inputs sit side by side (v2.4.1 #3): the wide panel makes the
    // stacked zh/en pair both ugly and needlessly tall.
    return jsx("label", { className: "dsh-skins-pz-row", children: [
      jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
      jsx("div", {
        className: `dsh-skins-pz-fields${field.scope === "locale" ? " dsh-skins-pz-fields-locale" : ""}`,
        children: inputs,
      }),
    ] });
  }

  function RangeField({ field, value, onValue, disabled }) {
    const current = value ?? field.default;
    return jsx("label", { className: "dsh-skins-pz-row", children: [
      jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
      jsx("div", { className: "dsh-skins-pz-fields", children: jsx("div", { className: "dsh-skins-pz-range", children: [
        jsx("input", {
          type: "range", min: field.min, max: field.max, step: field.step,
          value: current, disabled,
          "aria-label": tr(field.labelKey),
          onChange: (event) => onValue(Number(event.target.value)),
        }),
        jsx("output", { children: `${current}${field.unit ?? ""}` }),
      ] }) }),
    ] });
  }

  function SelectField({ field, value, onValue, disabled }) {
    return jsx("label", { className: "dsh-skins-pz-row", children: [
      jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
      jsx("div", { className: "dsh-skins-pz-fields", children: jsx("select", {
        className: "dsh-skins-pz-input", value: value ?? field.default, disabled,
        "aria-label": tr(field.labelKey),
        onChange: (event) => onValue(event.target.value),
        children: field.options.map((option) => jsx("option", {
          value: option.value, children: tr(option.labelKey),
        }, option.value)),
      }) }),
    ] });
  }

  // ---- wallpaper: built-in choices + user library in ONE section -----------

  function WallpaperSection({ skinId, field, value, onValue, state, disabled }) {
    const uploadRef = useRef(null);
    const [message, setMessage] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [visible, setVisible] = useState(PAGE_SIZE);
    const schema = getSkinSchema(skinId);
    const builtins = schema?.builtinAssets ?? {};
    const liveAssets = builtinAssetsFor(skinId);
    const choices = field.builtinChoices ?? [];
    const library = state.library;

    const removeAsset = async (asset) => {
      if (deletingId !== null) return; // one delete in flight — no double DELETEs
      const references = state.references[asset.id] ?? [];
      const names = references.map((entry) => `${labelFor(entry.skinId)} · ${entry.key}`).join("\n");
      const confirmed = references.length === 0
        || window.confirm(`${tr("personalization.library.deleteConfirm")}\n${names}`);
      if (!confirmed) return;
      setMessage(null); // a stale note must not outlive its action
      setDeletingId(asset.id);
      const result = await configClient.deleteImage(asset.id);
      setDeletingId(null);
      // Success is announced too: the refetch inside deleteImage removes the
      // cell, but the outcome must never read as "did it actually delete?"
      // (field report — silent success left the user unsure).
      setMessage(result.error
        ? tr("personalization.library.deleteFailed")
        : tr("personalization.library.deleted", { name: asset.displayName }));
    };

    const clearLibrary = async () => {
      const pairs = new Map();
      for (const asset of library) {
        for (const entry of state.references[asset.id] ?? []) {
          pairs.set(`${labelFor(entry.skinId)} · ${entry.key}`, true);
        }
      }
      const names = [...pairs.keys()].join("、");
      const confirmed = window.confirm(tr("personalization.library.clearConfirm", {
        count: library.length,
        names: names === "" ? "—" : names,
      }));
      if (!confirmed) return;
      for (const asset of [...library]) {
        const result = await configClient.deleteImage(asset.id);
        if (result.error) {
          // Stop at the first failure and surface what is left (L8).
          setMessage(tr("personalization.library.clearFailed"));
          configClient.refetch();
          return;
        }
      }
    };

    return jsx("div", { className: "dsh-skins-pz-row", children: [
      jsx("span", { className: "dsh-skins-pz-label", children: tr(field.labelKey) }),
      jsx("div", { className: "dsh-skins-pz-fields", children: [
        choices.length > 0 ? jsx("div", { className: "dsh-skins-pz-group", children: [
          jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.builtin") }),
          jsx("div", { className: "dsh-skins-pz-thumbs", children: choices.map((key) => {
            const asset = builtins[key];
            const ref = `builtin:${skinId}:${key}`;
            return jsx("button", {
              type: "button", className: `dsh-skins-pz-thumb${value === ref ? " on" : ""}`,
              disabled, title: tr(asset?.labelKey ?? "personalization.builtin.default"),
              "aria-pressed": value === ref,
              onClick: () => onValue(ref),
              children: jsx("img", { src: liveAssets[key]?.url ?? asset?.url ?? "", alt: tr(asset?.labelKey ?? key), loading: "lazy", decoding: "async" }),
            }, key);
          }) }),
        ] }) : null,
        jsx("div", { className: "dsh-skins-pz-group", children: [
          jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.library") }),
          jsx("div", { className: "dsh-skins-pz-thumbs", children: [
            ...library.slice(0, visible).map((asset) => jsx("div", {
              key: asset.id, className: `dsh-skins-pz-cell${value === asset.id ? " on" : ""}`,
              children: [
                jsx("button", {
                  type: "button", className: `dsh-skins-pz-thumb${value === asset.id ? " on" : ""}`,
                  disabled, title: asset.displayName,
                  "aria-pressed": value === asset.id,
                  onClick: () => onValue(asset.id),
                  children: jsx("img", { src: configClient.assetUrl(asset), alt: asset.displayName, loading: "lazy", decoding: "async" }),
                }, asset.id),
                jsx("button", {
                  type: "button",
                  className: `dsh-skins-pz-del${deletingId === asset.id ? " dsh-skins-pz-del-busy" : ""}`,
                  disabled: disabled || deletingId !== null,
                  "aria-label": `${tr("personalization.library.delete")}: ${asset.displayName}`,
                  onClick: () => removeAsset(asset),
                  children: deletingId === asset.id
                    ? jsx("span", { className: "dsh-skins-update-spinner", "aria-hidden": "true" })
                    : "×",
                }, `${asset.id}-del`),
              ],
            })),
            library.length > visible ? jsx("button", {
              type: "button", className: "dsh-skins-pz-btn",
              onClick: () => setVisible(visible + PAGE_SIZE),
              children: tr("personalization.library.more", { count: library.length - visible }),
            }) : null,
            library.length === 0 ? jsx("span", {
              className: "dsh-skins-pz-muted", children: tr("personalization.library.empty"),
            }) : null,
          ] }),
          message === null ? null : jsx("div", { className: "dsh-skins-pz-status dsh-skins-pz-muted", children: message }),
          jsx("div", { className: "dsh-skins-pz-rowbtns", children: [
            jsx("button", {
              type: "button", className: "dsh-skins-pz-btn",
              disabled: disabled || deletingId !== null,
              onClick: () => uploadRef.current?.click(),
              children: tr("personalization.library.upload"),
            }),
            library.length > 0 ? jsx("button", {
              type: "button", className: "dsh-skins-pz-btn dsh-skins-pz-danger",
              disabled: disabled || deletingId !== null,
              onClick: clearLibrary,
              children: tr("personalization.library.clear"),
            }) : null,
          ] }),
          jsx("input", {
            ref: uploadRef, type: "file", accept: "image/png,image/jpeg,image/webp,image/gif",
            multiple: true,
            style: { display: "none" },
            onChange: async (event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = ""; // re-selecting the same files must re-fire
              if (files.length === 0) return;

              // Q43 reversal (v2.6): the picker is the batch entry — multi-select
              // uploads sequentially (the store serializes writes anyway) with
              // progress and a failure summary. Drag-drop stays out.
              if (files.length > 1) {
                let ok = 0;
                let lastAssetId = null;
                let firstError = null;
                for (let index = 0; index < files.length; index += 1) {
                  setMessage(tr("personalization.library.uploadingBatch", {
                    done: index + 1, total: files.length,
                  }));
                  const result = await configClient.uploadImage(files[index]);
                  if (result.asset) {
                    ok += 1;
                    lastAssetId = result.asset.id;
                  } else if (firstError === null) {
                    firstError = resolveHostErrorText(
                      { code: result.error, message: tr("personalization.library.uploadFailed") },
                      tr,
                    );
                  }
                }
                if (lastAssetId !== null) onValue(lastAssetId); // land on the newest upload
                setMessage(firstError === null
                  ? null
                  : ok === 0
                    ? firstError
                    : tr("personalization.library.uploadSomeFailed", {
                        ok, failed: files.length - ok, reason: firstError,
                      }));
                return;
              }

              const result = await configClient.uploadImage(files[0]);
              if (result.asset) {
                setMessage(null);
                onValue(result.asset.id);
              } else {
                // Surface WHY the upload was rejected (server code → localized
                // reason; unmapped codes fall back to the generic copy). The
                // delete-failed text must never render for an upload — field
                // report: a failed upload showed 删除失败 and misdirected the
                // bug hunt.
                setMessage(resolveHostErrorText(
                  { code: result.error, message: tr("personalization.library.uploadFailed") },
                  tr,
                ));
              }
            },
          }),
        ] }),
      ] }),
    ] });
  }

  // ---- the panel ------------------------------------------------------------

  // Panel-collapse glyph: a double chevron pointing LEFT — the direction the
  // panel's edge actually travels when it folds back into the skin list
  // (motion-consistent; a right-pointing arrow read as "expand", field
  // report). Explicit `L` commands with spaces are REQUIRED here: the
  // compact `M11 6-6 6…` form (implicit lineto after moveto, sign-separated)
  // mis-tokenizes in Chromium — the pair's y is swallowed and the chevron
  // collapses into a horizontal bar (field report: "乱码"). The affordance
  // collapses the PANEL, not the shell — click-outside/Esc remain the shell
  // dismissers.
  function CollapseIcon() {
    return jsx("svg", {
      viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true",
      children: jsx("path", {
        d: "M17 6 L11 12 L17 18 M11 6 L5 12 L11 18",
        stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round",
      }),
    });
  }

  return function PersonalizationPanel({ skinId, onCollapse }) {
    const state = useConfigState();
    const schema = getSkinSchema(skinId);
    const headerRef = useRef(null);
    // In wide mode the panel mounts to the shell's right while the shell is
    // still narrow. Focus the heading without asking the shell to
    // horizontally scroll it into view; that transient scrollLeft used to
    // shove the list column left and make expansion look like a bounce
    // (field issue #12). In stacked mode, retain normal focus scrolling so
    // keyboard users are brought down to the newly mounted panel.
    const wideLayout = typeof window !== "undefined" && window.innerWidth >= 905;
    useEffect(() => {
      headerRef.current?.focus?.(wideLayout ? { preventScroll: true } : undefined);
    }, []);

    if (schema === null) return null;
    const writesBlocked = state.status !== "synced" || state.mode === "recovery";
    const overrides = configClient.effectiveOverrides(skinId);
    const { values } = mergeValues(skinId, overrides);
    const hasAnyOverride = Object.keys(overrides).length > 0;

    const fieldRows = schema.fields.map((field) => {
      const value = values[field.key];
      const setValue = (next) => configClient.preview(skinId, field.key, next);
      const common = { field, value, onValue: setValue, disabled: writesBlocked };
      switch (field.type) {
        case "text": return jsx(TextField, { ...common, key: field.key });
        case "range": return jsx(RangeField, { ...common, key: field.key });
        case "select": return jsx(SelectField, { ...common, key: field.key });
        case "image": return jsx(WallpaperSection, {
          ...common, key: field.key, skinId, state,
        });
        default: return null;
      }
    });

    // Footer STATUS bar (Q50, v1.0.0 height-consistency ruling): transient
    // status strips only, rendered just while there is something to say. The
    // reset control used to live here and grew the panel by one button the
    // moment a skin had any override — panel heights then differed between
    // modified and pristine skins (and when re-targeting between them). It
    // now lives in the header row, whose height is fixed.
    const statusCluster = [];
    if (state.mode === "recovery") {
      statusCluster.push(jsx("div", { key: "recovery", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
        jsx("div", { children: tr("personalization.status.recovery") }),
        jsx("div", { className: "dsh-skins-pz-muted", children: tr("personalization.status.recoveryHint") }),
        jsx("button", {
          type: "button", className: "dsh-skins-pz-btn",
          onClick: () => configClient.confirmRecovery(),
          children: tr("personalization.recovery.confirm"),
        }),
      ] }));
    }
    if (state.status === "loading") {
      statusCluster.push(jsx("div", { key: "loading", className: "dsh-skins-pz-status", children: [
        jsx("span", { children: tr("personalization.status.loading") }),
      ] }));
    }
    if (state.status === "offline-failed") {
      statusCluster.push(jsx("div", { key: "offline", className: "dsh-skins-pz-status", children: [
        jsx("span", { children: tr("personalization.status.offline") }),
        jsx("button", {
          type: "button", className: "dsh-skins-pz-btn",
          onClick: () => configClient.retry(),
          children: tr("personalization.status.retry"),
        }),
      ] }));
    }
    if (state.status === "unsupported-readonly") {
      statusCluster.push(jsx("div", { key: "ro", className: "dsh-skins-pz-status", children: [
        jsx("span", { children: tr("personalization.status.unsupported") }),
      ] }));
    }
    // Auto-save failure strips (ADR-0003): exhausted revision conflicts use
    // lastFlushCode; ordinary server failures use lastFlushError. The next
    // edit clears both fields.
    if (state.lastFlushCode === "REVISION_CONFLICT") {
      statusCluster.push(jsx("div", { key: "save-conflict", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
        jsx("span", { children: tr("personalization.saveConflict") }),
      ] }));
    } else if (state.lastFlushError) {
      statusCluster.push(jsx("div", { key: "save-error", className: "dsh-skins-pz-status dsh-skins-pz-warn", children: [
        jsx("span", { children: tr("personalization.saveFailed") }),
        jsx("div", { className: "dsh-skins-pz-muted", children: state.lastFlushError }),
      ] }));
    }

    return jsx("div", { className: "dsh-skins-pz", children: [
      // Header row (`.dsh-skins-pz-head`): the heading stays the focus
      // target (issue #12); the reset and collapse controls pack at its
      // right end so both are discoverable where the user is looking —
      // the gear that opened it is a full column away (user ruling). The
      // reset appears only while the skin has overrides, and its appearing
      // can no longer change the panel's height (v1.0.0 ruling).
      jsx("div", { className: "dsh-skins-pz-head", children: [
        jsx("div", {
          ref: headerRef, className: "dsh-skins-pop-title",
          tabIndex: -1, role: "heading", "aria-level": 2,
          children: `${tr("personalization.title")} · ${labelFor(skinId)}`,
        }),
        hasAnyOverride ? jsx("button", {
          type: "button", className: "dsh-skins-pz-btn dsh-skins-pz-danger",
          disabled: writesBlocked,
          onClick: () => {
            // Destructive + immediate (auto-save, ADR-0003) → confirm first,
            // listing the NON-default fields the reset will visibly change.
            const affected = schema.fields
              .filter((field) => overrides[field.key] !== undefined)
              .map((field) => tr(field.labelKey));
            const confirmed = window.confirm(tr("personalization.resetConfirm", {
              fields: affected.length > 0 ? affected.join(tr("personalization.resetJoin")) : "—",
            }));
            if (!confirmed) return;
            for (const field of schema.fields) configClient.previewReset(skinId, field.key);
            void configClient.flushNow();
          },
          children: tr("personalization.reset"),
        }) : null,
        onCollapse ? jsx("button", {
          type: "button",
          className: "dsh-skins-pz-collapse",
          "aria-label": tr("personalization.collapse"),
          title: tr("personalization.collapse"),
          onClick: onCollapse,
          children: jsx(CollapseIcon, {}),
        }) : null,
      ] }),
      ...fieldRows,
      statusCluster.length > 0 ? jsx("div", { className: "dsh-skins-pz-actions", children:
        jsx("div", { className: "dsh-skins-pz-cluster dsh-skins-pz-cluster-status", children: statusCluster }),
      }) : null,
    ] });
  };
}
