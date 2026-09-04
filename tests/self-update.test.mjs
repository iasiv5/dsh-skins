import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codedError } from "../src/host/errors.js";
import {
  compareStableVersions,
  createSelfUpdater,
  detectInstallSource,
  fetchLatestStableRelease,
  parseStableVersion,
  repositoryIdentity,
  resolveReleaseArtifact,
} from "../src/host/self-update.js";

const PKG = "@iasiv5/dsh-skins";

function pluginManifest(version) {
  return {
    name: PKG,
    version,
    repository: { type: "git", url: "git+https://github.com/iasiv5/dsh-skins.git" },
    dist: { integrity: "sha512-" + "a".repeat(64), tarball: `https://registry.npmjs.org/${PKG}/-/${version}.tgz` },
    dsh: {
      bundle: { patch: "./cordis.patch.yml" },
      client: { platform: "web", inject: [] },
    },
  };
}

function fixture(spec = "0.3.1", version = "0.3.1") {
  const root = mkdtempSync(join(tmpdir(), "dsh-skins-update-"));
  const profileDir = join(root, "profiles", "web");
  const packageDir = join(profileDir, "node_modules", "@iasiv5", "dsh-skins");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(profileDir, "package.json"), `${JSON.stringify({
    dependencies: { [PKG]: spec },
    dsh: { profile: { bundles: [PKG] } },
  }, null, 2)}\n`);
  writeFileSync(join(profileDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(pluginManifest(version), null, 2)}\n`);
  return {
    root,
    profileDir,
    packageDir,
    cacheFile: join(root, "dsh-skins", "update-cache.json"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeInstalled(fx, spec, version) {
  const profile = JSON.parse(readFileSync(join(fx.profileDir, "package.json"), "utf8"));
  profile.dependencies[PKG] = spec;
  writeFileSync(join(fx.profileDir, "package.json"), `${JSON.stringify(profile, null, 2)}\n`);
  writeFileSync(join(fx.packageDir, "package.json"), `${JSON.stringify(pluginManifest(version), null, 2)}\n`);
}

function readProfile(fx) {
  return JSON.parse(readFileSync(join(fx.profileDir, "package.json"), "utf8"));
}

async function waitForTerminal(updater) {
  for (let index = 0; index < 100; index += 1) {
    const operation = updater.currentOperation();
    if (operation?.phase === "done" || operation?.phase === "failed") return operation;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("operation did not settle");
}

test("stable versions, repository identity, and source detection are strict", () => {
  assert.deepEqual(parseStableVersion("v0.4.0"), { version: "0.4.0", tag: "v0.4.0", parts: [0, 4, 0] });
  assert.equal(parseStableVersion("v0.4.0-beta.1"), null);
  assert.equal(compareStableVersions("0.4.0", "0.3.9"), 1);
  assert.equal(repositoryIdentity("git+https://github.com/iasiv5/dsh-skins.git"), "iasiv5/dsh-skins");
  assert.equal(detectInstallSource("link:/work/skins").kind, "link");
  assert.equal(detectInstallSource("file:/tmp/skins.tgz").kind, "file");
  assert.equal(detectInstallSource("0.3.1").kind, "npm");
  assert.equal(detectInstallSource("^1.0.0").kind, "npm");
  assert.equal(detectInstallSource("latest").kind, "npm");
  assert.equal(detectInstallSource("npm:@iasiv5/dsh-skins@1.0.0").kind, "npm");
  assert.equal(detectInstallSource("github:iasiv5/dsh-skins#main").kind, "github");
  assert.equal(detectInstallSource("github:iasiv5/skins#abc").kind, "github");
  assert.equal(detectInstallSource("file:../neighbor").kind, "file");
});

test("registry latest accepts only the exact package with a strict X.Y.Z version", async () => {
  const release = await fetchLatestStableRelease({
    currentVersion: "0.3.1",
    fetchJson: async () => pluginManifest("0.4.0"),
  });
  assert.equal(release.version, "0.4.0");
  assert.equal(release.tag, "v0.4.0");
  assert.equal(release.htmlUrl, `https://www.npmjs.com/package/${PKG}/v/0.4.0`);
  await assert.rejects(() => fetchLatestStableRelease({
    fetchJson: async () => ({ ...pluginManifest("0.4.0"), version: "0.4.0-beta.1" }),
  }), (error) => error.code === "REGISTRY_VERSION_INVALID");
  await assert.rejects(() => fetchLatestStableRelease({
    fetchJson: async () => ({ ...pluginManifest("0.4.0"), name: "something-else" }),
  }), (error) => error.code === "REGISTRY_NAME_MISMATCH");
});

