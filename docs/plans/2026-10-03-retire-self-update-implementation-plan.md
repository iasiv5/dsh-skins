# 退役 dsh-skins 自更新器（更新职责移交 dsh-m）实施计划

## 目标

- 整体移除 dsh-skins 自更新器：npm registry 检查、精确版本安装、失败自动回滚、更新栏 UI、`/dsh-skins/update` 与 `/dsh-skins/restart` 路由、配套测试与文档，代码零残留。
- 更新发现与执行移交 dsh-m 市场（头部角标、`dshm outdated/upgrade`）与 `dsh plugin update`；npm 仍是唯一分发渠道（ADR-0005 渠道决策保留）。
- 文档收尾：新建 ADR-0008、重写 GLOSSARY「分发与更新」节、改写双语 README（含配对记录重录）、清理 developers.md 更新事务描述、给 ADR-0005 加取代横幅。
- 以 v1.3.0 发布，并**用 dsh-m 链路完成本次升级**作为退役验收；桌面机验收允许滞后（24h+ 窗口）。

## 架构快照

- Host 侧：`apply(ctx)` 现在装配 updater（self-update.js）+ restart 调度器（restart.js）+ `mountUpdateRoutes`（routes.js）+ personalization 路由。退役后只剩 personalization：inject 服务从 `["webServer", "agents", "webRuntime"]` 收窄为 `["webServer", "webRuntime"]`，effect 标签从 `dsh-skins: self-update routes` 改为 `dsh-skins: personalization routes`。
- `src/host/routes.js` 必须与 restart.js **同任务删除**：routes.js:1 `import { restartSafety, waitForRestartSafety } from "./restart.js"`，且被 personalization-routes.js:13 引用——esbuild 会打包相对导入链，分任务删除必然构建失败（评审 F1）。删除后仅 `isTrustedRequest` 及其依赖链存活，原文迁入 personalization-routes.js。
- trust 迁移完整闭包（评审 F2）：`parseAuthority`（routes.js:17-23）、`canonicalAuthority`（routes.js:25-28）、`isLoopbackHostname`（routes.js:30-36）、`isTrustedAuthority`（routes.js:38-47）、`isTrustedRequest`（routes.js:49 起，含 JSDoc）；`header` 复用 personalization-routes.js 既有本地实现，不迁移。
- `src/host/runner.js`（`runDshPlugin`）仅被 self-update 装配引用 → 随退役删除。
- 客户端侧：`sidebar-switcher.js` 引 `update-panel.js` 的 `createUpdatePanel`/`UPDATE_CSS` 并在皮肤卡片后挂更新栏；`.dsh-skins-update-spinner` 是更新面板与个性化删除徽标**共享**的 CSS 原子（更新面板死后名字变成误称）→ 面板删除、spinner 更名 `.dsh-skins-spinner` 留给个性化面板。
- `host-errors.js` 的 `HOST_ERROR_KEYS` 中 24 个 update/restart/registry/release/profile/rollback 映射与 `resolveFailedOperationText` 仅服务更新域 → 删除；personalization 族保留。`dicts.js` 对应中英文案成对删除（`dicts.test.mjs` 按 `HOST_ERROR_KEYS` 泛型迭代，自动适配，无需改动）。
- 构建守卫 `scripts/build-client.mjs:44-45` 断言宿主 bundle 含 `/dsh-skins/update` 与 `self-update routes` → 换锚为 personalization，并**新增反向断言**（update 锚缺席），防止功能复活。

## 全局约束

- 退役必须彻底：代码、UI、i18n、错误码、测试、README 承诺零残留；不做「隐藏不删」（grill 共识 Q1=A）。
- npm 仍是唯一分发渠道：dist-tag 只用 latest，严格 `X.Y.Z`，安装形态为精确版本固定（逐字继承 ADR-0005 Constraints）。
- 配置与图库数据目录 `$DSH_HOME/dsh-skins/` 与插件安装目录物理隔离的承诺不变；文档改写不得弱化该承诺。
- 版本号 1.3.0（minor；配置/皮肤/宿主契约零变化，grill 共识 Q4）。
- 发布验收只走 dsh-m 链路；升级窗口期内不得点击旧 1.2.3 自更新栏（grill 共识 Q8）。
- 接受的损失（grill 共识 Q2，写入 ADR-0008，不得在文档中粉饰）：①「先备份再安装、失败自动回滚」事务；②「Agent 运行中阻止重启」安全门；③桌面机升级受 npmmirror 同步滞后 + minimumReleaseAge 等待期约束（know-how 020 红线：产品内不绕过）。
- 发布遵循 know-how 018：CI 绿 ≠ 已上架（staged 延迟实测 17–39 分钟），必须 registry 三键交叉验证后再升级；窗口期内不得重推 tag。
- 无额外全局约束（无新依赖、无 Node 版本变化）。

