# ADR-0023 重落地（门禁开路）实施计划

---
status: in-progress
date: 2026-11-01
design-source: 2026-11-01 grilling 共识（Q1–Q13 全锁定）+ 双子代理走读/考古报告 + know-how 044 定谳
supersedes: docs/plans/2026-10-31-builtin-assets-external-delivery-implementation-plan.md（其交付内容经 2d3f60d 回滚，本计划以门禁开路重新交付同一内容）
---

## 目标

以发版前最小可证伪门禁开路，重落地 ADR-0023 内置资产出仓（`lib/client.js` 3,371,654 B → 约 330 KB，-90%），恢复被 2d3f60d 连带删除的 ADR/plan 文档并修正误归因记录，版本 **1.5.25**。

**硬约束（主人 2026-11-01 明示）**：本计划**不包含发版动作**。全部任务完成后停在发版前，等主人安排人工审核与手动验证、主人明确拍板后才允许打 tag / npm publish。

## 架构快照

- 交付 seam：client 内置资产从内联 data-URL 迁到 host 的 `/dsh-skins/assets/b_<skinId>_<key>.<ext>` 路由（ADR-0023 Decision 3）。gate 必须验证的是「打包产物 + 真启动 + 真路由应答」，而非「模块可 import」。
- 1.5.22 事故定谳（know-how 044 + git 考古）：Desktop 崩溃为上游 cookie 堆积 431、与插件无关（当晚安装从未成功 + 卸载未愈双反证）；web 症状最可能为部署机 host 半更新触发 fail-open 静默退化。回滚系取证前置的误归因。
- 门禁缺口三件套（本计划补齐）：① release 链旧 load test 只 import 不 boot（verify:delivery 补）；② push 事件只跑批尾、中间态不可构建快照盲区（every-commit-buildable 补）；③ desktop 验收被计划排到发版后（本计划排回发版前，验证机按 Q10 修订为本 Linux web 机，desktop 真机延后并记录于 ADR-0023 Amendment）。

## 全局约束

- **绝不自动发版**：无 tag push、无 npm publish 步骤；一切发布动作等主人拍板。
- 版本落 **1.5.25**（回放中间态不得把版本改写为 1.5.22；package.json 冲突一律保留 1.5.24 直至 Beat 4 bump）。
- 回放方式：`git cherry-pick` 保留逐提交粒度（Q8）；**每个回放 commit 必须可独立构建**（对齐 developers.md checkpoint 纪律与 every-commit-buildable 门禁）——区间内 16f9a2b..19489c3^ 的坏 import 快照不得原样复刻，深度修正在所在 commit 内折入修复。
- GLOSSARY.md 零改动（ADR-0023 原裁决：交付通道是工程决策非领域语言）。
- lib/ 随源码入库：凡回放 commit 触碰 src/，必须以解决冲突后的 src 重新 `pnpm run build` 并提交产物，禁用任一侧的旧 lib。
- 验证命令均在仓库根（`/home/ubuntu/workspace/dsh-skins`）执行；预计 >90 秒的命令（`pnpm run test`/`pnpm run check`）按 workspace AGENTS.md 后台起跑；验证输出经管道时保留退出码（`set -o pipefail`）。
- 无额外平台/依赖约束（esbuild/eslint/playwright-core 均已在 devDependencies 钉版）。

## 文件结构与职责

| 文件 | 职责 | 状态 |
|---|---|---|
| `scripts/verify-delivery.mjs` | 交付门禁：pack→解包→按宿主合同 boot→真 HTTP 断言（两拍） | **已落（Beat 1）** |
| `package.json` | `verify:delivery` script + `check` 链接线 | **已落（Beat 1）** |
| `scripts/verify-bundle-guard.mjs` | manifest 门控的 `?v=<版本>` 字面量断言（棘轮公式在 Beat 4 被 3184e4c 回放版替换） | **已落（Beat 1）** |
| `.github/workflows/ci.yml` | `every-commit-buildable` job：push 区间逐 commit 构建+lib 对账 | **已落（Beat 1）** |
| `docs/developers.md` | 交付门禁条目 + 重启声明纪律 | **已落（Beat 1）** |
| `docs/adr/0023-builtin-assets-external-delivery.md` | 由 24dd2ba 回放恢复，随后加 Amendment（误归因定谳 + 验证机换 Web 机裁量） | Beat 2 |
| `docs/adr/0024-rollback-forensics-discipline.md` | 新立：回滚取证纪律 | Beat 2 |
| `assets/`、`src/client/builtin-assets.js`、`src/host/builtin-assets.js`、`scripts/ab-delivery-compare.mjs`、`scripts/build-builtin-manifest.mjs`、`scripts/lib/wallpaper-settled.mjs` 等 | 由 15 提交回放原样恢复 | Beat 2 |
| `docs/plans/2026-11-01-adr-0023-redelivery-gated-implementation-plan.md` | 本计划 | Beat 2a |

