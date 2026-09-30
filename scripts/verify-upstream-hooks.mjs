#!/usr/bin/env node
/**
 * Upstream-hooks guard (ADR-0006): the hooks dsh-skins decorations pin against
 * upstream build artifacts must still exist in the installed DSH runtime.
 *
 * Why: css-modules hash classes drift on every upstream rebuild (0.1.2-rc.1
 * rebuilt .gdEzaW_bubble away and moved the MessageItem styles from the
 * conversation package to chat), and nothing else in `pnpm run check`
 * observes the real runtime — bundle-guard is a wallpaper size gate,
 * smoke-test runs against DOM stubs. This script is the missing tripwire:
 * hook drift fails `check` at upgrade time instead of being discovered by
 * eye weeks later.
 *
 * Manifest (keep in sync with the selectors in src/client/skins/*):
 *   1. exact-hash   .Sixlwa_bubble still exists in dsh-client-ui-chat
 *                   (union branch 1; ADR-0006)
 *   2. structural   the chat module still has exactly one *_bubble class
 *                   (the user bubble) and a *userStack* container class
 *                   (union branch 2 preconditions)
 *   2b. goal        the goal-panel bubble hook: oRe1gG_bubble exact hash and
 *                   a *_stack container class (ADR-0006 v1.0.4 amendment)
 *   3. whitelist    the page-wide *_bubble inventory across every installed
 *                   @deepseek-ai package stays ⊆ {Sixlwa_bubble,
 *                   oRe1gG_bubble}; a new _bubble class is a new
 *                   false-positive surface for [class*="_bubble"] and forces
 *                   a re-review instead of silently widening the selector
 *   4. dark hook    body[data-ds-dark-theme] is still shipped by the theme
 *                   package (every dark variant rule keys off it)
 *   5. service API  the client/host service methods this plugin consumes are
 *                   still exported by the corresponding runtime packages:
 *                   theme.overrideTokens, locale.register/translate,
 *                   slots.inject/register, connection.isLoopback,
 *                   webServer.register, webRuntime.trustedHosts
 *   6. overlay CSS  the v2 overlay-frost structural hooks still exist in the
 *                   dsh-web-frontend dist stylesheet: _float_ shell local
 *                   name, _dialog_ local name, the _float* local-name
 *                   whitelist, and the --dsw-mask-blur /
 *                   --dsw-menu-backdrop-filter token definitions (ADR-0007)
 *
 * Runtime resolution: $DSH_RUNTIME_ROOT, else ~/.local/share/dsh-runtime.
 * No runtime installed → yellow skip, exit 0 (CI has no runtime; absence is
 * not a code defect). Runtime present but drifted → exit 1.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const YELLOW = process.stderr.isTTY ? "\x1b[33m" : "";
const RED = process.stderr.isTTY ? "\x1b[31m" : "";
const RESET = process.stderr.isTTY ? "\x1b[0m" : "";

const runtimeRoot = process.env.DSH_RUNTIME_ROOT || join(homedir(), ".local/share/dsh-runtime");
const pnpmDir = join(runtimeRoot, "node_modules/.pnpm");

if (!existsSync(pnpmDir)) {
	console.error(`${YELLOW}upstream-hooks: no DSH runtime at ${runtimeRoot} — skipping (set DSH_RUNTIME_ROOT to override)${RESET}`);
	process.exit(0);
}

// Collect lib/*.js of every installed @deepseek-ai package, keyed by package
// name (pnpm dir "@deepseek-ai+dsh-client-ui-chat@0.1.2-rc.1_..." →
// node_modules/@deepseek-ai/dsh-client-ui-chat/lib).
const packages = new Map(); // name -> [file paths]
for (const entry of readdirSync(pnpmDir)) {
	if (!entry.startsWith("@deepseek-ai+dsh-")) continue;
	const pkg = entry.slice("@deepseek-ai+".length, entry.indexOf("@", entry.indexOf("+")));
	const libDir = join(pnpmDir, entry, "node_modules/@deepseek-ai", pkg, "lib");
	if (!existsSync(libDir)) continue;
	const files = readdirSync(libDir).filter((f) => f.endsWith(".js")).map((f) => join(libDir, f));
	if (files.length > 0) packages.set(pkg, files);
}

const readAll = (pkg) => (packages.get(pkg) ?? []).map((f) => readFileSync(f, "utf8")).join("\n");
const BUBBLE_TOKEN = /[A-Za-z0-9]+_bubble[A-Za-z0-9]*/g;
const problems = [];