## 输入工件

- 设计来源：本会话 `/grill-with-docs` 两轮共识（Q1-Q8 全按推荐 + Q7 改计划先行 + Q8 按推荐）。
- `dsh-skins/docs/adr/0005-npm-registry-update-channel.md`（被部分取代的出生证明）。
- `01_docs/dsh-intall-know-how/018`（npm staged 发布延迟与三键验证）、`020`（desktop 装机通道与红线）、`008`（registry verified 数组为发版后常规动作，不在本计划内）。
- 评审记录：plan-reviewer 第一轮 11 条（F1-F11）与第二轮 3 条（N1-N3）共 14 条全部接受，已并入本计划对应任务。

## 文件结构与职责

- Create: `docs/adr/0008-retire-self-updater.md` — 退役决策记录（正文见 Task 4）。
- Delete: `src/host/self-update.js`、`src/host/restart.js`、`src/host/runner.js`、`src/host/routes.js`、`src/client/update-panel.js`
- Delete: `tests/self-update.test.mjs`、`tests/restart-routes.test.mjs`、`tests/routes-integration.test.mjs`、`tests/update-panel.test.mjs`
- Modify: `src/index.js`（装配收窄）、`src/host/personalization-routes.js`（接收 trust 函数闭包）、`src/host/atomic-write.js`（注释去 self-update 引用）
- Modify: `src/client/sidebar-switcher.js`（解挂更新栏 + spinner 更名）、`src/client/personalization/panel.js`（spinner 更名）、`src/client/host-errors.js`（裁剪）、`src/client/dicts.js`（裁剪）
- Modify: `tests/built-host.test.mjs`（新契约）、`tests/sidebar-switcher.test.mjs`（CSS 契约）、`tests/host-errors.test.mjs`（裁剪）
- Modify: `smoke-test.cjs`（删更新面板断言）、`scripts/build-client.mjs`（守卫换锚）、`scripts/verify-release.mjs`（仅注释）
- Modify: `README.md`、`README.en.md`（更新章节与 FAQ）、`README.i18n.yaml`（配对记录重录）、`GLOSSARY.md`（分发节）、`docs/developers.md`（去更新事务段）、`docs/adr/0005-npm-registry-update-channel.md`（取代横幅）
- Modify: `package.json`（1.2.3 → 1.3.0，归入 release commit）
- 边界：`personalization/` 目录逻辑、皮肤本体、`errors.js`、`verify-upstream-hooks.mjs`、`cordis.patch.yml` 一律不动。

## 任务清单

### Task 1: Host 侧退役与 routes.js 解体（模块、trust 迁移、装配、构建守卫、宿主测试）

- 目标：删除自更新 Host 全部模块与装配；`routes.js` 与 `restart.js` 同任务删除（构建链耦合，评审 F1），trust 函数闭包原文迁入 `personalization-routes.js`（评审 F2）；宿主 bundle 只挂 personalization 路由。
- 涉及文件：删 `src/host/self-update.js`、`src/host/restart.js`、`src/host/runner.js`、`src/host/routes.js`、`tests/self-update.test.mjs`、`tests/restart-routes.test.mjs`、`tests/routes-integration.test.mjs`；改 `src/index.js`、`src/host/personalization-routes.js`、`scripts/build-client.mjs`、`src/host/atomic-write.js`；重写 `tests/built-host.test.mjs`。
- 接口契约：
  - Consumes: `mountPersonalizationRoutes(hostContext, { store, trustedHosts })`（现状不动）。
  - Produces: effect 标签 `dsh-skins: personalization routes`（宿主测试与 build-client 守卫共同锚定）；trust 判定由 `personalization-routes.js` 内部持有，对外行为不变（`tests/personalization-routes.test.mjs` 的 403 围栏测试 L81、trust hardening 测试 L335 为行为锚）。
- 验证范围：`pnpm run build` + `node --test tests/built-host.test.mjs tests/personalization-routes.test.mjs`。

