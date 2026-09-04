import assert from "node:assert/strict";
import test from "node:test";
import { DICTS, formatTemplate } from "../src/client/dicts.js";
import { resolveFailedOperationText, resolveHostErrorText } from "../src/client/host-errors.js";

/** tr that behaves like the official locale runtime bound to the en dict. */
const enTr = (key, params = {}) => {
  const template = DICTS.en[key];
  if (template === undefined) return key;
  return formatTemplate(template, params);
};
const zhTr = (key, params = {}) => {
  const template = DICTS.zh[key];
  if (template === undefined) return key;
  return formatTemplate(template, params);
};

test("resolveHostErrorText localizes coded errors and falls back to the raw message", () => {
  assert.equal(
    resolveHostErrorText({ code: "AGENTS_RUNNING", params: { count: 2 }, text: "检测到 2 个 Agent 正在运行" }, enTr),
    "2 Agent(s) are running; try again later",
  );
  assert.equal(
    resolveHostErrorText({ code: "AGENTS_RUNNING", params: { count: 2 }, text: "检测到 2 个 Agent 正在运行" }, zhTr),
    "检测到 2 个 Agent 正在运行，请稍后重试",
  );
  // Unknown code → raw host message, never a bare key.
  assert.equal(
    resolveHostErrorText({ code: "SOMETHING_ELSE", text: "raw fallback" }, enTr),
    "raw fallback",
  );
  // Plain strings (client-side errors) pass through untouched.
  assert.equal(resolveHostErrorText("offline", enTr), "offline");
  assert.equal(resolveHostErrorText(null, enTr), "");
});

test("resolveFailedOperationText composes the rollback suffix in both languages", () => {
  const operation = {
    phase: "failed",
    message: "DSH 插件更新失败（exit 1）：boom；自动回滚失败：恢复后的版本锁定校验失败",
    code: "UPDATE_COMMAND_FAILED",
    params: { exitCode: "1", output: "boom" },
    rollbackError: { code: "ROLLBACK_LOCKFILE_MISMATCH" },
  };
  assert.equal(
    resolveFailedOperationText(operation, enTr),
    "DSH plugin update failed (exit 1): boom; automatic rollback failed: Restored profile failed exact-version verification",
  );
  assert.equal(
    resolveFailedOperationText({ phase: "failed", message: "已经是最新正式版本", code: "UPDATE_ALREADY_LATEST" }, zhTr),
    "已经是最新正式版本",
  );
  // Uncoded failures keep their host message verbatim.
  assert.equal(resolveFailedOperationText({ phase: "failed", message: "simulated install failure" }, enTr), "simulated install failure");
});
