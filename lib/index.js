// src/index.js
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// src/host/personalization/store.js
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync as mkdirSync2,
  openSync,
  readFileSync,
  readdirSync,
  renameSync as renameSync2,
  rmdirSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { join } from "node:path";

// src/host/errors.js
function codedError(code, message, params) {
  const error = message instanceof Error ? message : new Error(message);
  error.code = code;
  if (params !== void 0) error.params = params;
  return error;
}
function publicError(error) {
  const value = {
    error: error instanceof Error ? error.message : String(error)
  };
  if (error !== null && error !== void 0 && error.code !== void 0) value.code = error.code;
  if (error !== null && error !== void 0 && error.params !== void 0) value.params = error.params;
  return value;
}

// src/host/atomic-write.js
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function atomicWriteText(file, content, fs = { mkdirSync, writeFileSync, renameSync }) {
  fs.mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

// src/host/personalization/image-meta.js
function ascii(buffer, offset, length) {
  return String.fromCharCode(...buffer.subarray(offset, offset + length));
}
function parsePng(buffer) {
  if (buffer.length < 24) return null;
  if (ascii(buffer, 0, 8) !== "PNG\r\n\n") return null;
  if (ascii(buffer, 12, 4) !== "IHDR") return null;
  if (buffer.readUInt32BE(8) !== 13) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { mime: "image/png", width, height, animated: false };
}
function parseGif(buffer) {
  if (buffer.length < 10) return null;
  const signature = ascii(buffer, 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  if (width === 0 || height === 0) return null;
  return { mime: "image/gif", width, height, animated: null };
}
var JPEG_SOF_MARKERS = /* @__PURE__ */ new Set([
  192,
  193,
  194,
  195,
  197,
  198,
  199,
  201,
  202,
  203,
  205,
  206,
  207
]);
function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 255 || buffer[1] !== 216) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 255) return null;
    const marker = buffer[offset + 1];
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      offset += 2;
      continue;
    }
    if (marker === 218 || marker === 217) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      const width = buffer.readUInt16BE(offset + 7);
      const height = buffer.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return null;
      return { mime: "image/jpeg", width, height, animated: false };
    }
    offset += 2 + length;
  }
  return null;
}
function parseWebp(buffer) {
  if (buffer.length < 30) return null;
  if (ascii(buffer, 0, 4) !== "RIFF" || ascii(buffer, 8, 4) !== "WEBP") return null;
  if (buffer.readUInt32LE(4) + 8 > buffer.length) return null;
  const chunk = ascii(buffer, 12, 4);
  const chunkSize = buffer.readUInt32LE(16);
  if (20 + chunkSize > buffer.length) return null;
  if (chunk === "VP8X") {
    const flags = buffer[20];
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { mime: "image/webp", width, height, animated: (flags & 2) !== 0 };
  }
  if (chunk === "VP8 ") {
    if (ascii(buffer, 23, 3) !== "*") return null;
    const width = buffer.readUInt16LE(26) & 16383;
    const height = buffer.readUInt16LE(28) & 16383;
    if (width === 0 || height === 0) return null;
    return { mime: "image/webp", width, height, animated: false };
  }
  if (chunk === "VP8L") {
    if (buffer[20] !== 47) return null;
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 16383) + 1;
    const height = (bits >> 14 & 16383) + 1;
    return { mime: "image/webp", width, height, animated: false };
  }
  return null;
}
function detectImageMeta(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  return parsePng(buffer) ?? parseJpeg(buffer) ?? parseGif(buffer) ?? parseWebp(buffer);
}
function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

