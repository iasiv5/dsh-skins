// Smoke test: simulate the DSH client module loader + DOM, run apply()/dispose,
// and exercise the multi-skin engine (registry, initial mount, live switch,
// sidebar registration, remote theme persistence and independent skin switching).
const fs = require("fs");
const path = require("path");

const pluginSrc = fs.readFileSync(path.join(__dirname, "lib/client.js"), "utf8");

// ---- minimal DOM stubs ----
function makeEl(tag) {
	return {
		tagName: tag, rel: "", type: "", href: "", textContent: "",
		dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] ?? ""; } },
		children: [], removed: false,
		append(c) { c.parentElement = this; this.children.push(c); },
		appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
		remove() {
			this.removed = true;
			// Real DOM semantics: removal detaches the node from its parent so
			// later querySelector lookups cannot "resurrect" it (the runtime
			// relies on this when rebuilding style tags).
			if (this.parentElement && this.parentElement.children) {
				const index = this.parentElement.children.indexOf(this);
				if (index >= 0) this.parentElement.children.splice(index, 1);
			}
		},
		get className() { return ""; },
	};
}
const head = { ...makeEl("head"), querySelector() { return null; }, querySelectorAll() { return [makeEl("link")]; } };
const body = { ...makeEl("body"), dataset: {}, style: makeEl("b").style };

global.document = {
	title: "DeepSeek Harness",
	body, head,
	createElement: (t) => makeEl(t),
	querySelector: () => null,
};

class MutationObserver {
	constructor(cb) { this.cb = cb; (global.__mutationObservers ??= []).push(this); }
	observe() {}
	disconnect() { this.disconnected = true; }
}
global.MutationObserver = MutationObserver;

const storage = new Map([["dsh-skins:theme-preference", "dark"]]);
global.localStorage = {
	getItem(key) { return storage.has(key) ? storage.get(key) : null; },
	setItem(key, value) { storage.set(key, String(value)); }
};

// ---- module loader stub ----
const registrations = {};
let stateOverrides = null;
global.window = {
	__ModuleLoader__: {
		load(reg) { registrations[reg.id] = reg.factory((spec) => {
			if (spec === "react/jsx-runtime") {
				const h = (type, props) => {
					if (props === undefined) throw new Error("jsx props must not be undefined");
					return { $$el: true, type, props };
				};
				return { jsx: h, jsxs: (t, p) => h(t, p), Fragment: "Fragment" };
			}
			if (spec === "react") {
				return {
					useState: (init) => {
						const value = stateOverrides?.length ? stateOverrides.shift() : typeof init === "function" ? init() : init;
						return [value, () => {}];
					},
					useEffect: () => {},
					useLayoutEffect: () => {},
					useCallback: (fn) => fn,
					useRef: (v) => ({ current: v })
				};
			}
			if (spec === "react-dom") {
				return { createPortal: (children) => ({ $$portal: true, children }) };
			}
			throw new Error("unexpected require: " + spec);
		}) },
	},
};

// ---- load the plugin ----
eval(pluginSrc);
// The registration id MUST equal the package name — the DSH boot page keys
// __DSH_BOOT__ entries by package name, and dsh-client-modules rejects any
// other id ("loaded without registering …"). Derive the expectation from
// package.json so a future rename cannot silently drift again.
const expectedId = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).name;
const mod = registrations[expectedId];
if (!mod) throw new Error(`plugin did not register under id ${expectedId}`);
console.log("✓ module registered; inject =", JSON.stringify(mod.inject));

// ---- skin registry ----
const skins = mod.listSkins();
console.log("✓ skins:", skins.map((s) => s.id + " (" + s.label + ")").join(", "));
if (!skins.some((s) => s.id === "meirenzhi")) throw new Error("registry missing meirenzhi");
if (!skins.some((s) => s.id === "openbmc")) throw new Error("registry missing openbmc");
if (!skins.some((s) => s.id === "uefi-harness")) throw new Error("registry missing uefi-harness");

