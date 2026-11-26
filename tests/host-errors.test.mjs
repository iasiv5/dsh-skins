import assert from "node:assert/strict";
import test from "node:test";
import { DICTS, formatTemplate } from "../src/client/dicts.js";
import { resolveHostErrorText } from "../src/client/host-errors.js";

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

test("resolveHostErrorText localizes coded errors and never leaks the Host's raw text", () => {
  assert.equal(
    resolveHostErrorText({ code: "STORE_READONLY", text: "配置为更高版本创建，当前只读" }, enTr),
    "Created by a newer config version; read-only",
  );
  assert.equal(
    resolveHostErrorText({ code: "STORE_READONLY", text: "配置为更高版本创建，当前只读" }, zhTr),
    "配置为更高版本创建，当前只读",
  );
  // Unknown code → the localized generic naming the code, in the interface
  // language. The Host's own message text never reaches users (fix H).
  assert.equal(
    resolveHostErrorText({ code: "SOMETHING_ELSE", text: "raw fallback" }, enTr),
    "Unknown host error (SOMETHING_ELSE)",
  );
  assert.equal(
    resolveHostErrorText({ code: "SOMETHING_ELSE", text: "原始兜底" }, zhTr),
    "宿主返回未知错误（SOMETHING_ELSE）",
  );
  // Coded values keep their structured params alongside the code.
  assert.equal(
    resolveHostErrorText({ code: "SOMETHING_ELSE", params: { limit: 5 } }, enTr),
    "Unknown host error (SOMETHING_ELSE)",
  );
  // Plain strings and code-less client-side shapes keep their own text —
  // that text never went through the Host fence, so nothing leaks.
  assert.equal(resolveHostErrorText("offline", enTr), "offline");
  assert.equal(resolveHostErrorText({ message: "boom" }, enTr), "boom");
  assert.equal(resolveHostErrorText(null, enTr), "");
});