- [ ] Step 1: 重写 `tests/built-host.test.mjs` 为新契约（完整目标内容）：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { apply, name } from "../lib/index.js";

test("generated Host bundle mounts and disposes personalization routes through DSH services", () => {
  const routes = [];
  let routeDisposals = 0;
  let pluginDispose;
  const host = {
    webServer: {
      register(route) {
        routes.push(route);
        return () => { routeDisposals += 1; };
      },
    },
    webRuntime: { trustedHosts: ["example.test"] },
    effect(setup, label) {
      assert.equal(label, "dsh-skins: personalization routes");
      pluginDispose = setup();
    },
  };
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ["webServer", "webRuntime"]);
      callback(host);
    },
    get(service) {
      throw new Error(`unexpected service lookup: ${service}`);
    },
  };

  assert.equal(name, "@iasiv5/dsh-skins");
  apply(ctx);
  assert.deepEqual(routes.map((route) => route.path), [
    "/dsh-skins/config",
    "/dsh-skins/recovery",
    "/dsh-skins/library",
    "/dsh-skins/library",
    "/dsh-skins/assets",
  ]);
  assert.deepEqual(routes.map((route) => route.kind), [
    "exact", "exact", "exact", "prefix", "prefix",
  ]);
  assert.equal(typeof pluginDispose, "function");
  pluginDispose();
  assert.equal(routeDisposals, 5);
});
```

- Run: `node --test tests/built-host.test.mjs`
- Expected: 失败于 `inject` 的 `assert.deepEqual(services, ["webServer", "webRuntime"])`（旧 index.js 传 3 个服务，先于 label 断言触发）
- [ ] Step 2: 删除五个源文件与三个测试文件（见涉及文件清单）。注意 `routes.js` 与 `restart.js` 必须同批删除——`personalization-routes.js:13` 仍引用 routes.js、routes.js:1 引用 restart.js，链条必须在本任务内一次断净。
- [ ] Step 3: `src/index.js` 收窄。删除 L5-L8 四个 import、`packageVersion()`/`packageRoot()`/`readFileSync` import（三者只为 updater 的 currentVersion 服务，已核实无其他引用）、updater/restart 两段装配；inject 服务数组改 `["webServer", "webRuntime"]`；effect 标签改 `dsh-skins: personalization routes`；删除文件末尾 `export { createSelfUpdater } ...` 行。目标形态（`dirname`/`fileURLToPath` 唯一使用者已删，import 一并清掉——评审 F8）：

```js
import { homedir } from "node:os";
import { join } from "node:path";
import { createPersonalizationStore } from "./host/personalization/store.js";
import { mountPersonalizationRoutes } from "./host/personalization-routes.js";

export const name = "@iasiv5/dsh-skins";

function dshHome() {
  return process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
}

export function apply(ctx) {
  ctx.inject(["webServer", "webRuntime"], (hostContext) => {
    const root = dshHome();
    const personalization = createPersonalizationStore({
      dataDir: join(root, "dsh-skins"),
    });
    hostContext.effect(() => {
      return mountPersonalizationRoutes(hostContext, {
        store: personalization,
        trustedHosts: hostContext.webRuntime.trustedHosts,
      });
    }, "dsh-skins: personalization routes");
  });
}
```

- [ ] Step 4: `src/host/personalization-routes.js` 接收 trust 闭包（评审 F2）：将 routes.js 的 `parseAuthority`（L17-23）、`canonicalAuthority`（L25-28）、`isLoopbackHostname`（L30-36）、`isTrustedAuthority`（L38-47）、`isTrustedRequest`（L49 起，含 JSDoc）**逐字**复制到 import 块之后、路由注册之前；删除 L13 `import { isTrustedRequest } from "./routes.js";`。`header` 不迁移——personalization-routes.js 已有同实现（L46 附近），被迁入的 `isTrustedRequest` 直接复用本文件版本。
- [ ] Step 5: `scripts/build-client.mjs` L44-45 守卫换锚并加反向断言（routes.js 已同批删除，`/dsh-skins/update` 字面量不再可能入 bundle）：

```js
  if (!host.includes("/dsh-skins/config") || !host.includes("personalization routes")) {
    throw new Error("generated host bundle is missing the personalization routes");
  }
  if (host.includes("/dsh-skins/update") || host.includes("self-update routes")) {
    throw new Error("generated host bundle still contains self-update remnants");
  }
