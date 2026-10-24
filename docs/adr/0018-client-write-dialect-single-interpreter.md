# 客户端写方言单解释器：runWriteOp 内部 seam 收拢孪生

---
status: accepted
date: 2026-10-24
---

## 背景

2026-10-23 架构评审（improve-codebase-architecture 流程 + 双子代理独立走查 + 主人钢人裁决）选定本仓库当日唯一最优优化任务。ADR-0015 把写方言在服务端收拢为唯一解释器（`store.js` `applyOperations`），其 Consequences 宣称「前置条件/重试/逐项裁决机器集中于一处（locality）」——但客户端至今持**两个**解释器：

- `flushNow`（config-client.js:210-352）：字段写路径（自动保存）；
- `runGalleryOp`（config-client.js:567-618）：图库写路径（`deleteAsset` / `clearLibrary`）。

两者逐字共享同一骨架——PATCH 请求体构造、`writeChain` 串行化、`writeGate` 门禁、attempt×2 循环、STORE_READONLY 降级序列、409 后 refetch 重试——但分派表已悄然分叉：`flushNow` 区分 REVISION_CONFLICT（按「refetch 后修订号有推进」谓词重试）、STORE_RECOVERY_REQUIRED、offline-failed、recovery 四种去向；`runGalleryOp` 把一切 409 折叠进 `goalAchieved()` + 盲重试，**无 STORE_RECOVERY_REQUIRED 分支**——恢复态竞态窗口内（writeGate 通过后、PATCH 落地前宿主翻入恢复态）终态错报 `REVISION_CONFLICT`。该错名无任何 ADR/grill 记录裁定为刻意（对照：ADR-0015 Q10-a 裁定的 `goalAchieved` 语义与 ADR-0003 裁定的修订号推进谓词是**已裁定差异**；恢复码缺分支是**漏网**）。ADR-0015 否决「DELETE 路由另写一套」的理由（「前置条件/重试/issues 机器在两条路由各写一份，等于把第二写方言制度化」）同样适用于客户端孪生。实证的修订压力：ADR-0015 落地后 48 小时内即触发 ADR-0003 修正案、通知生命周期一天三改（cb714e9 / 729579d / bc90eee）——写路径处于急改节奏，孪生使每次修订成本翻倍且漏改无人命名。

## Decision

1. **新增内部 seam `runWriteOp(operations, policy)`**：`createConfigClient` 内私有函数，不抽 sibling 文件（seam 需触达 snapshot/refetch/writeChain/writeGate/request/setFlushFailure/setStatus/emit 等闭包状态，抽文件会把它们全部变成参数——接口比实现宽，制造浅模块；深模块可有内部 seam）。**藏进 seam（共享骨架）**：PATCH 请求体构造、`writeChain` 串行化、`writeGate`（入链执行时门禁）、attempt×2 循环、响应排空、STORE_READONLY 降级序列、成功后 notice 退役 + refetch + announce 纪律。**留在薄包装（policy 注入）**：字段路径的 issues 摘除/selfHealed 政策、「refetch 后修订号有推进才重试」谓词（ADR-0003）；图库路径的 `goalAchieved` 谓词（ADR-0015 Q10-a）、ASSET_NOT_FOUND 特例；各路径返回形状转译。两谓词保留差异不统一——它们是两层已裁定语义，正是 seam 的两个真 adapter。
2. **seam 持统一 409 码表分发**：STORE_READONLY / REVISION_CONFLICT / STORE_RECOVERY_REQUIRED 三码一处学全、新码一处加；码级处置差异经 policy 回调注入。
3. **恢复码正名（唯一行为变化）**：图库路径收到 STORE_RECOVERY_REQUIRED → refetch 揭示恢复态 → 返回 `{ error: "STORE_RECOVERY_REQUIRED" }`（宿主稳定码穿透，`host-errors.js` 既有解析；不盲重试、不吞码）。面板维持通用「删除失败」文案（现状不按码分派图库错误），零词典改动；`writeGate` 常态拦截下该窗口为窄竞态。
4. **外部 interface 逐字节不动**：`flushNow` 返回 `{flushed, blocked, errorMessage, selfHealed}`、图库返回 `{affectedSkins, revision, error}`、`configClient` 16 成员导出面原样；既有期望值零改动（执法面＝测试文件 git diff：flushNow 返回形状钉 25 处＝含 blocked 的 18 处＋纯 flushed 的 7 处，全文件 deepEqual 76 处均在冻结面内；评审 R1 勘误，原口径 18 为采样不足的派生数）。
5. **双重门禁保留**：`deleteImage`/`clearLibrary` 的外层同步门禁（面板同步禁用依据，「此刻可写吗」）与 seam 内执行时门禁（「轮到我时还可写吗」）语义不同，均保留。
6. **验收**：三个测试文件既有用例与期望值零改动全绿；`config-client.test.mjs` **新增**恢复码正名钉（scripted fetch 回 409/STORE_RECOVERY_REQUIRED → `deleteImage` 返回具名码；判据自证＝改前同场景返回 `REVISION_CONFLICT`）；结构钉 `grep -c 'method: "PATCH"' src/client/personalization/config-client.js` 由 2 变 1。
7. **GLOSSARY 增「写方言」词条**（立案同日落档）：PATCH 单通道、修订号乐观锁、结构化码表裁决、按路径注入重试取向；图库上传纯追加豁免。
8. **发版**：client-only、零像素、HMR 生效；随下一个自然 1.5.x 搭车（ADR-0016 先例），不占独立版本。

