/**
 * PersonalizationStore — the single owner of `$DSH_HOME/dsh-skins/` mutable
 * state (design §5). Every mutating Host route goes through here; route
 * handlers only do trust fencing, HTTP codec and error mapping.
 *
 * On-disk layout:
 *   state.json              the ONE mutable state file (atomic temp+rename)
 *   audit.jsonl             best-effort audit of every commit: one JSON line each,
 *                           rotated to audit.jsonl.1 past 1 MiB (no display names)
 *   assets/u_<id>.<ext>     immutable content-addressed-by-id blobs
 *   quarantine/             unrecognized files moved ONLY after recovery is
 *                           confirmed by the user (branch A, design §5.3)
 *
 * Boot modes:
 *   normal      state healthy → full read/write, GC enabled
 *   recovery    state corrupt/empty/missing while assets exist → NO destructive
 *               GC, candidate library rebuilt from blobs by sniffing, config
 *               overrides reported as lost; user confirm restores normal
 *   unsupported state configVersion > CONFIG_VERSION → strict zero writes:
 *               no rebuild, no moves, no GC (design §5.3 B)
 *
 * Durability contract (design §5.2): rename-based atomicity covers process
 * crashes and exception paths. Power loss may lose the state file — recovery
 * mode then guarantees blobs survive while config overrides may not.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { codedError } from "../errors.js";
import { atomicWriteText } from "../atomic-write.js";
import { detectImageMeta, extensionForMime } from "./image-meta.js";
import {
  ASSET_ID_PATTERN,
  ASSET_ID_PREFIX,
  CONFIG_VERSION,
  defaultsFor,
  GIF_MAX_PIXELS,
  GLOBAL_MAX_BYTES,
  GLOBAL_MAX_PIXELS,
  getField,
  getSkinSchema,
  isSameOverrideValue,
  listAssetFields,
  metaSatisfiesField,
  resolveImageRef,
  validateOverride,
} from "../../shared/personalization/catalog.js";

const STATE_FILE = "state.json";
const ASSETS_DIR = "assets";
const QUARANTINE_DIR = "quarantine";
const DISK_SAFETY_RESERVE = 64 * 1024 * 1024;
const CORRUPT_BACKUP_LIMIT = 3;
const ID_ATTEMPTS = 5;
const AUDIT_FILE = "audit.jsonl";
const AUDIT_MAX_BYTES = 1_048_576; // rotate to audit.jsonl.1 once the log passes 1 MiB

/** Audit-safe view of one override value: refs and scalars verbatim; free text and objects only by size. */
function summarizeAuditValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return resolveImageRef(value) !== null ? value : { string: value.length };
  return { object: Object.keys(value).length };
}

function defaultFs() {
  return {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    renameSync,
    unlinkSync,
    readdirSync,
    rmdirSync,
    statSync,
    statfsSync,
    copyFileSync,
    openSync,
    closeSync,
  };
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Strip control characters and clamp to a byte budget; null when invalid. */
function sanitizeDisplayName(name) {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "");
  if (cleaned.trim().length === 0) return null;
  if (Buffer.byteLength(cleaned, "utf8") > 200) return null;
  return cleaned;
}

function isValidStateShape(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return false;
  if (!Number.isInteger(state.configVersion) || state.configVersion < 1) return false;
  if (!Number.isInteger(state.revision) || state.revision < 0) return false;
  if (typeof state.skins !== "object" || state.skins === null || Array.isArray(state.skins)) return false;
  if (typeof state.library !== "object" || state.library === null || Array.isArray(state.library)) return false;
  // Crash-safe recovery marker (two-phase recovery): present between the
  // rebuilt-state commit and the quarantine move (see finishRecoveryCleanup).
  if (state.recoveryCleanup !== undefined) {
    const pending = state.recoveryCleanup;
    if (pending === null || typeof pending !== "object" || Array.isArray(pending)
      || !Array.isArray(pending.quarantine)
      || !pending.quarantine.every((name) => typeof name === "string")) return false;
  }
  return true;
}