```

- [ ] Step 6: `src/host/atomic-write.js` 头注释（grep 锚 `self-update.js`）：改写为直接陈述共享不变量（用户数据写入走同一原子替换路径），不再引用已删除模块名。
- [ ] Step 7: 运行并确认通过。
- Run: `pnpm run build && node --test tests/built-host.test.mjs tests/personalization-routes.test.mjs`
- Expected: 构建绿；两个测试文件全绿（5 条路由、5 次 dispose、无多余 service lookup；403 围栏与 trust hardening 保持绿证明 trust 迁移逐字无变形）
- [ ] Step 8: 残留自查（限本任务 touched 面；评审 N1：全域扫描此时会命中三类后续任务才消除的合法存在——build-client.mjs 守卫字面量、verify-release.mjs 旧注释的 "self-updater" 子串、update-panel.js:3 端点字面量）。
- Run: `grep -rn "self-update\|createSelfUpdater\|runDshPlugin\|createRestartScheduler\|mountUpdateRoutes\|dsh-skins/update" src/index.js src/host tests/built-host.test.mjs tests/personalization-routes.test.mjs`
- Expected: 0 命中（客户端残留归 Task 2、verify-release 注释归 Task 5，不在本步扫描面）

### Task 2: 客户端退役（更新栏、错误映射、文案）

- 目标：删除更新面板与其全部客户端配套，CSS 组合与错误码表收窄到 personalization。
- 涉及文件：删 `src/client/update-panel.js`、`tests/update-panel.test.mjs`；改 `src/client/sidebar-switcher.js`、`src/client/host-errors.js`、`src/client/dicts.js`、`tests/host-errors.test.mjs`、`tests/sidebar-switcher.test.mjs`、`smoke-test.cjs`。
- 接口契约：
  - Consumes: Task 1 产物（宿主已无 `/dsh-skins/update` 路由，客户端断言才有意义）。
  - Produces: `sidebar-switcher.js` 的 CSS 组合收敛为 `[SHELL_CSS, PANEL_CSS]`；`HOST_ERROR_KEYS` 仅存 personalization 族；spinner 更名留给 Task 3，本任务后 `.dsh-skins-update-spinner` CSS 行原样保留。
- 验证范围：build + 相关单测 + smoke-test。

- [ ] Step 1: 先改测试（失败先行）：`tests/sidebar-switcher.test.mjs` 删 L10 `UPDATE_CSS` import，L350-351 改为 `assert.ok(css.endsWith(PANEL_CSS + "\n"), "组合契约：单标签以 [SHELL, PANEL] 收尾")`；`tests/host-errors.test.mjs` 删 `resolveFailedOperationText` import 与第二个 test，第一个 test 中 `AGENTS_RUNNING` 映射断言换成 `STORE_READONLY`（期望文本取自 `dicts.js` 的 `host.personalization.readonly` 中英模板，保持 zh/en 双断言结构），未知码回退、纯字符串、null 三段断言原样保留。
- Run: `node --test tests/sidebar-switcher.test.mjs tests/host-errors.test.mjs`
- Expected: 失败（旧代码仍导出 `UPDATE_CSS`、仍映射 `AGENTS_RUNNING`）
- [ ] Step 2: 删 `src/client/update-panel.js` 与 `tests/update-panel.test.mjs`。
- [ ] Step 3: `sidebar-switcher.js` 解挂四处（评审 F3 补第三处）：删 L1 import；删 L255 `const UpdatePanel = createUpdatePanel({ jsx, react });`；L252 改 `const CSS = [SHELL_CSS, PANEL_CSS].join("\n");`；删 L536 `jsx(UpdatePanel, { key: "update", open, tr }),` 一行。L176-181 spinner CSS 块本任务不动。
- [ ] Step 4: `host-errors.js` 裁剪：`HOST_ERROR_KEYS` 删除 24 个映射——`RESTART_UNAVAILABLE`、`NO_PENDING_UPDATE`、`RESTART_SAFETY_UNKNOWN`、`AGENTS_RUNNING`、`UPDATE_LINK_PROTECTED`、`UPDATE_SOURCE_UNSUPPORTED`、`UPDATE_ALREADY_LATEST`、`UPDATE_SOURCE_CHANGED`、`UPDATE_COMMAND_FAILED`、`UPDATE_COMMAND_TIMEOUT`、`REGISTRY_CHECK_FAILED`、`REGISTRY_NAME_MISMATCH`、`REGISTRY_VERSION_INVALID`、`REGISTRY_INTEGRITY_MISSING`、`RELEASE_MANIFEST_MISSING`、`RELEASE_NAME_MISMATCH`、`RELEASE_VERSION_MISMATCH`、`RELEASE_REPOSITORY_MISMATCH`、`RELEASE_NOT_WEB_PLUGIN`、`RELEASE_NO_BUNDLE_PATCH`、`PROFILE_NOT_PINNED`、`PROFILE_BUNDLE_MISSING`、`ROLLBACK_LOCKFILE_MISMATCH`、`ROLLBACK_BUNDLE_MISSING`；删除 `resolveFailedOperationText` 函数；**两处注释都改**（评审 F7）：文件头注释（L1-3「shared by the update panel and the personalization panel」）与 `HOST_ERROR_KEYS` 的 jsdoc 段（L5-10 含「the update panel renders the localized template」），均改为仅 personalization 语境。
- [ ] Step 5: `dicts.js` 成对删除：zh 与 en 各删两段——`"update.checking"` 起至 `"update.phase.rollback"` 止；`"host.restart.unavailable"` 起至 `"host.rollback.bundleMissing"` 止。
- [ ] Step 6: `smoke-test.cjs` 三段精确删除（评审 F6：皮肤卡断言与 ✓ popover 行夹在 find 与 update 块之间，不得整块删）：①删 L332 `const updatePanelNode = panelChildren.find(...)` 一行；②删 L335 `if (typeof updatePanelNode?.type !== "function") throw ...` 一行；③删 L346 块首注释 `// ---- update panel states: ...` 起至 L400 `console.log("✓ update panel covers link, available, current, error, progress, and restart states")` 止。L333-334、L336-343 皮肤卡/gear 断言与 L344 `✓ popover` 行**原样保留**。
- [ ] Step 7: 运行并确认通过。
- Run: `pnpm run build && node --test tests/sidebar-switcher.test.mjs tests/host-errors.test.mjs tests/dicts.test.mjs tests/personalization-panel.test.mjs && node smoke-test.cjs`
- Expected: 全绿；smoke-test 输出保留 `✓ popover` 行、不再含 update panel 行，其余 ✓ 行完好
- [ ] Step 8: 裁剪自查。
- Run: `grep -n "update\." src/client/dicts.js | grep -v hot-update; grep -n "REGISTRY_\|RELEASE_\|ROLLBACK_\|UPDATE_\|RESTART_" src/client/host-errors.js`
- Expected: 两条均 0 命中

