/**
 * Personalization HTTP routes (design §4). Handlers do trust fencing, HTTP
 * codec and error mapping ONLY — every state change goes through the
 * PersonalizationStore's serialized queue.
 *
 * DSH WebServer supports exact/prefix registrations only; dynamic segments
 * are parsed inside the handler and every suffix is validated against a
 * strict pattern before it is ever used to locate a file (paths are rebuilt
 * from trusted library metadata, never from raw request bytes).
 */

import { codedError, publicError } from "./errors.js";
import { isTrustedRequest } from "./routes.js";
import { ASSET_ID_PATTERN, GLOBAL_MAX_BYTES } from "../shared/personalization/catalog.js";

const CODE_STATUS = {
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
  STORE_NOT_RECOVERING: 409,
};

function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

function sendError(response, error) {
  const status = CODE_STATUS[error?.code] ?? 500;
  sendJson(response, status, publicError(error));
}

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
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

/** Decode the display-name header: exactly one decode, bounded, sanitized. */
function decodeDisplayName(request) {
  const raw = header(request.headers, "x-filename");
  if (raw === undefined || raw === "") return "wallpaper";
  try {
    return decodeURIComponent(raw);
  } catch {
    throw codedError("FILENAME_INVALID", "x-filename 不是合法的 encodeURIComponent 输出");
  }
}

export function mountPersonalizationRoutes(host, options) {
  const { store, assetsBasePath = "/dsh-skins/assets", trustedHosts = [] } = options;
  const disposers = [];

  const fence = (request, response) => {
    if (isTrustedRequest(request, trustedHosts)) return true;
    sendJson(response, 403, { error: "trusted DSH Web request required" });
    return false;
  };

  // Registration is itself transactional: a mid-mount throw disposes every
  // route registered so far instead of leaking partial mounts.
  try {

  // --- config: GET snapshot / PATCH field operations ------------------------

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
    },
  });
  disposers.push(configRoute);

  // --- recovery confirmation (branch A commit) ------------------------------

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
    },
  });
  disposers.push(recoveryRoute);

  // --- library: GET list / POST upload (exact) -------------------------------

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
    },
  });
  disposers.push(libraryRoute);

  // --- library: DELETE /{id} (prefix; suffix strictly validated) -------------

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
    },
  });
  disposers.push(libraryDeleteRoute);

  // --- assets: GET /{file} (prefix; path rebuilt from trusted metadata) ------

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
          "cross-origin-resource-policy": "same-origin",
        });
        response.end(blob.buffer);
      } catch (error) {
        return sendError(response, error);
      }
    },
  });
  disposers.push(assetsRoute);

  } catch (error) {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      try { disposers[index](); } catch {}
    }
    throw error;
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}
