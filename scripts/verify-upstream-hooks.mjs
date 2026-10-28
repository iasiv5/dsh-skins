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
 * Manifest — the bubble hashes/containers below are imported from the single
 * source src/client/skins/decoration.js (BUBBLE_HOOKS, ADR-0016): guard and
 * skins consume the same object, so a hash re-derivation is a one-file edit
 * (the ADR-0011 Q3 "keep in sync" comment discipline is retired by
 * construction). Overlay selectors live in src/client/skins/frost-family.js
 * (ADR-0012):
 *   1. exact-hash   BUBBLE_HOOKS.chat.exact still exists in dsh-client-ui-chat
 *                   (union branch 1; ADR-0006)
 *   2. structural   the chat module still has exactly one *_bubble class
 *                   (the user bubble) and the chat container class
 *                   (BUBBLE_HOOKS.chat.container; union branch 2 preconditions)
 *   2b. goal        the goal-panel bubble hook: BUBBLE_HOOKS.goal.exact hash
 *                   and a *_stack container class (ADR-0006 v1.0.4 amendment)
 *   3. whitelist    the page-wide *_bubble inventory across every installed
 *                   @deepseek-ai package stays ⊆ {BUBBLE_HOOKS.chat.exact,
 *                   BUBBLE_HOOKS.goal.exact, ROF66W_bubble (reviewed upstream
 *                   reply bubble, see below)}; a new _bubble class is a new
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
 *   7. shell frame  the Windows-Desktop single-paint alignment (ADR-0009)
 *                   pins the AppFrame structural local names in
 *                   dsh-client-ui-layout: _frame / _sidebarCol class
 *                   selectors, the public data-windows-titlebar marker, the
 *                   published --dsh-windows-content-radius variable, and a
 *                   page-wide inventory that fails when any OTHER package
 *                   ships a *_frame / *_sidebarCol class selector (a new
 *                   false-positive surface for the ADR-0009 selectors)
 *
 * Runtime resolution: $DSH_RUNTIME_ROOT, else ~/.local/share/dsh-runtime.
 * Two layouts are understood: the pnpm store (`node_modules/.pnpm/
 * @deepseek-ai+dsh-*@…`) and the direct desktop-asar form
 * (`node_modules/@deepseek-ai/dsh-*` — point $DSH_RUNTIME_ROOT at an
 * extracted asar's dsh/ directory).
 *
 * Verdicts are machine-distinguishable (ADR-0011) — callers grep stable
 * tokens instead of trusting exit codes that conflate "verified" with
 * "nothing was checked":
 *   upstream-hooks: VERIFIED <mode> — …   runtime present, manifest alive
 *   upstream-hooks: SKIPPED <reason)      no runtime under the root; exit 0
 *                                          (absence is not a code defect;
 *                                          CI provisions a pinned runtime
 *                                          instead — ADR-0011)
 *   upstream-hooks: FAILED (<n> problems) runtime present but drifted; exit 1
 *
 * Judging modes: the pnpm store is the WEB runtime the ADR-0006 exact hashes
 * were derived from → strict mode (hashes are hard requirements). The direct
 * asar layout is the desktop app's OWN frontend build — its css-modules
 * hashes differ per release, so it runs structural mode (single-bubble
 * inventories + container classes must hold; exact hashes are reported, not
 * required; the page-wide bubble whitelist is the runtime's own observed
 * families). The ADR-0007/0009 shell/overlay hooks are structural local
 * names in both modes and are judged identically.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BUBBLE_HOOKS } from "../src/client/skins/decoration.js";

const YELLOW = process.stderr.isTTY ? "\x1b[33m" : "";
const RED = process.stderr.isTTY ? "\x1b[31m" : "";
const RESET = process.stderr.isTTY ? "\x1b[0m" : "";

// BUBBLE_HOOKS values are interpolated into RegExp patterns below; escape
// metacharacters so a future container/local-name value (re-derivation is the
// routine maintenance of that object) can never silently change matching
// semantics (visual-reviewer R1-V1, ADR-0016).
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const runtimeRoot = process.env.DSH_RUNTIME_ROOT || join(homedir(), ".local/share/dsh-runtime");
const pnpmDir = join(runtimeRoot, "node_modules/.pnpm");
const directDir = join(runtimeRoot, "node_modules/@deepseek-ai");