### Task 3: spinner 更名（`.dsh-skins-update-spinner` → `.dsh-skins-spinner`）

- 目标：更新面板死后消除误称，共享 CSS 原子归位给个性化删除徽标。
- 涉及文件：`src/client/sidebar-switcher.js`（L176-178 注释、L179/181 两行 CSS）、`src/client/personalization/panel.js`（L36 注释、L102 CSS、L282 jsx className）。全仓库恰好这 5 处（已核实 tests/smoke-test 无残留引用，相关断言已在 Task 2 删除）。
- 接口契约：Consumes: Task 2 后的 sidebar-switcher CSS 块。Produces: 类名 `.dsh-skins-spinner` + keyframes `dsh-skins-spin`（保留原名）。
- 验证范围：build + personalization 面板测试 + 旧名清零 grep。纯更名，无 TDD 循环。

- [ ] Step 1: 5 处替换 + L176-178 注释改写为「【共享原子】.dsh-skins-spinner（含 keyframes 与 reduced-motion 退出）是个性化面板删除徽标的加载指示」语义。
- [ ] Step 2: 运行并确认通过。
- Run: `pnpm run build && node --test tests/personalization-panel.test.mjs tests/sidebar-switcher.test.mjs && grep -rn "dsh-skins-update-spinner" src tests scripts smoke-test.cjs lib`
- Expected: 测试绿；grep 0 命中（lib 为重建产物，一并验证）

### Task 4: 文档收尾（README 双语与配对重录、GLOSSARY、ADR-0008、0005 横幅、developers.md）