// ---- run apply() with a stub ctx (initial skin = meirenzhi) ----
const slotRegistrations = [];
const injectedSlotKeys = [];
const registeredDicts = [];
const registeredDictObjects = {};
let activeLocale = "zh";
const effects = [];
const eventListeners = new Map();
let themeSnapshot = { preference: "system", active: { id: "light" }, themes: [], revision: 0 };
const ctx = {
	slots: {
		_injected: [],
		register(opts, comp) {
			if (!this._injected.includes(opts.name)) {
				throw new Error(`slot "${opts.name}" is not declared through slots.inject()`);
			}
			slotRegistrations.push({ opts, comp });
			return () => {};
		},
		inject(key, callback) {
			injectedSlotKeys.push(key);
			this._injected.push(key);
			try {
				const dispose = callback();
				return typeof dispose === "function" ? dispose : () => {};
			} finally {
				this._injected.pop();
			}
		},
	},
	locale: {
		register: (ns, dicts) => {
			registeredDicts.push(ns);
			registeredDictObjects[ns] = dicts;
			return () => {};
		},
		getLocale: () => ({ active: activeLocale }),
		translate: (ns, key, params) => {
			const dict = registeredDictObjects[ns];
			const template = dict?.[activeLocale]?.[key] ?? dict?.en?.[key] ?? key;
			return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
		}
	},
	connection: { isLoopback: false },
	theme: {
		getTheme: () => themeSnapshot,
		setTheme(id) {
			themeSnapshot = { ...themeSnapshot, preference: id, active: { id: id === "system" ? "light" : id }, revision: themeSnapshot.revision + 1 };
			for (const fn of eventListeners.get("theme/change") ?? []) fn(themeSnapshot);
		},
		// Minimal overrideTokens stub mirroring the Host contract: one layer
		// per source, disposer removes exactly that layer.
		_layers: new Map(),
		overrideTokens(source, tokens) {
			for (const value of Object.values(tokens)) {
				if (typeof value !== "object" || typeof value.light !== "string" || typeof value.dark !== "string") {
					throw new Error("overrideTokens requires {light,dark} pairs");
				}
			}
			this._layers.set(source, tokens);
			return () => this._layers.delete(source);
		}
	},
	on(event, fn) {
		const list = eventListeners.get(event) ?? [];
		list.push(fn);
		eventListeners.set(event, list);
		return () => eventListeners.set(event, list.filter((item) => item !== fn));
	},
	effect(setup, label) { const d = setup(); effects.push({ label, d }); },
};
mod.apply(ctx);
if (window.__DSH_SKINS__.active() !== "meirenzhi") throw new Error("first load must land on the factory skin (meirenzhi)");
console.log("✓ factory skin (meirenzhi) mounts on first load");
if (themeSnapshot.preference !== "dark") throw new Error("remote fallback should restore dark, got " + themeSnapshot.preference);
if (window.__DSH_SKINS__.themePreference() !== "dark") throw new Error("diagnostic preference should report dark");
ctx.theme.setTheme("light");
if (storage.get("dsh-skins:theme-preference") !== "light") throw new Error("theme/change should persist light");
console.log("✓ remote theme fallback restored dark and persisted later light selection");

const styleTag = (id) => head.children.find((c) => c.tagName === "style" && c.dataset.pluginCss === "dsh-skins/" + id + ".css");

