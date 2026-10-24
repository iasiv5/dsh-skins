# 客户端写方言单解释器实施计划（ADR-0018）

## 目标

- config-client 内两个写方言解释器（`flushNow` :210-352 / `runGalleryOp` :567-618）收拢为内部 seam `runWriteOp(operations, policy)`：共享骨架单源，两个薄包装只持各自政策（ADR-0018 Decision 1/2）。
- 恢复码正名（唯一行为变化）：图库路径 409 `STORE_RECOVERY_REQUIRED` → refetch 揭示恢复态 → 返回 `{ error: "STORE_RECOVERY_REQUIRED" }`；基线＝同场景错报 `REVISION_CONFLICT`。
- 外部形状逐字节不动：`flushNow` 返回 `{flushed, blocked, errorMessage, selfHealed}`、图库返回 `{affectedSkins, revision, error}`、`configClient` 16 成员导出面；既有期望值零改动——执法面＝测试文件 git diff 零改动（flushNow 返回形状钉 **25 处**＝含 `blocked` 的 18 处〔17 单行＋:624-628 多行〕＋纯 `{flushed}` 的 7 处〔:142/:176/:200/:235/:288/:338/:862〕；全文件 deepEqual 76 处均在冻结面内。评审 R1 勘误：原「18 处」为 grep 采样不足的派生数）。
- 发版：client-only、零像素、HMR 生效；随下一自然 1.5.x 搭车，不占独立版本。

## 架构快照

- **seam 藏/露**（ADR-0018 Decision 1）。藏：PATCH 请求体构造（`{baseRevision, operations}`）、`writeChain` 串行化、`writeGate`（入链执行时）、attempt×2 循环、响应排空、STORE_READONLY 降级序列、成功后 notice 退役 + refetch + announce。露（policy 注入）：字段路径的 issues 摘除/selfHealed 政策与「refetch 后修订号有推进才重试」谓词（ADR-0003）；图库路径的 `goalAchieved` 谓词（ADR-0015 Q10-a）与 ASSET_NOT_FOUND 特例；两路径各自返回形状转译。
- **统一 409 分发**（Decision 2）：三码（STORE_READONLY / REVISION_CONFLICT / STORE_RECOVERY_REQUIRED）一处分派；RECOVERY_REQUIRED 到达 → refetch → 恢复态则具名返回、不重试（对齐 flushNow 既有 :280-290 语义，图库路径由此获得该分支＝正名）。恢复态快照保留库资产（宿主 `snapshot()` 事实，store.js :415-431）——正名钉夹具必须据此构造；空库变体会走 `goalAchieved` 短路成静默成功（评审 I3）。
- **双重门禁保留**（Decision 5）：`deleteImage`（:621-622）/`clearLibrary` 外层同步 `writeGate` 留在薄包装（面板同步禁用依据）；seam 内执行时门禁属骨架。
- **新钉夹具**：沿用 `tests/config-client.test.mjs` 既有 `makeFetch` / `snapshotBody` / `flushingClient` 模式（:6-41）。

## 全局约束

- **G0 例外（允许触碰的测试面，逐条穷尽）**：
  1. `tests/config-client.test.mjs`：允许**新增**恢复码正名钉**一条**；既有用例与期望值零改动（含 76 处 deepEqual 全冻结面）。
  2. `tests/write-dialect.test.mjs`、`tests/personalization-panel.test.mjs`：零改动、零新增。
  3. `tests/sidebar-switcher.test.mjs`：零改动——:60 mock flushNow 返回形状、:215/:232 调用计数断言，为形状冻结面的间接消费方（不改 config-client 行为则恒绿）。
  4. `tests/personalization-store.test.mjs`：零改动——:382/:548 钉 STORE_RECOVERY_REQUIRED（host 侧不动则恒绿）。
  5. 执行中如遇未列测试变红 → 停下说明，不猜。