- 目标：文档与现实一致；为「为什么插件没有更新功能」留下决策出处；docs 面零残留。
- 涉及文件：`README.md`、`README.en.md`、`README.i18n.yaml`（重录）、`GLOSSARY.md`、`docs/developers.md`、`docs/adr/0008-retire-self-updater.md`（新建）、`docs/adr/0005-npm-registry-update-channel.md`。
- 接口契约：Consumes: Task 1-3 的事实（路由消失、spinner 更名、更新栏移除）。Produces: ADR-0008 供 README 引用；`README.i18n.yaml` 重录后 `pnpm run verify:readme` 保持绿为双语配对门槛（评审 F4：verify-readme-pairing.mjs 以 git blob hash 比对，双侧编辑后必须 `--write` 重录，否则 verify 恒红）。
- 验证范围：重录 + `pnpm run verify:readme` + 双语与 docs 残留 grep。

- [ ] Step 1: 新建 `docs/adr/0008-retire-self-updater.md`（格式对齐 0005）：

```markdown
# 退役自更新器，更新职责移交 dsh-m 市场

---
status: accepted
date: 2026-10-03
---

插件不再自带更新器：npm registry 检查、精确版本安装、失败自动回滚、更新栏 UI 与
`/dsh-skins/update`、`/dsh-skins/restart` 路由整体移除。更新发现交给 dsh-m 市场的头部
升级角标与 `dshm outdated/upgrade`，执行交给 `dsh plugin update`（市场升级与 CLI 等价）。
动因：dsh-m 的升级链路（peer 预检、releaseAge 预检、发版延迟处理）已覆盖本插件的全部
更新场景，插件内并行维护一套检查/安装/回滚机制是重复负债；且更新检查每次打开皮肤
切换器都直连 registry.npmjs.org，是一层可去除的网络依赖。取舍：失去「先备份再安装、
失败自动回滚」的事务与「Agent 运行中阻止重启」的安全门——前者由包管理器的精确版本
加 lockfile 完整性校验兜底（失败的最坏情形是插件未加载，重装旧精确版本即恢复），后者
由 dsh-m 与宿主的重启流程接管。本 ADR 部分取代 0005：npm 作为唯一分发渠道的决策不变，
废除的只是「插件自己检查并安装自己」的机制。

## Constraints

- npm 仍是唯一分发渠道：dist-tag 只用 latest，严格 X.Y.Z，安装形态是精确版本固定（继承 0005）。
- 配置与图库数据目录 `$DSH_HOME/dsh-skins/` 与插件安装目录物理隔离的承诺不变，任何升级通道都不得触碰。
- 桌面 profile 的升级受 npmmirror 同步滞后与 minimumReleaseAge 等待期约束；产品内不绕过（know-how 020 红线）。

## Consequences

- 皮肤切换器不再有更新栏；`detectInstallSource`、`update-cache.json` 缓存与 `link:`/`github:` 来源引导随之消失——`link:` 开发安装照常工作，只是没有更新语义。
- 升级失败的恢复路径 = `dsh plugin add --profile web @iasiv5/dsh-skins@<旧精确版本>`。
- README、GLOSSARY 与 docs/developers.md 的自更新描述、ADR-0005 的自更新器机制描述一并退役。
```

- [ ] Step 2: `docs/adr/0005` frontmatter 之后加一行横幅：`> 2026-10-03：本文的「自更新器」机制已由 [0008](./0008-retire-self-updater.md) 退役；npm 作为唯一分发渠道的决策继续有效。`
- [ ] Step 3: `GLOSSARY.md`：「分发与更新」节（锚 `### 分发与更新` 至 `### 资产与存储` 前）替换为 `### 分发`，仅保留词条「正式版本」，定义改为「严格 X.Y.Z 的语义化版本及其 v 前缀 tag；发布链路与升级通道都只接受它，npm latest 标签指向最新正式版本。」_Avoid_ 保留「版本号（与配置格式的修订号混淆）」；「更新通道」「安装来源」两词条删除。
- [ ] Step 4: `docs/developers.md`（评审 F5）「工作原理」段三处：①L16 引言「插件怎么构成、更新事务怎么落地。」→「插件怎么构成。」②L18 双端结构句「Host 负责 npm registry 检查、安全安装与重启」→「Host 负责个性化配置、图库与资产路由」③「**更新事务**（Host）：」起至「**明暗持久化**」前整块删除（L20-25，含 update-cache、来源迁移、自动恢复、INVOCATION_ID/NOTIFY_SOCKET 探测四条 bullet）。L84/86/92 的「重启/更新/ link:」提法属正常运维语义，不动。
- [ ] Step 5: `README.md` 按锚点逐处改写：
  - L28：删括注「（与一键更新落地后的形态完全一致）」，保留「需要可复现安装时，固定到精确版本：」。
  - L135：「升级、回滚、一键更新都碰不到它」→「插件升级（经 dsh-m 市场或 `dsh plugin`）只替换插件安装目录，碰不到它」。
  - L155-171 整节「一键更新与安全设计」→ 新节：

    ```markdown
    ## 更新

    本节回答：插件怎么更新。

    插件不自带更新器（ADR-0008）：更新发现与安装交给 dsh-m 市场，或 DSH 官方 CLI——
    升级用 `dsh plugin --profile web update @iasiv5/dsh-skins`；回滚 = 重装旧精确版本
    `dsh plugin add --profile web @iasiv5/dsh-skins@X.Y.Z`。npm 上 `@iasiv5/dsh-skins`
    的 latest 精确版本仍是唯一分发形态，版本策略维持严格 X.Y.Z。
    ```
  - FAQ L178-179「更新失败会怎样？」→ 替换为「**为什么没有「检查更新」按钮？** 更新职责已移交 dsh-m 市场与 DSH CLI（ADR-0008）；皮肤切换器只负责换肤与个性化。」
  - L188 答句中「自更新只替换插件安装目录」→「升级只替换插件安装目录（无论经哪个通道）」。