// initial mount: skin slots + per-skin style tag + backdrop + favicon
const skinSlots = slotRegistrations.filter((r) => r.opts.priority !== undefined);
if (skinSlots.length !== 3) throw new Error("expected 3 brand slot registrations, got " + skinSlots.length);
console.log("✓ slots registered:", skinSlots.map((r) => r.opts.name).join(", "));
const tagMeirenzhi = styleTag("meirenzhi");
if (!tagMeirenzhi) throw new Error("meirenzhi style tag missing");
console.log("✓ per-skin style tag:", tagMeirenzhi.dataset.pluginCss);
console.log("✓ body scope attr:", body.dataset.dshMeirenzhiSkin === "");
// Backdrop is delivered through a dedicated pseudo-element stylesheet whose
// selector is scoped to the body attribute; the wallpaper url must appear in
// the light layer. The factory wallpaper is THE SAME IMAGE in both themes, so
// runtime emits no dark-mode ::before — the theme difference rides the
// overlay layers (::after), which DO swap per theme.
const backdropTag = styleTag("meirenzhi.backdrop");
if (!backdropTag) throw new Error("meirenzhi backdrop stylesheet missing");
if (!backdropTag.textContent.includes("url(")) throw new Error("meirenzhi backdrop should contain the wallpaper url");
if (!backdropTag.textContent.includes("body[data-dsh-meirenzhi-skin]::before")) throw new Error("backdrop must paint through the fixed pseudo layer");
if (!backdropTag.textContent.includes("[data-ds-dark-theme]::after")) throw new Error("same-image dark behavior must swap the overlay layer (::after) per theme");
if (backdropTag.textContent.includes("[data-ds-dark-theme]::before")) throw new Error("same-image wallpaper must not emit a dark-specific ::before");
console.log("✓ backdrop pseudo stylesheet:", backdropTag.textContent.slice(0, 60) + "...");
console.log("✓ favicon link appended:", head.children.some((c) => c.rel === "icon" && !c.removed));
if (document.title !== "美人志") throw new Error("meirenzhi mount must rebrand the bare tab title, got " + document.title);
console.log("✓ tab title:", document.title);

// the official DocumentTitle projector rewrites the tab asynchronously —
// simulate its "<session> — DeepSeek Harness" projection and let the skin's
// title observer convert the brand segment while keeping the session segment.
document.title = "标题实验 — DeepSeek Harness";
for (const o of global.__mutationObservers) if (typeof o.cb === "function") o.cb();
if (document.title !== "标题实验 — 美人志") throw new Error("renderer projection must keep the session segment and rebrand the product segment, got " + document.title);
console.log("✓ session-aware tab title:", document.title);

// ---- sidebar switcher: registration + dictionary + component render ----
if (!injectedSlotKeys.includes("sidebar.footer.action")) throw new Error("sidebar switcher slot not injected");
const switcher = slotRegistrations.find((r) => r.opts.id === "skins-switcher");
if (!switcher) throw new Error("sidebar switcher not registered");
if (switcher.opts.name !== "sidebar.footer.action") throw new Error("switcher slot name wrong: " + switcher.opts.name);
if (registeredDictObjects["dsh-skins.ui"].zh["skins.switch"] !== "皮肤切换") throw new Error("zh dict missing skins.switch");
if (registeredDictObjects["dsh-skins.ui"].en["skins.switch"] !== "Skin Switcher") throw new Error("en dict missing skins.switch");
if (registeredDictObjects["dsh-skins.ui"].zh["appearance.title"] !== "外观配色") throw new Error("zh dict missing appearance.title");
if (registeredDictObjects["dsh-skins.ui"].zh["appearance.system"] !== "跟随系统") throw new Error("zh dict missing appearance.system");
if (registeredDictObjects["dsh-skins.ui"].zh["skins.official.label"] !== "DeepSeek Harness（官方）") throw new Error("zh dict missing official skin label");
if (registeredDictObjects["dsh-skins.ui"].en["skins.official.label"] !== "DeepSeek Harness (Official)") throw new Error("en dict missing official skin label");
const swTree = switcher.comp({ wide: true }); // t 传空 → 引擎内置词条兜底
const swBtn = swTree.props.children[0];
if (swBtn.type !== "button" || swBtn.props["aria-label"] !== "皮肤切换") throw new Error("switcher button wrong");
if (swBtn.props.children[1] === null || swBtn.props.children[1].props.children !== "皮肤切换") throw new Error("switcher label missing in wide mode");
const railTree = switcher.comp({ wide: false });
if (!String(railTree.props.className).includes("rail")) throw new Error("collapsed sidebar should get rail class");
if (railTree.props.children[0].props.children[1] !== null) throw new Error("rail mode should hide the label");
console.log("✓ sidebar switcher registered (order " + switcher.opts.order + "); button 皮肤切换; rail mode hides label");