// --- manifest checks -------------------------------------------------------
const chat = readAll("dsh-client-ui-chat");
if (chat === "") {
	problems.push("dsh-client-ui-chat is not installed under the runtime — the DOM-hook manifest cannot be evaluated (layout change?)");
} else {
	// 1. exact-hash branch
	if (!chat.includes("Sixlwa_bubble")) {
		problems.push('exact-hash branch dead: "Sixlwa_bubble" no longer in dsh-client-ui-chat — re-derive the hash and update src/client/skins/* (ADR-0006)');
	}
	// 2. structural-branch preconditions
	const chatBubbles = [...new Set(chat.match(BUBBLE_TOKEN) ?? [])];
	if (chatBubbles.length !== 1 || chatBubbles[0] !== "Sixlwa_bubble") {
		problems.push(`chat module *_bubble inventory is [${chatBubbles.join(", ")}], expected exactly [Sixlwa_bubble] — the structural branch's "the only _bubble under userStack is the user bubble" premise needs re-review (ADR-0006)`);
	}
	if (!/[A-Za-z0-9]*userStack/.test(chat)) {
		problems.push('structural branch dead: no *userStack* class in dsh-client-ui-chat — the "userStack > bubble" DOM shape changed (ADR-0006)');
	}
}

// 2b. goal-panel bubble hook (ADR-0006 v1.0.4 amendment)
const goal = readAll("dsh-client-ui-goal");
if (goal === "") {
	problems.push("dsh-client-ui-goal is not installed under the runtime — the goal-bubble hook manifest cannot be evaluated (layout change?)");
} else {
	if (!goal.includes("oRe1gG_bubble")) {
		problems.push('goal exact-hash branch dead: "oRe1gG_bubble" no longer in dsh-client-ui-goal — re-derive the hash and update src/client/skins/* (ADR-0006 amendment)');
	}
	if (!/[A-Za-z0-9]*_stack/.test(goal)) {
		problems.push('goal structural branch dead: no *_stack container class in dsh-client-ui-goal — the "stack > bubble" DOM shape changed (ADR-0006 amendment)');
	}
}

// 3. page-wide *_bubble whitelist
// ROF66W_bubble (0.2.0-rc.2 audit): user-questions QuestionReplyView reply
// bubble — themed via --dsw-specific-bubble, its container local name is
// `_row`, so branch 2 ([class*="userStack"] > …) can never sweep it.
const BUBBLE_WHITELIST = new Set(["Sixlwa_bubble", "oRe1gG_bubble", "ROF66W_bubble"]);
const foundBubbles = new Map(); // token -> Set<pkg>
for (const [pkg, files] of packages) {
	for (const file of files) {
		for (const token of readFileSync(file, "utf8").match(BUBBLE_TOKEN) ?? []) {
			if (!foundBubbles.has(token)) foundBubbles.set(token, new Set());
			foundBubbles.get(token).add(pkg);
		}
	}
}
for (const [token, pkgs] of foundBubbles) {
	if (!BUBBLE_WHITELIST.has(token)) {
		problems.push(`new *_bubble class ${token} in ${[...pkgs].join(", ")} — new false-positive surface for [class*="_bubble"], re-review the ADR-0006 selectors`);
	}
}
for (const token of BUBBLE_WHITELIST) {
	if (!foundBubbles.has(token)) {
		problems.push(`whitelisted bubble class ${token} vanished from the runtime — update BUBBLE_WHITELIST (ADR-0006 manifest)`);
	}
}

// 4. dark-mode attribute hook
const theme = readAll("dsh-client-ui-theme");
if (theme === "") {
	problems.push("dsh-client-ui-theme is not installed — the dark-hook check cannot be evaluated (layout change?)");
} else if (!theme.includes("data-ds-dark-theme")) {
	problems.push('dark hook dead: "data-ds-dark-theme" no longer shipped by dsh-client-ui-theme — every [data-ds-dark-theme] rule in src/client/skins/* is orphaned');
}

// 5. service API anchors (2026-09-28 audit): methods skins calls on injected
// services. Scoped per package so generic names ("register") stay meaningful;
// a missing anchor means that injected-service call site will throw at runtime.
const SERVICE_API_ANCHORS = [
	["dsh-client-ui-theme", ["overrideTokens"], "theme.overrideTokens"],
	["dsh-client-locale", ["register", "translate"], "locale.register / locale.translate"],
	["dsh-client-ui-slots", ["inject", "register"], "slots.inject / slots.register"],
	["dsh-client-connection", ["isLoopback"], "connection.isLoopback"],
	["dsh-host-webserver", ["register"], "webServer.register"],
	["dsh-web-app", ["trustedHosts"], "webRuntime.trustedHosts"],
];
for (const [pkg, anchors, label] of SERVICE_API_ANCHORS) {
	const source = readAll(pkg);
	if (source === "") {
		problems.push(`${pkg} is not installed under the runtime — the service-API anchor for ${label} cannot be evaluated`);
		continue;
	}
	for (const anchor of anchors) {
		if (!source.includes(anchor)) {
			problems.push(`service API drift: ${label} — "${anchor}" no longer found in ${pkg}; the skins call site will fail at runtime`);
		}
	}
}

