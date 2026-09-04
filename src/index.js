import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mountUpdateRoutes } from "./host/routes.js";
import { createRestartScheduler } from "./host/restart.js";
import { createSelfUpdater } from "./host/self-update.js";
import { runDshPlugin } from "./host/runner.js";
import { createPersonalizationStore } from "./host/personalization/store.js";
import { mountPersonalizationRoutes } from "./host/personalization-routes.js";

export const name = "@iasiv5/dsh-skins";

function packageRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function packageVersion() {
  const manifest = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8"));
  if (typeof manifest.version !== "string") throw new Error("dsh-skins package.json 缺少版本号");
  return manifest.version;
}

function dshHome() {
  return process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
}

export function apply(ctx) {
  ctx.inject(["webServer", "agents", "webRuntime"], (hostContext) => {
    const root = dshHome();
    const profileDir = join(root, "profiles", "web");
    const updater = createSelfUpdater({
      profileDir,
      cacheFile: join(root, "dsh-skins", "update-cache.json"),
      currentVersion: packageVersion(),
    }, {
      runner: runDshPlugin,
    });
    const restart = createRestartScheduler(ctx.get("appExit"));
    const personalization = createPersonalizationStore({
      dataDir: join(root, "dsh-skins"),
    });
    hostContext.effect(() => {
      let disposeUpdate = null;
      let disposePersonalization = null;
      try {
        disposeUpdate = mountUpdateRoutes(hostContext, {
          updater,
          restart,
          agents: hostContext.agents,
          trustedHosts: hostContext.webRuntime.trustedHosts,
        });
        disposePersonalization = mountPersonalizationRoutes(hostContext, {
          store: personalization,
          trustedHosts: hostContext.webRuntime.trustedHosts,
        });
      } catch (error) {
        disposePersonalization?.();
        disposeUpdate?.();
        throw error;
      }
      return () => {
        disposePersonalization();
        disposeUpdate();
      };
    }, "dsh-skins: self-update routes");
  });
}

export { createSelfUpdater } from "./host/self-update.js";