// zh/en dictionary parity gate — no key may exist in only one language.
const zhKeys = Object.keys(registeredDictObjects["dsh-skins.ui"].zh);
const enKeys = Object.keys(registeredDictObjects["dsh-skins.ui"].en);
const zhOnly = zhKeys.filter((key) => !enKeys.includes(key));
const enOnly = enKeys.filter((key) => !zhKeys.includes(key));
if (zhOnly.length || enOnly.length) throw new Error("dict key parity broken: zh-only=" + zhOnly + " en-only=" + enOnly);
if (!enKeys.some((key) => key.startsWith("host."))) throw new Error("en dict must carry localized host error templates");
console.log("✓ zh/en dictionaries at parity (" + zhKeys.length + " keys, host.* errors localized)");

// localized skin metadata: descriptions follow the active UI locale
if (!String(mod.listSkins().find((s) => s.id === "openbmc").description).includes("冰绡叠浪")) throw new Error("zh skin description missing");
if (!String(mod.listSkins().find((s) => s.id === "meirenzhi").description).includes("云鬓花颜")) throw new Error("zh meirenzhi description missing");
activeLocale = "en";
const openbmcEn = mod.listSkins().find((s) => s.id === "openbmc");
const uefiEn = mod.listSkins().find((s) => s.id === "uefi-harness");
const meirenzhiEn = mod.listSkins().find((s) => s.id === "meirenzhi");
if (!openbmcEn.description.includes("Ice-silk waves") || openbmcEn.description.includes("飘带")) throw new Error("en openbmc description missing: " + openbmcEn.description);
if (!uefiEn.description.includes("Violet spark") || uefiEn.description.includes("固件") || uefiEn.description.includes("占位")) throw new Error("en uefi description missing: " + uefiEn.description);
if (!meirenzhiEn.description.includes("Moonlit silks") || meirenzhiEn.description.includes("云鬓")) throw new Error("en meirenzhi description missing: " + meirenzhiEn.description);
activeLocale = "zh";

// unified card style: every description is a "mark · backdrop · palette" triple
const officialEn = registeredDictObjects["dsh-skins.ui"].en["skins.official.description"];
const officialZh = registeredDictObjects["dsh-skins.ui"].zh["skins.official.description"];
for (const [id, text] of [["official", officialEn], ["openbmc", openbmcEn.description], ["uefi-harness", uefiEn.description], ["meirenzhi", meirenzhiEn.description]]) {
	if ((text.match(/ · /g) || []).length !== 2) throw new Error(`en description for ${id} must be a three-part triple: ${text}`);
}
const openbmcZh = mod.listSkins().find((s) => s.id === "openbmc").description;
const uefiZh = mod.listSkins().find((s) => s.id === "uefi-harness").description;
const meirenzhiZh = mod.listSkins().find((s) => s.id === "meirenzhi").description;
if (uefiZh.includes("占位")) throw new Error("zh uefi description must drop the placeholder prefix: " + uefiZh);
for (const [id, text] of [["official", officialZh], ["openbmc", openbmcZh], ["uefi-harness", uefiZh], ["meirenzhi", meirenzhiZh]]) {
	if ((text.match(/ · /g) || []).length !== 2) throw new Error(`zh description for ${id} must be a three-part triple: ${text}`);
}

// slot registration label resolves through the locale service
if (switcher.opts.label() !== "皮肤切换") throw new Error("slot label must resolve to zh, got " + switcher.opts.label());
activeLocale = "en";
if (switcher.opts.label() !== "Skin Switcher") throw new Error("slot label must resolve to en, got " + switcher.opts.label());
activeLocale = "zh";
console.log("✓ skin descriptions and slot label localize with the active UI locale");

// Force the popover open. useState order: open, active skin, box,
// personalize view, theme preference.
stateOverrides = [true, "meirenzhi", { left: 20, bottom: 50 }, null, "dark"];
const openTree = switcher.comp({ wide: true });
const portal = openTree.props.children[1];
if (!portal?.$$portal) throw new Error("open switcher should render a portal");
const panel = portal.children;
// Combined shell (Q46): the list lives inside .dsh-skins-pop-main.
const shellChildren = panel.props.children;
const mainColumn = Array.isArray(shellChildren)
  ? shellChildren.find((node) => String(node?.props?.className ?? "").includes("dsh-skins-pop-main"))
  : null;
