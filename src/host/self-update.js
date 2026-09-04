import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { codedError } from "./errors.js";
import { atomicWriteText } from "./atomic-write.js";

// npm single channel (ADR-0005): the update check resolves the `latest`
// dist-tag of @iasiv5/dsh-skins on registry.npmjs.org and every install is
// pinned to an exact immutable version. GitHub Releases are no longer the
// update source; github:-spec installs report a legacy source and never
// self-update.
export const PACKAGE_NAME = "@iasiv5/dsh-skins";
export const REPOSITORY = "iasiv5/dsh-skins";
export const REGISTRY_LATEST_URL = "https://registry.npmjs.org/@iasiv5%2Fdsh-skins/latest";
export const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@iasiv5/dsh-skins";
export const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_SCHEMA_VERSION = 2;
const PROFILE_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
const STABLE_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NPM_SELF_SPEC_RE = /^npm:@iasiv5\/dsh-skins@/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseStableVersion(value) {
  const raw = String(value ?? "").trim();
  const version = raw.startsWith("v") ? raw.slice(1) : raw;
  const match = STABLE_VERSION_RE.exec(version);
  if (match === null) return null;
  return {
    version,
    tag: `v${version}`,
    parts: match.slice(1).map(Number),
  };
}

export function compareStableVersions(left, right) {
  const a = parseStableVersion(left);
  const b = parseStableVersion(right);
  if (a === null || b === null) throw new Error("invalid stable semantic version");
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] === b.parts[index]) continue;
    return a.parts[index] > b.parts[index] ? 1 : -1;
  }
  return 0;
}

