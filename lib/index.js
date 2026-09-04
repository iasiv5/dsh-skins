// src/index.js
import { readFileSync as readFileSync3 } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname4, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";

// src/host/restart.js
import { spawn } from "node:child_process";

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

// src/host/restart.js
var RELAUNCH_HELPER = String.raw`
const { spawn } = require('node:child_process')
const [parentPid, executable, cwd, argsJson] = process.argv.slice(1)
const args = JSON.parse(argsJson)
const waitForParent = () => {
  try {
    process.kill(Number(parentPid), 0)
    setTimeout(waitForParent, 100)
  } catch {
    setTimeout(() => {
      const child = spawn(executable, args, {
        cwd,
        env: process.env,
        detached: false,
        stdio: 'ignore',
      })
      child.once('error', () => process.exit(1))
      child.once('exit', code => process.exit(code == null ? 1 : code))
    }, 750)
  }
}
waitForParent()
`;
var MANAGED_RESTART_EXIT_CODE = 75;
function serviceManagedEnv(env) {
  return typeof env === "object" && env !== null && (env.INVOCATION_ID !== void 0 || env.NOTIFY_SOCKET !== void 0);
}
function createRestartScheduler(exit, overrides = {}) {
  if (typeof exit !== "function") return { available: false, schedule() {
  } };
  const runtime = {
    execPath: process.execPath,
    argv: [...process.argv],
    cwd: process.cwd(),
    env: process.env,
    pid: process.pid,
    spawn,
    setTimeout,
    ...overrides
  };
  let scheduled = false;
  return {
    available: true,
    schedule() {
      if (scheduled) return;
      scheduled = true;
      if (serviceManagedEnv(runtime.env)) {
        const managed = runtime.setTimeout(() => exit(MANAGED_RESTART_EXIT_CODE), 150);
        managed.unref?.();
        return;
      }
      const helper = runtime.spawn(runtime.execPath, [
        "-e",
        RELAUNCH_HELPER,
        String(runtime.pid),
        runtime.execPath,
        runtime.cwd,
        JSON.stringify(runtime.argv.slice(1))
      ], {
        cwd: runtime.cwd,
        env: runtime.env,
        detached: true,
        stdio: "ignore"
      });
      helper.unref();
      const timer = runtime.setTimeout(() => exit(0), 150);
      timer.unref?.();
    }
  };
}
function agentList(agents) {
  if (agents === null || agents === void 0 || typeof agents.list !== "function") return null;
  try {
    const list = agents.list();
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}
function restartSafety(agents) {
  const list = agentList(agents);
  if (list === null) return { state: "unknown", running: null };
  const running = list.filter((agent) => agent?.status === "running").length;
  return { state: running > 0 ? "blocked" : "safe", running };
}
async function waitForRestartSafety(agents, confirmUnknown = false) {
  const list = agentList(agents);
  if (list === null) {
    if (!confirmUnknown) {
      throw codedError("RESTART_SAFETY_UNKNOWN", "无法确认 Agent 运行状态，请再次确认后重启");
    }
    return { state: "unknown", running: null };
  }
  const running = list.filter((agent) => agent?.status === "running").length;
  if (running > 0) {
    throw codedError("AGENTS_RUNNING", `检测到 ${running} 个 Agent 正在运行，请等待任务结束后再重启`, { count: running });
  }
  await Promise.all(list.map((agent) => typeof agent?.whenIdle === "function" ? agent.whenIdle() : void 0));
  const after = agentList(agents);
  if (after === null) {
    if (!confirmUnknown) {
      throw codedError("RESTART_SAFETY_UNKNOWN", "复核 Agent 状态失败，请再次确认后重启");
    }
    return { state: "unknown", running: null };
  }
  const started = after.filter((agent) => agent?.status === "running").length;
  if (started > 0) {
    throw codedError("AGENTS_RUNNING", `检测到 ${started} 个 Agent 刚刚开始运行，请稍后再重启`, { count: started });
  }
  return { state: "safe", running: 0 };
}

// src/host/routes.js
function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}
function header(headers, name2) {
  const value = headers?.[name2];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
}
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
async function readJsonBody(request, limit = 4096) {
  const type = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!type.startsWith("application/json")) throw new Error("content-type must be application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid request body");
  return value;
}
function method(request, response, expected) {
  if (request.method === expected) return true;
  response.writeHead(405, { allow: expected });
  response.end();
  return false;
}
function mountUpdateRoutes(host, options) {
  const { updater, restart, agents, trustedHosts = [] } = options;
  const updateRoute = host.webServer.register({
    kind: "exact",
    path: "/dsh-skins/update",
    handler: async (request, response) => {
      if (!isTrustedRequest(request, trustedHosts)) return sendJson(response, 403, { error: "trusted DSH Web request required" });
      if (request.method === "GET") {
        const url = new URL(request.url ?? "/", "http://localhost");
        const force = url.searchParams.get("force") === "1" && request.headers["x-dsh-skins-force"] === "1";
        try {
          const status = await updater.status(force);
          return sendJson(response, 200, {
            ...status,
            operation: updater.currentOperation(),
            restartRequired: updater.restartRequired,
            restartAvailable: restart.available === true,
            restartSafety: restartSafety(agents)
          });
        } catch (error) {
          return sendJson(response, 502, {
            ...publicError(error),
            operation: updater.currentOperation(),
            restartRequired: updater.restartRequired,
            restartAvailable: restart.available === true,
            restartSafety: restartSafety(agents)
          });
        }
      }
      if (!method(request, response, "POST")) return;
      try {
        return sendJson(response, 202, { operation: updater.startUpdate() });
      } catch (error) {
        return sendJson(response, 409, publicError(error));
      }
    }
  });
  const restartRoute = host.webServer.register({
    kind: "exact",
    path: "/dsh-skins/restart",
    handler: async (request, response) => {
      if (!isTrustedRequest(request, trustedHosts)) return sendJson(response, 403, { error: "trusted DSH Web request required" });
      if (!method(request, response, "POST")) return;
      if (restart.available !== true) {
        return sendJson(response, 501, publicError(codedError("RESTART_UNAVAILABLE", "当前 DSH Host 不支持自重启")));
      }
      if (!updater.restartRequired) {
        return sendJson(response, 409, publicError(codedError("NO_PENDING_UPDATE", "当前没有等待重启应用的更新")));
      }
      try {
        const body = await readJsonBody(request);
        const confirmUnknown = body.confirmUnknown === true;
        await waitForRestartSafety(agents, confirmUnknown);
        sendJson(response, 202, { restarting: true });
        restart.schedule();
      } catch (error) {
        sendJson(response, 409, {
          ...publicError(error),
          restartSafety: restartSafety(agents)
        });
      }
    }
  });
  return () => {
    restartRoute();
    updateRoute();
  };
}

