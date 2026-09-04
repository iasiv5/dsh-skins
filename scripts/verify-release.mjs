/**
 * Release-version gate (design §14). Shared by local preflight and the
 * tag-triggered workflow so most of the release logic is testable BEFORE
 * the tag exists:
 *
 *   node scripts/verify-release.mjs              # package.json version only
 *   node scripts/verify-release.mjs v1.0.0       # tag ↔ version identity
 *
 * Rules: the version must be strict stable semver (X.Y.Z, no prerelease /
 * build suffixes — the self-updater rejects anything else), and when a tag
 * is given it must be exactly `v` + the package version.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tag = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = manifest.version;

function fail(message) {
  console.error(`verify-release: ${message}`);
  process.exit(1);
}

if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version must be strict stable semver (X.Y.Z), got "${version}"`);
}
if (manifest.name !== "@iasiv5/dsh-skins") {
  fail(`package.json name must be @iasiv5/dsh-skins, got "${manifest.name}"`);
}
// Repository identity: the self-updater pins tag↔version↔repository, so a
// mismatched identity must fail HERE rather than in the updater.
const repoUrl = manifest.repository?.url ?? "";
const repoMatch = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i.exec(repoUrl);
if (repoMatch === null) {
  fail(`package.json repository.url must point at GitHub, got "${repoUrl}"`);
} else {
  const repo = repoMatch[1];
  if (typeof manifest.homepage === "string" && !manifest.homepage.includes(repo)) {
    fail(`homepage must reference ${repo}, got "${manifest.homepage}"`);
  }
  if (typeof manifest.bugs?.url === "string" && !manifest.bugs.url.includes(repo)) {
    fail(`bugs.url must reference ${repo}, got "${manifest.bugs.url}"`);
  }
  // In CI the repository identity is anchored to the checkout itself:
  // three fields agreeing on the WRONG repo must still fail.
  const ciRepo = process.env.GITHUB_REPOSITORY;
  if (ciRepo !== undefined && ciRepo.toLowerCase() !== repo.toLowerCase()) {
    fail(`repository.url points at ${repo} but this checkout is ${ciRepo}`);
  }
}

if (tag === undefined) {
  console.log(`verify-release: package ${manifest.name}@${version} OK (no tag given)`);
  process.exit(0);
}

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  fail(`tag must be strictly vX.Y.Z, got "${tag}"`);
}
if (tag !== `v${version}`) {
  fail(`tag ${tag} does not match package version ${version}`);
}
console.log(`verify-release: tag ${tag} ↔ package ${manifest.name}@${version} OK`);
