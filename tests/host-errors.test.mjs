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

test("resolveHostErrorText localizes coded errors and falls back to the raw message", () => {
  assert.equal(
    resolveHostErrorText({ code: "STORE_READONLY", text: "配置为更高版本创建，当前只读" }, enTr),
    "Created by a newer config version; read-only",
  );
  assert.equal(
    resolveHostErrorText({ code: "STORE_READONLY", text: "配置为更高版本创建，当前只读" }, zhTr),
    "配置为更高版本创建，当前只读",
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