test("version artifacts validate name, repository, dsh shape, and integrity", async () => {
  const artifact = await resolveReleaseArtifact({ version: "0.4.0", tag: "v0.4.0", htmlUrl: "https://example.test", name: "v0.4.0" }, {
    fetchJson: async () => pluginManifest("0.4.0"),
  });
  assert.equal(artifact.manifest.version, "0.4.0");
  assert.equal(typeof artifact.integrity, "string");
  await assert.rejects(() => resolveReleaseArtifact({ version: "0.4.0", tag: "v0.4.0" }, {
    fetchJson: async () => pluginManifest("0.4.1"),
  }), (error) => error.code === "RELEASE_VERSION_MISMATCH");
  await assert.rejects(() => resolveReleaseArtifact({ version: "0.4.0", tag: "v0.4.0" }, {
    fetchJson: async () => { const m = pluginManifest("0.4.0"); delete m.dist; return m; },
  }), (error) => error.code === "REGISTRY_INTEGRITY_MISSING");
  await assert.rejects(() => resolveReleaseArtifact({ version: "0.4.0", tag: "v0.4.0" }, {
    fetchJson: async () => { const m = pluginManifest("0.4.0"); m.repository = { url: "git+https://github.com/someone/fork.git" }; return m; },
  }), (error) => error.code === "RELEASE_REPOSITORY_MISMATCH");
});

test("one-hour cache persists across updater instances and invalidates on version change", async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  let requests = 0;
  const deps = {
    runner: async () => {},
    fetchLatestRelease: async () => {
      requests += 1;
      return { version: "0.4.0", tag: "v0.4.0", htmlUrl: "https://example.test", name: "v0.4.0" };
    },
    now: () => 1_000_000,
  };
  const first = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.1" }, deps);
  assert.equal((await first.status()).cached, false);
  const second = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.1" }, deps);
  assert.equal((await second.status()).cached, true);
  assert.equal(requests, 1);
  const changed = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.2" }, deps);
  assert.equal((await changed.status()).cached, false);
  assert.equal(requests, 2);
});

test("link installs report development mode and cannot update", async (t) => {
  const fx = fixture("link:/work/skins", "0.4.0");
  t.after(fx.cleanup);
  const updater = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.4.0" }, {
    runner: async () => assert.fail("runner must not be called"),
    fetchLatestRelease: async () => ({ version: "0.5.0", tag: "v0.5.0", htmlUrl: "https://example.test", name: "v0.5.0" }),
  });
  const status = await updater.status();
  assert.equal(status.source.kind, "link");
  assert.equal(status.updateAvailable, true);
  assert.equal(status.canUpdate, false);
  assert.equal(status.disabledReason, "development-link");
});

test("legacy github installs are recognized but never self-update", async (t) => {
  const fx = fixture("github:iasiv5/skins#c".repeat(1), "0.4.0");
  t.after(fx.cleanup);
  const updater = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.4.0" }, {
    runner: async () => assert.fail("runner must not be called"),
    fetchLatestRelease: async () => ({ version: "0.5.0", tag: "v0.5.0", htmlUrl: "https://example.test", name: "v0.5.0" }),
  });
  const status = await updater.status();
  assert.equal(status.source.kind, "github");
  assert.equal(status.updateAvailable, true);
  assert.equal(status.canUpdate, false);
  assert.equal(status.disabledReason, "legacy-github");
});

