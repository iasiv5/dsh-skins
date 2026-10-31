/**
 * Deterministic wallpaper-settle wait for the pixel gates (ADR-0023 Task 7).
 *
 * The repro gates measure bright pixels over surfaces the wallpaper paints
 * into; since ADR-0023 the builtin wallpaper arrives over the host asset
 * route, so a measurement taken before the fetch+decode lands on a
 * no-wallpaper baseline and would misread as paint breakage. This helper
 * reads the computed body::before background URL and, when it is an
 * external /dsh-skins/assets/ URL, waits for an in-page Image on the same
 * URL to settle (HTTP cache makes this instant on repeat visits).
 *
 * Tri-state contract (unit-tested in tests/wallpaper-settled.test.mjs):
 *   1. external URL  -> wait for Image onload/onerror, log "wallpaper settled in Nms"
 *   2. inline/none   -> return immediately (factory-skin art stays inline, B9)
 *   3. deadline hit  -> throw an Error whose message carries
 *                       WALLPAPER_SETTLED_TIMEOUT — gates report INVALID
 *                       (exit 3), never FAIL/PASS (63d080a precedent).
 */

async function readExternalWallpaperUrl(page) {  return page.evaluate(() => {
    const backgroundImage = getComputedStyle(document.body, "::before").backgroundImage;
    const match = /url\("?([^")]+)"?\)/.exec(backgroundImage ?? "");
    if (match === null) return null;
    return match[1].startsWith("/dsh-skins/assets/") ? match[1] : null;
  });
}

export async function awaitWallpaperSettled(page, { timeoutMs = 10_000 } = {}) {
  const url = await readExternalWallpaperUrl(page);
  if (url === null) return;

  const startedAt = Date.now();
  const settle = page.evaluate((wallpaperUrl) => new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve(undefined);
    image.src = wallpaperUrl;
  }), url);

  const deadline = new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`WALLPAPER_SETTLED_TIMEOUT: ${wallpaperTimeoutText(url, timeoutMs)}`)), timeoutMs);
  });
  await Promise.race([settle, deadline]);
  console.log(`wallpaper settled in ${Date.now() - startedAt}ms`);
}

function wallpaperTimeoutText(url, timeoutMs) {
  return `external wallpaper "${url}" did not settle within ${timeoutMs}ms (route down? asset missing?)`;
}
