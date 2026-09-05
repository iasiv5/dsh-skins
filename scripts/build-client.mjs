import { build, context } from "esbuild";
import { readFile } from "node:fs/promises";
import process from "node:process";

const clientOptions = {
  entryPoints: ["src/client/index.js"],
  outfile: "lib/client.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  charset: "utf8",
  sourcemap: false,
};

const hostOptions = {
  entryPoints: ["src/index.js"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  legalComments: "none",
  charset: "utf8",
  sourcemap: false,
};

async function validateOutputs() {
  const { name } = JSON.parse(await readFile("package.json", "utf8"));
  const [client, host] = await Promise.all([
    readFile(clientOptions.outfile, "utf8"),
    readFile(hostOptions.outfile, "utf8"),
  ]);
  // The registration id must equal the package name: the boot page keys
  // __DSH_BOOT__ entries by package name, and dsh-client-modules throws
  // "loaded without registering" when a bundle registers under any other id.
  if (!client.includes(`id: "${name}"`) || !client.includes("window.__ModuleLoader__.load")) {
    throw new Error(
      `generated client bundle is missing the DSH module wrapper: expected registration id "${name}" (src/client/index.js must register under the package.json name)`,
    );
  }
  if (!host.includes("/dsh-skins/update") || !host.includes("self-update routes")) {
    throw new Error("generated host bundle is missing the self-update routes");
  }
  console.log(`built ${clientOptions.outfile} (${Buffer.byteLength(client)} bytes)`);
  console.log(`built ${hostOptions.outfile} (${Buffer.byteLength(host)} bytes)`);
}

if (process.argv.includes("--watch")) {
  const [client, host] = await Promise.all([context(clientOptions), context(hostOptions)]);
  await Promise.all([client.watch(), host.watch()]);
  console.log("watching src/client -> lib/client.js and src/host -> lib/index.js");
} else {
  await Promise.all([build(clientOptions), build(hostOptions)]);
  await validateOutputs();
}