if (!mainColumn) throw new Error("combined shell must wrap the list in dsh-skins-pop-main");
const panelChildren = mainColumn.props.children;
if (!Array.isArray(panelChildren)) throw new Error("list view must render a section array");

// Semantic node location (no positional coupling to section order).
const nodeByText = (text) => panelChildren.find((node) => node?.props?.children === text);
const appearanceTitle = nodeByText("外观配色");
if (!appearanceTitle) throw new Error("appearance section missing");
const themeGrid = panelChildren.find((node) => String(node?.props?.className ?? "").includes("dsh-skins-theme-grid"));
if (!themeGrid) throw new Error("theme grid missing");
const themeCards = themeGrid.props.children;
if (!Array.isArray(themeCards) || themeCards.length !== 3) throw new Error("appearance section needs 3 buttons");
if (!String(themeCards[1].props.className).includes("dsh-skins-theme-card-on")) throw new Error("dark appearance button should be selected");
if (!nodeByText("选择皮肤")) throw new Error("skin section must follow appearance section");

// Skin cards may be bare buttons (official) or card rows with a personalization
// gear (catalog skins) — collect the primary card and the gear of each row.
const skinCards = [];
const gears = [];
for (const node of panelChildren) {
  const className = String(node?.props?.className ?? "");
  if (className.includes("dsh-skins-pop-card-row")) {
    const [card, gear] = node.props.children;
    skinCards.push(card);
    gears.push(gear);
  } else if (className.includes("dsh-skins-pop-card")) {
    skinCards.push(node);
  }
}
const updatePanelNode = panelChildren.find((node) => typeof node?.type === "function");
if (skinCards.length !== 5) throw new Error("skin section needs official appearance + 4 skins, got " + skinCards.length);
if (gears.length !== 4) throw new Error("every catalog skin exposes a personalization gear, got " + gears.length);
if (typeof updatePanelNode?.type !== "function") throw new Error("update panel must render after the skin cards");
if (skinCards[0].props.children[0].props.children !== "DeepSeek Harness（官方）") throw new Error("official appearance must be the first skin card");
if (skinCards[0].props["aria-checked"] !== false) throw new Error("official appearance must not be selected on first load");
if (skinCards[1].props["aria-checked"] !== true) throw new Error("meirenzhi (factory skin) must remain selected on first load");
if (skinCards[1].props.children[0].props.children !== "凡人修仙传 · 美人志") throw new Error("meirenzhi must be registered second (factory skin first in the list)");
if (skinCards[4].props.children[0].props.children !== "天官赐福") throw new Error("tgcf must be registered and listed last");
themeCards[2].props.onClick();
if (themeSnapshot.preference !== "system") throw new Error("system button must call official theme.setTheme");
if (storage.get("dsh-skins:theme-preference") !== "system") throw new Error("system selection must persist remotely");
console.log("✓ popover: appearance(3) + skins(5: official first, meirenzhi second, tgcf last) + gears(4); system theme persisted");

// ---- update panel states: local development, available Release, up to date ----
stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.4.0", latest: { version: "0.3.1" }, source: { kind: "link" }, operation: null, restartRequired: false },
	error: null,
}, false, false, false, false];
const developmentUpdate = updatePanelNode.type(updatePanelNode.props);
if (!String(developmentUpdate.props.className).includes("dsh-skins-update-row-muted")) throw new Error("link mode status must be visually muted");
if (developmentUpdate.props.children !== "本地开发模式 - v0.4.0（最新正式版 v0.3.1）") throw new Error("link mode one-line status is incorrect");

stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.4.0", latest: { version: "0.5.0" }, source: { kind: "link" }, operation: null, restartRequired: false, updateAvailable: true },
	error: null,
}, false, false, false, false];
const developmentWithRelease = updatePanelNode.type(updatePanelNode.props);
if (developmentWithRelease.props.children !== "本地开发模式 - v0.4.0（可更新至 v0.5.0）") throw new Error("link mode newer-release status is incorrect");

stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.3.1", latest: { version: "0.4.0", htmlUrl: "https://example.test/release" }, source: { kind: "npm" }, operation: null, restartRequired: false, updateAvailable: true, canUpdate: true },
	error: null,
}, false, false, false, false];
const availableUpdate = updatePanelNode.type(updatePanelNode.props);
if (availableUpdate.props.children[0].props.children[0].props.children !== "发现插件更新") throw new Error("available update title missing");
if (availableUpdate.props.children[1].props.children.props.children !== "更新") throw new Error("available update action missing");

stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.4.0", latest: { version: "0.4.0" }, source: { kind: "npm" }, operation: null, restartRequired: false, updateAvailable: false, canUpdate: false },
	error: null,
}, false, false, false, false];
if (updatePanelNode.type(updatePanelNode.props) !== null) throw new Error("up-to-date GitHub install must hide the update row");

stateOverrides = [{ kind: "error", status: null, error: "offline" }, false, false, false, false];
const failedCheck = updatePanelNode.type(updatePanelNode.props);
if (failedCheck.props.children[1].props.children !== "重试") throw new Error("failed update check must offer retry");

stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.3.1", latest: { version: "0.4.0" }, source: { kind: "npm" }, operation: { phase: "installing" }, restartRequired: false, updateAvailable: true, canUpdate: true },
	error: null,
}, false, false, false, false];
const installingUpdate = updatePanelNode.type(updatePanelNode.props);
if (installingUpdate.props.children[1].props.children.props.className !== "dsh-skins-update-spinner") throw new Error("installing update must show progress spinner");

stateOverrides = [{
	kind: "ready",
	status: { currentVersion: "0.4.0", latest: { version: "0.4.0" }, source: { kind: "npm" }, operation: { phase: "done", release: { version: "0.4.0" } }, restartRequired: true, restartAvailable: true, restartSafety: { state: "safe", running: 0 }, updateAvailable: false, canUpdate: false },
	error: null,
}, false, false, false, false];
const restartUpdate = updatePanelNode.type(updatePanelNode.props);
if (restartUpdate.props.children[1].props.children[0].props.children !== "立即重启") throw new Error("completed update must offer immediate restart");
if (restartUpdate.props.children[1].props.children[1].props.children !== "稍后") throw new Error("completed update must offer deferred restart");
console.log("✓ update panel covers link, available, current, error, progress, and restart states");

// ---- restore the official appearance, then switch via the public selector ----
// The mount being torn down here is the INITIAL one — the factory skin
// (meirenzhi) — so the cleanup assertions reference meirenzhi artifacts.
const meirenzhiFavicon = head.children.find((c) => c.rel === "icon" && !c.removed);
mod.selectSkin("official");
if (window.__DSH_SKINS__.active() !== "official") throw new Error("official appearance must become active");
if (storage.get("dsh-skins:active") !== "official") throw new Error("official appearance selection must persist");
if (mod.selectSkin("default") !== "official") throw new Error("legacy \"default\" alias must normalize to official");
if (storage.get("dsh-skins:active") !== "official") throw new Error("legacy \"default\" alias must persist as official");
if (!tagMeirenzhi.removed) throw new Error("custom skin style must be removed for the official appearance");
if (styleTag("meirenzhi.backdrop") !== undefined && !styleTag("meirenzhi.backdrop").removed) throw new Error("official appearance must remove the meirenzhi backdrop stylesheet");
if (body.dataset.dshMeirenzhiSkin !== undefined) throw new Error("official appearance must remove the meirenzhi body scope");
if (!meirenzhiFavicon?.removed) throw new Error("official appearance must remove the custom favicon");
if (document.title !== "标题实验 — DeepSeek Harness") throw new Error("official appearance must restore the official brand segment, got " + document.title);
if (themeSnapshot.preference !== "system") throw new Error("skin selection must not change the official theme preference");
console.log("✓ DeepSeek Harness official appearance restored branding, background, favicon and tab title; selection persisted");

