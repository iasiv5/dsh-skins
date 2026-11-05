# 气泡描边装饰挂「精确哈希 ∪ 结构化」并集选择器

---
status: accepted
date: 2026-09-05
---

1.0.2 把全部 8 条用户气泡描边规则 pin 在 0.1.1-rc.2 构建产物的 css-modules 哈希类 `.gdEzaW_bubble` 上；上游 0.1.2-rc.1 重建后哈希漂移为 `.Sixlwa_bubble` 且 MessageItem 样式自 conversation 包迁至 chat 包，描边装饰层整体静默失效。当时无一步防线观测到：bundle-guard 是壁纸体积门，smoke-test 跑在 DOM stub 上，均不接触真实运行时。裁决（grill 六项共识，2026-09-05）：描边规则一律挂 `:is([class*="<当前哈希>"], [class*="userStack"] > [class*="_bubble"])` 并集——哈希漂移与 DOM 结构变化两种单点故障各有一支兜底；并以 `verify-upstream-hooks` 守卫把钩子清单钉进 `check`，漂移在升级时爆红而非被肉眼发现。全库实测（rc.1，212 个 @deepseek-ai 包）：页面级 `_bubble` 类仅 chat 的 `Sixlwa_bubble` 与 goal 面板的 `oRe1gG_bubble`，而 goal 容器类 `_stack` 不含 `userStack` 子串，故结构分支零误伤，goal 面板维持不描边的旧观感。

## Considered Options

- 仅 pin 新哈希 `Sixlwa_bubble`——被否：下次上游重建即重演本次事故。
- 纯结构化选择器——可行；但哈希与结构任一变化即全盲，且比并集更难归因失效原因。
- 等上游提供稳定身份钩子——被否：现无此钩子（`userRow` 的 `data-*` 是状态旗标非身份钩子），排期不可控。

## Consequences

- `scripts/verify-upstream-hooks.mjs` 的清单是本决策的执行机制：精确哈希存活、chat 恰一个 `*_bubble` 类、`userStack` 结构前提、全库 `_bubble` 白名单、暗色属性钩子，任一漂移即 `check` 失败；runtime 未装则黄字跳过（CI 无 runtime）。
- 未来代码级皮肤新增描边装饰时沿用「并集挂接 + 守卫清单登记」惯例（呼应 ADR-0004 前瞻原则）；更换哈希锚时同步更新金值测试与守卫清单。

## Amendments

- **2026-11-05（v1.5.29：chat 钩子退化为结构主导；守卫角色模型；CI pin 升 0.2.2-rc.1）**：
  DSH 0.2.2-rc.1 把用户气泡从 chat 模块的 css-modules 哈希类迁往
  dsh-web-frontend 的共享原语 UserMessageBubble（类名 `_bubble_<hash>_<n>`，
  逐构建漂移：web 线上消息气泡为 `_bubble_1sgyj_1`、工具提示为
  `_bubble_44yfq_1`，0.2.1-rc.2 的工具提示则是 `_bubble_12mhf_1`）——chat
  的精确哈希分支从此不可 pin。裁决：`BUBBLE_HOOKS.chat.exact = null`，chat
  挂接退化为结构分支 `[class*="userStack"] > [class*="_bubble"]`（新旧两代
  宿主结构下该气泡均为 userStack 直接子节点，装饰效果经离线复现 harness
  验证与旧并集一致）；goal 的 `oRe1gG_bubble` 仍在 goal 模块内，并集保留。
  守卫同步重造（ADR-0011 pin 升 0.2.2-rc.1，即本 ADR-0011 定义的重推导
  时刻）：token 正则补下划线开头形态、frontend dist 纳入清单、dist
  `_bubble` 按角色分类（position:fixed＝工具提示，portal 挂载不可能成为
  userStack 子节点；非 fixed＝消息气泡族，必须存在否则结构分支空转＝硬
  失败）、chat 模块自有令牌交由结构前提硬检查（恰一经典形 / UserMessageBubble
  原语形）、精确哈希死亡与白名单消失降为警告、成功摘要如实反映判定形态。
  教训句：**共享原语时代，哈希是逐构建噪声——挂接与守卫必须锚定结构
  不变量与角色，而非构建产物哈希。**
- **2026-09-05（v1.0.4）**：主人目测 goal 面板气泡无描边观感不佳，推翻首版「goal 维持不描边」的附带结论，扩描边至目标气泡——四皮肤各增 `:is([class*="oRe1gG_bubble"], [class*="_stack"] > [class*="_bubble"])` 明暗两条（RGBA 与用户气泡同族；实测 goal DOM 为 stack > bubble 直接嵌套，`_stack` 子串与 chat 的 `_userStack` 不冲突），守卫清单同步登记 goal 精确哈希与 `_stack` 结构前提。同版将五条 dsh-client peer 范围扩为 `^0.1.1-rc.2 || ^0.1.2-rc.1`（semver 预发布元组规则实证：单边 `^0.1.1-rc.2` 拒绝 `0.1.2-rc.1`，纯声明修正，loader 行为不变）。