if (!existsSync(pnpmDir) && !existsSync(directDir)) {
	console.error(`${YELLOW}upstream-hooks: SKIPPED (no DSH runtime at ${runtimeRoot}; set DSH_RUNTIME_ROOT to override)${RESET}`);
	process.exit(0);
}

// Collect lib/*.js of every installed @deepseek-ai package, keyed by package
// name (pnpm dir "@deepseek-ai+dsh-client-ui-chat@0.1.2-rc.1_..." →
// node_modules/@deepseek-ai/dsh-client-ui-chat/lib, or the direct asar form
// node_modules/@deepseek-ai/dsh-client-ui-chat/lib).
const packages = new Map(); // name -> [file paths]
const addPackage = (pkg, libDir) => {
	if (!existsSync(libDir)) return;
	const files = readdirSync(libDir).filter((f) => f.endsWith(".js")).map((f) => join(libDir, f));
	if (files.length === 0) return;
	if (!packages.has(pkg)) packages.set(pkg, []);
	packages.get(pkg).push(...files);
};
if (existsSync(pnpmDir)) {
	for (const entry of readdirSync(pnpmDir)) {
		if (!entry.startsWith("@deepseek-ai+dsh-")) continue;
		const pkg = entry.slice("@deepseek-ai+".length, entry.indexOf("@", entry.indexOf("+")));
		addPackage(pkg, join(pnpmDir, entry, "node_modules/@deepseek-ai", pkg, "lib"));
	}
} else {
	for (const entry of readdirSync(directDir)) {
		if (!entry.startsWith("dsh-")) continue;
		addPackage(entry, join(directDir, entry, "lib"));
	}
}

const readAll = (pkg) => (packages.get(pkg) ?? []).map((f) => readFileSync(f, "utf8")).join("\n");
const BUBBLE_TOKEN = /[A-Za-z0-9]+_bubble[A-Za-z0-9]*/g;
const problems = [];

// Judging mode. The ADR-0006 exact hashes were derived from the WEB runtime
// (pnpm store). The desktop app bundles its own frontend build whose
// css-modules hashes differ per release (2026-10-11 audit of the 0.2.0-rc.2
// desktop asar: chat=cJsG2q_bubble, goal=ja1rG_bubble — the exact-hash branch
// never matched there; the structural branch carries the desktop). So: pnpm
// store → strict mode (hashes are hard requirements); direct asar layout →
// structural mode (single-bubble inventories + containers, observed hashes
// reported, never required).
const directAsarLayout = !existsSync(pnpmDir);

// --- manifest checks -------------------------------------------------------
const chat = readAll("dsh-client-ui-chat");
if (chat === "") {
	problems.push("dsh-client-ui-chat is not installed under the runtime — the DOM-hook manifest cannot be evaluated (layout change?)");
} else {
	// 1. exact-hash branch (strict/web mode only)
	const chatBubbles = [...new Set(chat.match(BUBBLE_TOKEN) ?? [])];
	if (!directAsarLayout) {
		if (!chat.includes(BUBBLE_HOOKS.chat.exact)) {
			problems.push(`exact-hash branch dead: "${BUBBLE_HOOKS.chat.exact}" no longer in dsh-client-ui-chat — re-derive the hash and update BUBBLE_HOOKS in src/client/skins/decoration.js (ADR-0006/0016)`);
		}
		if (chatBubbles.length !== 1 || chatBubbles[0] !== BUBBLE_HOOKS.chat.exact) {
			problems.push(`chat module *_bubble inventory is [${chatBubbles.join(", ")}], expected exactly [${BUBBLE_HOOKS.chat.exact}] — the structural branch's "the only _bubble under ${BUBBLE_HOOKS.chat.container} is the user bubble" premise needs re-review (ADR-0006)`);
		}
	} else {
		// structural mode (desktop asar): the fallback branch must stand alone.
		console.error(`${YELLOW}upstream-hooks: desktop build bubble hashes [${chatBubbles.join(", ")}] — exact-hash branch not expected to match here (ADR-0006)${RESET}`);
		if (chatBubbles.length !== 1) {
			problems.push(`chat module *_bubble inventory is [${chatBubbles.join(", ")}], expected exactly one — the structural branch's "the only _bubble under ${BUBBLE_HOOKS.chat.container} is the user bubble" premise needs re-review (ADR-0006)`);
		}
	}
	// 2. structural-branch preconditions (both modes)
	if (!new RegExp(`[A-Za-z0-9]*${escapeRegExp(BUBBLE_HOOKS.chat.container)}`).test(chat)) {
		problems.push(`structural branch dead: no *${BUBBLE_HOOKS.chat.container}* class in dsh-client-ui-chat — the "${BUBBLE_HOOKS.chat.container} > bubble" DOM shape changed (ADR-0006)`);
	}
}