const ASSET_EXTENSIONS = new Set(["png", "jpg", "webp", "gif"]);

/**
 * Deep validation: a state counts as "normal" only when every library entry
 * is a coherent AssetMeta keyed by its own id. Semantically corrupt states
 * fall into recovery — the GC must never consume unvalidated state.
 */
function isValidAssetMeta(meta, id) {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return false;
  if (typeof meta.id !== "string" || meta.id !== id || !ASSET_ID_PATTERN.test(id)) return false;
  if (typeof meta.displayName !== "string") return false;
  if (typeof meta.mime !== "string" || !/^(image\/(png|jpeg|webp|gif))$/.test(meta.mime)) return false;
  if (typeof meta.extension !== "string" || !ASSET_EXTENSIONS.has(meta.extension)) return false;
  if (meta.extension !== extensionForMime(meta.mime)) return false;
  if (!Number.isInteger(meta.byteLength) || meta.byteLength <= 0 || meta.byteLength > GLOBAL_MAX_BYTES) return false;
  if (!Number.isInteger(meta.width) || meta.width <= 0) return false;
  if (!Number.isInteger(meta.height) || meta.height <= 0) return false;
  const pixelCap = meta.mime === "image/gif" ? GIF_MAX_PIXELS : GLOBAL_MAX_PIXELS;
  if (meta.width * meta.height > pixelCap) return false;
  if (typeof meta.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(meta.sha256)) return false;
  return typeof meta.createdAt === "string";
}

function isValidStateDeep(state) {
  if (!isValidStateShape(state)) return false;
  for (const [id, meta] of Object.entries(state.library)) {
    if (!isValidAssetMeta(meta, id)) return false;
  }
  for (const section of Object.values(state.skins)) {
    if (section === null || typeof section !== "object" || Array.isArray(section)) return false;
  }
  return true;
}

function emptyState() {
  return { configVersion: CONFIG_VERSION, revision: 0, skins: {}, library: {} };
}