// src/host/self-update.js
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync as mkdirSync2,
  readFileSync,
  renameSync as renameSync2,
  unlinkSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { dirname as dirname2, join } from "node:path";

// src/host/atomic-write.js
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function atomicWriteText(file, content, fs = { mkdirSync, writeFileSync, renameSync }) {
  fs.mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

// src/host/self-update.js
var PACKAGE_NAME = "@iasiv5/dsh-skins";
var REPOSITORY = "iasiv5/dsh-skins";
var REGISTRY_LATEST_URL = "https://registry.npmjs.org/@iasiv5%2Fdsh-skins/latest";
var NPM_PACKAGE_URL = "https://www.npmjs.com/package/@iasiv5/dsh-skins";
var CACHE_TTL_MS = 60 * 60 * 1e3;
var CACHE_SCHEMA_VERSION = 2;
var PROFILE_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
var STABLE_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
var NPM_SELF_SPEC_RE = /^npm:@iasiv5\/dsh-skins@/i;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseStableVersion(value) {
  const raw = String(value ?? "").trim();
  const version = raw.startsWith("v") ? raw.slice(1) : raw;
  const match = STABLE_VERSION_RE.exec(version);
  if (match === null) return null;
  return {
    version,
    tag: `v${version}`,
    parts: match.slice(1).map(Number)
  };
}
function compareStableVersions(left, right) {
  const a = parseStableVersion(left);
  const b = parseStableVersion(right);
  if (a === null || b === null) throw new Error("invalid stable semantic version");
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] === b.parts[index]) continue;
    return a.parts[index] > b.parts[index] ? 1 : -1;
  }
  return 0;
}
function repositoryIdentity(value) {
  const raw = typeof value === "string" ? value : isRecord(value) && typeof value.url === "string" ? value.url : "";
  return raw.trim().replace(/^git\+/, "").replace(/^git@github\.com:/i, "").replace(/^ssh:\/\/git@github\.com\//i, "").replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "").toLowerCase();
}
function detectInstallSource(spec) {
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
function readProfileManifest(profileDir) {
  return readJson(join(profileDir, "package.json"), {});
}
function readInstalledManifest(profileDir) {
  return readJson(join(profileDir, "node_modules", PACKAGE_NAME, "package.json"), null);
}
function captureProfileSnapshot(profileDir) {
  return PROFILE_FILES.map((name2) => {
    const file = join(profileDir, name2);
    return {
      name: name2,
      exists: existsSync(file),
      content: existsSync(file) ? readFileSync(file) : null
    };
  });
}
function restoreProfileSnapshot(profileDir, snapshot) {
  for (const item of snapshot) {
    const file = join(profileDir, item.name);
    if (item.exists) {
      mkdirSync2(dirname2(file), { recursive: true });
      const temporary = `${file}.${process.pid}.rollback`;
      writeFileSync2(temporary, item.content);
      renameSync2(temporary, file);
    } else if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}
function preserveProfileBundles(profileDir, snapshot) {
  const packageSnapshot = snapshot.find((item) => item.name === "package.json" && item.exists);
  if (packageSnapshot?.content === null || packageSnapshot?.content === void 0) return;
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
      bundles: [...bundles]
    }
  };
  atomicWriteText(join(profileDir, "package.json"), `${JSON.stringify(current, null, 2)}
`);
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
      { tag: expectedVersion, version: String(manifest.version ?? "missing") }
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
      "user-agent": `${PACKAGE_NAME}/${options.currentVersion ?? "unknown"}`
    },
    signal: options.signal
  });
  if (!response.ok) {
    throw codedError(
      "REGISTRY_CHECK_FAILED",
      `npm registry 更新检查失败（HTTP ${response.status}）`,
      { status: response.status }
    );
  }
  return response.json();
}
async function fetchLatestStableRelease(options = {}) {
  const manifest = await (options.fetchJson ?? fetchRegistryJson)(REGISTRY_LATEST_URL, options);
  if (!isRecord(manifest) || manifest.name !== PACKAGE_NAME) {
    throw codedError("REGISTRY_NAME_MISMATCH", "npm registry latest 返回的包名异常", { expected: PACKAGE_NAME });
  }
  const parsed = parseStableVersion(manifest.version);
  if (parsed === null || manifest.version !== parsed.version) {
    throw codedError(
      "REGISTRY_VERSION_INVALID",
      `npm registry latest 不是严格 X.Y.Z 版本：${String(manifest.version ?? "missing")}`,
      { version: String(manifest.version ?? "missing") }
    );
  }
  return {
    version: parsed.version,
    tag: parsed.tag,
    htmlUrl: `${NPM_PACKAGE_URL}/v/${parsed.version}`,
    name: parsed.tag
  };
}
async function resolveReleaseArtifact(release, options = {}) {
  const fetchJson = options.fetchJson ?? fetchRegistryJson;
  const manifest = await fetchJson(
    `https://registry.npmjs.org/@iasiv5%2Fdsh-skins/${release.version}`,
    options
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
    release
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
    ...operation.finishedAt === void 0 ? {} : { finishedAt: operation.finishedAt },
    ...operation.error === void 0 ? {} : { error: operation.error },
    ...operation.rolledBack === void 0 ? {} : { rolledBack: operation.rolledBack },
    ...operation.release === void 0 ? {} : { release: operation.release },
    ...operation.code === void 0 ? {} : { code: operation.code },
    ...operation.params === void 0 ? {} : { params: operation.params },
    ...operation.rollbackError === void 0 ? {} : { rollbackError: operation.rollbackError }
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
function createSelfUpdater(options, dependencies = {}) {
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
      const valid2 = validCachedRelease(memoryCache, currentVersion, now(), ttlMs);
      if (valid2 !== null) return valid2;
    }
    const disk = readJson(cacheFile, null);
    const valid = validCachedRelease(disk, currentVersion, now(), ttlMs);
    if (valid !== null) memoryCache = disk;
    return valid;
  };
  const writeCache = (checkedAt, release) => {
    memoryCache = cachePayload(currentVersion, checkedAt, release);
    atomicWriteText(cacheFile, `${JSON.stringify(memoryCache, null, 2)}
`);
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
      restartRequired
    };
  };
  const status = async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached !== null) return buildStatus(cached.release, cached.checkedAt, true);
    }
    const signal = AbortSignal.timeout(1e4);
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
        signal: AbortSignal.timeout(15e3)
      });
      operation.release = {
        version: artifact.version,
        tag: artifact.tag,
        htmlUrl: artifact.htmlUrl
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
        }
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
        name: artifact.name
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
          try {
            restoreProfileSnapshot(profileDir, snapshot);
          } catch {
          }
        }
      }
      const message = rollbackError === null ? original.message : `${original.message}；自动回滚失败：${rollbackError.message}`;
      setOperation({
        phase: "failed",
        message,
        error: message,
        rolledBack,
        ...original.code === void 0 ? {} : { code: original.code },
        ...original.params === void 0 ? {} : { params: original.params },
        ...rollbackError === null ? {} : {
          rollbackError: {
            message: rollbackError.message,
            ...rollbackError.code === void 0 ? {} : { code: rollbackError.code },
            ...rollbackError.params === void 0 ? {} : { params: rollbackError.params }
          }
        }
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
        startedAt: new Date(now()).toISOString()
      };
      updatePromise = executeUpdate();
      return publicOperation(operation);
    },
    currentOperation() {
      return publicOperation(operation);
    },
    get restartRequired() {
      return restartRequired;
    }
  };
}