// 2b. goal-panel bubble hook (ADR-0006 v1.0.4 amendment)
const goal = readAll("dsh-client-ui-goal");
if (goal === "") {
	problems.push("dsh-client-ui-goal is not installed under the runtime — the goal-bubble hook manifest cannot be evaluated (layout change?)");
} else {
	const goalBubbles = [...new Set(goal.match(BUBBLE_TOKEN) ?? [])];
	if (!directAsarLayout) {
		if (!goal.includes(BUBBLE_HOOKS.goal.exact)) {
			problems.push(`goal exact-hash branch dead: "${BUBBLE_HOOKS.goal.exact}" no longer in dsh-client-ui-goal — re-derive the hash and update BUBBLE_HOOKS in src/client/skins/decoration.js (ADR-0006 amendment/0016)`);
		}
	} else {
		if (goalBubbles.length !== 1) {
			problems.push(`goal module *_bubble inventory is [${goalBubbles.join(", ")}], expected exactly one — the "stack > bubble" structural premise needs re-review (ADR-0006 amendment)`);
		}
	}
	if (!new RegExp(`[A-Za-z0-9]*${escapeRegExp(BUBBLE_HOOKS.goal.container)}`).test(goal)) {
		problems.push(`goal structural branch dead: no *${BUBBLE_HOOKS.goal.container} container class in dsh-client-ui-goal — the "stack > bubble" DOM shape changed (ADR-0006 amendment)`);
	}
}