- [ ] Step 6: `README.en.md` 同义镜像以上五处：节题为「## One-click updates and the security design」（L155，评审 F11 更正引名）→「## Updates」；FAQ 锚为「**What happens when an update fails?**」（L178，评审 N3 更正——「How do updates fail?」实际不存在，照抄会静默跳过）；其余锚 `one-click update`、`self-update` 大小写不敏感查找。
- [ ] Step 7: 双语同步后重录配对记录（评审 F4）：`node scripts/verify-readme-pairing.mjs --write`，随后确认 `README.i18n.yaml` 的 diff 仅两条 hash 行变化。
- [ ] Step 8: 运行并确认通过。
- Run: `pnpm run verify:readme && grep -in "一键更新\|自更新\|先备份\|one-click update\|self-updat\|back up first" README.md README.en.md GLOSSARY.md docs/developers.md`
- Expected: verify 绿；grep 0 命中（`先备份`/`back up first` 两条堵住旧 FAQ 事务描述的静默残留盲区，评审 N3；`docs/adr/` 历史记录与本计划文档不在扫描范围）

### Task 5: 发布与验收（v1.3.0，dsh-m 链路闭环）

- 目标：全量检查、提交、发布、按 018 验证上架、经 dsh-m 升级本机并完成退役端到端验收。
- 涉及文件：`package.json`、`scripts/verify-release.mjs`（仅注释）、git/registry/dsh-m 操作。
- 接口契约：Consumes: Task 1-4 全绿。Produces: npm `@iasiv5/dsh-skins@1.3.0`；本机 profile 1.3.0 装机；桌面机交接说明。
- 验证范围：`pnpm run check` + registry 三键 + 装机后端到端清单。

