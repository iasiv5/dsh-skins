import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { resolveCaptureOutDir } from "../scripts/capture-output.mjs";

test("release-gate captures default to a versioned gitignored artifact directory", () => {
  assert.equal(
    resolveCaptureOutDir({ gate: true, explicitOut: undefined, packageVersion: "1.0.1" }),
    join(".artifacts", "release-gates", "v1.0.1"),
  );
  assert.equal(
    resolveCaptureOutDir({ gate: true, explicitOut: undefined, packageVersion: "2.3.4" }),
    join(".artifacts", "release-gates", "v2.3.4"),
    "future tags must stay isolated without checklist edits",
  );
});

test("documentation captures retain docs/assets as their default", () => {
  assert.equal(
    resolveCaptureOutDir({ gate: false, explicitOut: undefined, packageVersion: "1.0.1" }),
    "docs/assets",
  );
});

test("an explicit output directory overrides both defaults", () => {
  assert.equal(
    resolveCaptureOutDir({ gate: true, explicitOut: "docs/assets", packageVersion: "1.0.1" }),
    "docs/assets",
  );
  assert.equal(
    resolveCaptureOutDir({ gate: false, explicitOut: "/tmp/captures", packageVersion: "1.0.1" }),
    "/tmp/captures",
  );
});

test("release-gate artifact root is ignored by Git", () => {
  const ignoreRules = readFileSync(new URL("../.gitignore", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
  assert.ok(ignoreRules.includes(".artifacts/"), "safe gate defaults require .artifacts/ to remain gitignored");
});

test("release-gate default fails closed without a package version", () => {
  assert.throws(
    () => resolveCaptureOutDir({ gate: true, explicitOut: undefined, packageVersion: "" }),
    /non-empty package version/,
  );
});
