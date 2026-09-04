/**
 * Verify that README.md (zh) and README.en.md (en) change together.
 *
 * Both READMEs carry equal authority: neither is the "source of truth" for
 * the other. README.i18n.yaml records the git blob hash of each side as of
 * the last confirmed-consistent state. Editing either side without the
 * other makes `pnpm run check` fail; after syncing both, re-record with:
 *
 *   node scripts/verify-readme-pairing.mjs --write
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RECORD_FILE = "README.i18n.yaml";
const SIDES = ["README.md", "README.en.md"];
const write = process.argv.includes("--write");

const blobHash = (file) => execFileSync("git", ["hash-object", file], { encoding: "utf8" }).trim();

const current = Object.fromEntries(SIDES.map((side) => [side, blobHash(side)]));

if (write) {
  const body = [
    "# Bilingual README pairing record: the git blob hash of each side as of the",
    "# last confirmed-consistent state. Both languages carry equal authority;",
    "# after editing either side, bring the other along and re-record with:",
    "#   node scripts/verify-readme-pairing.mjs --write",
    ...SIDES.map((side) => `${side}: ${current[side]}`),
    "",
  ].join("\n");
  writeFileSync(RECORD_FILE, body);
  console.log(`${RECORD_FILE} recorded:`);
  for (const side of SIDES) console.log(`  ${side}: ${current[side]}`);
  process.exit(0);
}

if (!existsSync(RECORD_FILE)) {
  console.error(`${RECORD_FILE} is missing — record it with: node scripts/verify-readme-pairing.mjs --write`);
  process.exit(1);
}

const recorded = new Map(
  [...readFileSync(RECORD_FILE, "utf8").matchAll(/^(\S+):\s*([0-9a-f]{40})\s*$/gm)].map((match) => [match[1], match[2]]),
);

const stale = SIDES.filter((side) => recorded.get(side) !== current[side]);
if (stale.length > 0) {
  console.error(
    `README pairing out of sync: ${stale.join(", ")} changed since the last recorded pair.\n` +
    "Translate the change into the other README, then re-record:\n" +
    "  node scripts/verify-readme-pairing.mjs --write",
  );
  process.exit(1);
}

console.log(`README pairing OK (${SIDES.map((side) => `${side} ${current[side].slice(0, 8)}`).join(", ")})`);
