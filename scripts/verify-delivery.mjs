#!/usr/bin/env node
/**
 * Delivery gate (verify:delivery): prove the PACKED artifact boots and serves,
 * not merely that it parses. Born from the 1.5.22 incident post-mortem: the
 * release chain's "Minimal host load test" only imported lib/index.js and
 * checked `typeof apply === "function"` — apply(ctx) was never invoked, so a
 * whole class of artifact-level failures (missing packaged assets, boot-time
 * route wiring, host-contract drift) shipped green.
 *
 * What this gate does:
 *   1. `pnpm pack` the working tree into a temp dir and extract it — the gate
 *      exercises exactly the tarball npm would publish, never the workspace.
 *   2. Boot the extracted `lib/index.js` through the plugin's host contract
 *      (facts pinned against dsh-host-webserver 0.2.1-rc.5 and src/index.js):
 *        ctx.inject(["webServer"], cb) — services list is exact;
 *        cb(host) with host.webServer.register(route) → sync disposer;
 *        host.effect(setup, "dsh-skins: personalization routes") — setup runs
 *        synchronously, its return value is the disposer;
 *        ctx.get() must only ever be asked for "webStartup"/"webRuntime"
 *        (trusted-hosts.js fallback chain), lazily, never throwing the mount.
 *   3. Serve the captured routes over a real `node:http` listener. Handlers
 *      are written against native IncomingMessage/ServerResponse (upstream
 *      dispatch is literally `await route.handler(req, res)`), so the only
 *      upstream semantics we replicate is the ~10-line exact-then-longest-
 *      prefix match. Accepted trade-off: if upstream ever changes dispatch
 *      order, upstream's own tests own that; our gate owns "boot + serve".
 *      Bind 127.0.0.1, send no Origin and no cross-site sec-fetch-site — the
 *      plugin's own trust fence (routes.js isTrustedRequest) passes without
 *      simulating webStartup at all.
 *   4. Assert, in two stages:
 *      Stage 1 (always, today's baseline): five routes registered with the
 *      expected path/kind sequence; GET /dsh-skins/config answers 200 with a
 *      JSON snapshot; dispose tears down exactly the five registrations.
 *      Stage 2 (when the package ships assets/manifest.json, i.e. after the
 *      ADR-0023 replay): every packaged asset file must answer 200 over its
 *      b_ route with immutable caching and an etag; an unknown b_ key must
 *      answer a discernible non-200 (fail-open contract) without crashing
 *      the host; `lib/client.js` must carry the `?v=<version>` literal and
 *      zero __DSH_SKINS_ASSET_REV__ residue (verified by verify-bundle-guard,
 *      gated on the same manifest presence).
 *   5. Disposal symmetry: effect disposers run, all five route disposals fire.
 *
 * Environment: DSH_HOME is pointed at a temp dir (mount is fs-free; the store
 * initializes lazily on first request). cwd stays wherever the gate is run
 * from — deliberately NOT "$DSH_HOME/profiles/desktop", which would flip
 * hostProfileFor to desktop semantics and trigger a one-time migration copy.
 *
 * Wired into `pnpm run check` (after verify:hooks, before the lib-sync diff)
 * and therefore into release.yml ahead of publish. `tar` is assumed on PATH
 * (GNU tar on Linux CI, bsdtar shipped with Windows 10+/macOS).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_NAME = "@iasiv5/dsh-skins";
const EFFECT_LABEL = "dsh-skins: personalization routes";
const EXPECTED_ROUTES = [
	{ kind: "exact", path: "/dsh-skins/config" },
	{ kind: "exact", path: "/dsh-skins/recovery" },
	{ kind: "exact", path: "/dsh-skins/library" },
	{ kind: "prefix", path: "/dsh-skins/library" },
	{ kind: "prefix", path: "/dsh-skins/assets" },
];

const problems = [];
const problem = (message) => problems.push(message);
let port = 0; // assigned once the gate's listener is up; read by get()

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;

const workDir = mkdtempSync(join(tmpdir(), "dsh-skins-delivery-"));
const packDir = join(workDir, "pack");
const extractDir = join(workDir, "extracted");
const dshHome = join(workDir, "dsh-home");
const packageDir = join(extractDir, "package");

function run(label, command, args, options = {}) {
	const result = spawnSync(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], ...options });
	if (result.status !== 0) {
		problem(`${label} failed (exit ${result.status}): ${(result.stderr || result.stdout || "").toString().trim().slice(-400)}`);
	}
	return result;
}

/** The ~10 upstream lines this gate deliberately re-owns: exact first, then longest prefix. */
function dispatch(routes) {
	const exact = new Map(routes.filter((route) => route.kind === "exact").map((route) => [route.path, route]));
	const prefixes = routes
		.filter((route) => route.kind === "prefix")
		.sort((a, b) => b.path.length - a.path.length);
	return async (request, response) => {
		const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
		const route = exact.get(pathname) ?? prefixes.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`));
		if (!route) {
			response.writeHead(404, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: "not found" }));
			return;
		}
		try {
			await route.handler(request, response);
		} catch (error) {
			console.warn(`[verify:delivery] handler threw on ${pathname}:`, error?.message ?? error);
			if (response.headersSent) response.destroy();
			else {
				response.writeHead(400, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: "bad request" }));
			}
		}
	};
}

function listen(dispatcher) {
	return new Promise((resolveListen, rejectListen) => {
		const server = createServer(dispatcher);
		server.once("error", rejectListen);
		server.listen(0, "127.0.0.1", () => resolveListen(server));
	});
}

const get = (path) =>
	fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5_000) });

try {
	// --- 1. pack + extract the exact npm artifact ----------------------------
	run("pnpm pack", "pnpm", ["pack", "--pack-destination", packDir]);
	const tarballs = existsSync(packDir) ? readdirSync(packDir).filter((name) => /^iasiv5-dsh-skins-\d+\.\d+\.\d+.*\.tgz$/.test(name)) : [];
	if (tarballs.length !== 1) {
		problem(`expected exactly one packed tarball in ${packDir}, got ${tarballs.length}`);
	} else {
		mkdirSync(extractDir, { recursive: true });
		run("tar extract", "tar", ["-xzf", join(packDir, tarballs[0]), "-C", extractDir]);
	}
	if (problems.length > 0) throw new Error("artifact preparation failed");

	// --- 2. boot through the exact host contract -----------------------------
	process.env.DSH_HOME = dshHome;
	const plugin = await import(pathToFileURL(join(packageDir, "lib", "index.js")).href);
	if (plugin.name !== PACKAGE_NAME) problem(`bad package name: ${plugin.name}`);
	if (typeof plugin.apply !== "function") problem("apply() missing");

	const routes = [];
	let routeDisposals = 0;
	const effectDisposers = [];
	const host = {
		webServer: {
			register(route) {
				routes.push(route);
				return () => {
					routeDisposals += 1;
				};
			},
		},
		effect(setup, label) {
			if (label !== EFFECT_LABEL) problem(`unexpected effect label: ${label}`);
			effectDisposers.push(setup());
		},
	};
	const ctx = {
		inject(services, callback) {
			if (JSON.stringify(services) !== JSON.stringify(["webServer"])) problem(`inject services must be exactly ["webServer"], got ${JSON.stringify(services)}`);
			callback(host);
		},
		get(service) {
			if (service === "webStartup" || service === "webRuntime") return undefined; // trusted-hosts degrades to []
			throw new Error(`unexpected service lookup: ${service}`);
		},
	};

	plugin.apply(ctx);

	if (routes.length !== EXPECTED_ROUTES.length) {
		problem(`expected ${EXPECTED_ROUTES.length} registered routes, got ${routes.length}`);
	} else {
		for (let index = 0; index < EXPECTED_ROUTES.length; index += 1) {
			const expected = EXPECTED_ROUTES[index];
			const actual = routes[index];
			if (actual?.kind !== expected.kind || actual?.path !== expected.path) {
				problem(`route[${index}]: expected ${expected.kind} ${expected.path}, got ${actual?.kind} ${actual?.path}`);
			}
		}
	}

	// --- 3. real HTTP over the captured routes -------------------------------
	const server = await listen(dispatch(routes));
	port = server.address().port;

	// Stage 1: the host answers, with a parseable config snapshot.
	const configResponse = await get("/dsh-skins/config");
	if (configResponse.status !== 200) problem(`/dsh-skins/config expected 200, got ${configResponse.status}`);
	else {
		const snapshot = await configResponse.json().catch(() => null);
		if (!snapshot || typeof snapshot !== "object") problem("/dsh-skins/config did not return a JSON object");
		else if (!Number.isFinite(snapshot.revision)) problem("/dsh-skins/config snapshot has no numeric revision");
	}

	// Stage 2: only when the package ships the builtin-asset manifest.
	const manifestPath = join(packageDir, "assets", "manifest.json");
	if (existsSync(manifestPath)) {
		const assetFiles = [];
		const walk = (dir) => {
			for (const entry of readdirSync(dir)) {
				const full = join(dir, entry);
				if (statSync(full).isDirectory()) walk(full);
				else if (entry !== "manifest.json") assetFiles.push(full);
			}
		};
		walk(join(packageDir, "assets"));
		if (assetFiles.length === 0) problem("assets/manifest.json shipped but the assets dir holds no files");
		JSON.parse(readFileSync(manifestPath, "utf8")); // must at least be valid JSON (trusted metadata)

		const clientText = readFileSync(join(packageDir, "lib", "client.js"), "utf8");
		if (!clientText.includes(`?v=${version}`)) problem(`lib/client.js lacks the ?v=${version} asset-rev literal`);
		if (clientText.includes("__DSH_SKINS_ASSET_REV__")) problem("lib/client.js carries unresolved __DSH_SKINS_ASSET_REV__");

		for (const file of assetFiles) {
			const key = file.slice(packageDir.length);
			const assetResponse = await get(`/dsh-skins/assets${key}?v=${version}`);
			if (assetResponse.status !== 200) {
				problem(`asset ${key}: expected 200, got ${assetResponse.status}`);
				continue;
			}
			const cacheControl = assetResponse.headers.get("cache-control") ?? "";
			if (!cacheControl.includes("immutable")) problem(`asset ${key}: cache-control lacks immutable (${cacheControl || "none"})`);
			if (!assetResponse.headers.get("etag")) problem(`asset ${key}: missing etag`);
			if (!(assetResponse.headers.get("content-type") ?? "").startsWith("image/")) problem(`asset ${key}: unexpected content-type ${assetResponse.headers.get("content-type")}`);
		}

		// Fail-open negative control: an unknown b_ key must be a discernible
		// non-200 and must not take the host down with it.
		const miss = await get(`/dsh-skins/assets/b_missing-skin_missing-key.webp?v=${version}`);
		if (miss.status === 200) problem("negative control: unknown b_ key unexpectedly served 200");
		const stillAlive = await get("/dsh-skins/config");
		if (stillAlive.status !== 200) problem(`negative control: host degraded after b_ miss (config → ${stillAlive.status})`);
		console.log(`verify:delivery: builtin-asset assertions ran over ${assetFiles.length} packaged file(s)`);
	} else {
		console.log("verify:delivery: builtin-asset assertions SKIPPED (no assets/manifest.json in package — pre-ADR-0023-replay baseline)");
	}

	// --- 4. disposal symmetry -------------------------------------------------
	for (const disposer of effectDisposers) disposer?.();
	if (routeDisposals !== EXPECTED_ROUTES.length) problem(`expected ${EXPECTED_ROUTES.length} route disposals, got ${routeDisposals}`);

	server.close();
} catch (error) {
	problem(error?.message ?? String(error));
}

if (problems.length > 0) {
	for (const item of problems) console.error(`verify:delivery: ${item}`);
	console.error(`verify:delivery: FAILED — forensic artifact kept at ${workDir}`);
	process.exit(1);
}
rmSync(workDir, { recursive: true, force: true });
console.log(`✓ verify:delivery OK — packed artifact boots, serves config${existsSync(join(extractDir, "package", "assets", "manifest.json")) ? ", serves all packaged assets" : ""}, disposes symmetrically`);