- **范围红线**：host 侧（store.js / personalization-routes.js）不碰；上传路径不碰（纯追加豁免）；panel 不碰；`runWriteOp` 不进 `configClient` 导出面（内部 seam）；GLOSSARY 已落档（写方言词条）不再动；签名钉死 `(operations, policy)`。
- **计划判据四律**（developers.md）：① 冻结类断言面清点必须 grep 派生、逐文件裁决，禁止凭记忆穷举；② 「单源收拢/全部派生」类步骤的注释、用户可见文案与代码同清单核对；③ 「唯一来源」grep 判据显式豁免来源文件自身；④ **判据自证**——每条判据命令先在基线（改动前状态）跑一遍，确认非永真/永假；`grep -c` 计 0 时 exit 1，禁入 `&&` 链。
- **lib 纪律**：凡触碰 `src/` 的 checkpoint 一并提交重建后的 `lib/`（developers.md 发版节第 6 条）；构建（esbuild）在 danger-full-access 沙箱会话执行（工作区 AGENTS 约定）。
- **分支**：仓库惯例直接在 main 迭代；开工前需主人明确同意在 main 直接执行（先例 2026-10-21/10-22 批准）。

## 文件结构与职责

| 文件 | 动作 | 职责变化 |
|---|---|---|
| `src/client/personalization/config-client.js` | 修改 | 新增私有 `runWriteOp`（共享骨架 + 统一 409 分发）；`flushNow`/`runGalleryOp` 瘦身为薄包装；外层同步门禁原样 |
| `tests/config-client.test.mjs` | 修改 | 新增恢复码正名钉一条（唯一 G0 例外） |
| `lib/client.js` | 再生 | 随每个 src checkpoint 重建提交 |
| `docs/adr/0018-*.md` | 收口 | 实际发版时补 Amendment（Task 4 备注，不在本次落笔） |

不新建任何 src/test 文件。

## 任务清单

### Task 0：文档 checkpoint + 基线三查

1. **存档 commit**：工作区现有三份文档变更——GLOSSARY「写方言」词条、ADR-0018 新增、本计划——先作为纯文档 checkpoint 提交（不触 src，无需重建 lib），使 `git status` 干净。
2. `pnpm run test` 全绿（基线）；记录 `git rev-parse HEAD` 为基线 commit。
3. **断言面 grep 派生**（四律①）：`grep -rn 'flushNow\|runGalleryOp' src/ tests/` 与 `grep -rn 'STORE_RECOVERY_REQUIRED' src/ tests/`，逐文件裁决「改/不改」，与 G0 清单比对；差异 → 停下说明。
4. **判据自证**（四律④）：`grep -c 'method: "PATCH"' src/client/personalization/config-client.js` → 期望基线 = **2**（flushNow 与 runGalleryOp 各一；≠0 ≠1，证非永真永假）。

验证：`pnpm run test` 绿；grep 裁决表与 G0 一致；PATCH 计数基线 = 2。

### Task 1：恢复码正名钉先行（红，不落库）

1. `tests/config-client.test.mjs` 新增用例（夹具沿用 `makeFetch`/`snapshotBody`，fetch handler 按 **URL+method 分派**而非调用序号）：
   - 常量：图项 `u_a`（id/displayName/extension）；`recoveryBody = snapshotBody({ mode: "recovery", library: [u_a] })`——恢复态快照**必须保留库内资产**（宿主事实：`store.js` `snapshot()` 在恢复模式仍返回 library 全量，:415-431；若用默认空库，`goalAchieved`（资产不在库）会短路成静默成功 `{affectedSkins: []}`，错报不可复现——评审 I3 勘误注）。
   - fetch 分派：GET 按剧本阶段回常态快照（boot，library 含 `u_a`）或 `recoveryBody`（409 后的 refetch）；**一切** `PATCH /config` 恒回 `jsonResponse(409, { code: "STORE_RECOVERY_REQUIRED", error: "…" })`——基线现状会发第二次 PATCH（盲重试），修复后只发一次，handler 两种都扛。
   - 断言：`assert.deepEqual(await client.deleteImage("u_a"), { error: "STORE_RECOVERY_REQUIRED" })`。
2. `node --test tests/config-client.test.mjs` → 该用例**红**（现状返回 `{ error: "REVISION_CONFLICT" }`）＝四律④的改前证伪基线；其余用例全绿。
3. 本任务**不单独 checkpoint**——红态不落 main，与 Task 3 的绿态合并落库（先例 ADR-0017 Task 1 纪律）。