// src/host/runner.js
import { spawn as spawn2 } from "node:child_process";
import { dirname as dirname3, resolve } from "node:path";
var COMMAND_TIMEOUT_MS = 10 * 60 * 1e3;
var WINDOWS_METACHARS = /[\s"&|<>^()%!]/;
function quoteWindowsArg(value) {
  if (!WINDOWS_METACHARS.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
function spawnPortable(file, args, options) {
  const { viaShell = false, ...spawnOptions } = options;
  if (process.platform !== "win32" || viaShell !== true) {
    return spawn2(file, args, { ...spawnOptions, shell: false });
  }
  const commandLine = [file, ...args].map(quoteWindowsArg).join(" ");
  return spawn2(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], {
    ...spawnOptions,
    shell: false,
    windowsVerbatimArguments: true
  });
}
function currentDshInvocation() {
  const entry = process.argv[1];
  if (entry !== void 0 && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const absolute = resolve(entry);
    return {
      file: process.execPath,
      prefix: [...process.execArgv, absolute],
      cwd: dirname3(absolute),
      viaShell: false
    };
  }
  return { file: "dsh", prefix: [], cwd: void 0, viaShell: process.platform === "win32" };
}
function runDshPlugin(profile, args, options = {}) {
  const invocation = options.invocation ?? currentDshInvocation();
  const argv = [...invocation.prefix, "plugin", "--profile", profile, ...args, "--reporter=ndjson"];
  return new Promise((resolvePromise, reject) => {
    const child = spawnPortable(invocation.file, argv, {
      cwd: invocation.cwd,
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      viaShell: invocation.viaShell
    });
    let output = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise(output);
    };
    const append = (chunk) => {
      const text = String(chunk);
      output = (output + text).slice(-256 * 1024);
      options.onChunk?.(text);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", finish);
    child.on("close", (code) => {
      if (code === 0) finish();
      else {
        const tail = output.trim().slice(-1200) || "no output";
        finish(codedError(
          "UPDATE_COMMAND_FAILED",
          `DSH 插件更新失败（exit ${String(code)}）：${tail}`,
          { exitCode: String(code), output: tail }
        ));
      }
    });
    const timer = setTimeout(() => {
      if (child.pid !== void 0) {
        try {
          if (process.platform === "win32") child.kill("SIGTERM");
          else process.kill(-child.pid, "SIGTERM");
        } catch {
        }
      }
      finish(codedError("UPDATE_COMMAND_TIMEOUT", "DSH 插件更新超时"));
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    timer.unref?.();
  });
}

// src/host/personalization/store.js
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync as existsSync2,
  mkdirSync as mkdirSync3,
  openSync,
  readFileSync as readFileSync2,
  readdirSync,
  renameSync as renameSync3,
  rmdirSync,
  statfsSync,
  statSync,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync3
} from "node:fs";
import { join as join2 } from "node:path";

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
  tgcf: {
    builtinAssets: {
      // Registry mirrors the grid: the factory default (moonlit) leads.
      moonlit: { mime: "image/webp", labelKey: "personalization.tgcf.moonlit" },
      crimson: { mime: "image/webp", labelKey: "personalization.tgcf.crimson" },
      pale: { mime: "image/webp", labelKey: "personalization.tgcf.pale" },
      "seal-favicon": { mime: "image/webp" }
    },
    fields: [
      // Factory default rides moonlit (花怜 · 月下同伞) since the 1.0.0
      // wallpaper addition; it leads the grid (user ruling) and its label
      // carries the （默认壁纸） suffix. crimson/pale remain selectable, and
      // stored overrides are untouched by the default flip.
      { ...WALLPAPER_FIELD, default: "builtin:tgcf:moonlit", builtinChoices: ["moonlit", "crimson", "pale"] },
      {
        key: "slogan",
        type: "text",
        scope: "locale",
        labelKey: "personalization.slogan",
        maxLength: 40,
        default: { zh: "百无禁忌", en: "No Taboos" }
      },
      {
        // Ruling #14: ONE translucency knob. It drives the panel tint, the
        // wallpaper scrim and the blur as one combined visual (the curve
        // lives in the tgcf projector, calibrated through the historical
        // defaults P=82 → scrim 30 / blur 12); the blur/scrim fields are
        // retired — pre-1.0.0 there are no external users to migrate.
        // Ruling #15: factory default 10; ruling #17 re-tunes it to 30 —
        // a faint veil so menus read while the wallpaper still leads;
        // 1.0.0 re-tunes it to 35 (user) for a touch more panel presence.
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
  },
  // ADR-0004 (reversing design §9a): every catalog skin declares the same
  // standard field set. The legacy skins' catalog slogan defaults are
  // same-source with their factories' static `slogans`, and panelOpacity
  // default 55 anchors the derived projection to the baked alpha strings —
  // the byte-equivalence invariant is pinned by the projector tests.
  // Legacy wallpaper semantics (scrim never applies to user images,
  // placeholder branch) live inside each skin's project() branches.
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
  // 美人志（出厂皮肤，注册顺序第一位）：6 张内置精选，出厂默认 yuntai
  // （001合照）领头并对齐 tgcf 的「出厂默认领先」惯例；panelOpacity 锚定
  // tgcf 二次曲线（projector 数学见 skins/meirenzhi/index.js）。
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
    existsSync: existsSync2,
    mkdirSync: mkdirSync3,
    readFileSync: readFileSync2,
    writeFileSync: writeFileSync3,
    renameSync: renameSync3,
    unlinkSync: unlinkSync2,
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
  const stateFile = join2(dataDir, STATE_FILE);
  const assetsDir = join2(dataDir, ASSETS_DIR);
  const quarantineDir = join2(dataDir, QUARANTINE_DIR);
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
    return join2(assetsDir, `${id}.${extension}`);
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
    const file = join2(assetsDir, name2);
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
          fs.unlinkSync(join2(assetsDir, name2));
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
      const id = ASSET_ID_PREFIX + randomUUID2().replaceAll("-", "");
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
        fs.renameSync(join2(assetsDir, name2), join2(quarantineDir, name2));
      } catch {
      }
    }
    const cleaned = structuredClone(state);
    delete cleaned.recoveryCleanup;
    commitState(cleaned);
  }
  function pruneCorruptBackups() {
    const dir = join2(dataDir);
    if (!fs.existsSync(dir)) return;
    const backups = fs.readdirSync(dir).filter((name2) => name2.startsWith(`${STATE_FILE}.corrupt.`)).sort();
    while (backups.length > CORRUPT_BACKUP_LIMIT) {
      try {
        fs.unlinkSync(join2(dir, backups.shift()));
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
function sendJson2(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(value));
}
function sendError(response, error) {
  const status = CODE_STATUS[error?.code] ?? 500;
  sendJson2(response, status, publicError(error));
}
function header2(headers, name2) {
  const value = headers?.[name2];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
}
function method2(request, response, expected) {
  if (request.method === expected) return true;
  response.writeHead(405, { allow: expected });
  response.end();
  return false;
}
async function readJsonBody2(request, limit = 128 * 1024) {
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
  const raw = header2(request.headers, "x-filename");
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
    sendJson2(response, 403, { error: "trusted DSH Web request required" });
    return false;
  };
  try {
    const configRoute = host.webServer.register({
      kind: "exact",
      path: "/dsh-skins/config",
      handler: async (request, response) => {
        if (!fence(request, response)) return;
        if (request.method === "GET") return sendJson2(response, 200, store.snapshot());
        if (!method2(request, response, "PATCH")) return;
        try {
          const body = await readJsonBody2(request);
          const result = await store.applyOperations(body);
          return sendJson2(response, 200, result);
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
        if (!method2(request, response, "POST")) return;
        try {
          return sendJson2(response, 200, await store.confirmRecovery());
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
        if (request.method === "GET") return sendJson2(response, 200, store.snapshot());
        if (!method2(request, response, "POST")) return;
        try {
          const declaredLength = Number(header2(request.headers, "content-length") ?? "0");
          if (declaredLength > GLOBAL_MAX_BYTES) throw codedError("UPLOAD_TOO_LARGE", "图片超过 20MB 上限");
          const buffer = await readRawBody(request, GLOBAL_MAX_BYTES + 1024);
          const displayName = decodeDisplayName(request);
          const declaredMime = header2(request.headers, "content-type");
          const result = await store.uploadAsset(buffer, { displayName, declaredMime });
          return sendJson2(response, 201, result);
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
        if (!method2(request, response, "DELETE")) return;
        const path = String(request.url ?? "").split("?")[0];
        const match = /\/dsh-skins\/library\/([^/]+)$/.exec(path);
        const suffix = match?.[1] ?? "";
        if (!ASSET_ID_PATTERN.test(suffix)) {
          return sendJson2(response, 400, { error: "invalid asset id", code: "INVALID_ASSET_ID" });
        }
        try {
          return sendJson2(response, 200, await store.deleteAsset(suffix));
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
        if (!method2(request, response, "GET")) return;
        try {
          const blob = store.serveAsset(String(request.url ?? ""));
          if (blob === null) {
            return sendJson2(response, 404, { error: "asset not found", code: "ASSET_NOT_FOUND" });
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
function packageRoot() {
  return join3(dirname4(fileURLToPath(import.meta.url)), "..");
}
function packageVersion() {
  const manifest = JSON.parse(readFileSync3(join3(packageRoot(), "package.json"), "utf8"));
  if (typeof manifest.version !== "string") throw new Error("dsh-skins package.json 缺少版本号");
  return manifest.version;
}
function dshHome() {
  return process.env.DSH_HOME?.trim() || join3(homedir(), ".dsh");
}
function apply(ctx) {
  ctx.inject(["webServer", "agents", "webRuntime"], (hostContext) => {
    const root = dshHome();
    const profileDir = join3(root, "profiles", "web");
    const updater = createSelfUpdater({
      profileDir,
      cacheFile: join3(root, "dsh-skins", "update-cache.json"),
      currentVersion: packageVersion()
    }, {
      runner: runDshPlugin
    });
    const restart = createRestartScheduler(ctx.get("appExit"));
    const personalization = createPersonalizationStore({
      dataDir: join3(root, "dsh-skins")
    });
    hostContext.effect(() => {
      let disposeUpdate = null;
      let disposePersonalization = null;
      try {
        disposeUpdate = mountUpdateRoutes(hostContext, {
          updater,
          restart,
          agents: hostContext.agents,
          trustedHosts: hostContext.webRuntime.trustedHosts
        });
        disposePersonalization = mountPersonalizationRoutes(hostContext, {
          store: personalization,
          trustedHosts: hostContext.webRuntime.trustedHosts
        });
      } catch (error) {
        disposePersonalization?.();
        disposeUpdate?.();
        throw error;
      }
      return () => {
        disposePersonalization();
        disposeUpdate();
      };
    }, "dsh-skins: self-update routes");
  });
}
export {
  apply,
  createSelfUpdater,
  name
};