test("successful update installs the exact npm version and requires restart", async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const calls = [];
  const updater = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.1" }, {
    fetchLatestRelease: async () => ({ version: "0.4.0", tag: "v0.4.0", htmlUrl: "https://example.test", name: "v0.4.0" }),
    resolveReleaseArtifact: async (release) => ({ ...release, manifest: pluginManifest("0.4.0"), integrity: "sha512-x" }),
    runner: async (_profile, args) => {
      calls.push(args);
      // pnpm add @iasiv5/dsh-skins@0.4.0 records the bare version in dependencies
      writeInstalled(fx, "0.4.0", "0.4.0");
      const profile = readProfile(fx);
      profile.dsh.profile.bundles.push("unrelated-auto-activated-bundle");
      writeFileSync(join(fx.profileDir, "package.json"), `${JSON.stringify(profile, null, 2)}\n`);
    },
  });
  updater.startUpdate();
  const operation = await waitForTerminal(updater);
  assert.equal(operation.phase, "done");
  assert.equal(updater.restartRequired, true);
  assert.equal(calls[0].at(-1), `${PKG}@0.4.0`);
  const profile = readProfile(fx);
  assert.equal(profile.dependencies[PKG], "0.4.0");
  assert.deepEqual(profile.dsh.profile.bundles, [PKG]);
});

test("failed update restores the previous exact version", async (t) => {
  const fx = fixture("0.3.1", "0.3.1");
  t.after(fx.cleanup);
  let calls = 0;
  const updater = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.1" }, {
    fetchLatestRelease: async () => ({ version: "0.4.0", tag: "v0.4.0", htmlUrl: "https://example.test", name: "v0.4.0" }),
    resolveReleaseArtifact: async (release) => ({ ...release, manifest: pluginManifest("0.4.0"), integrity: "sha512-x" }),
    runner: async (_profile, args) => {
      calls += 1;
      if (calls === 1) {
        writeInstalled(fx, "0.4.0", "0.4.0");
        throw new Error("simulated install failure");
      }
      assert.equal(args.at(-1), `${PKG}@0.3.1`);
      writeInstalled(fx, "0.3.1", "0.3.1");
    },
  });
  updater.startUpdate();
  const operation = await waitForTerminal(updater);
  assert.equal(operation.phase, "failed");
  assert.equal(operation.rolledBack, true);
  assert.match(operation.error, /simulated install failure/);
  assert.equal(readProfile(fx).dependencies[PKG], "0.3.1");
  assert.equal(JSON.parse(readFileSync(join(fx.packageDir, "package.json"), "utf8")).version, "0.3.1");
});

test("failed operations surface machine codes and params for client-side localization", async (t) => {
  const fx = fixture("0.3.1", "0.3.1");
  t.after(fx.cleanup);
  let calls = 0;
  const updater = createSelfUpdater({ profileDir: fx.profileDir, cacheFile: fx.cacheFile, currentVersion: "0.3.1" }, {
    fetchLatestRelease: async () => ({ version: "0.4.0", tag: "v0.4.0", htmlUrl: "https://example.test", name: "v0.4.0" }),
    resolveReleaseArtifact: async (release) => ({ ...release, manifest: pluginManifest("0.4.0"), integrity: "sha512-x" }),
    runner: async (_profile, args) => {
      calls += 1;
      if (calls === 1) {
        writeInstalled(fx, "0.4.0", "0.4.0");
        throw codedError(
          "UPDATE_COMMAND_FAILED",
          "DSH 插件更新失败（exit 1）：boom",
          { exitCode: "1", output: "boom" },
        );
      }
      writeInstalled(fx, "0.3.1", "0.3.1");
    },
  });
  updater.startUpdate();
  const operation = await waitForTerminal(updater);
  assert.equal(operation.phase, "failed");
  assert.equal(operation.code, "UPDATE_COMMAND_FAILED");
  assert.deepEqual(operation.params, { exitCode: "1", output: "boom" });
  assert.equal(operation.rollbackError, undefined);
  assert.equal(operation.rolledBack, true);
  // An uncoded error keeps the legacy shape: message passthrough, no code key.
  assert.match(operation.error, /DSH 插件更新失败（exit 1）：boom/);
});
