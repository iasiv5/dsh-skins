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
- T6 浏览器清单：执行状态以下方「执行记录（评审 R2 后补充）」为准；未全部完成前不得宣称全过；
- 停在发版前，交付摘要就绪。

## 执行记录（2026-11-02）

- T1–T5 全部完成：Beat 1 门禁四件套、15 提交回放（04ebd75 被逐-commit 重建纪律吸收、19489c3 折入 16f9a2b/e213a26）、ADR-0023 两 Amendment + ADR-0024、readme 配对补登记（db05a2d 漏登顺带修复）、verify:delivery 二拍激活（7 打包资产 200 + immutable + etag + 缺席键负对照）。区间终点树与 fc2bc2a 对账：全部差异可归因于回滚后提交（bb63036 sweep 修复、retro 双语化）与 Beat 1 增量，lib/index.js 逐字节一致。
- T6 机器可判面全绿：活宿主 `GET /dsh-skins/assets/b_meirenzhi_yuntai.webp` = 200 + image/webp(283,460B) + immutable + etag + nosniff + CORP；缺席键 404；三 repro 门禁对真壁纸链路 PASS（6/6 hops、双 cycle、阅读底实色）。**活体验证抓到真缺口一处**：hot-deploy 只拷 lib/ 不拷 assets/ → b_ 全 404（1.5.22 部署态故障形态复现），已修脚本并补拷（二次重启愈）。
- 版本 bump 1.5.25（npm view E404 确认未占用；README 零版本引用，配对哈希不变）。
- 待主人：① 真浏览器目检清单（三皮切换、meirenzhi 内置精选全链路、通透度 0→100→回厂、霜面底/阅读底、冷缓存 fail-open、切肤零闪烁）；② 人工审核代码；③ 拍板后方可 tag/publish 1.5.25。desktop 真机目检按 Amendment 延后至下次 Windows 会话。

## 执行记录（评审 R2 后补充，2026-11-02）

### T3 对账的基准更正（评审 S-3）

- 原 T3 文本的期望「`fc2bc2a..HEAD` 仅 package.json 版本行与 developers.md 增量差异」基准有误：fc2bc2a 是回滚 2d3f60d **之前**的尖端；回滚及其后的提交（5b78705、bb63036、0f789b4、c5ac89c、3344d87、db05a2d）天然位于 fc2bc2a..HEAD 之间，回放不应也不会抹掉它们。
- 正确的对账分两段：(i) ADR-0023 产品内容——`assets/`、`src/host/`、`src/client/skins/`、`src/shared/`、`src/index.js`、`src/client/index.js`、`src/client/builtin-assets.js`、`smoke-test.cjs`、`tests/builtin-assets.test.mjs`——在 fc2bc2a..HEAD 之间**逐字节零差异**（核验命令：`git diff --stat fc2bc2a HEAD -- <上述路径>`，无输出）；(ii) 其余差异逐文件归因如下。

### 逐文件归因（fc2bc2a..HEAD，共 24 个文件；提交按新→旧排列）

| 文件 | fc2bc2a 之后引入差异的提交 |
|---|---|
| `.githooks/pre-commit` | c5ac89c |
| `.github/workflows/ci.yml` | bb373c6 |
| `README.en.md` | db05a2d |
| `README.i18n.yaml` | 5ed96c6 |
| `README.md` | db05a2d |
| `docs/adr/0021-skin-switch-sidebar-paint-order.md` | bb63036 |
| `docs/adr/0023-builtin-assets-external-delivery.md` | aa40420 83dbd9e 2d3f60d |
| `docs/adr/0024-rollback-forensics-discipline.md` | aa40420 |
| `docs/developers.md` | 26c3479 bb373c6 3344d87 c5ac89c 2d3f60d |
| `docs/plans/2026-11-01-adr-0023-redelivery-gated-implementation-plan.md` | 409dfde e4a15b1 |
| `eslint.config.js` | c5ac89c |
| `lib/client.js` | 7a0966e 6bbd68b 0d76d0c 5d09873 5fa121a bb63036 2d3f60d |
| `package.json` | 7a0966e 26c3479 bb373c6 c5ac89c 0f789b4 5b78705 2d3f60d |
| `scripts/capture-previews.mjs` | 3344d87 |
| `scripts/hot-deploy.sh` | af44c61 e524882 |
| `scripts/lib/ui-locale.mjs` | 3344d87 |
| `scripts/repro-fullscreen-collapse.mjs` | 6cf0482 3344d87 bb63036 2d3f60d |
| `scripts/repro-plugin-panel-readability.mjs` | 3344d87 |
| `scripts/repro-stale-grid-paint.mjs` | 6cf0482 3344d87 2d3f60d |
| `scripts/verify-bundle-guard.mjs` | 483c511 02713ca bb373c6 2d3f60d |
| `scripts/verify-delivery.mjs` | 0302590 02713ca bb373c6 |
| `src/client/runtime.js` | 6bbd68b bb63036 2d3f60d |
| `tests/gate-ui-locale.test.mjs` | 3344d87 |
| `tests/runtime-effects.test.mjs` | bb63036 |

