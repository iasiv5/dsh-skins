import { restartSafety, waitForRestartSafety } from "./restart.js";
import { codedError, publicError } from "./errors.js";

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

function canonicalAuthority(entry, parsed) {
  const port = parsed.port !== "" ? parsed.port : new URL(`https://${entry}`).port;
  return port === "" ? parsed.hostname : `${parsed.hostname}:${port}`;
}

function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const parsed = parseAuthority(entry);
    if (parsed === undefined) return false;
    return canonicalAuthority(entry, parsed) === parsed.hostname
      ? parsed.hostname === hostUrl.hostname
      : parsed.host === hostUrl.host;
  });
}

/** Mirror DSH's browser-trust fence for privileged local Host routes. */
export function isTrustedRequest(request, trustedHosts = []) {
  const host = header(request.headers, "host");
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  const socketAddress = request.socket?.remoteAddress
    ?? request.info?.remoteAddress;
  if (isLoopbackHostname(hostUrl.hostname)) {
    // A loopback Host claim must come from a loopback TCP peer: the Host
    // header is client-controlled and trivially spoofed when the server
    // listens on a non-loopback interface. (When no socket info exists —
    // unit-test harnesses — the header check stands as before.)
    if (typeof socketAddress === "string") {
      const loopbackPeer = socketAddress === "127.0.0.1" || socketAddress === "::1"
        || socketAddress === "::ffff:127.0.0.1";
      if (!loopbackPeer) return false;
    }
  } else if (!isTrustedAuthority(hostUrl, trustedHosts)) {
    return false;
  }
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined) return true;
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

export function mountUpdateRoutes(host, options) {
  const { updater, restart, agents, trustedHosts = [] } = options;
  const updateRoute = host.webServer.register({
    kind: "exact",
    path: "/dsh-skins/update",
    handler: async (request, response) => {
      if (!isTrustedRequest(request, trustedHosts)) return sendJson(response, 403, { error: "trusted DSH Web request required" });
      if (request.method === "GET") {
        const url = new URL(request.url ?? "/", "http://localhost");
        const force = url.searchParams.get("force") === "1"
          && request.headers["x-dsh-skins-force"] === "1";
        try {
          const status = await updater.status(force);
          return sendJson(response, 200, {
            ...status,
            operation: updater.currentOperation(),
            restartRequired: updater.restartRequired,
            restartAvailable: restart.available === true,
            restartSafety: restartSafety(agents),
          });
        } catch (error) {
          return sendJson(response, 502, {
            ...publicError(error),
            operation: updater.currentOperation(),
            restartRequired: updater.restartRequired,
            restartAvailable: restart.available === true,
            restartSafety: restartSafety(agents),
          });
        }
      }
      if (!method(request, response, "POST")) return;
      try {
        return sendJson(response, 202, { operation: updater.startUpdate() });
      } catch (error) {
        return sendJson(response, 409, publicError(error));
      }
    },
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
          restartSafety: restartSafety(agents),
        });
      }
    },
  });

  return () => {
    restartRoute();
    updateRoute();
  };
}
