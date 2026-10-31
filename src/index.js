import { homedir } from "node:os";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPersonalizationStore } from "./host/personalization/store.js";
import { mountPersonalizationRoutes } from "./host/personalization-routes.js";
import { createBuiltinAssetServer } from "./host/builtin-assets.js";
import { resolveTrustedHosts } from "./host/trusted-hosts.js";

export const name = "@iasiv5/dsh-skins";

function expandHomePath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

function dshHome() {
  const configured = process.env.DSH_HOME?.trim();
  return resolve(expandHomePath(configured || join(homedir(), ".dsh")));
}

export function hostProfileFor(root, cwd = process.cwd()) {
  // dsh-desktop-host launches the Host with cwd = $DSH_HOME/profiles/desktop;
  // normal Web launchers do not. Never infer the profile from the mere
  // existence of a Desktop installation alongside this Web process.
  const normalized = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  return normalized(cwd) === normalized(join(expandHomePath(root), "profiles", "desktop")) ? "desktop" : "web";
}

export function dataDirForProfile(root, profile) {
  root = resolve(expandHomePath(root));
  const legacy = join(root, "dsh-skins");
  if (profile !== "desktop") return legacy; // unchanged Web path
  const desktop = join(root, "dsh-skins-desktop");
  if (existsSync(desktop) || !existsSync(legacy)) return desktop;
  // Pre-1.5.4 Desktop stored everything in the legacy directory. Copy once,
  // never move or modify it: an existing Web installation may own it too.
  // Publish the complete copy with a same-parent directory rename so an
  // interrupted copy cannot be mistaken for a valid new Desktop store.
  const stage = mkdtempSync(join(root, ".dsh-skins-desktop-migrate-"));
  try {
    for (const name of readdirSync(legacy)) {
      cpSync(join(legacy, name), join(stage, name), { recursive: true, force: false, errorOnExist: true });
    }
    renameSync(stage, desktop);
  } catch (error) {
    if (!existsSync(desktop)) throw error;
    // Another Desktop Host completed the one-time migration first.
  } finally {
    if (dirname(resolve(stage)) !== resolve(root)) throw new Error("unsafe Desktop migration staging path");
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
  return desktop;
}

export function apply(ctx) {
  ctx.inject(["webServer"], (hostContext) => {
    const root = dshHome();
    const profile = hostProfileFor(root);
    const personalization = createPersonalizationStore({
      dataDir: dataDirForProfile(root, profile),
      profile,
    });
    hostContext.effect(() => {
      // Builtin artwork delivery (ADR-0023): package assets served over the
      // same /dsh-skins/assets/ prefix as gallery uploads. src/ and lib/ both
      // sit one level below the package root, so "../assets" resolves in dev
      // and in the built bundle alike. Best-effort mount: a missing manifest
      // simply leaves serveBuiltinAsset undefined and b_ requests 404 —
      // fail-open (Decision 6), base colors + scrim still render.
      let serveBuiltinAsset;
      try {
        const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
        const manifest = JSON.parse(readFileSync(join(assetsDir, "manifest.json"), "utf8"));
        serveBuiltinAsset = createBuiltinAssetServer({ assetsDir, manifest }).serveBuiltinAsset;
      } catch {
        // No manifest or unreadable assets: fail-open, see above.
      }
      return mountPersonalizationRoutes(hostContext, {
        store: personalization,
        trustedHosts: () => resolveTrustedHosts(ctx),
        serveBuiltinAsset,
      });
    }, "dsh-skins: personalization routes");
  });
}