注：本表不含本文件自身的最后修改提交 `c505332`（自引用，无法在文件内自洽记录）。

分类：① 回滚（2d3f60d）及回滚后的修复与 retro：bb63036（flash-free sweep）、0f789b4/5b78705（版本）、c5ac89c（pre-commit、no-undef、导航）、3344d87（双语门禁与 ui-locale）、db05a2d（README rc.5）；② Beat 1 本次新增：bb373c6、0302590、483c511、ci.yml、developers.md 段；③ 回放合流点：6cf0482、6bbd68b、02713ca、26c3479、0d76d0c、5d09873、5fa121a；④ 评审后修复：e524882、af44c61（hot-deploy）、5ed96c6（readme 配对）、aa40420（ADR 增补）、409dfde（计划执行记录）。

### 回放过程中的两处事后修正（已在对应提交内说明）

- 02713ca 折入了 verify-delivery.mjs 的 rev 断言形状修正：最初按「`?v=<版本>` 字面量」编写，实测产物为 define 形 `rev = "<版本>"`，`?v=<版本>` 连续字面量并不存在。
- lib 段前移（评审 R1-C-1）：cf410f9 缺 lib 段，已改写为 8879bc4（lib/index.js +51/−12 并入该提交）；后续提交因 lib 段前移，range-diff 仅 #4、#5 补丁不同。改写前的链保留在分支 `backup/pre-lib-fix-2568ef0`。

### 评审小结的处理结论

- S-1（verify:delivery 清单缺席时打印 SKIPPED 并返回 0）：计划外建议，未实施——计划 T1 规格明确把「无 manifest 的基线 → SKIPPED 绿」定为设计内行为。
- S-2（hot-deploy 覆盖 assets 前无备份）：已修复（af44c61）。红灯复演：旧脚本备份仅含 client.js、index.js，之前的 assets 无法恢复；新脚本备份为 lib/ 与 assets/（profile 原本无 assets 时写 ASSETS_ABSENT 标记），rm 前校验 profile 根含 package.json。往返验证：临时 profile A（原有 assets）与 B（原本无 assets）各自「部署 → 执行打印的回滚指令 → 逐字节比对部署前快照」全部一致（脚本与日志位于仓库外的 exec-logs/hd-roundtrip）。
- S-3：见本节上文的归因表。
- D-1（T6 浏览器清单）：执行中（见下）。

### T6 浏览器清单：执行状态

- 已完成（只读，fresh 上下文，无配置写入）：
  - 三皮切换（openbmc / uefi-harness / meirenzhi）：无 pageerror，切换器存在，作用域属性就位（uefi 的属性名为 `data-dsh-uefi-harness`）。
  - openbmc 背景为内联 data URL（ADR-0023 Decision 2，无 b_ 请求）；uefi 的 `b_uefi-harness_art.webp` 为 200 + immutable + etag；meirenzhi 用户所选 `b_meirenzhi_yinyue.webp` 为 200 + immutable + etag。
  - 打包的 7 个 `b_` 资产，活体字节逐一与候选文件相等（7/7 MATCH）。
  - 冷缓存负对照（中止全部 `b_` 请求）：页面正常渲染，侧栏、标题、输入框完整可见（粗粒度视觉判读），`::after` 纱层仍为 linear-gradient；浏览器仅记录两条 ERR_FAILED 资源错误，无 pageerror。
  - 观察项（建议，不阻断）：矩阵运行的第 3 个上下文中出现过一次默认壁纸 `b_meirenzhi_yuntai.webp` 的 200 请求；随后 5 次重复流程未复现，最终渲染均为 yinyue；根因待定。
- 续（已完成）：通透度 0→100→35 随动（壁纸区域亮度标准差 46.2 / 19.9 / 2.95，单调；配置测后逐项还原，revision 907→910）；repro 门禁在 c505332 复跑三项全部 PASS；切换期间逐帧完整性 117 帧、违例 0；截图与原始日志归档到工作区私有目录；脱敏验证记录入库：`docs/verification/2026-11-02-adr-0023-linux-web-verification.md`。
- 续（未完成）：冷加载默认壁纸闪现的裁决（接受并注明，或先修复）待定稿；该项由主人决定。
