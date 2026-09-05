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
 *   3. whitelist    the page-wide *_bubble inventory across every installed
 *                   @deepseek-ai package stays ⊆ {Sixlwa_bubble,
 *                   oRe1gG_bubble}; a new _bubble class is a new
 *                   false-positive surface for [class*="_bubble"] and forces
 *                   a re-review instead of silently widening the selector
 *   4. dark hook    body[data-ds-dark-theme] is still shipped by the theme
 *                   package (every dark variant rule keys off it)
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

// 3. page-wide *_bubble whitelist
const BUBBLE_WHITELIST = new Set(["Sixlwa_bubble", "oRe1gG_bubble"]); // chat user bubble; goal-panel bubble
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

// --- report ----------------------------------------------------------------
if (problems.length > 0) {
	for (const problem of problems) console.error(`${RED}upstream-hooks: ${problem}${RESET}`);
	process.exit(1);
}
const bubbles = [...foundBubbles.keys()].sort().join(", ");
console.log(`✓ upstream hooks OK: Sixlwa_bubble alive; chat *_bubble = [Sixlwa_bubble]; userStack alive; page *_bubble = {${bubbles}}; dark attr alive (${packages.size} @deepseek-ai packages scanned)`);
