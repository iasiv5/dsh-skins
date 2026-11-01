# 回滚取证纪律：紧急回滚必须先钉宿主侧证据锚点

---
status: accepted
date: 2026-11-01
---

## 背景

v1.5.22（ADR-0023 资产出仓）发布当晚被紧急回滚（2d3f60d），回滚说明写「prevents DSH Desktop from starting and breaks skin switching」——该归因作于取证之前。事后定谳（workspace 仓 know-how 044，2026-10-31 深夜）：Desktop 起不来的真凶是 dsh-desktop 上游缺陷——dsh-auth cookie 按含端口 authority 哈希命名 × 每次启动换随机端口 × 30 天 Max-Age × cookie 不隔离端口 → 第 71 条越过 Node 16KB 请求头 → 431 → welcome 崩溃循环；与插件无关。反证当时已在手：当晚 4 次 `pnpm add …@1.5.22` 因 minimumReleaseAge 全部未装成；23:05 卸载插件后崩溃依旧。web 侧「换肤/通透度失效」亦无插件侧可复现机理（被回滚代码全链 fail-open，npm 包资产三重证据完整——2026-11-01 git 考古）。一次基于症状共存而非机理证据的回滚，让一个已 grill 十四问、实测 -90% bundle 的交付停摆，并连带删除了已 accepted 的 ADR 与实施计划文档。

## Decision

1. **回滚前置证据**：任何紧急回滚 commit 必须附宿主侧日志锚点（crash log 行号 / journal 条目及其指向被回滚工件的机理链条）；「症状与发布时间共存」本身不是证据。
2. **安装态判别前置**：症状机器上若工件根本未安装成功（安装失败、版本未解析、「卸载自救」），不得归因于该工件；「卸载后症状未愈」是归因反证，必须在回滚决策**前**取得。
3. **归因可废止**：回滚后若取证推翻归因，必须以 Amendment 修正 ADR 层的事实叙述（git 历史不可改写，修正住在文档层），不得让错误归因独占正史；被回滚连带删除的 accepted 文档随重落地恢复。
4. **先回滚后取证的唯一例外**：症状呈活动扩散（持续写坏用户数据 / 安全面）时可先回滚，回滚 commit 须注明「取证未完，锚点待补」，并在取证完成后补 Amendment。

## Consequences

- 紧急回滚从「分钟级反应」变为「证据钉点后反应」；对装饰层插件（壁纸/描边/毛玻璃）而言几乎总是可接受——fail-open 契约保证症状不损坏数据、不挡 UI。
- 未来架构评审（含 improve-codebase-architecture 流程）读到 2d3f60d 的回滚说明时，以本 ADR 与 ADR-0023 Amendment 为准，不采信回滚说明中的归因叙述。
- 「验证记录发版前出」（ADR-0023 Decision 10 本义，Q11 曾被实施计划操作化为发版后补课）由本 ADR 与交付门禁（verify:delivery）共同闭合：门禁管机器可判的面，验证记录管机器不可判的面，两者都在 publish 前。

## Amendments

- 无（首版）。