## Considered Options

- **保持两解释器**——被否：每次写路径修订必须凭记忆落两处，漏一处即无人命名的行为分叉；ADR-0015 的 locality 宣称只兑现了服务端半边，客户端孪生是其未完成部分。
- **统一重试谓词**——被否：两谓词各由已裁定 ADR 语义背书（0003 / 0015 Q10-a），统一＝修订两份裁决；差异正是 seam 的两个真 adapter。
- **抽 sibling 文件（如 config-write.js）**——被否：需把 8 个闭包状态变参数，接口比实现宽；深模块可有内部 seam，测试经两个薄包装穿过它。
- **顺手改进图库错误文案（按码分派词典）**——被否：超出正名范围；面板另有恢复态横幅；面板对图库错误一贯通用文案。
- **顺带 decorations 死通道清理**——被否（主人裁定，沿用 ADR-0017 Q11 纪律）：关注点不同（effects 形状 vs 写方言机器），保持任务纯度与验收语义单一。

## Consequences

- 写方言机器在客户端单源：下一次 409 码表/重试纪律修订落一处（locality）；方言不变量读者/Agent 学一次（AI-navigability）；seam 经两个薄包装被既有测试穿过（接口即测试面）。
- `grep -c 'method: "PATCH"' = 1` 成为「第二写方言不复活」的结构绊线。
- 恢复态竞态窗口内图库写返回值语义正确（错名消除）；用户可见面极小（面板通用文案不变）。
- `lib/client.js` 字节变化随 checkpoint 再生同提交；GLOSSARY「写方言」词条为领域语言新增锚点（_Avoid_: 第二写方言、保存接口）。
- 上传路径（纯追加豁免）不在此列，形状不动；host 侧零改动。

## Amendments

- **2026-10-24（发版收口）**：本决定以 `1.5.16` 搭车收编（同日完成）：全门禁绿（`pnpm run check` exit 0，含 verify:hooks strict 真跑）+ Release workflow success（RUN=40076648641）+ npm 三键核验（per-version 200 / dist-tags.latest=1.5.16 / time=2026-10-24T08:22:36Z，staged 窗口约 16 分钟）。client-only（HMR 生效、零像素、免截图 gate）；同日前置的两轮独立评审（计划 4 题＋产出 1 题，全修复复核通过）与「计划外建议落地」提交（O2 恰一次断言、seam RETRY 绊线、跨缝恢复钉）随本版本入库。
- **2026-10-24（计划外建议落地轮的事实修正）**：背景节「恢复态竞态窗口内……终态错报 REVISION_CONFLICT」的机理描述经跨缝集成钉复核需修正——宿主 `snapshot()` 在恢复模式下 `library` 为**空**（重建候选在 `recovery.candidateLibrary`，store.js `initOnce`/`snapshot`）。因此真实生产竞态（宿主重启入恢复态＋旧标签页持过期常态快照）下，旧 `runGalleryOp` 的实际行为是 `goalAchieved` 短路成**静默假成功** `{affectedSkins: []}`（图未删而报已删）；错报 REVISION_CONFLICT 的变体需要「恢复快照保留库资产」这一真实宿主不会产生的快照形状（评审 I3 探针 PROBE-A 构造形）。两种旧处置均为缺陷，均由 Decision 3 的具名分发根治（`onRecoveryRequired` 不查 goal、不重试、码穿透，对两种快照形状一致收敛为具名返回）。全部 Decision 不变；单元钉保留「保留资产」夹具以钉死错名分支的消灭（并按评审 O2 加固 PATCH 恰一次断言、按评审次要观察加 seam RETRY 绊线），跨缝钉（write-dialect.test.mjs 恢复钉）把守真实协议形状（空库＋candidateLibrary 存活＋门禁零 PATCH）。

## 附录：grill 共识（Q1–Q15，2026-10-24 会话存档）

三轮 grill 十五问全按推荐裁定（主人逐轮「本轮按推荐」）：

1. **Q1** 收拢＋对齐（恢复码缺分支是漏网非裁决）；**Q2** 谓词差异保留为策略注入；**Q3** seam 统一 409 三码分发；**Q4** 外部形状逐字节不动（唯一例外＝Q1 正名）。
2. **Q5** 独立 ADR-0018（ADR-0015 不加 amendment——其宣称被完成而非推翻）；**Q6** GLOSSARY「写方言」词条当日落档；**Q7** 搭车下一自然 1.5.x；**Q8** writing-plans 立计划后动工。
3. **Q9** 恢复码正名＝码穿透（零词典改动）；**Q10** 藏/露清单（骨架入 seam、政策留薄包装）；**Q11** `createConfigClient` 内私有函数；**Q12** 命名 `runWriteOp`（run*Op 家族一致）。
4. **Q13** 验收判据四件（既有钉零改动全绿 / 恢复码正名钉＋基线自证 / PATCH 构造 grep 2→1 / lib 同步）；**Q14** 双重门禁保留；**Q15** 文档先行、两份一次成文、批准后动工。
