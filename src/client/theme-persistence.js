export const THEME_STORAGE_KEY = "dsh-skins:theme-preference";
const PREFERENCES = new Set(["light", "dark", "system"]);

/**
 * Persist official theme preferences in localStorage only for remote browsers.
 * Loopback browsers keep using the official Host-backed settings scope.
 */
export function installRemoteThemePersistence(ctx) {
  if (ctx.connection?.isLoopback === true) return;
  const theme = ctx.theme;
  if (!theme || typeof theme.getTheme !== "function" || typeof theme.setTheme !== "function") return;

  const persist = (snapshot) => {
    const preference = snapshot?.preference;
    if (!PREFERENCES.has(preference)) return;
    try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch {}
  };
  ctx.on("theme/change", persist);

  let stored;
  try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
  if (PREFERENCES.has(stored)) {
    if (theme.getTheme().preference !== stored) theme.setTheme(stored);
  } else {
    persist(theme.getTheme());
  }
}

export function readLocalThemePreference() {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}
