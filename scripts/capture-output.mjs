import { join } from "node:path";

/**
 * Resolve where capture-previews writes screenshots.
 *
 * Release-gate evidence is local by default: it belongs under the gitignored
 * .artifacts tree, isolated by package version. Documentation captures retain
 * the historical docs/assets default. Passing --out is the explicit opt-in to
 * another destination (including intentionally updating docs/assets).
 */
export function resolveCaptureOutDir({ gate, explicitOut, packageVersion }) {
  if (explicitOut !== undefined) return explicitOut;
  if (!gate) return "docs/assets";
  if (typeof packageVersion !== "string" || packageVersion.length === 0) {
    throw new Error("release-gate capture requires a non-empty package version");
  }
  return join(".artifacts", "release-gates", `v${packageVersion}`);
}