// src/shared/personalization/catalog.js
var CONFIG_VERSION = 1;
var GLOBAL_MAX_BYTES = 20 * 1024 * 1024;
var GLOBAL_MAX_PIXELS = 4e7;
var GIF_MAX_PIXELS = 12e6;
var ASSET_ID_PATTERN = /^u_[0-9a-f]{32}$/;
var ASSET_ID_PREFIX = "u_";
var BUILTIN_REF_PATTERN = /^builtin:([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;
var USER_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
var WALLPAPER_FIELD = {
  key: "wallpaper",
  type: "image",
  scope: "single",
  labelKey: "personalization.wallpaper",
  default: null,
  // filled per skin below
  allowedUserMime: USER_IMAGE_MIMES,
  maxBytes: GLOBAL_MAX_BYTES,
  maxWidth: 16384,
  maxHeight: 16384,
  maxPixels: GLOBAL_MAX_PIXELS
};
var SKINS = {
  // ADR-0004 (reversing design §9a): every catalog skin declares the same
  // standard field set. The legacy skins' catalog slogan defaults are
  // same-source with their factories' static `slogans`, and panelOpacity
  // default 55 anchors the derived projection to the baked alpha strings —
  // the byte-equivalence invariant is pinned by the projector tests.
  // Legacy wallpaper semantics (scrim never applies to user images,
  // placeholder branch) live inside each skin's project() branches.
  // openbmc（出厂皮肤，v1.0.6 起注册顺序第一位，见 client/index.js）
  openbmc: {
    builtinAssets: { art: { mime: "image/webp", labelKey: "personalization.openbmc.art" } },
    fields: [
      { ...WALLPAPER_FIELD, default: "builtin:openbmc:art", builtinChoices: ["art"] },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "察于未萌 · 治于未乱", en: "Govern before the storm" }
      },
      {
        key: "panelOpacity",
        type: "range",
        scope: "single",
        labelKey: "personalization.panelTranslucency",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        default: 55
      }
    ]
  },
  "uefi-harness": {
    builtinAssets: { art: { mime: "image/webp", labelKey: "personalization.uefi.art" } },
    fields: [
      { ...WALLPAPER_FIELD, default: "builtin:uefi-harness:art", builtinChoices: ["art"] },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "启于固件 · 行于万象", en: "Boot before everything" }
      },
      {
        key: "panelOpacity",
        type: "range",
        scope: "single",
        labelKey: "personalization.panelTranslucency",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        default: 55
      }
    ]
  },
  // 美人志（v1.0.6 前的出厂皮肤，现注册顺序第三位）：6 张内置精选，出厂默认 yuntai
  // （001合照）领头并对齐已移除 tgcf 皮肤的「出厂默认领先」惯例；panelOpacity 锚定
  // 其二次曲线（projector 数学见 skins/meirenzhi/index.js）。
  meirenzhi: {
    builtinAssets: {
      yuntai: { mime: "image/webp", labelKey: "personalization.meirenzhi.yuntai" },
      mupeiling: { mime: "image/webp", labelKey: "personalization.meirenzhi.mupeiling" },
      ziling: { mime: "image/webp", labelKey: "personalization.meirenzhi.ziling" },
      nangongwan: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongwan" },
      nangongque: { mime: "image/webp", labelKey: "personalization.meirenzhi.nangongque" },
      yinyue: { mime: "image/webp", labelKey: "personalization.meirenzhi.yinyue" }
    },
    fields: [
      {
        ...WALLPAPER_FIELD,
        default: "builtin:meirenzhi:yuntai",
        builtinChoices: [
          "yuntai",
          "mupeiling",
          "ziling",
          "nangongwan",
          "nangongque",
          "yinyue"
        ]
      },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "风起凡尘 · 红颜问道", en: "From mortal dust, immortals bloom" }
      },
      {
        key: "panelOpacity",
        type: "range",
        scope: "single",
        labelKey: "personalization.panelTranslucency",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        default: 35
      }
    ]
  }
};
function getSkinSchema(skinId) {
  const entry = SKINS[skinId];
  if (entry === void 0) return null;
  return { skinId, fields: entry.fields, builtinAssets: entry.builtinAssets };
}
function getField(skinId, key) {
  return SKINS[skinId]?.fields.find((field) => field.key === key) ?? null;
}
function listAssetFields(skinId) {
  return SKINS[skinId]?.fields.filter((field) => field.type === "image") ?? [];
}
function defaultsFor(skinId) {
  const values = {};
  for (const field of SKINS[skinId]?.fields ?? []) values[field.key] = field.default;
  return values;
}
function isSameOverrideValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  return keysA.length === Object.keys(b).length && keysA.every((key) => Object.hasOwn(b, key) && isSameOverrideValue(a[key], b[key]));
}
function resolveImageRef(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.startsWith("builtin:")) {
    const match = BUILTIN_REF_PATTERN.exec(value);
    return match === null ? null : { kind: "builtin", skinId: match[1], assetKey: match[2] };
  }
  if (ASSET_ID_PATTERN.test(value)) return { kind: "user", id: value };
  return null;
}
var HEX_COLOR = /^#[0-9a-f]{6}$/i;
var CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function scopeKeys(scope) {
  if (scope === "locale") return ["zh", "en"];
  if (scope === "colorScheme") return ["light", "dark"];
  return null;
}
function validScopeObject(value, scope, checkMember) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = scopeKeys(scope);
  if (Object.keys(value).length !== keys.length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
    if (!checkMember(value[key])) return false;
  }
  return true;
}
function validateTextMember(value, field) {
  if (typeof value !== "string") return false;
  if (CONTROL_CHARS.test(value)) return false;
  return value.length <= field.maxLength;
}
function validateRangeMember(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < field.min || value > field.max) return false;
  if (field.step !== void 0 && field.step > 0) {
    const steps = (value - field.min) / field.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) return false;
  }
  return true;
}
function validateScalar(value, field) {
  switch (field.type) {
    case "text":
      return validateTextMember(value, field);
    case "range":
      return validateRangeMember(value, field);
    case "select":
      return typeof value === "string" && field.options.some((option) => option.value === value);
    default:
      return false;
  }
}
function validateImageRef(value, field, skinId, meta) {
  const ref = resolveImageRef(value);
  if (ref === null) return false;
  if (ref.kind === "builtin") {
    if (ref.skinId !== skinId) return false;
    return SKINS[skinId]?.builtinAssets[ref.assetKey] !== void 0;
  }
  if (meta === void 0 || meta === null) return true;
  return metaSatisfiesField(field, meta);
}
function metaSatisfiesField(field, meta) {
  if (typeof meta.mime !== "string" || !field.allowedUserMime.includes(meta.mime)) return false;
  if (meta.byteLength > field.maxBytes) return false;
  if (meta.width > field.maxWidth || meta.height > field.maxHeight) return false;
  const maxPixels = meta.mime === "image/gif" ? Math.min(field.maxPixels, GIF_MAX_PIXELS) : field.maxPixels;
  return meta.width * meta.height <= maxPixels;
}
function validateOverride(skinId, key, value, metaProvider) {
  const field = getField(skinId, key);
  if (field === null) return { ok: false, code: "UNKNOWN_FIELD" };
  const provider = typeof metaProvider === "function" ? metaProvider : void 0;
  if (field.scope === "single") {
    if (field.type === "image") {
      const ref = resolveImageRef(value);
      if (ref === null) return { ok: false, code: "BAD_SHAPE" };
      if (ref.kind === "builtin") {
        if (!validateImageRef(value, field, skinId, void 0)) return { ok: false, code: "BAD_ASSET" };
        return { ok: true };
      }
      if (provider !== void 0) {
        const meta = provider(ref.id);
        if (meta === null) return { ok: false, code: "MISSING_ASSET" };
        if (!validateImageRef(value, field, skinId, meta)) return { ok: false, code: "BAD_ASSET" };
      }
      return { ok: true };
    }
    if (!validateScalar(value, field)) return { ok: false, code: "BAD_VALUE" };
    return { ok: true };
  }
  if (!validScopeObject(value, field.scope, (member) => {
    if (field.type === "text") return validateTextMember(member, field);
    if (field.type === "range") return validateRangeMember(member, field);
    if (field.type === "color") return typeof member === "string" && HEX_COLOR.test(member);
    return false;
  })) return { ok: false, code: "BAD_SHAPE" };
  return { ok: true };
}