export function repositoryIdentity(value) {
  const raw = typeof value === "string"
    ? value
    : isRecord(value) && typeof value.url === "string" ? value.url : "";
  return raw
    .trim()
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function detectInstallSource(spec) {
  const value = String(spec ?? "").trim();
  if (/^link:/i.test(value)) return { kind: "link", spec: value };
  if (/^file:/i.test(value) || /\.tgz(?:$|[?#])/i.test(value)) return { kind: "file", spec: value };
  if (/^(?:git\+|github:|git@|ssh:\/\/|https?:\/\/)/i.test(value)) return { kind: "github", spec: value };
  const range = NPM_SELF_SPEC_RE.test(value) ? value.replace(NPM_SELF_SPEC_RE, "") : value;
  if (range === "*" || range === "latest" || /^[\s~^><=]*\d/.test(range)) {
    return { kind: "npm", spec: value };
  }
  return { kind: "unknown", spec: value };
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function readProfileManifest(profileDir) {
  return readJson(join(profileDir, "package.json"), {});
}

export function readInstalledManifest(profileDir) {
  return readJson(join(profileDir, "node_modules", PACKAGE_NAME, "package.json"), null);
}

export function captureProfileSnapshot(profileDir) {
  return PROFILE_FILES.map((name) => {
    const file = join(profileDir, name);
    return {
      name,
      exists: existsSync(file),
      content: existsSync(file) ? readFileSync(file) : null,
    };
  });
}

export function restoreProfileSnapshot(profileDir, snapshot) {
  for (const item of snapshot) {
    const file = join(profileDir, item.name);
    if (item.exists) {
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.rollback`;
      writeFileSync(temporary, item.content);
      renameSync(temporary, file);
    } else if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

function preserveProfileBundles(profileDir, snapshot) {
  const packageSnapshot = snapshot.find((item) => item.name === "package.json" && item.exists);
  if (packageSnapshot?.content === null || packageSnapshot?.content === undefined) return;
  let before;
  try {
    before = JSON.parse(packageSnapshot.content.toString("utf8"));
  } catch {
    return;
  }
  const bundles = before.dsh?.profile?.bundles;
  if (!Array.isArray(bundles) || !bundles.includes(PACKAGE_NAME)) return;
  const current = readProfileManifest(profileDir);
  current.dsh = {
    ...current.dsh,
    profile: {
      ...current.dsh?.profile,
      bundles: [...bundles],
    },
  };
  atomicWriteText(join(profileDir, "package.json"), `${JSON.stringify(current, null, 2)}\n`);
}

function validatePluginManifest(manifest, expectedVersion) {
  if (!isRecord(manifest)) throw codedError("RELEASE_MANIFEST_MISSING", "发布的包缺少 package.json");
  if (manifest.name !== PACKAGE_NAME) {
    throw codedError("RELEASE_NAME_MISMATCH", `发布的包名必须是 ${PACKAGE_NAME}`, { expected: PACKAGE_NAME });
  }
  if (manifest.version !== expectedVersion) {
    throw codedError(
      "RELEASE_VERSION_MISMATCH",
      `发布版本 v${expectedVersion} 与包版本 ${String(manifest.version ?? "missing")} 不一致`,
      { tag: expectedVersion, version: String(manifest.version ?? "missing") },
    );
  }
  if (repositoryIdentity(manifest.repository) !== REPOSITORY.toLowerCase()) {
    throw codedError("RELEASE_REPOSITORY_MISMATCH", `发布的包仓库必须是 ${REPOSITORY}`, { repository: REPOSITORY });
  }
  if (!isRecord(manifest.dsh) || !isRecord(manifest.dsh.client) || manifest.dsh.client.platform !== "web") {
    throw codedError("RELEASE_NOT_WEB_PLUGIN", "发布的包不是 DSH Web 客户端插件");
  }
  if (!isRecord(manifest.dsh.bundle) || typeof manifest.dsh.bundle.patch !== "string") {
    throw codedError("RELEASE_NO_BUNDLE_PATCH", "发布的包未声明 DSH bundle patch");
  }
  return manifest;
}

async function fetchRegistryJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": `${PACKAGE_NAME}/${options.currentVersion ?? "unknown"}`,
    },
    signal: options.signal,
  });
  if (!response.ok) {
    throw codedError(
      "REGISTRY_CHECK_FAILED",
      `npm registry 更新检查失败（HTTP ${response.status}）`,
      { status: response.status },
    );
  }
  return response.json();
}

export async function fetchLatestStableRelease(options = {}) {
  const manifest = await (options.fetchJson ?? fetchRegistryJson)(REGISTRY_LATEST_URL, options);
  if (!isRecord(manifest) || manifest.name !== PACKAGE_NAME) {
    throw codedError("REGISTRY_NAME_MISMATCH", "npm registry latest 返回的包名异常", { expected: PACKAGE_NAME });
  }
  const parsed = parseStableVersion(manifest.version);
  if (parsed === null || manifest.version !== parsed.version) {
    throw codedError(
      "REGISTRY_VERSION_INVALID",
      `npm registry latest 不是严格 X.Y.Z 版本：${String(manifest.version ?? "missing")}`,
      { version: String(manifest.version ?? "missing") },
    );
  }
  return {
    version: parsed.version,
    tag: parsed.tag,
    htmlUrl: `${NPM_PACKAGE_URL}/v/${parsed.version}`,
    name: parsed.tag,
  };
}

export async function resolveReleaseArtifact(release, options = {}) {
  const fetchJson = options.fetchJson ?? fetchRegistryJson;
  // The exact-version document is immutable on the npm registry — it is the
  // authoritative artifact, integrity included.
  const manifest = await fetchJson(
    `https://registry.npmjs.org/@iasiv5%2Fdsh-skins/${release.version}`,
    options,
  );
  if (!isRecord(manifest) || !isRecord(manifest.dist) || typeof manifest.dist.integrity !== "string") {
    throw codedError("REGISTRY_INTEGRITY_MISSING", "npm registry 版本元数据缺少 dist.integrity");
  }
  validatePluginManifest(manifest, release.version);
  return { ...release, manifest, integrity: manifest.dist.integrity };
}

function cachePayload(currentVersion, checkedAt, release) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    currentVersion,
    checkedAt,
    release,
  };
}

function validCachedRelease(value, currentVersion, now, ttlMs) {
  if (!isRecord(value) || value.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
  if (value.currentVersion !== currentVersion) return null;
  if (!Number.isFinite(value.checkedAt) || now - value.checkedAt < 0 || now - value.checkedAt >= ttlMs) return null;
  const release = value.release;
  if (!isRecord(release) || parseStableVersion(release.version) === null) return null;
  if (release.tag !== `v${release.version}` || typeof release.htmlUrl !== "string") return null;
  return { checkedAt: value.checkedAt, release };
}

function publicOperation(operation) {
  if (operation === null) return null;
  return {
    id: operation.id,
    phase: operation.phase,
    message: operation.message,
    startedAt: operation.startedAt,
    ...(operation.finishedAt === undefined ? {} : { finishedAt: operation.finishedAt }),
    ...(operation.error === undefined ? {} : { error: operation.error }),
    ...(operation.rolledBack === undefined ? {} : { rolledBack: operation.rolledBack }),
    ...(operation.release === undefined ? {} : { release: operation.release }),
    ...(operation.code === undefined ? {} : { code: operation.code }),
    ...(operation.params === undefined ? {} : { params: operation.params }),
    ...(operation.rollbackError === undefined ? {} : { rollbackError: operation.rollbackError }),
  };
}

function sourceReason(source) {
  if (source.kind === "link") return "development-link";
  if (source.kind === "file") return "local-file";
  if (source.kind === "github") return "legacy-github";
  if (source.kind !== "npm") return "unsupported-source";
  return null;
}

function validateInstalledState(profileDir, artifact) {
  const profile = readProfileManifest(profileDir);
  const dependency = profile.dependencies?.[PACKAGE_NAME];
  if (typeof dependency !== "string" || dependency !== artifact.version) {
    throw codedError("PROFILE_NOT_PINNED", "profile 未固定到已验证的精确版本");
  }
  if (!Array.isArray(profile.dsh?.profile?.bundles) || !profile.dsh.profile.bundles.includes(PACKAGE_NAME)) {
    throw codedError("PROFILE_BUNDLE_MISSING", "profile 未注册 dsh-skins bundle");
  }
  const installed = readInstalledManifest(profileDir);
  validatePluginManifest(installed, artifact.version);
  return installed;
}

export function createSelfUpdater(options, dependencies = {}) {
  const profileDir = options.profileDir;
  const cacheFile = options.cacheFile;
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const now = dependencies.now ?? Date.now;
  const latestRelease = dependencies.fetchLatestRelease ?? fetchLatestStableRelease;
  const resolveArtifact = dependencies.resolveReleaseArtifact ?? resolveReleaseArtifact;
  const runner = dependencies.runner;
  if (typeof runner !== "function") throw new Error("self updater requires a profile runner");

  let currentVersion = options.currentVersion;
  if (parseStableVersion(currentVersion) === null) throw new Error(`invalid current version ${currentVersion}`);
  let memoryCache = null;
  let operation = null;
  let updatePromise = null;
  let restartRequired = false;

  const readSource = () => {
    const profile = readProfileManifest(profileDir);
    return detectInstallSource(profile.dependencies?.[PACKAGE_NAME]);
  };

  const readCache = () => {
    if (memoryCache !== null) {
      const valid = validCachedRelease(memoryCache, currentVersion, now(), ttlMs);
      if (valid !== null) return valid;
    }
    const disk = readJson(cacheFile, null);
    const valid = validCachedRelease(disk, currentVersion, now(), ttlMs);
    if (valid !== null) memoryCache = disk;
    return valid;
  };

  const writeCache = (checkedAt, release) => {
    memoryCache = cachePayload(currentVersion, checkedAt, release);
    atomicWriteText(cacheFile, `${JSON.stringify(memoryCache, null, 2)}\n`);
  };

  const buildStatus = (release, checkedAt, cached) => {
    const source = readSource();
    const releaseNewer = compareStableVersions(release.version, currentVersion) > 0;
    const disabledReason = sourceReason(source);
    return {
      currentVersion,
      source,
      latest: release,
      checkedAt,
      cached,
      updateAvailable: releaseNewer,
      canUpdate: releaseNewer && disabledReason === null,
      disabledReason,
      restartRequired,
    };
  };

  const status = async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached !== null) return buildStatus(cached.release, cached.checkedAt, true);
    }
    const signal = AbortSignal.timeout(10_000);
    const release = await latestRelease({ currentVersion, signal });
    const checkedAt = now();
    writeCache(checkedAt, release);
    return buildStatus(release, checkedAt, false);
  };

  const setOperation = (patch) => {
    Object.assign(operation, patch);
    if (operation.phase === "done" || operation.phase === "failed") {
      operation.finishedAt = new Date(now()).toISOString();
    }
  };

  const executeUpdate = async () => {
    let snapshot = null;
    let previousSpec = null;
    let previousVersion = null;
    try {
      setOperation({ phase: "checking", message: "正在重新检查最新正式版本" });
      const before = await status(true);
      if (!before.canUpdate) {
        if (before.disabledReason === "development-link") {
          throw codedError("UPDATE_LINK_PROTECTED", "本地 link 开发模式不会被在线更新覆盖");
        }
        if (before.updateAvailable) {
          throw codedError("UPDATE_SOURCE_UNSUPPORTED", "当前安装来源不支持一键更新");
        }
        throw codedError("UPDATE_ALREADY_LATEST", "已经是最新正式版本");
      }

      setOperation({ phase: "preparing", message: "正在验证 npm 版本元数据" });
      const artifact = await resolveArtifact(before.latest, {
        currentVersion,
        signal: AbortSignal.timeout(15_000),
      });
      operation.release = {
        version: artifact.version,
        tag: artifact.tag,
        htmlUrl: artifact.htmlUrl,
      };

      const profile = readProfileManifest(profileDir);
      previousSpec = profile.dependencies?.[PACKAGE_NAME];
      const previousManifest = readInstalledManifest(profileDir);
      previousVersion = previousManifest?.version ?? currentVersion;
      if (detectInstallSource(previousSpec).kind !== "npm") {
        throw codedError("UPDATE_SOURCE_CHANGED", "更新开始前安装来源已变化，请重新打开皮肤切换器");
      }
      validatePluginManifest(previousManifest, previousVersion);
      snapshot = captureProfileSnapshot(profileDir);

      setOperation({ phase: "installing", message: `正在安装 ${artifact.tag}` });
      await runner("web", ["add", `${PACKAGE_NAME}@${artifact.version}`], {
        onChunk: (chunk) => {
          if (String(chunk).trim() !== "") operation.message = `正在安装 ${artifact.tag}`;
        },
      });
      preserveProfileBundles(profileDir, snapshot);

      setOperation({ phase: "validating", message: "正在校验安装结果" });
      validateInstalledState(profileDir, artifact);
      currentVersion = artifact.version;
      restartRequired = true;
      writeCache(now(), {
        version: artifact.version,
        tag: artifact.tag,
        htmlUrl: artifact.htmlUrl,
        name: artifact.name,
      });
      setOperation({ phase: "done", message: `已安装 ${artifact.tag}，重启后生效`, rolledBack: false });
    } catch (error) {
      const original = error instanceof Error ? error : new Error(String(error));
      let rollbackError = null;
      let rolledBack = false;
      if (snapshot !== null && typeof previousSpec === "string" && parseStableVersion(previousVersion) !== null) {
        setOperation({ phase: "rollback", message: "更新失败，正在恢复原版本" });
        try {
          await runner("web", ["add", `${PACKAGE_NAME}@${previousVersion}`], {});
          restoreProfileSnapshot(profileDir, snapshot);
          const restored = readInstalledManifest(profileDir);
          validatePluginManifest(restored, previousVersion);
          const restoredProfile = readProfileManifest(profileDir);
          if (restoredProfile.dependencies?.[PACKAGE_NAME] !== previousSpec) {
            throw codedError("ROLLBACK_LOCKFILE_MISMATCH", "恢复后的版本锁定校验失败");
          }
          if (!Array.isArray(restoredProfile.dsh?.profile?.bundles) || !restoredProfile.dsh.profile.bundles.includes(PACKAGE_NAME)) {
            throw codedError("ROLLBACK_BUNDLE_MISSING", "恢复后的 bundle 注册校验失败");
          }
          rolledBack = true;
        } catch (rollbackFailure) {
          rollbackError = rollbackFailure instanceof Error ? rollbackFailure : new Error(String(rollbackFailure));
          try { restoreProfileSnapshot(profileDir, snapshot); } catch {}
        }
      }
      const message = rollbackError === null
        ? original.message
        : `${original.message}；自动回滚失败：${rollbackError.message}`;
      setOperation({
        phase: "failed",
        message,
        error: message,
        rolledBack,
        ...(original.code === undefined ? {} : { code: original.code }),
        ...(original.params === undefined ? {} : { params: original.params }),
        ...(rollbackError === null ? {} : {
          rollbackError: {
            message: rollbackError.message,
            ...(rollbackError.code === undefined ? {} : { code: rollbackError.code }),
            ...(rollbackError.params === undefined ? {} : { params: rollbackError.params }),
          },
        }),
      });
    } finally {
      updatePromise = null;
    }
  };

  return {
    async status(force = false) {
      return status(force);
    },
    startUpdate() {
      if (updatePromise !== null) return publicOperation(operation);
      operation = {
        id: randomUUID(),
        phase: "queued",
        message: "更新已排队",
        startedAt: new Date(now()).toISOString(),
      };
      updatePromise = executeUpdate();
      return publicOperation(operation);
    },
    currentOperation() {
      return publicOperation(operation);
    },
    get restartRequired() {
      return restartRequired;
    },
  };
}
