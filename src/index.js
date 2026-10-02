import { homedir } from "node:os";
import { join } from "node:path";
import { createPersonalizationStore } from "./host/personalization/store.js";
import { mountPersonalizationRoutes } from "./host/personalization-routes.js";

export const name = "@iasiv5/dsh-skins";

function dshHome() {
  return process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
}

export function apply(ctx) {
  ctx.inject(["webServer", "webRuntime"], (hostContext) => {
    const root = dshHome();
    const personalization = createPersonalizationStore({
      dataDir: join(root, "dsh-skins"),
    });
    hostContext.effect(() => {
      return mountPersonalizationRoutes(hostContext, {
        store: personalization,
        trustedHosts: hostContext.webRuntime.trustedHosts,
      });
    }, "dsh-skins: personalization routes");
  });
}