// src/host/personalization/store.js
var STATE_FILE = "state.json";
var ASSETS_DIR = "assets";
var QUARANTINE_DIR = "quarantine";
var DISK_SAFETY_RESERVE = 64 * 1024 * 1024;
var CORRUPT_BACKUP_LIMIT = 3;
var ID_ATTEMPTS = 5;
function defaultFs() {
  return {
    existsSync,
    mkdirSync: mkdirSync2,
    readFileSync,
    writeFileSync: writeFileSync2,
    renameSync: renameSync2,
    unlinkSync,
    readdirSync,
    rmdirSync,
    statSync,
    statfsSync,
    copyFileSync,
    openSync,
    closeSync
  };
}
function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function sanitizeDisplayName(name2) {
  if (typeof name2 !== "string") return null;
  const cleaned = name2.replace(/[\u0000-\u001f\u007f]/g, "");
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
  if (state.recoveryCleanup !== void 0) {
    const pending = state.recoveryCleanup;
    if (pending === null || typeof pending !== "object" || Array.isArray(pending) || !Array.isArray(pending.quarantine) || !pending.quarantine.every((name2) => typeof name2 === "string")) return false;
  }
  return true;
}
var ASSET_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "webp", "gif"]);
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
function createPersonalizationStore(options = {}) {
  const dataDir = options.dataDir;
  if (typeof dataDir !== "string" || dataDir.length === 0) {
    throw new Error("personalization store requires a dataDir");
  }
  const fs = options.fs ?? defaultFs();
  const now = options.now ?? Date.now;
  const stateFile = join(dataDir, STATE_FILE);
  const assetsDir = join(dataDir, ASSETS_DIR);
  const quarantineDir = join(dataDir, QUARANTINE_DIR);
  let state = null;
  let mode = "normal";
  let recovery = null;
  let chain = Promise.resolve();
  let initialized = false;
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
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && Number.isInteger(parsed.configVersion) && parsed.configVersion > CONFIG_VERSION) {
      return { kind: "future", state: parsed };
    }
    if (!isValidStateShape(parsed)) return { kind: "corrupt" };
    return { kind: "ok", state: parsed };
  }
  function listAssetFiles() {
    if (!fs.existsSync(assetsDir)) return [];
    return fs.readdirSync(assetsDir).filter((name2) => !name2.startsWith("."));
  }
  function blobFileFor(id, extension) {
    return join(assetsDir, `${id}.${extension}`);
  }
  function commitState(next) {
    atomicWriteText(stateFile, `${JSON.stringify(next, null, 2)}
`, fs);
    state = next;
  }
  function enqueue(work) {
    const run = chain.then(work);
    chain = run.then(() => void 0, () => void 0);
    return run;
  }
  function sniffBlobFile(name2) {
    const file = join(assetsDir, name2);
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch {
      return { name: name2, kind: "unreadable" };
    }
    const meta = detectImageMeta(buffer);
    if (meta === null) return { name: name2, kind: "unrecognized" };
    const id = name2.split(".")[0];
    if (!ASSET_ID_PATTERN.test(id)) return { name: name2, kind: "unrecognized" };
    const extension = extensionForMime(meta.mime);
    if (name2 !== `${id}.${extension}`) return { name: name2, kind: "unrecognized" };
    return {
      name: name2,
      kind: "asset",
      meta: {
        id,
        displayName: name2,
        mime: meta.mime,
        extension,
        byteLength: buffer.length,
        width: meta.width,
        height: meta.height,
        sha256: sha256Hex(buffer),
        createdAt: new Date(now()).toISOString()
      }
    };
  }
  function init() {
    if (initialized) return;
    try {
      initOnce();
    } catch (error) {
      initialized = false;
      state = null;
      throw error;
    }
  }
  function initOnce() {
    initialized = true;
    const read = readStateFile();
    if (read.kind === "future" || read.kind === "ok" && read.state.configVersion > CONFIG_VERSION) {
      mode = "unsupported";
      state = read.state;
      return;
    }
    ensureDirs();
    const assetFiles = listAssetFiles();
    if (read.kind === "missing" && assetFiles.length === 0) {
      commitState(emptyState());
      mode = "normal";
      gcNow();
      return;
    }
    if (read.kind === "missing" || read.kind === "corrupt" || !isValidStateDeep(read.state)) {
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
    if (state.recoveryCleanup !== void 0) {
      finishRecoveryCleanup();
    }
    normalizeState();
    gcNow();
  }
  function normalizeState() {
    const provider = metaProviderFactory(state.library);
    let removed = false;
    for (const skinId of Object.keys(state.skins)) {
      if (getSkinSchema(skinId) === null) {
        delete state.skins[skinId];
        removed = true;
        continue;
      }
      const section = state.skins[skinId];
      const defaults = defaultsFor(skinId);
      for (const key of Object.keys(section)) {
        if (!validateOverride(skinId, key, section[key], provider).ok) {
          delete section[key];
          removed = true;
          continue;
        }
        if (isSameOverrideValue(section[key], defaults[key])) {
          delete section[key];
          removed = true;
        }
      }
      if (Object.keys(section).length === 0) {
        delete state.skins[skinId];
        removed = true;
      }
    }
    if (removed) {
      state.revision += 1;
      commitState(state);
    }
  }
  function gcNow() {
    if (mode !== "normal" || state?.recoveryCleanup !== void 0) return;
    const live = new Set(Object.keys(state.library));
    for (const name2 of listAssetFiles()) {
      const id = name2.split(".")[0];
      if (!live.has(id)) {
        try {
          fs.unlinkSync(join(assetsDir, name2));
        } catch {
        }
      }
    }
  }
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
  function referencesFor(skins, library) {
    const references = {};
    for (const id of Object.keys(library)) references[id] = [];
    for (const [skinId, section] of Object.entries(skins)) {
      for (const field of listAssetFields(skinId)) {
        const value = section?.[field.key];
        if (typeof value === "string" && references[value] !== void 0) {
          references[value].push({ skinId, key: field.key });
        }
      }
    }
    return references;
  }
  function snapshot() {
    init();
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
        totalBytes: Object.values(library).reduce((sum, meta) => sum + (meta?.byteLength ?? 0), 0)
      }
    };
    if (mode === "normal") base.references = referencesFor(skins, library);
    if (mode === "recovery") base.recovery = recovery;
    return base;
  }
  async function applyOperations({ baseRevision, operations }) {
    init();
    requireNormal("配置写入");
    return enqueue(() => {
      if (!Number.isInteger(baseRevision) || baseRevision < 0 || baseRevision !== state.revision) {
        throw codedError("REVISION_CONFLICT", "配置已被其他会话修改（修订号过期），请刷新后重试");
      }
      if (!Array.isArray(operations) || operations.length === 0 || operations.length > 64) {
        throw codedError("INVALID_CONFIG", "operations 必须是 1–64 个元素的数组");
      }
      for (const operation of operations) {
        if (operation === null || typeof operation !== "object") {
          throw codedError("INVALID_CONFIG", "operation 必须是对象");
        }
        const { op, skinId, key } = operation;
        if (op !== "set" && op !== "delete") throw codedError("INVALID_CONFIG", "op 必须是 set 或 delete");
        if (getField(skinId, key) === null) {
          throw codedError("INVALID_CONFIG", `未知字段 ${skinId}.${key}`);
        }
      }
      const draft = structuredClone(state);
      const provider = metaProviderFactory(draft.library);
      for (const operation of operations) {
        const { op, skinId, key } = operation;
        if (op === "set") {
          const verdict = validateOverride(skinId, key, operation.value, provider);
          if (!verdict.ok) {
            throw codedError("INVALID_CONFIG", `${skinId}.${key} 校验失败（${verdict.code}）`, { code: verdict.code });
          }
        }
      }
      for (const { op, skinId, key, value } of operations) {
        draft.skins[skinId] = draft.skins[skinId] ?? {};
        if (op === "set") draft.skins[skinId][key] = value;
        else delete draft.skins[skinId][key];
      }
      draft.revision += 1;
      commitState(draft);
      gcNow();
      return { revision: draft.revision };
    });
  }
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
      const required = BigInt(incomingBytes) * 3n + BigInt(DISK_SAFETY_RESERVE);
      if (BigInt(stats.bsize) * BigInt(stats.bavail) < required) {
        throw codedError("DISK_FULL", "磁盘剩余空间不足，拒绝写入");
      }
    } catch (error) {
      if (error?.code === "DISK_FULL") throw error;
    }
  }
  function writeBlobExclusive(buffer, extension) {
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt += 1) {
      const id = ASSET_ID_PREFIX + randomUUID().replaceAll("-", "");
      const target = blobFileFor(id, extension);
      let descriptor;
      try {
        descriptor = fs.openSync(target, "wx");
      } catch (error) {
        if (error?.code === "EEXIST") continue;
        throw error;
      }
      try {
        fs.writeFileSync(descriptor, buffer);
        return { id, target };
      } finally {
        try {
          fs.closeSync(descriptor);
        } catch {
        }
      }
    }
    throw codedError("STORE_WRITE_FAILED", "无法分配新的资产 id（连续碰撞）");
  }
  async function uploadAsset(buffer, { displayName, declaredMime }) {
    init();
    requireNormal("图片上传");
    const meta = ingestAssetMeta(buffer, { declaredMime });
    const name2 = sanitizeDisplayName(displayName);
    if (name2 === null) throw codedError("FILENAME_INVALID", "文件展示名无效");
    return enqueue(() => {
      checkDiskSpace(buffer.length);
      const extension = extensionForMime(meta.mime);
      const { id, target } = writeBlobExclusive(buffer, extension);
      const asset = {
        id,
        displayName: name2,
        mime: meta.mime,
        extension,
        byteLength: buffer.length,
        width: meta.width,
        height: meta.height,
        sha256: sha256Hex(buffer),
        createdAt: new Date(now()).toISOString()
      };
      const draft = structuredClone(state);
      draft.library[id] = asset;
      draft.revision += 1;
      try {
        commitState(draft);
      } catch (error) {
        try {
          fs.unlinkSync(target);
        } catch {
        }
        throw error;
      }
      return { asset, revision: draft.revision };
    });
  }
  async function deleteAsset(id) {
    init();
    requireNormal("图片删除");
    if (typeof id !== "string" || !ASSET_ID_PATTERN.test(id)) {
      throw codedError("INVALID_ASSET_ID", "非法的图片 id");
    }
    return enqueue(() => {
      const meta = state.library[id];
      if (meta === void 0) throw codedError("ASSET_NOT_FOUND", "图片不存在");
      const draft = structuredClone(state);
      const affectedSkins = [];
      for (const [skinId, section] of Object.entries(draft.skins)) {
        for (const field of listAssetFields(skinId)) {
          if (section?.[field.key] === id) {
            delete section[field.key];
            affectedSkins.push({ skinId, key: field.key });
          }
        }
      }
      delete draft.library[id];
      draft.revision += 1;
      commitState(draft);
      try {
        fs.unlinkSync(blobFileFor(id, meta.extension));
      } catch {
      }
      gcNow();
      return { revision: draft.revision, affectedSkins };
    });
  }
  function serveAsset(url) {
    init();
    const path = String(url ?? "").split("?")[0];
    const match = /\/dsh-skins\/assets\/([^/]+)$/.exec(path);
    if (match === null) return null;
    const name2 = match[1];
    if (!/^u_[0-9a-f]{32}\.(png|jpe?g|webp|gif)$/.test(name2)) return null;
    const id = name2.split(".")[0];
    const meta = (state.library ?? {})[id];
    if (meta === void 0) return null;
    if (name2 !== `${id}.${meta.extension}`) return null;
    try {
      return { buffer: fs.readFileSync(blobFileFor(id, meta.extension)), meta };
    } catch {
      return null;
    }
  }
  async function confirmRecovery() {
    init();
    if (mode !== "recovery") throw codedError("STORE_NOT_RECOVERING", "当前不在恢复模式");
    return enqueue(() => {
      try {
        if (fs.existsSync(stateFile) && typeof fs.copyFileSync === "function") {
          try {
            fs.copyFileSync(stateFile, `${stateFile}.corrupt.${now()}.json`);
            pruneCorruptBackups();
          } catch {
          }
        }
      } catch {
      }
      const draft = emptyState();
      draft.library = recovery.candidateLibrary;
      draft.revision = 1;
      draft.recoveryCleanup = { quarantine: [...recovery.quarantine] };
      commitState(draft);
      finishRecoveryCleanup();
      mode = "normal";
      recovery = null;
      gcNow();
      return { revision: draft.revision };
    });
  }
  function finishRecoveryCleanup() {
    const pending = state.recoveryCleanup;
    if (pending === void 0) return;
    fs.mkdirSync(quarantineDir, { recursive: true });
    for (const name2 of pending.quarantine) {
      try {
        fs.renameSync(join(assetsDir, name2), join(quarantineDir, name2));
      } catch {
      }
    }
    const cleaned = structuredClone(state);
    delete cleaned.recoveryCleanup;
    commitState(cleaned);
  }
  function pruneCorruptBackups() {
    const dir = join(dataDir);
    if (!fs.existsSync(dir)) return;
    const backups = fs.readdirSync(dir).filter((name2) => name2.startsWith(`${STATE_FILE}.corrupt.`)).sort();
    while (backups.length > CORRUPT_BACKUP_LIMIT) {
      try {
        fs.unlinkSync(join(dir, backups.shift()));
      } catch {
      }
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
    }
  };
}

