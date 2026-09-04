import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { codedError } from "./errors.js";

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const WINDOWS_METACHARS = /[\s"&|<>^()%!]/;

function quoteWindowsArg(value) {
  if (!WINDOWS_METACHARS.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function spawnPortable(file, args, options) {
  const { viaShell = false, ...spawnOptions } = options;
  if (process.platform !== "win32" || viaShell !== true) {
    return spawn(file, args, { ...spawnOptions, shell: false });
  }
  const commandLine = [file, ...args].map(quoteWindowsArg).join(" ");
  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], {
    ...spawnOptions,
    shell: false,
    windowsVerbatimArguments: true,
  });
}

export function currentDshInvocation() {
  const entry = process.argv[1];
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const absolute = resolve(entry);
    return {
      file: process.execPath,
      prefix: [...process.execArgv, absolute],
      cwd: dirname(absolute),
      viaShell: false,
    };
  }
  return { file: "dsh", prefix: [], cwd: undefined, viaShell: process.platform === "win32" };
}

export function runDshPlugin(profile, args, options = {}) {
  const invocation = options.invocation ?? currentDshInvocation();
  const argv = [...invocation.prefix, "plugin", "--profile", profile, ...args, "--reporter=ndjson"];
  return new Promise((resolvePromise, reject) => {
    const child = spawnPortable(invocation.file, argv, {
      cwd: invocation.cwd,
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      viaShell: invocation.viaShell,
    });
    let output = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise(output);
    };
    const append = (chunk) => {
      const text = String(chunk);
      output = (output + text).slice(-256 * 1024);
      options.onChunk?.(text);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", finish);
    child.on("close", (code) => {
      if (code === 0) finish();
      else {
        const tail = output.trim().slice(-1200) || "no output";
        finish(codedError(
          "UPDATE_COMMAND_FAILED",
          `DSH 插件更新失败（exit ${String(code)}）：${tail}`,
          { exitCode: String(code), output: tail },
        ));
      }
    });
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          if (process.platform === "win32") child.kill("SIGTERM");
          else process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
      finish(codedError("UPDATE_COMMAND_TIMEOUT", "DSH 插件更新超时"));
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    timer.unref?.();
  });
}