// 6. frontend dist CSS hooks (ADR-0007): the v2 overlay-frost union pins
// structural local names that live in the web-frontend stylesheet, not in
// lib/*.js — resolved from the dsh-web-frontend package's dist/assets.
const frontendDir = (() => {
	const entry = readdirSync(pnpmDir).find((e) => e.startsWith("@deepseek-ai+dsh-web-frontend@"));
	if (!entry) return null;
	return join(pnpmDir, entry, "node_modules/@deepseek-ai/dsh-web-frontend/dist/assets");
})();
if (!frontendDir || !existsSync(frontendDir)) {
	console.error(`upstream-hooks: frontend dist not found under the runtime — ADR-0007 CSS-hook checks skipped`);
} else {
	const css = readdirSync(frontendDir)
		.filter((f) => f.endsWith(".css"))
		.map((f) => readFileSync(join(frontendDir, f), "utf8"))
		.join("\n");
	// 6a. the dockkit float-window shell local name (v2 selector a)
	if (!/\._float_[A-Za-z0-9]+_\d+\{/.test(css)) {
		problems.push('overlay hook dead: "._float_<hash>" no longer in dsh-web-frontend dist CSS — the dockkit float shell class drifted, re-derive [class*="_float_"] (ADR-0007)');
	}
	// 6b. the host dialog local name (v2 selector b)
	if (!/\._dialog_[A-Za-z0-9]+_\d+\{/.test(css)) {
		problems.push('overlay hook dead: "._dialog_<hash>" no longer in dsh-web-frontend dist CSS — the host dialog class drifted, re-derive [class*="_dialog_"] (ADR-0007)');
	}
	// 6c. _float* local-name whitelist: v2 selector a must not grow false
	// positives. floatTitle/floatBody/floatResize/floatHeader/floatingCell
	// contain the "_float" prefix but not the "_float_" substring (next char
	// is a letter) — the selector only ever hits the shell.
	const FLOAT_WHITELIST = new Set(["float", "floatBody", "floatHeader", "floatResize", "floatTitle", "floatingCell"]);
	const foundFloats = new Set([...css.matchAll(/\._(float[A-Za-z0-9]*)_[A-Za-z0-9]+_\d+\{/g)].map((m) => m[1]));
	for (const token of foundFloats) {
		if (!FLOAT_WHITELIST.has(token)) {
			problems.push(`new *_float* class ${token} in dsh-web-frontend — new false-positive surface for [class*="_float_"], re-review the ADR-0007 selectors`);
		}
	}
	for (const token of FLOAT_WHITELIST) {
		if (!foundFloats.has(token)) {
			problems.push(`whitelisted float class _${token}_ vanished from the frontend dist — update FLOAT_WHITELIST (ADR-0007 manifest)`);
		}
	}
	// 6d. the two self-frost tokens the skins rely on without overriding are
	// defined by the theme client, not the frontend stylesheet
	const themeCss = readAll("dsh-client-ui-theme");
	for (const token of ["--dsw-mask-blur", "--dsw-menu-backdrop-filter"]) {
		if (!themeCss.includes(`${token}:`)) {
			problems.push(`overlay token dead: "${token}" no longer defined by dsh-client-ui-theme — mask/menu self-frost assumptions broke (ADR-0007)`);
		}
	}
}

// --- report ----------------------------------------------------------------
if (problems.length > 0) {
	for (const problem of problems) console.error(`${RED}upstream-hooks: ${problem}${RESET}`);
	process.exit(1);
}
const bubbles = [...foundBubbles.keys()].sort().join(", ");
console.log(`✓ upstream hooks OK: Sixlwa_bubble alive; chat *_bubble = [Sixlwa_bubble]; userStack alive; goal oRe1gG_bubble + _stack alive; page *_bubble = {${bubbles}}; dark attr alive; service-API anchors alive; overlay hooks alive (_float_/_dialog_/_float* whitelist/mask+menu tokens) (${packages.size} @deepseek-ai packages scanned)`);