// 3. page-wide *_bubble whitelist
// ROF66W_bubble (0.2.0-rc.2 audit): user-questions QuestionReplyView reply
// bubble — themed via --dsw-specific-bubble, its container local name is
// `_row`, so the chat structural sweep can never match it.
// Structural mode (desktop asar) swaps the fixed whitelist for the runtime's
// OWN observed chat/goal/reply families: extra families are still a
// structural-premise break, "vanished" pins are a web-runtime notion only.
const BUBBLE_WHITELIST = new Set([BUBBLE_HOOKS.chat.exact, BUBBLE_HOOKS.goal.exact, "ROF66W_bubble"]);
const foundBubbles = new Map(); // token -> Set<pkg>
for (const [pkg, files] of packages) {
	for (const file of files) {
		for (const token of readFileSync(file, "utf8").match(BUBBLE_TOKEN) ?? []) {
			if (!foundBubbles.has(token)) foundBubbles.set(token, new Set());
			foundBubbles.get(token).add(pkg);
		}
	}
}
if (directAsarLayout) {
	// Structural mode: the runtime's own chat/goal families plus the reviewed
	// user-questions reply bubble (web pin ROF66W_bubble; desktop builds ship
	// the same module under a per-build hash, e.g. v1fjQa_bubble) — its
	// container local name `_row` keeps it out of both structural sweeps.
	const structuralBubbles = new Set([
		...(chat.match(BUBBLE_TOKEN) ?? []),
		...(goal.match(BUBBLE_TOKEN) ?? []),
		...(readAll("dsh-client-ui-user-questions").match(BUBBLE_TOKEN) ?? []),
	]);
	for (const [token, pkgs] of foundBubbles) {
		if (!structuralBubbles.has(token)) {
			problems.push(`new *_bubble class ${token} in ${[...pkgs].join(", ")} — new false-positive surface for [class*="_bubble"], re-review the ADR-0006 selectors`);
		}
	}
} else {
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
// slots.inject / slots.register is NOT anchored here: since 0.2.1-rc.2 the
// ui-slots module no longer ships as a standalone store package — it is
// compiled into the dsh-web-frontend bundle. Its existence is anchored in
// section 6 against the frontend dist module map instead (ADR-0011 附录 P1).
const SERVICE_API_ANCHORS = [
	["dsh-client-ui-theme", ["overrideTokens"], "theme.overrideTokens"],
	["dsh-client-locale", ["register", "translate"], "locale.register / locale.translate"],
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
let frontendChecked = false;
const frontendDir = (() => {
	if (existsSync(pnpmDir)) {
		const entry = readdirSync(pnpmDir).find((e) => e.startsWith("@deepseek-ai+dsh-web-frontend@"));
		if (!entry) return null;
		return join(pnpmDir, entry, "node_modules/@deepseek-ai/dsh-web-frontend/dist/assets");
	}
	const direct = join(directDir, "dsh-web-frontend/dist/assets");
	return existsSync(direct) ? direct : null;
})();
if (!frontendDir || !existsSync(frontendDir)) {
	console.error(`upstream-hooks: frontend dist not found under the runtime — ADR-0007 CSS-hook checks + slots module-map anchor skipped`);
} else {
	frontendChecked = true;
	const css = readdirSync(frontendDir)
		.filter((f) => f.endsWith(".css"))
		.map((f) => readFileSync(join(frontendDir, f), "utf8"))
		.join("\n");
	// 6a. the dockkit float-window shell local name (v2 selector a)
	if (!/\._float_[A-Za-z0-9]+_\d+\{/.test(css)) {
		problems.push('overlay hook dead: "._float_<hash>" no longer in dsh-web-frontend dist CSS — the dockkit float shell class drifted, re-derive [class*="_float_"] (ADR-0007)');
	}
	// 6a-2. the dockkit pane surface (ADR-0009 v7): the fullscreen right
	// panel's opaque backing targets [class*="_pane_"] in the dockkit css.
	if (!/\._pane_[A-Za-z0-9]+_\d+\{/.test(css)) {
		problems.push('overlay hook dead: "._pane_<hash>" no longer in dsh-web-frontend dist CSS — the dockkit pane class drifted, re-derive the ADR-0009 v7 [class*="_pane_"] rule');
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
	// 6e. slots service existence (ADR-0011 附录 P1): since 0.2.1-rc.2 the
	// ui-slots module is compiled into this bundle (module-map key). If the
	// key vanishes, the plugin's client inject (`@deepseek-ai/dsh-client-ui-
	// slots` in package.json dsh.client.inject) fails to resolve at runtime.
	const frontendJs = readdirSync(frontendDir)
		.filter((f) => f.endsWith(".js"))
		.map((f) => readFileSync(join(frontendDir, f), "utf8"))
		.join("\n");
	if (!frontendJs.includes('"@deepseek-ai/dsh-client-ui-slots"')) {
		problems.push('service API drift: slots service — the "@deepseek-ai/dsh-client-ui-slots" module-map key no longer exists in the dsh-web-frontend dist; the plugin client inject will fail to resolve');
	}
}

// 7. shell-frame surface hooks (ADR-0009): the Windows-Desktop single-paint
// alignment pins structural css-modules local names shipped by
// dsh-client-ui-layout's AppFrame. Class-selector-shaped checks only, so JS
// identifiers can never trip them.
const layout = readAll("dsh-client-ui-layout");
if (layout === "") {
	problems.push("dsh-client-ui-layout is not installed under the runtime — the shell-frame hook manifest cannot be evaluated (layout change?)");
} else {
	if (!layout.includes("data-windows-titlebar")) {
		problems.push('shell-frame hook dead: "data-windows-titlebar" no longer in dsh-client-ui-layout — the public Desktop marker drifted (ADR-0009)');
	}
	for (const name of ["frame", "sidebarCol", "rightbarCol"]) {
		// Hashes may be underscore-led (`_2H3hWW_root`, 0.2.0-rc.2 desktop build).
		if (!new RegExp(`\\.[A-Za-z0-9_]+_${name}[{,:\\[.]`).test(layout)) {
			problems.push(`shell-frame hook dead: no .*_${name} class selector in dsh-client-ui-layout — the AppFrame local name drifted, re-derive the ADR-0009 selectors`);
		}
	}
	if (!layout.includes("--dsh-windows-content-radius")) {
		problems.push('shell-frame contract dead: "--dsh-windows-content-radius" no longer published by dsh-client-ui-layout — the 16px content-radius contract drifted (ADR-0009)');
	}
	if (!layout.includes("data-rightbar-col")) {
		problems.push('shell-frame hook dead: "data-rightbar-col" no longer in dsh-client-ui-layout — the right-panel solid-backdrop anchor drifted (ADR-0009 v6)');
	}
	if (!layout.includes("data-rightbar-fullscreen")) {
		problems.push('fullscreen hook dead: "data-rightbar-fullscreen" no longer in dsh-client-ui-layout — the fullscreen-state marker drifted, re-derive the ADR-0020 selectors');
	}
}
// ADR-0009 v2: the third neutralized paint lives on the ui-sidebar root
// (its own `.<hash>_root` paints --dsw-specific-sidebar-fill inside the
// column). DESKTOP-ASAR LAYOUT ONLY (ADR-0011 附录 P3): ADR-0009 rules are
// desktop chrome gated by html[data-windows-titlebar], and the 0.2.1-rc.2
// WEB build no longer ships any *_root class in ui-sidebar (the fill paint
// survives under a different local name) — asserting the desktop paint
// premise against the web store is a category error, same precedent as
// exact-hash being strict-mode-only. Desktop hand-runs still hard-check
// this; the pending desktop re-survey is recorded in ADR-0011 附录.
const sidebarPackage = readAll("dsh-client-ui-sidebar");
if (sidebarPackage === "") {
	problems.push("dsh-client-ui-sidebar is not installed under the runtime — the ADR-0009 v2 sidebar-root hook cannot be evaluated");
} else if (directAsarLayout && !/\.([A-Za-z0-9_]*)_root\{[^}]*background:var\(--dsw-specific-sidebar-fill\)/.test(sidebarPackage)) {
	problems.push('shell-frame hook dead: the sidebar root no longer paints --dsw-specific-sidebar-fill — re-derive the ADR-0009 v2 [class*="_sidebarCol"] > [class*="_root"] rule');
} else if (!directAsarLayout) {
	console.error(`${YELLOW}upstream-hooks: sidebar-root paint premise is desktop-only (ADR-0009 v2) — not judged against the web store (ADR-0011 附录 P3)${RESET}`);
}
// ADR-0020: the dockkit fullscreen panel root (cards carrier, full-window,
// self-gated by its own state attribute) is one of the two frost-base
// surfaces. Pin the marker against its owning package.
const sidebarRight = readAll("dsh-client-ui-sidebar-right");
if (sidebarRight === "") {
	problems.push("dsh-client-ui-sidebar-right is not installed under the runtime — the ADR-0020 dockkit fullscreen panel hook cannot be evaluated");
} else if (!sidebarRight.includes("data-sidebar-right-panel")) {
	problems.push('fullscreen hook dead: "data-sidebar-right-panel" no longer in dsh-client-ui-sidebar-right — the dockkit fullscreen panel marker drifted, re-derive the ADR-0020 selectors');
}
// Page-wide inventory: [class*="_frame"] / [class*="_sidebarCol"] /
// [class*="_rightbarCol"] must only ever match the AppFrame pair. Any OTHER
// package shipping one of these class selectors is a new false-positive
// surface and forces a re-review instead of silently widening the selectors
// (rightbarCol's whitelist is layout-only — ADR-0020, impl-review P1).
const SHELL_LOCAL_NAMES = ["frame", "sidebarCol", "centerCol", "rightbarCol"];
const shellInventory = new Map(); // local name -> Set<pkg>
for (const name of SHELL_LOCAL_NAMES) {
	// [A-Za-z0-9_]+ — hashes may be underscore-led (see section 7 note above).
	const pattern = new RegExp(`\\.[A-Za-z0-9_]+_${name}[{,:\\[.]`);
	const found = new Set();
	for (const [pkg, files] of packages) {
		for (const file of files) {
			if (pattern.test(readFileSync(file, "utf8"))) found.add(pkg);
		}
	}
	shellInventory.set(name, found);
	// Reviewed false-positive surfaces (2026-10-11, 0.2.0-rc.2 desktop asar +
	// web runtime): five more packages ship their own `.<hash>_frame` panels.
	// They can never match the ADR-0009 selectors — rule 1 requires a DIRECT
	// [class*="_sidebarCol"] child (:has anchor), rule 2 targets only the
	// parent of a _sidebarCol, and _sidebarCol stays unique to the AppFrame
	// (its own inventory below). A package appearing here without a guard
	// entry is still a hard fail; entries record the reviewed set.
	// 2026-10-19 (ADR-0011 附录 P2): dsh-client-ui-attachment ships an
	// attachment tile/thumbnail `._frame` — no _sidebarCol child, it can
	// never match rule 1 or rule 2.
	// ADR-0020: rightbarCol is the layout AppFrame's own structural face — its
	// whitelist is the strictest (layout only). settings-shell ships no such
	// class and has no reviewed basis to shelter it, so it must not ride the
	// shared non-frame reviewed set (impl-review P1).
	const reviewed = name === "rightbarCol"
		? new Set(["dsh-client-ui-layout"])
		: name === "frame"
			? new Set([
				"dsh-client-ui-layout",
				"dsh-client-ui-chat",
				"dsh-client-ui-sidebar-browser",
				"dsh-client-ui-sidebar-documentpreview",
				"dsh-client-ui-subagent",
				"dsh-client-ui-user-questions",
				"dsh-client-ui-attachment",
			])
			: new Set(["dsh-client-ui-layout", "dsh-client-ui-settings-shell"]);
	const unexpected = [...found].filter((pkg) => !reviewed.has(pkg));
	if (unexpected.length > 0) {
		// Memo (impl-review B3): a future structural face joining
		// SHELL_LOCAL_NAMES extends this parameterized pattern — its own
		// reviewed branch above and its own ADR reference here.
		const adr = name === "rightbarCol" ? "ADR-0020" : "ADR-0009";
		problems.push(`new *_${name} class selector in ${unexpected.join(", ")} — new false-positive surface for the ${adr} [class*="_${name}"] selectors, re-review them`);
	}
}

// --- report ----------------------------------------------------------------
if (problems.length > 0) {
	for (const problem of problems) console.error(`${RED}upstream-hooks: ${problem}${RESET}`);
	console.error(`${RED}upstream-hooks: FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"})${RESET}`);
	process.exit(1);
}
const bubbles = [...foundBubbles.keys()].sort().join(", ");
const bubbleSummary = directAsarLayout
	? `desktop structural mode: single-bubble inventories + ${BUBBLE_HOOKS.chat.container}/${BUBBLE_HOOKS.goal.container} containers alive; page *_bubble = {${bubbles}}`
	: `${BUBBLE_HOOKS.chat.exact} alive; chat *_bubble = [${BUBBLE_HOOKS.chat.exact}]; ${BUBBLE_HOOKS.chat.container} alive; goal ${BUBBLE_HOOKS.goal.exact} + ${BUBBLE_HOOKS.goal.container} alive; page *_bubble = {${bubbles}}`;
const modeSummary = directAsarLayout ? "structural-mode (desktop asar layout)" : "strict-mode (pnpm store layout)";
const overlaySummary = frontendChecked
	? "overlay hooks alive (_float_/_dialog_/_pane_/_float* whitelist/mask+menu tokens + slots module map)"
	: "overlay hooks NOT CHECKED (frontend dist absent under the runtime)";
const sidebarRootSummary = directAsarLayout
	? "sidebar-root paint alive"
	: "sidebar-root paint NOT JUDGED (desktop-only premise, ADR-0011 附录 P3)";
console.log(`✓ upstream-hooks: VERIFIED ${modeSummary} — ${bubbleSummary}; dark attr alive; service-API anchors alive; ${overlaySummary}; shell-frame hooks alive (_frame/_sidebarCol/_rightbarCol/titlebar marker/content-radius/fullscreen marker); ${sidebarRootSummary} (${packages.size} @deepseek-ai packages scanned)`);