- [ ] Step 1: `scripts/verify-release.mjs` 仅注释改写：L10「the self-updater rejects anything else」→「the release pipeline and the dsh-m upgrade channel accept nothing else」；L33「the self-updater pins tag↔version↔repository」→「release provenance pins tag↔version↔repository」。逻辑零改动。
- Run: `node scripts/verify-release.mjs v1.3.0`
- Expected: 当前版本下报版本不匹配属预期，仅确认脚本可执行无语法错（真正验证在发版 CI）
- [ ] Step 2: 全量检查。
- Run: `pnpm run check`
- Expected: build、node --check、smoke-test、全部单测、verify:readme、verify:bundle、verify:hooks 全绿
- [ ] Step 3: 全仓库残留终扫（负向清零 + 正向在位双向验证；评审 N2：build-client.mjs 的反向守卫永久含有侦测字面量，是唯一合法命中者——排除后单独断言其在位）。
- Run: `(grep -rn "self-update\|dsh-skins/update\|dsh-skins/restart\|createSelfUpdater\|update-panel\|UPDATE_CSS\|dsh-skins-update-spinner\|update-cache" src scripts tests smoke-test.cjs GLOSSARY.md README.md README.en.md docs/developers.md | grep -v "^scripts/build-client.mjs:") || true; grep -c "self-update routes" scripts/build-client.mjs`
- Expected: 第一段无输出（0 行残留；`docs/adr/` 历史记录与本计划文档不在扫描范围）；第二段计数 ≥1（防复活守卫在位）
- [ ] Step 4: 提交退役（单一原子 commit，跨代码/测试/文档不可分割）。
- Run: `git add -A && git commit -m "refactor!: retire the self-updater; updates move to dsh-m (ADR-0008)"`
- [ ] Step 5: 版本与发布 commit：`package.json` `1.2.3` → `1.3.0`；`git add package.json && git commit -m "chore: release v1.3.0" && git tag v1.3.0 && git push origin main v1.3.0`
- [ ] Step 6: 上架核验（018：绿 ≠ 已上架；staged 延迟实测 17–39 分钟，见 018 §1 与 §7）。Release workflow 绿后轮询三键，轮询间隔 ≥60s，**上限 45 分钟**；超限按 018 §5 判定法处置（读 job logs 找 `Your package is being processed`，**不得重推 tag**）：
- Run: `npm view @iasiv5/dsh-skins@1.3.0 version dist.integrity --json && curl -s https://registry.npmjs.org/@iasiv5%2Fdsh-skins | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dist-tags']['latest'], '1.3.0' in d['versions'])"`
- Expected: `1.3.0`、integrity 存在、latest=1.3.0 且版本在 versions 表
- [ ] Step 7: 经 dsh-m 升级本机（主路径；**不得点击旧 1.2.3 自更新栏**）：dsh-m 市场角标 → 升级 `@iasiv5/dsh-skins`（CLI 后备 `dsh plugin --profile web update @iasiv5/dsh-skins`），随后重启 DSH Web（`dshm_restart` 或 `sudo systemctl restart deepseek-harness.service`）。
- [ ] Step 8: 退役端到端验收清单（逐条留痕）：
  1. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/dsh-skins/update` 与 `/dsh-skins/restart` → 非 200/202 即通过（401=宿主认证墙、404=路由已死，均证明更新路由不存在）；
  2. 打开皮肤切换器：无更新栏；meirenzhi / openbmc / uefi-harness / tgcf 四皮肤切换正常，`/?skin=official` 回官方正常；
  3. 个性化面板：字段自动保存、恢复默认二次确认、图库上传/删除正常（删除徽标 spinner 正常转动，即 Task 3 更名无回归）;
  4. `grep -c "self-update routes" ~/.dsh/profiles/web/node_modules/@iasiv5/dsh-skins/lib/index.js` → 0，且装机版本为 1.3.0；
  5. dsh-m 角标对 dsh-skins 不再点亮（`dshm outdated` 无 dsh-skins 条目）；
  6. 清理残留缓存：`mkdir -p ~/workspace/.dsh-skins-retire-backup && mv ~/.dsh/dsh-skins/update-cache.json ~/workspace/.dsh-skins-retire-backup/ 2>/dev/null || echo "no cache file"`（观察期后随定案清理）。
- [ ] Step 9: 桌面机交接（非本机任务，写入交付说明）：Windows desktop profile 等 npmmirror 同步 + minimumReleaseAge 24h 窗口后，由主人走 dsh-m 正规升级；等待期内不改 `profiles/desktop/pnpm-workspace.yaml` 绕过（know-how 020 红线）。观察期＝退役生效起至下一次 DSH 升级。

## 执行纪律

- 开始实现前先批判性复查本计划；发现缺项、矛盾或命令失效，先修计划再动手。
- 按任务顺序执行；Task 1-4 期间**不提交**（退役是原子变更，中间态不可构建/不可发布），Task 5 Step 4 一次性提交；如执行者确需中间 checkpoint，仅允许 `git stash` 式临时保存，不留 commit。
- 每完成一个任务立即运行该任务的验证；失败不跨任务携带。
- 遇阻、重复失败或计划与仓库现实不符，立即停下说明，不猜。
- 当前在 `main`：已获用户批准在 main 直接执行（grill 共识 Q7 讨论语境），提交前无需再确认。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

- `pnpm run check` 全绿（含 build、smoke-test、全部单测、三件 verify）。
- Task 5 Step 3 残留终扫 0 命中。
- Task 5 Step 8 端到端清单六条全过。
- 环境：本机 Linux shell（bash），仓库 `~/workspace/dsh-skins`，Node 22 + pnpm 10（仓库现状，无新增工具要求）。