export function createPersonalizationStore(options = {}) {
  const dataDir = options.dataDir;
  if (typeof dataDir !== "string" || dataDir.length === 0) {
    throw new Error("personalization store requires a dataDir");
  }
  const fs = options.fs ?? defaultFs();
  const now = options.now ?? Date.now;
  const profile = options.profile === "desktop" ? "desktop" : "web";

  const stateFile = join(dataDir, STATE_FILE);
  const assetsDir = join(dataDir, ASSETS_DIR);
  const quarantineDir = join(dataDir, QUARANTINE_DIR);
  const auditFile = join(dataDir, AUDIT_FILE);
  const auditMaxBytes = Number.isInteger(options.auditMaxBytes) && options.auditMaxBytes > 0
    ? options.auditMaxBytes
    : AUDIT_MAX_BYTES;

  let state = null;
  let mode = "normal"; // normal | recovery | unsupported
  let recovery = null; // { candidateLibrary, quarantine:[names], configLost }
  let chain = Promise.resolve();
  let initialized = false;

  // -- filesystem helpers ---------------------------------------------------

  function ensureDirs() {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  function readStateFile() {
    if (!fs.existsSync(stateFile)) return { kind: "missing" };
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
      return { kind: "corrupt" };
    }
    // Version probe BEFORE any current-shape validation (N2): a future
    // version may legitimately change the top-level skeleton — that is
    // "unsupported", never "corrupt", and must trigger zero writes.
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      && Number.isInteger(parsed.configVersion) && parsed.configVersion > CONFIG_VERSION) {
      return { kind: "future", state: parsed };
    }
    if (!isValidStateShape(parsed)) return { kind: "corrupt" };
    return { kind: "ok", state: parsed };
  }

  function listAssetFiles() {
    if (!fs.existsSync(assetsDir)) return [];
    return fs.readdirSync(assetsDir).filter((name) => !name.startsWith("."));
  }

  function blobFileFor(id, extension) {
    return join(assetsDir, `${id}.${extension}`);
  }

  function commitState(next, { source, previous = state, ops } = {}) {
    atomicWriteText(stateFile, `${JSON.stringify(next, null, 2)}\n`, fs);
    state = next;
    recordAudit(previous, next, source ?? "unknown", ops);
  }

  /**
   * Best-effort audit of one committed write. Written AFTER the state file, so
   * the log only ever describes committed state; a refused append never fails
   * or blocks the commit.
   */
  function recordAudit(previous, next, source, ops) {
    try {
      const skins = [];
      const skinIds = new Set([...Object.keys(previous?.skins ?? {}), ...Object.keys(next.skins ?? {})]);
      for (const skinId of skinIds) {
        const before = previous?.skins?.[skinId] ?? {};
        const after = next.skins?.[skinId] ?? {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
          skins.push({ skin: skinId, key, from: summarizeAuditValue(before[key]), to: summarizeAuditValue(after[key]) });
        }
      }
      const libraryBefore = new Set(Object.keys(previous?.library ?? {}));
      const libraryAfter = new Set(Object.keys(next.library ?? {}));
      const entry = {
        ts: new Date(now()).toISOString(),
        profile,
        source,
        revision: next.revision,
        prevRevision: previous?.revision ?? null,
        ...(ops === undefined ? {} : { ops }),
        skins,
        libraryAdded: [...libraryAfter].filter((id) => !libraryBefore.has(id)),
        libraryRemoved: [...libraryBefore].filter((id) => !libraryAfter.has(id)),
      };
      rotateAuditIfNeeded();
      fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`);
    } catch {
      // Best-effort: a refused audit append must never fail or block a commit.
    }
  }

  function rotateAuditIfNeeded() {
    try {
      if (fs.statSync(auditFile).size >= auditMaxBytes) fs.renameSync(auditFile, `${auditFile}.1`);
    } catch {
      // No log yet, or nothing to rotate.
    }
  }

  /** Serialized mutation queue: every visible state change runs through it. */
  function enqueue(work) {
    const run = chain.then(work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  // -- boot -----------------------------------------------------------------

  function sniffBlobFile(name) {
    const file = join(assetsDir, name);
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch {
      return { name, kind: "unreadable" };
    }
    const meta = detectImageMeta(buffer);
    if (meta === null) return { name, kind: "unrecognized" };
    const id = name.split(".")[0];
    if (!ASSET_ID_PATTERN.test(id)) return { name, kind: "unrecognized" };
    const extension = extensionForMime(meta.mime);
    // An extension that contradicts the sniffed magic bytes would register an
    // asset that can never be served (serveAsset rebuilds paths from the
    // trusted extension) — quarantine instead of resurrecting it.
    if (name !== `${id}.${extension}`) return { name, kind: "unrecognized" };
    return {
      name,
      kind: "asset",
      meta: {
        id,
        displayName: name,
        mime: meta.mime,
        extension,
        byteLength: buffer.length,
        width: meta.width,
        height: meta.height,
        sha256: sha256Hex(buffer),
        createdAt: new Date(now()).toISOString(),
      },
    };
  }

  function init() {
    if (initialized) return;
    try {
      initOnce();
    } catch (error) {
      // A failed boot (e.g. disk error during the initial state write) must
      // not latch `initialized` — the next call retries the whole boot.
      initialized = false;
      state = null;
      throw error;
    }
  }

  function initOnce() {
    initialized = true;
    // Boot is read-only first: parse the JSON and inspect configVersion
    // BEFORE creating directories or deep-validating — a future-version state
    // must leave the data directory byte-identical (design §5.3 B).
    const read = readStateFile();
    if (read.kind === "future" || (read.kind === "ok" && read.state.configVersion > CONFIG_VERSION)) {
      mode = "unsupported";
      state = read.state;
      return; // no ensureDirs, no validation, no GC
    }
    ensureDirs();
    const assetFiles = listAssetFiles();

    if (read.kind === "missing" && assetFiles.length === 0) {
      // True first install (design §5.3 branch A precondition).
      commitState(emptyState(), { source: "install", previous: null });
      mode = "normal";
      gcNow();
      return;
    }

    if (read.kind === "missing" || read.kind === "corrupt" || !isValidStateDeep(read.state)) {
      // Recovery branch A: rebuild a candidate from blobs; nothing destructive.
      const candidateLibrary = {};
      const quarantine = [];
      for (const scanned of assetFiles.map(sniffBlobFile)) {
        if (scanned.kind === "asset") candidateLibrary[scanned.meta.id] = scanned.meta;
        else quarantine.push(scanned.name);
      }
      mode = "recovery";
      recovery = { candidateLibrary, quarantine, configLost: true };
      state = emptyState();
      return;
    }

    mode = "normal";
    state = read.state;
    if (state.recoveryCleanup !== undefined) {
      // A previous recovery committed its state but crashed before the
      // quarantine move — resume it (idempotent), then GC.
      finishRecoveryCleanup();
    }
    normalizeState();
    gcNow();
  }

  /**
   * Load-time normalization (simplification Q36, design §5.5): reconcile the
   * persisted overrides against the CURRENT catalog. Unknown keys, values the
   * catalog now rejects (removed fields, shape changes such as the old
   * light/dark scrim pair, dangling user refs) and whole sections of
   * unregistered skins are dropped; an actual removal bumps the revision once
   * and is committed atomically.
   *
   * Runs ONLY on the normal path: the recovery branch writes nothing until
   * the user confirms, and a future-version state is sorted into
   * `unsupported` by the configVersion gate long before this code runs —
   * which is exactly why fields a FUTURE version may add can never be
   * damaged by an older build's normalization.
   */
  function normalizeState() {
    const previous = structuredClone(state); // normalization mutates `state` in place: keep the pre-image for the audit
    const provider = metaProviderFactory(state.library);
    let removed = false;
    for (const skinId of Object.keys(state.skins)) {
      if (getSkinSchema(skinId) === null) {
        delete state.skins[skinId]; // orphan section of an unregistered skin
        removed = true;
        continue;
      }
      const section = state.skins[skinId];
      const defaults = defaultsFor(skinId, profile);
      for (const key of Object.keys(section)) {
        if (!validateOverride(skinId, key, section[key], provider).ok) {
          delete section[key];
          removed = true;
          continue;
        }
        // A stored value equal to the field's factory default is not an
        // override (v1.0.0 ruling): older builds could persist one via a
        // default-thumbnail click. Dropping it is lossless for the effective
        // value and lets the field follow future default changes again.
        // Structural comparison — locale/colorScheme defaults are fresh
        // objects on every defaultsFor() call, so `===` never fires for them.
        if (isSameOverrideValue(section[key], defaults[key])) {
          delete section[key];
          removed = true;
        }
      }
      if (Object.keys(section).length === 0) {
        delete state.skins[skinId]; // emptied sections leave no husk behind
        removed = true;
      }
    }
    if (removed) {
      state.revision += 1;
      commitState(state, { source: "normalize", previous });
    }
  }

  // -- garbage collection ---------------------------------------------------

  function gcNow() {
    if (mode !== "normal" || state?.recoveryCleanup !== undefined) return;
    const live = new Set(Object.keys(state.library));
    for (const name of listAssetFiles()) {
      const id = name.split(".")[0];
      if (!live.has(id)) {
        try { fs.unlinkSync(join(assetsDir, name)); } catch {}
      }
    }
  }

  // -- guards ---------------------------------------------------------------

  function requireNormal(operation) {
    if (mode === "unsupported") {
      throw codedError("STORE_READONLY", `配置状态为更高版本（configVersion>${CONFIG_VERSION}），${operation}被拒绝`);
    }
    if (mode === "recovery") {
      throw codedError("STORE_RECOVERY_REQUIRED", `配置状态待恢复，${operation}被拒绝`);
    }
  }

  function metaProviderFactory(library) {
    return (id) => library[id] ?? null;
  }

  // -- snapshot -------------------------------------------------------------

  function referencesFor(skins, library) {
    const references = {};
    for (const id of Object.keys(library)) references[id] = [];
    for (const [skinId, section] of Object.entries(skins)) {
      for (const field of listAssetFields(skinId)) {
        const value = section?.[field.key];
        if (typeof value === "string" && references[value] !== undefined) {
          references[value].push({ skinId, key: field.key });
        }
      }
    }
    return references;
  }

  function snapshot() {
    init();
    // Future-version states may carry a changed skeleton (that is what a
    // configVersion bump licenses) — read-only reporting must survive it.
    const library = state.library ?? {};
    const skins = state.skins ?? {};
    const base = {
      configVersion: state.configVersion,
      revision: state.revision,
      skins,
      library: Object.values(library),
      mode,
      quota: {
        count: Object.keys(library).length,
        totalBytes: Object.values(library).reduce((sum, meta) => sum + (meta?.byteLength ?? 0), 0),
      },
    };
    if (mode === "normal") base.references = referencesFor(skins, library);
    if (mode === "recovery") base.recovery = recovery;
    return base;
  }

  // -- config operations (unified write dialect, ADR-0015) --------------------

  /**
   * Shared gallery-delete core (ADR-0015): sweep every skin section for
   * fields referencing `id`, clear them (recording the fallbacks), prune
   * emptied sections (load-normalize doctrine: no husks), and drop the
   * library entry. Returns the removed AssetMeta. Callers own commit/blob.
   */
  function applyGalleryDelete(draft, id, affectedSkins) {
    const meta = draft.library[id];
    for (const [skinId, section] of Object.entries(draft.skins)) {
      for (const field of listAssetFields(skinId)) {
        if (section?.[field.key] === id) {
          delete section[field.key];
          affectedSkins.push({ skinId, key: field.key });
        }
      }
      if (Object.keys(section).length === 0) delete draft.skins[skinId];
    }
    delete draft.library[id];
    return meta;
  }

  async function applyOperations({ baseRevision, operations }) {
    init();
    requireNormal("配置写入");
    // Revision, structure, draft, and value validation all run INSIDE the
    // serialized queue so interleaved mutations cannot bypass the precondition.
    // ADR-0015: the op vocabulary is set | delete | deleteAsset | clearLibrary —
    // gallery deletes ARE config writes and ride the same precondition.
    return enqueue(() => {
      if (!Number.isInteger(baseRevision) || baseRevision < 0 || baseRevision !== state.revision) {
        throw codedError("REVISION_CONFLICT", "配置已被其他会话修改（修订号过期），请刷新后重试");
      }
      if (!Array.isArray(operations) || operations.length === 0 || operations.length > 64) {
        throw codedError("INVALID_CONFIG", "operations 必须是 1–64 个元素的数组");
      }
      // Validation pass 1 — structure: every op is checked against the
      // PRE-BATCH state; verdicts are aggregated (not first-throw) so the
      // client can name each offending field (ADR-0015 params.issues).
      const issues = [];
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation === null || typeof operation !== "object") {
          issues.push({ opIndex: index, code: "INVALID_OP" });
          continue;
        }
        const { op, skinId, key } = operation;
        if (op === "set" || op === "delete") {
          if (getField(skinId, key) === null) {
            issues.push({ opIndex: index, skinId, key, code: "UNKNOWN_FIELD" });
          }
        } else if (op === "deleteAsset") {
          const assetId = operation.assetId;
          if (typeof assetId !== "string" || !ASSET_ID_PATTERN.test(assetId)) {
            issues.push({ opIndex: index, assetId, code: "INVALID_ASSET_ID" });
          } else if (state.library[assetId] === undefined) {
            issues.push({ opIndex: index, assetId, code: "ASSET_NOT_FOUND" });
          }
        } else if (op !== "clearLibrary") {
          issues.push({ opIndex: index, code: "INVALID_OP" });
        }
      }
      // Validation pass 2 — set values (against the pre-batch library: a set
      // may legally reference an asset that a LATER deleteAsset in the same
      // batch removes — application order then resets the field, B3).
      const draft = structuredClone(state);
      const provider = metaProviderFactory(draft.library);
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation?.op !== "set") continue;
        const verdict = validateOverride(operation.skinId, operation.key, operation.value, provider);
        if (!verdict.ok) {
          issues.push({ opIndex: index, skinId: operation.skinId, key: operation.key, code: verdict.code });
        }
      }
      if (issues.length > 0) {
        issues.sort((a, b) => a.opIndex - b.opIndex);
        throw codedError("INVALID_CONFIG", `operations 校验失败（${issues[0].code}）`, {
          code: issues[0].code, // retained for old readers (ADR-0015 Q&A R1-8)
          issues,
        });
      }
      // Application pass — array order (B3). Field ops and gallery ops share
      // one draft, one commit, one revision bump.
      const affectedSkins = [];
      const removedAssets = [];
      let galleryOps = false;
      const hasFieldOps = operations.some((operation) => operation?.op === "set" || operation?.op === "delete");
      for (const operation of operations) {
        const { op, skinId, key } = operation;
        if (op === "set" || op === "delete") {
          draft.skins[skinId] = draft.skins[skinId] ?? {};
          if (op === "set") draft.skins[skinId][key] = operation.value;
          else delete draft.skins[skinId][key];
        } else if (op === "deleteAsset") {
          galleryOps = true;
          const meta = applyGalleryDelete(draft, operation.assetId, affectedSkins);
          if (meta !== undefined) removedAssets.push(meta); // in-batch duplicates are no-ops
        } else if (op === "clearLibrary") {
          galleryOps = true;
          for (const id of Object.keys(draft.library)) {
            const meta = applyGalleryDelete(draft, id, affectedSkins);
            if (meta !== undefined) removedAssets.push(meta);
          }
        }
      }
      // A gallery-only batch that removed nothing (clearLibrary on an empty
      // library) is an idempotent no-op: no commit, no revision bump.
      if (galleryOps && !hasFieldOps && removedAssets.length === 0) {
        return { revision: state.revision, affectedSkins };
      }
      // Terminal-state invariant (ADR-0015: 终态一致、无悬空). Validation ran
      // against the PRE-batch library (B3), so a deleteAsset ordered BEFORE a
      // set of the same asset would otherwise persist a dangling reference —
      // fail closed on the draft instead of waiting for load-time self-heal.
      if (galleryOps) {
        const finalProvider = metaProviderFactory(draft.library);
        for (const [skinId, section] of Object.entries(draft.skins)) {
          for (const field of listAssetFields(skinId)) {
            const value = section?.[field.key];
            if (value === undefined) continue;
            const verdict = validateOverride(skinId, field.key, value, finalProvider);
            if (!verdict.ok) {
              throw codedError("INVALID_CONFIG", `终态校验失败：${skinId}.${field.key} 引用已删除资产`, {
                code: verdict.code,
                issues: [{ skinId, key: field.key, code: verdict.code }],
              });
            }
          }
        }
      }
      draft.revision += 1;
      commitState(draft, { source: "operations", ops: [...new Set(operations.map((operation) => operation?.op))] });
      for (const meta of removedAssets) {
        try { fs.unlinkSync(blobFileFor(meta.id, meta.extension)); } catch {}
      }
      gcNow();
      const result = { revision: draft.revision };
      if (galleryOps) result.affectedSkins = affectedSkins;
      return result;
    });
  }

  // -- asset upload (design §4 upload contract) ------------------------------

  /**
   * Shared ingest validation (upload AND theme import): magic sniff, animation
   * policy, global byte and per-format pixel caps. Returns the trusted meta.
   */
  function ingestAssetMeta(buffer, { declaredMime } = {}) {
    const meta = detectImageMeta(buffer);
    if (meta === null) throw codedError("UNSUPPORTED_IMAGE", "无法识别的图片格式");
    if (meta.animated === true) throw codedError("ANIMATION_UNSUPPORTED", "动画 WebP 暂不支持");
    if (typeof declaredMime === "string" && declaredMime !== "" && declaredMime !== meta.mime) {
      throw codedError("UNSUPPORTED_IMAGE", `声明的 ${declaredMime} 与实际内容 ${meta.mime} 不符`);
    }
    if (buffer.length > GLOBAL_MAX_BYTES) {
      throw codedError("UPLOAD_TOO_LARGE", "图片超过 20MB 上限");
    }
    const pixelCap = meta.mime === "image/gif" ? GIF_MAX_PIXELS : GLOBAL_MAX_PIXELS;
    if (meta.width * meta.height > pixelCap) {
      throw codedError("UPLOAD_TOO_LARGE", `图片像素超过上限（${meta.mime === "image/gif" ? "12" : "40"}MP）`);
    }
    return meta;
  }

  function checkDiskSpace(incomingBytes) {
    if (typeof fs.statfsSync !== "function") return;
    try {
      const stats = fs.statfsSync(dataDir);
      // incoming + 2× temporary overhead + safety reserve (design §4).
      const required = BigInt(incomingBytes) * 3n + BigInt(DISK_SAFETY_RESERVE);
      if (BigInt(stats.bsize) * BigInt(stats.bavail) < required) {
        throw codedError("DISK_FULL", "磁盘剩余空间不足，拒绝写入");
      }
    } catch (error) {
      if (error?.code === "DISK_FULL") throw error;
      // statfs unavailable on this platform — proceed without the check.
    }
  }

  /**
   * Exclusive, no-overwrite blob commit (design: immutable blobs). Uses
   * open(2) with "wx" so a colliding id fails with EEXIST instead of being
   * replaced by rename(2); a crash mid-write leaves a partial file that is
   * not referenced by any state — the GC (or recovery sniff) reclaims it.
   */
  function writeBlobExclusive(buffer, extension) {
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt += 1) {
      const id = ASSET_ID_PREFIX + randomUUID().replaceAll("-", "");
      const target = blobFileFor(id, extension);
      let descriptor;
      try {
        descriptor = fs.openSync(target, "wx");
      } catch (error) {
        if (error?.code === "EEXIST") continue; // collision: try a new id
        throw error;
      }
      try {
        fs.writeFileSync(descriptor, buffer);
        return { id, target };
      } finally {
        try { fs.closeSync(descriptor); } catch {}
      }
    }
    throw codedError("STORE_WRITE_FAILED", "无法分配新的资产 id（连续碰撞）");
  }

  async function uploadAsset(buffer, { displayName, declaredMime }) {
    init();
    requireNormal("图片上传");
    const meta = ingestAssetMeta(buffer, { declaredMime });
    const name = sanitizeDisplayName(displayName);
    if (name === null) throw codedError("FILENAME_INVALID", "文件展示名无效");

    return enqueue(() => {
      checkDiskSpace(buffer.length);
      const extension = extensionForMime(meta.mime);
      const { id, target } = writeBlobExclusive(buffer, extension);

      const asset = {
        id,
        displayName: name,
        mime: meta.mime,
        extension,
        byteLength: buffer.length,
        width: meta.width,
        height: meta.height,
        sha256: sha256Hex(buffer),
        createdAt: new Date(now()).toISOString(),
      };
      const draft = structuredClone(state);
      draft.library[id] = asset;
      draft.revision += 1;
      try {
        commitState(draft, { source: "upload" });
      } catch (error) {
        // State commit failed: the blob is orphaned (GC reclaims it later);
        // surface the error without leaving a visible-but-dangling reference.
        try { fs.unlinkSync(target); } catch {}
        throw error;
      }
      return { asset, revision: draft.revision };
    });
  }

  // -- asset delete (compat adapter over the shared core, ADR-0015) -----------
  // Kept for mixed-version tolerance (an open tab holds the old bundle): no
  // precondition rides on this route — today's unconditional semantics are
  // the compatibility floor. New clients use the deleteAsset PATCH op.

  async function deleteAsset(id) {
    init();
    requireNormal("图片删除");
    if (typeof id !== "string" || !ASSET_ID_PATTERN.test(id)) {
      throw codedError("INVALID_ASSET_ID", "非法的图片 id");
    }
    return enqueue(() => {
      if (state.library[id] === undefined) throw codedError("ASSET_NOT_FOUND", "图片不存在");
      const draft = structuredClone(state);
      const affectedSkins = [];
      const meta = applyGalleryDelete(draft, id, affectedSkins);
      draft.revision += 1;
      commitState(draft, { source: "delete" }); // state first: a crash here only orphans the blob
      try { fs.unlinkSync(blobFileFor(meta.id, meta.extension)); } catch {}
      gcNow();
      return { revision: draft.revision, affectedSkins };
    });
  }

  // -- asset serving (path rebuilt from trusted metadata, design §4) ---------

  function serveAsset(url) {
    init();
    const path = String(url ?? "").split("?")[0];
    const match = /\/dsh-skins\/assets\/([^/]+)$/.exec(path);
    if (match === null) return null;
    const name = match[1];
    if (!/^u_[0-9a-f]{32}\.(png|jpe?g|webp|gif)$/.test(name)) return null;
    const id = name.split(".")[0];
    const meta = (state.library ?? {})[id];
    if (meta === undefined) return null;
    // The requested extension must equal the trusted metadata's extension;
    // the served path is rebuilt from metadata, never from the raw suffix.
    if (name !== `${id}.${meta.extension}`) return null;
    try {
      return { buffer: fs.readFileSync(blobFileFor(id, meta.extension)), meta };
    } catch {
      return null;
    }
  }

  // -- recovery confirmation (branch A: destructive steps only after commit) -

  async function confirmRecovery() {
    init();
    if (mode !== "recovery") throw codedError("STORE_NOT_RECOVERING", "当前不在恢复模式");
    return enqueue(() => {
      // Two-phase recovery (design §5.3 A): NOTHING moves before the rebuilt
      // state is atomically committed, and the commit carries a persisted
      // cleanup marker so a crash mid-cleanup resumes on the next boot.
      try {
        // Archive a COPY (non-destructive) of the unreadable state file.
        if (fs.existsSync(stateFile) && typeof fs.copyFileSync === "function") {
          try {
            fs.copyFileSync(stateFile, `${stateFile}.corrupt.${now()}.json`);
            pruneCorruptBackups();
          } catch {} // archiving is best-effort
        }
      } catch {}

      const draft = emptyState();
      draft.library = recovery.candidateLibrary;
      draft.revision = 1;
      draft.recoveryCleanup = { quarantine: [...recovery.quarantine] };
      commitState(draft, { source: "recovery-confirm" }); // the single atomic commit point

      finishRecoveryCleanup(); // phase 2 — idempotent, crash-resumable
      mode = "normal";
      recovery = null;
      gcNow();
      return { revision: draft.revision };
    });
  }

  /**
   * Finish (or resume) the recovery cleanup: physically move quarantined
   * files, then commit the marker-free state that re-enables GC. Running
   * under a committed state with `recoveryCleanup` present — GC stays off
   * until this completes, so a crash anywhere in here is safe to retry.
   */
  function finishRecoveryCleanup() {
    const pending = state.recoveryCleanup;
    if (pending === undefined) return;
    fs.mkdirSync(quarantineDir, { recursive: true });
    for (const name of pending.quarantine) {
      try { fs.renameSync(join(assetsDir, name), join(quarantineDir, name)); } catch {}
    }
    const cleaned = structuredClone(state);
    delete cleaned.recoveryCleanup;
    commitState(cleaned, { source: "recovery-cleanup" });
  }

  function pruneCorruptBackups() {
    const dir = join(dataDir);
    if (!fs.existsSync(dir)) return;
    const backups = fs.readdirSync(dir)
      .filter((name) => name.startsWith(`${STATE_FILE}.corrupt.`))
      .sort();
    while (backups.length > CORRUPT_BACKUP_LIMIT) {
      try { fs.unlinkSync(join(dir, backups.shift())); } catch {}
    }
  }

  return {
    init,
    snapshot,
    applyOperations,
    uploadAsset,
    deleteAsset,
    serveAsset,
    confirmRecovery,
    getMode: () => {
      init();
      return mode;
    },
  };
}