// src/host/personalization-routes.js
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return void 0;
  }
}
function canonicalAuthority(entry, parsed) {
  const port = parsed.port !== "" ? parsed.port : new URL(`https://${entry}`).port;
  return port === "" ? parsed.hostname : `${parsed.hostname}:${port}`;
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const parsed = parseAuthority(entry);
    if (parsed === void 0) return false;
    return canonicalAuthority(entry, parsed) === parsed.hostname ? parsed.hostname === hostUrl.hostname : parsed.host === hostUrl.host;
  });
}
function isTrustedRequest(request, trustedHosts = []) {
  const host = header(request.headers, "host");
  if (host === void 0) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === void 0) return false;
  const socketAddress = request.socket?.remoteAddress ?? request.info?.remoteAddress;
  if (isLoopbackHostname(hostUrl.hostname)) {
    if (typeof socketAddress === "string") {
      const loopbackPeer = socketAddress === "127.0.0.1" || socketAddress === "::1" || socketAddress === "::ffff:127.0.0.1";
      if (!loopbackPeer) return false;
    }
  } else if (!isTrustedAuthority(hostUrl, trustedHosts)) {
    return false;
  }
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
var CODE_STATUS = {
  INVALID_CONFIG: 400,
  INVALID_ASSET_ID: 400,
  FILENAME_INVALID: 400,
  ASSET_NOT_FOUND: 404,
  UNKNOWN_SKIN: 404,
  UNSUPPORTED_IMAGE: 415,
  ANIMATION_UNSUPPORTED: 415,
  UPLOAD_TOO_LARGE: 413,
  DISK_FULL: 507,
  STORE_READONLY: 409,
  REVISION_CONFLICT: 409,
  STORE_RECOVERY_REQUIRED: 409,
  STORE_NOT_RECOVERING: 409
};
function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(value));
}
function sendError(response, error) {
  const status = CODE_STATUS[error?.code] ?? 500;
  sendJson(response, status, publicError(error));
}
function header(headers, name2) {
  const value = headers?.[name2];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
}
function method(request, response, expected) {
  if (request.method === expected) return true;
  response.writeHead(405, { allow: expected });
  response.end();
  return false;
}
async function readJsonBody(request, limit = 128 * 1024) {
  const type = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!type.startsWith("application/json")) throw codedError("INVALID_CONFIG", "content-type must be application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw codedError("INVALID_CONFIG", "request body too large");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw codedError("INVALID_CONFIG", "请求体不是合法 JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw codedError("INVALID_CONFIG", "invalid request body");
  }
  return value;
}
async function readRawBody(request, limit, overflowCode = "UPLOAD_TOO_LARGE") {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw codedError(overflowCode, "request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function decodeDisplayName(request) {
  const raw = header(request.headers, "x-filename");
  if (raw === void 0 || raw === "") return "wallpaper";
  try {
    return decodeURIComponent(raw);
  } catch {
    throw codedError("FILENAME_INVALID", "x-filename 不是合法的 encodeURIComponent 输出");
  }
}
function mountPersonalizationRoutes(host, options) {
  const { store, assetsBasePath = "/dsh-skins/assets", trustedHosts = [] } = options;
  const disposers = [];
  const fence = (request, response) => {
    if (isTrustedRequest(request, trustedHosts)) return true;
    sendJson(response, 403, { error: "trusted DSH Web request required" });
    return false;
  };
  try {
    const configRoute = host.webServer.register({
      kind: "exact",
      path: "/dsh-skins/config",
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (request.method === "GET") return sendJson(response, 200, store.snapshot());
        if (!method(request, response, "PATCH")) return;
        try {
          const body = await readJsonBody(request);
          const result = await store.applyOperations(body);
          return sendJson(response, 200, result);
        } catch (error) {
          return sendError(response, error);
        }
      }
    });
    disposers.push(configRoute);
    const recoveryRoute = host.webServer.register({
      kind: "exact",
      path: "/dsh-skins/recovery",
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (!method(request, response, "POST")) return;
        try {
          return sendJson(response, 200, await store.confirmRecovery());
        } catch (error) {
          return sendError(response, error);
        }
      }
    });
    disposers.push(recoveryRoute);
    const libraryRoute = host.webServer.register({
      kind: "exact",
      path: "/dsh-skins/library",
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (request.method === "GET") return sendJson(response, 200, store.snapshot());
        if (!method(request, response, "POST")) return;
        try {
          const declaredLength = Number(header(request.headers, "content-length") ?? "0");
          if (declaredLength > GLOBAL_MAX_BYTES) throw codedError("UPLOAD_TOO_LARGE", "图片超过 20MB 上限");
          const buffer = await readRawBody(request, GLOBAL_MAX_BYTES + 1024);
          const displayName = decodeDisplayName(request);
          const declaredMime = header(request.headers, "content-type");
          const result = await store.uploadAsset(buffer, { displayName, declaredMime });
          return sendJson(response, 201, result);
        } catch (error) {
          return sendError(response, error);
        }
      }
    });
    disposers.push(libraryRoute);
    const libraryDeleteRoute = host.webServer.register({
      kind: "prefix",
      path: "/dsh-skins/library",
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (!method(request, response, "DELETE")) return;
        const path = String(request.url ?? "").split("?")[0];
        const match = /\/dsh-skins\/library\/([^/]+)$/.exec(path);
        const suffix = match?.[1] ?? "";
        if (!ASSET_ID_PATTERN.test(suffix)) {
          return sendJson(response, 400, { error: "invalid asset id", code: "INVALID_ASSET_ID" });
        }
        try {
          return sendJson(response, 200, await store.deleteAsset(suffix));
        } catch (error) {
          return sendError(response, error);
        }
      }
    });
    disposers.push(libraryDeleteRoute);
    const assetsRoute = host.webServer.register({
      kind: "prefix",
      path: assetsBasePath,
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (!method(request, response, "GET")) return;
        try {
          const blob = store.serveAsset(String(request.url ?? ""));
          if (blob === null) {
            return sendJson(response, 404, { error: "asset not found", code: "ASSET_NOT_FOUND" });
          }
          response.writeHead(200, {
            "content-type": blob.meta.mime,
            "content-length": blob.meta.byteLength,
            "cache-control": "private, max-age=31536000, immutable",
            etag: `"${blob.meta.sha256}"`,
            "x-content-type-options": "nosniff",
            "cross-origin-resource-policy": "same-origin"
          });
          response.end(blob.buffer);
        } catch (error) {
          return sendError(response, error);
        }
      }
    });
    disposers.push(assetsRoute);
  } catch (error) {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      try {
        disposers[index]();
      } catch {
      }
    }
    throw error;
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// src/index.js
var name = "@iasiv5/dsh-skins";
function dshHome() {
  return process.env.DSH_HOME?.trim() || join2(homedir(), ".dsh");
}
function apply(ctx) {
  ctx.inject(["webServer", "webRuntime"], (hostContext) => {
    const root = dshHome();
    const personalization = createPersonalizationStore({
      dataDir: join2(root, "dsh-skins")
    });
    hostContext.effect(() => {
      return mountPersonalizationRoutes(hostContext, {
        store: personalization,
        trustedHosts: hostContext.webRuntime.trustedHosts
      });
    }, "dsh-skins: personalization routes");
  });
}
export {
  apply,
  name
};