mod.selectSkin("uefi-harness");
const tagUefi = styleTag("uefi-harness");
if (!tagUefi || tagUefi.removed) throw new Error("UEFI skin style tag missing after switch");
const bgUefi = styleTag("uefi-harness.backdrop")?.textContent || "";
if (!bgUefi.includes("url(")) throw new Error("UEFI backdrop must carry the gilded circuit-board wallpaper url");
if (!bgUefi.includes("linear-gradient")) throw new Error("UEFI backdrop must stack a veil scrim over the wallpaper");
if (body.dataset.dshOpenbmcSkin !== undefined || body.dataset.dshUefiHarness !== "") throw new Error("UEFI body scope not active");
const skinSlotsAfterSwitch = slotRegistrations.filter((r) => r.opts.priority !== undefined);
if (skinSlotsAfterSwitch.length !== 6) throw new Error("brand slots should re-register after switch (3+3), got " + skinSlotsAfterSwitch.length);
console.log("✓ switched to independent UEFI Harness via public selector; backdrop = gilded circuit art + veil scrim");
if (document.title !== "标题实验 — UEFI Harness") throw new Error("uefi mount must rebrand the session-aware tab title, got " + document.title);
console.log("✓ UEFI body scope attr after switch:", body.dataset.dshUefiHarness === "");

// ---- openbmc: personalization-aware since ADR-0004, default-anchor check ----
// UEFI → openbmc switch: the default-P projection must reproduce the baked
// visuals byte-for-byte (P=55 anchors to the baked alpha strings).
mod.selectSkin("openbmc");
if (window.__DSH_SKINS__.active() !== "openbmc") throw new Error("openbmc must become active");
if (body.dataset.dshOpenbmcSkin !== "") throw new Error("openbmc body scope attr missing");
const obmcThemeLayer = ctx.theme._layers.get("dsh-skins/openbmc");
if (!obmcThemeLayer) throw new Error("openbmc must register a token override layer (ADR-0004)");
if (typeof obmcThemeLayer["--dsw-alias-bg-base"].light !== "string" || !obmcThemeLayer["--dsw-alias-bg-base"].light.startsWith("rgba(247, 250, 252,")) {
	throw new Error("panel opacity must derive translucent panel bases at the default P=55");
}
const obmcBackdrop = styleTag("openbmc.backdrop");
if (!obmcBackdrop || obmcBackdrop.removed) throw new Error("openbmc backdrop stylesheet missing");
if (!obmcBackdrop.textContent.includes("linear-gradient(rgba(247, 250, 252, 0.15)")) throw new Error("openbmc default scrim must equal the baked string at P=55");
const obmcCss = styleTag("openbmc");
if (!obmcCss || obmcCss.removed) throw new Error("openbmc static css missing");
if (obmcCss.textContent.includes("backdrop-filter")) throw new Error("no glass rule at the default P=55 (blur 0)");
console.log("✓ openbmc active: baked-default token layer + backdrop + no glass at default P");