## 任务清单

### T1 · Beat 1 门禁落地（已完成，随本计划提交）

- 改动面：见上表前五行。
- 验证（已跑）：`pnpm run lint` 绿；`node scripts/verify-bundle-guard.mjs` 绿（基线棘轮）；`node scripts/verify-delivery.mjs` 绿 + 打印 `builtin-asset assertions SKIPPED (no assets/manifest.json …)` 机器可辨 token；ci.yml 经 YAML 解析校验。
- checkpoint：`gate(delivery): verify:delivery 真启动门禁 + every-commit-buildable + rev 字面量断言 + 重启纪律`（不触 src/，无需重建 lib）。

### T2 · 本计划文档提交

- `docs(plan): ADR-0023 重落地（门禁开路）实施计划`，仅本文件。

### T3 · cherry-pick 回放 4db5e55..fc2bc2a（15 提交，19489c3 折入所在提交）

执行序列（旧→新）：`24dd2ba f124bcb fd0a653 16f9a2b e213a26 a1be2e2 3184e4c 51c3dd9 aaa7eab a86e1c0 04ebd75 28a282b 19489c3 ca92cec fc2bc2a`。

- 逐提交 `git cherry-pick -x <sha>`；冲突解决后**一律重建 lib**：`pnpm run build && git add -A && git cherry-pick --continue`（lib 冲突不取任一侧，以解决后 src 的构建产物为准）。
- 已知冲突剧本：
  - `package.json`（a86e1c0）：版本行保留 `1.5.24`，`files` 增 `"assets"`；
  - `src/client/runtime.js`（aaa7eab select 预热 vs bb63036 sweep 语义）：保留 bb63036 的同步 sweep + 仅真切换才 sweep 判定，把预热逻辑按其原 diff 折入；
  - `scripts/repro-*.mjs`（壁纸 settled 等待 vs retro 双语查找）：两者叠加，互不覆盖；
  - `scripts/verify-bundle-guard.mjs`（3184e4c 固定预算 vs Beat 1 rev 断言）：取 3184e4c 版本为基底，若其未含 `?v=<版本>`/`__DSH_SKINS_ASSET_REV__` 断言则把 Beat 1 块重新折入（verify:delivery 对打包产物已有同款断言兜底）；
  - `docs/developers.md`（a86e1c0 vs Beat 1 条目）：两段并存。
- **可构建性折入**：16f9a2b 及 e213a26 落地后若 `pnpm run build` 因 `builtin-assets.js` import 深度失败，把 19489c3 的深度修正折入当前 commit（`git checkout 19489c3 -- <相关文件>` 后重建）；序列走到 19489c3 时为空提交则 `git cherry-pick --skip`。
- 验证：每个回放 commit 完成（或全部回放完成后逐个抽查）`git checkout <sha> && pnpm run build && git diff --exit-code -- lib/` 全绿；区间终点树与 `fc2bc2a` 内容比对（`git diff fc2bc2a HEAD -- assets src scripts smoke-test.cjs` 预期仅 package.json 版本行与 developers.md 增量差异）。

### T4 · ADR 文档修正

- 恢复后的 `docs/adr/0023-…md` 增补 **Amendments** 两条：① 2026-11-01 误归因定谳（引 know-how 044：上游 cookie 堆积 431 与插件无关、安装从未成功、卸载未愈反证；2d3f60d 回滚说明作于取证之前）；② 2026-11-01 验证机裁量（本 Linux web 机真机验证替代发版前 desktop 实机；理由=包跨形态同一 + dsh-app 转发层已有 asar 实证 + desktop 真机延后至下次 Windows 会话）。
- 新立 `docs/adr/0024-rollback-forensics-discipline.md`：回滚 commit 必须附宿主日志锚点；「症状出现在安装未完成的机器上」必须阻断归因；引用 2d3f60d 为反例、044 §3 为取证判据。
- 验证：两文件存在且 Amendment 引用的 know-how 044 行号实读可核。

