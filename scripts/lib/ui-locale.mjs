/**
 * Gate-side UI language helpers (retro 2026-11-01, items 1 and 5).
 *
 * A gate cannot pin the host language. `locale.preference` lives in the Host
 * settings, and its RPC read overrides navigator languages and localStorage —
 * verified 2026-11-01 (three fresh contexts, all rendered zh-CN). Pinning it
 * would rewrite the operator's durable settings, so gates do not. Instead:
 *   - every UI lookup must hold in BOTH languages: UI lists each accepted
 *     label (all locales), and gates match by membership or through the regex
 *     builders below — never by equality with one language's string;
 *   - observedLocale() reports the language the run actually saw, so drift
 *     shows up in the log instead of as a selector miss.
 * tests/gate-ui-locale.test.mjs enforces these rules across scripts/repro-*
 * and scripts/capture-previews.mjs.
 *
 * Sources: ui-sidebar dictionary (`session.new.label`: "New session" /
 * "新建会话"); host dictionaries (`onboardingContinue` / `welcomeContinue`:
 * "Continue" / "继续"); dsh-skins dictionary (`personalization.reset`:
 * "Restore defaults" / "恢复默认"); right-sidebar toggles observed live in both
 * languages (2026-10-29 gate runs; 2026-11-01 zh probe).
 */

export const UI = Object.freeze({
  openRightSidebar: Object.freeze(["Open right sidebar", "打开右侧边栏"]),
  collapseRightSidebar: Object.freeze(["Collapse right sidebar", "收起右侧边栏"]),
  newSession: Object.freeze(["New session", "新建会话"]),
  restoreDefaults: Object.freeze(["Restore defaults", "恢复默认"]),
  continueNotice: Object.freeze(["Continue", "继续"]),
});

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Substring match (Playwright hasText semantics) over every accepted label. */
export function labelRegex(labels) {
  return new RegExp(labels.map(escapeRegex).join("|"));
}

/**
 * Whole-name match for accessible names. Rejects per-row variants such as
 * "在“X”中新建会话" that a substring match would also catch.
 */
export function exactLabelRegex(labels) {
  return new RegExp(`^(?:${labels.map(escapeRegex).join("|")})$`);
}

/** The language the run saw (`<html lang>`, set by dsh-client-locale). */
export async function observedLocale(page) {
  return page.evaluate(() => document.documentElement.lang || "unknown");
}