// ---- tgcf: personalization-aware skin, token layer + backdrop + hot-update ----
// Direct UEFI → openbmc → TGCF switch (no official detour): teardown-first
// mounting restores the official brand segment before tgcf rebrands it.
mod.selectSkin("tgcf");
if (window.__DSH_SKINS__.active() !== "tgcf") throw new Error("tgcf must become active");
if (body.dataset.dshTgcfSkin !== "") throw new Error("tgcf body scope attr missing");
const tgcfBackdrop = styleTag("tgcf.backdrop");
if (!tgcfBackdrop || tgcfBackdrop.removed) throw new Error("tgcf backdrop stylesheet missing");
if (!tgcfBackdrop.textContent.includes("data:image/webp")) throw new Error("tgcf backdrop must embed the bundled factory wallpaper (WebP)");
if (!tgcfBackdrop.textContent.includes("filter:blur(1px)")) throw new Error("tgcf backdrop must apply the curve-derived 1px wallpaper blur at the default P=35");
if (!tgcfBackdrop.textContent.includes("linear-gradient(rgba(255,246,234,0.040)")) throw new Error("tgcf scrim overlay must derive from the translucency curve at the default P=35");
const tgcfThemeLayer = ctx.theme._layers.get("dsh-skins/tgcf");
if (!tgcfThemeLayer) throw new Error("tgcf must register a token override layer");
if (tgcfThemeLayer["--dsw-alias-brand-primary"].light !== "#C3272B") throw new Error("accent default must map to the brand-primary token");
if (tgcfThemeLayer["--dsw-specific-bubble"].dark !== "#8E2A2F") throw new Error("bubble default must map to the specific-bubble token");
if (typeof tgcfThemeLayer["--dsw-alias-bg-base"].light !== "string" || !tgcfThemeLayer["--dsw-alias-bg-base"].light.startsWith("rgba(255,252,246,")) {
	throw new Error("panel opacity must derive translucent panel bases");
}
if (document.title !== "标题实验 — 天官赐福") throw new Error("tgcf must rebrand the session title, got " + document.title);
const tgcfDecor = styleTag("tgcf");
if (!tgcfDecor || !tgcfDecor.textContent.includes("prefers-reduced-motion")) throw new Error("tgcf static css must ship ambient motion with a reduced-motion guard");
console.log("✓ tgcf active: backdrop + tokens + title + ambient motion (reduced-motion guarded)");

// hot-update: change overrides through the runtime's personalization hook,
// then confirm the projected effects swap without touching the selection.
mod.selectSkin("official");
if (ctx.theme._layers.get("dsh-skins/tgcf")) throw new Error("switching to official must dispose the tgcf token layer");
mod.selectSkin("tgcf");
if (!ctx.theme._layers.get("dsh-skins/tgcf")) throw new Error("re-selecting tgcf must re-register the token layer");
console.log("✓ token override layers dispose and re-register across skin switches");

// Hot-update (the config sync wiring fires this on every page load): the
// rebuilt effects must fully replace the old set without tearing down the
// live skin (the 9c19d5c regression this now guards against).
const tgcfCssBefore = styleTag("tgcf");
const tgcfTitleBefore = document.title;
const hotUpdate = window.__DSH_SKINS__.hotUpdate();
if (hotUpdate.applied !== true) throw new Error("hot update must apply, got " + JSON.stringify(hotUpdate));
if (!styleTag("tgcf") || styleTag("tgcf").removed) throw new Error("hot update must keep the tgcf style tag alive");
if (!styleTag("tgcf.backdrop") || styleTag("tgcf.backdrop").removed) throw new Error("hot update must keep the backdrop tag alive");
if (body.dataset.dshTgcfSkin !== "") throw new Error("hot update must keep the body scope attribute");
if (!ctx.theme._layers.get("dsh-skins/tgcf")) throw new Error("hot update must re-register the token layer");
if (document.title !== tgcfTitleBefore) throw new Error("hot update must keep the rebranded title, got " + document.title);
if (window.__DSH_SKINS__.active() !== "tgcf") throw new Error("hot update must not change the active skin");
void tgcfCssBefore;
console.log("✓ hot-update rebuilt effects with the live skin intact");

// unknown id must throw
let threw = false;
try { mod.selectSkin("nope"); } catch { threw = true; }
if (!threw) throw new Error("selectSkin should reject unknown ids");
console.log("✓ unknown skin id rejected");

// theme switch (dark) repaint signal, then full dispose
body.dataset.dsDarkTheme = "";
const uiTag = styleTag("sidebar");
for (const e of effects) if (typeof e.d === "function") e.d();
if (body.dataset.dshUefiHarness !== undefined) throw new Error("dispose must remove the UEFI scope attr");
if (!tagUefi.removed) throw new Error("dispose must remove the skin style tag");
if (!uiTag.removed) throw new Error("dispose must remove the sidebar UI style tag");
if (document.title !== "标题实验 — DeepSeek Harness") throw new Error("dispose must restore the official brand segment, got " + document.title);
console.log("✓ dispose ran; scope attr + skin/sidebar UI style tags removed; tab title restored");
console.log("\nALL SMOKE CHECKS PASSED");