### T5 · b_ 断言激活 + 全门禁绿

- `pnpm run build` 后跑 `node scripts/verify-delivery.mjs`：预期**无 SKIPPED token**，打印 `builtin-asset assertions ran over N packaged file(s)`（N=7：meirenzhi 6 + uefi 1）；
- `node scripts/verify-bundle-guard.mjs`：预期激活 rev 断言分支且绿；
- `pnpm run check` 后台起跑（>90s），预期全绿退出码 0。repro 门禁需要配套 chromium：若 `~/.cache/ms-playwright` 缺 `chromium_headless_shell-1234`，先 `npx playwright-core install chromium`。

### T6 · Beat 3 本机真机验证

- `bash scripts/hot-deploy.sh`（须在无沙箱写限制会话；失败即停不碰 profile）；
- 真浏览器清单（本机 `http://127.0.0.1:3080`）：三皮切换目检、meirenzhi 内置精选全链路（网络面板 7 个 `b_` 请求 200）、通透度 0→100→回厂随动、霜面底/阅读底、冷缓存首载 fail-open（DevTools 拦截 b_ 请求后底色+纱层照常、UI 不挡）、切肤零闪烁（bb63036 语义回归）；
- 产出：验证记录（版本号+逐项输出，脱敏）入库；desktop 真机延后项与截图证据按 Q10 分工（模板进公开仓、实测进 `01_docs`）。

### T7 · Beat 4 守卫终形 + 发版前停机

- 确认 3184e4c 回放后的 verify-bundle-guard 已是 Decision 7 形（固定代码上限+单行上限；ΣWebP 漂移守卫 单张 ≤640,000 / meirenzhi 合计 ≤2,300,000 原值逐字转移 manifest 校验）；若折入冲突时丢失任一条，补回；
- `package.json` bump `1.5.25`（bump 前先 `npm view @iasiv5/dsh-skins@1.5.25 --registry=https://registry.npmjs.org/` 查占位）；README 徽章/版本引用按 `verify:readme` 配对重登记；
- 全门禁 `pnpm run check` 最后一遍绿；
- **🛑 停机点**：输出交付摘要（改动清单、门禁证据、验证记录指针、回滚预案），等主人人工审核 + 手动验证 + 拍板。拍板后的发版序列另行走 developers.md「发版」节（tag push → Release workflow → npm staged 轮询 know-how 018 → 三键核验），不在本计划执行范围。

## 接口契约（Consumes / Produces）

- T3 Produces：区间终点的 src 树（≈fc2bc2a 内容 + 版本行 1.5.24 + developers.md 增量）→ T5 的门禁与 T4 的文档都以它为基底。
- T1 的 `verify:delivery` Stage-2 断言消费 T3 产出的 `assets/manifest.json` 与 `b_` 路由；两者任一缺失即 SKIPPED（基线）或红（回放后缺资产 = 包不完整，必须红）。
- T4 消费 git 考古报告与 know-how 044（workspace 仓 `01_docs/dsh-intall-know-how/044-dsh-desktop-welcome-web-auth-failed-cookie-heap.md`），引用行号实读核验。

## 执行纪律

- 开始实现前批判性复查本计划；与仓库现实不符立即停下说明，不猜。
- 按任务顺序执行，不无声跳步；每任务完成即跑其验证。
- 回放冲突解决取「语义合流」不取「单侧获胜」；每次 `--continue` 前 lib 必为本地重建产物。
- 主人在 `main` 上已明确同意本计划执行（2026-11-01 grilling 共识 + 「先试试看」）。

## 最终验证

- `pnpm run check` 全绿（含 verify:delivery 二拍、every-commit-buildable 待 push 后在 CI 侧生效）；
- 区间终点树与 `fc2bc2a` 的差异清单已逐项解释；
- T6 真机清单全过；
- 停在发版前，交付摘要就绪。
