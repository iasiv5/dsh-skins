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
  const [client, host] = await Promise.all([
    readFile(clientOptions.outfile, "utf8"),
    readFile(hostOptions.outfile, "utf8"),
  ]);
  if (!client.includes('id: "dsh-skins"') || !client.includes("window.__ModuleLoader__.load")) {
    throw new Error("generated client bundle is missing the DSH module wrapper");
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