验证：新钉 RED 且红因＝错名返回值（非夹具错误）；无其他红。

Produces：正名钉（RED）。Consumes：`makeFetch`/`snapshotBody`/`flushingClient` 既有夹具。

### Task 2：`runWriteOp` seam 落地 + `flushNow` 迁移

1. `createConfigClient` 内新增 `runWriteOp(operations, policy)`：实现共享骨架（PATCH 构造、`writeChain` 串行、`writeGate`、attempt×2、响应排空、STORE_READONLY 降级、成功后 notice 退役 + refetch + announce）与统一 409 三码分发（RECOVERY_REQUIRED → refetch → 恢复态具名返回、不重试——语义对齐 flushNow 既有 :280-288）。
2. `flushNow` 改写为薄包装：防抖计时器清理、intent 快照与 `buildOperations`、修订号推进谓词、issues 摘除/selfHealed 政策、`{flushed, blocked, errorMessage, selfHealed}` 转译——全部经 policy 注入 `runWriteOp`；既有用例（含 flushNow 形状钉 25 处、全文件 76 处 deepEqual）零改动通过。
3. **注释同步**（四律②）：`flushNow` 头注释与 ADR-0003/0015 相关注释改写为 seam 口径；与「请求构造/门禁/降级」相关的过时本地注释随骨架迁移至 `runWriteOp`，同清单核对。
4. `pnpm run build` 重建 lib。

验证：`node --test tests/config-client.test.mjs` 既有用例全绿、Task 1 新钉仍红（图库未迁移）；`pnpm run test` 除新钉外全绿。

Produces：`runWriteOp` seam（字段路径已接入）。Consumes：Task 1 新钉（作为后续绿的判据）。

### Task 3：`runGalleryOp` 迁移 + 正名转绿

1. `runGalleryOp` 改写为薄包装：`goalAchieved` 谓词、ASSET_NOT_FOUND 特例、`{affectedSkins, revision, error}` 转译——经 policy 注入 `runWriteOp`；`deleteImage`/`clearLibrary` 的外层同步门禁与 goal 谓词实参**原样保留**；恢复码路径经 seam 分发自动获得正名。
2. `pnpm run build` 重建 lib；`pnpm run test` **全绿**（Task 1 新钉转绿）。
3. **Checkpoint commit**（src + tests + lib 同提交）。

验证：`pnpm run test` 全绿；`grep -c 'method: "PATCH"' src/client/personalization/config-client.js` = **1**。

### Task 4：终验 + 结构钉

1. **结构钉**（四律③：来源文件自身即被测对象，不适用豁免）：`grep -n 'method: "PATCH"' src/client/personalization/config-client.js` → 仅 `runWriteOp` 内一处。
2. `pnpm run check` 全门禁（含 lib-sync、ESLint、README 配对）。
3. 输出修改摘要；ADR-0018 Amendment 留待实际发版（搭车 1.5.x）时补记——先例 ADR-0016「随下一个自然 1.5.x 搭车」。

验证：`pnpm run check` 绿；测试面 diff 仅 `config-client.test.mjs` 的新增用例；PATCH 构造唯一。

## 执行纪律

- **回退口径**：唯一 src checkpoint 是 Task 3（src + tests + lib 原子同提交）——回退单元＝整体 `git revert` 该 commit；Task 0 纯文档存档独立成 commit，不随实现回退；Task 1 红钉与 Task 2 中间态均不落库，无需回退。
- 开始实现前，先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标。
- 每完成一个任务，运行该任务定义的验证；验证不过不算完成。
- 遇阻塞、重复失败或计划与仓库现实不符（如行段漂移、遇未列测试变红），立即停下说明，不猜。
- 全部任务完成后，运行最终验证并输出修改摘要。

## 最终验证

- `pnpm run check` 全绿（构建 + ESLint + 测试 + lib-sync）。
- 测试面 diff：仅 `tests/config-client.test.mjs` 新增一条用例，无既有期望值改动。
- `grep -c 'method: "PATCH"' src/client/personalization/config-client.js` = 1（第二写方言不复活的结构绊线）。
