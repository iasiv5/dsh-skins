import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import semver from "semver";

// semver gate semantics differ by layer (R1-2): the dsh-m/host compat gate
// evaluates with includePrerelease:true (compat-check.ts:45) and therefore
// accepts future rc lines; package-manager peer resolution uses default
// semantics (ADR-0006 precedent: ^0.1.1-rc.2 rejects 0.1.2-rc.1), where a
// cross-tuple prerelease does not satisfy the range. The union keeps both
// engines aligned on the floor; appending a new arm for a future rc line is
// optional-but-harmless (know-how 034 必查②).
const RANGE = ">=0.2.0-rc.1 || >=0.2.1-rc.1";
const PEERS = [
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-conversation",
  "@deepseek-ai/dsh-client-ui-sidebar",
  "@deepseek-ai/dsh-client-ui-theme",
];

test("DSH engine floor and six dsh-client peer floors are declared", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of PEERS) assert.equal(pkg.peerDependencies[name], RANGE, name);
  assert.equal(pkg.peerDependencies["@deepseek-ai/cordis"], "^4.0.1");
  assert.equal(pkg.dsh.engines.dsh, RANGE);
  for (const version of ["0.2.0-rc.1", "0.2.1-rc.3"]) {
    assert.ok(semver.satisfies(version, pkg.dsh.engines.dsh, { includePrerelease: true }));
  }
  assert.ok(!semver.satisfies("0.1.7-rc.2", pkg.dsh.engines.dsh, { includePrerelease: true }));
});

test("union floor accepts the target lines and stable futures", () => {
  for (const v of ["0.2.0-rc.1", "0.2.0-rc.2", "0.2.1-rc.1", "0.2.1-rc.2", "0.2.1", "0.2.2", "0.3.0", "1.0.0"]) {
    assert.ok(semver.satisfies(v, RANGE), `expected ${v} to satisfy ${RANGE}`);
  }
});

test("union floor rejects pre-floor and legacy lines", () => {
  for (const v of ["0.1.2-rc.1", "0.1.7-rc.2", "0.2.0-rc.0"]) {
    assert.ok(!semver.satisfies(v, RANGE), `expected ${v} to be rejected by ${RANGE}`);
  }
});

test("default-semver layer: cross-tuple rc lines do not satisfy the range", () => {
  // Pins the package-manager (default semantics) layer only. The dsh-m/host
  // gate (includePrerelease:true) accepts these. When DSH ships a new rc
  // line, appending `>=X.Y.Z-rc.n` to RANGE stays optional-but-harmless
  // (know-how 034 必查②). Stable releases (0.2.2, 0.3.0) satisfy regardless.
  for (const v of ["0.2.2-rc.1", "0.3.0-rc.1"]) {
    assert.ok(!semver.satisfies(v, RANGE), `expected ${v} to be rejected by ${RANGE}`);
  }
});
