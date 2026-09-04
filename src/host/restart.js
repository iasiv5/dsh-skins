import { spawn } from "node:child_process";
import { codedError } from "./errors.js";

const RELAUNCH_HELPER = String.raw`
const { spawn } = require('node:child_process')
const [parentPid, executable, cwd, argsJson] = process.argv.slice(1)
const args = JSON.parse(argsJson)
const waitForParent = () => {
  try {
    process.kill(Number(parentPid), 0)
    setTimeout(waitForParent, 100)
  } catch {
    setTimeout(() => {
      const child = spawn(executable, args, {
        cwd,
        env: process.env,
        detached: false,
        stdio: 'ignore',
      })
      child.once('error', () => process.exit(1))
      child.once('exit', code => process.exit(code == null ? 1 : code))
    }, 750)
  }
}
waitForParent()
`;

// Exit code used to hand a restart to the service manager: non-zero so a
// `Restart=on-failure` unit re-launches the process, while 75 (EX_TEMPFAIL)
// stays distinctive in service logs compared with genuine crash exit codes.
const MANAGED_RESTART_EXIT_CODE = 75;

// systemd sets INVOCATION_ID for every service it starts and NOTIFY_SOCKET
// for Type=notify units; either marker means this cgroup is manager-owned.
function serviceManagedEnv(env) {
  return typeof env === "object" && env !== null
    && (env.INVOCATION_ID !== undefined || env.NOTIFY_SOCKET !== undefined);
}

export function createRestartScheduler(exit, overrides = {}) {
  if (typeof exit !== "function") return { available: false, schedule() {} };
  const runtime = {
    execPath: process.execPath,
    argv: [...process.argv],
    cwd: process.cwd(),
    env: process.env,
    pid: process.pid,
    spawn,
    setTimeout,
    ...overrides,
  };
  let scheduled = false;
  return {
    available: true,
    schedule() {
      if (scheduled) return;
      scheduled = true;
      if (serviceManagedEnv(runtime.env)) {
        // Under a service manager the unit owns this cgroup: the relaunch
        // helper below would be killed by cgroup cleanup once the main
        // process exits, and its clean exit(0) never triggers
        // Restart=on-failure. Hand the restart to the manager instead.
        const managed = runtime.setTimeout(() => exit(MANAGED_RESTART_EXIT_CODE), 150);
        managed.unref?.();
        return;
      }
      const helper = runtime.spawn(runtime.execPath, [
        "-e",
        RELAUNCH_HELPER,
        String(runtime.pid),
        runtime.execPath,
        runtime.cwd,
        JSON.stringify(runtime.argv.slice(1)),
      ], {
        cwd: runtime.cwd,
        env: runtime.env,
        detached: true,
        stdio: "ignore",
      });
      helper.unref();
      const timer = runtime.setTimeout(() => exit(0), 150);
      timer.unref?.();
    },
  };
}

function agentList(agents) {
  if (agents === null || agents === undefined || typeof agents.list !== "function") return null;
  try {
    const list = agents.list();
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

export function restartSafety(agents) {
  const list = agentList(agents);
  if (list === null) return { state: "unknown", running: null };
  const running = list.filter((agent) => agent?.status === "running").length;
  return { state: running > 0 ? "blocked" : "safe", running };
}

export async function waitForRestartSafety(agents, confirmUnknown = false) {
  const list = agentList(agents);
  if (list === null) {
    if (!confirmUnknown) {
      throw codedError("RESTART_SAFETY_UNKNOWN", "无法确认 Agent 运行状态，请再次确认后重启");
    }
    return { state: "unknown", running: null };
  }
  const running = list.filter((agent) => agent?.status === "running").length;
  if (running > 0) {
    throw codedError("AGENTS_RUNNING", `检测到 ${running} 个 Agent 正在运行，请等待任务结束后再重启`, { count: running });
  }
  await Promise.all(list.map((agent) => typeof agent?.whenIdle === "function" ? agent.whenIdle() : undefined));
  const after = agentList(agents);
  if (after === null) {
    if (!confirmUnknown) {
      throw codedError("RESTART_SAFETY_UNKNOWN", "复核 Agent 状态失败，请再次确认后重启");
    }
    return { state: "unknown", running: null };
  }
  const started = after.filter((agent) => agent?.status === "running").length;
  if (started > 0) {
    throw codedError("AGENTS_RUNNING", `检测到 ${started} 个 Agent 刚刚开始运行，请稍后再重启`, { count: started });
  }
  return { state: "safe", running: 0 };
}
