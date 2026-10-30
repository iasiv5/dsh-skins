# 插件面板实色阅读底（免透字）

---
status: accepted（设计已经主人批准 2026-10-30；实机验收门独立存在于实施计划 Task 9，不通过按修订流程处置）
date: 2026-10-30
---

## 背景

皮肤激活态下，插件管理页（已安装/插件市场 Tab、内置插件配置、实验性插件列表）的文字与图标直接浮在壁纸上：次要描述几不可读，明暗两态、三张皮肤全部命中（主人 Desktop 三实拍，2026-10-30）。

根因（源码 + 活体 DOM 双证，取证记录 `01_docs/research/2026-10-30-dsh-skins-plugin-panel-readability.md`）：ADR-0013 投影核把全窗口唯一的实底 token 族（`--dsw-alias-bg-base` 等）骑写为 rgba 制造玻璃语境，而补偿不透明面只配了三处——浮层 frost（ADR-0007/0012）、右栏全屏（ADR-0020）、Desktop 外壳（ADR-0009）。文字密集的路由页落在盲区：headless DOM 探针实测（web 0.2.1-rc.4，openbmc dark P=55），插件页 `SECTION[data-plugin-panel="true"]`（css-modules 前缀 `X_2TxG_`，覆盖整个 centerCol）→ `_installedPanel` → `_group` 整条绘制链 `rgba(0,0,0,0)`，文字与壁纸之间唯一的填充只有 frame 级 token（α≈0.55–0.66）。声明表 `scrim` 是壁纸级纱幕（P=55 时浓度 ~9%），frost 家族只覆盖浮层，均不命中路由页；三皮源码 grep 插件页挂点零覆盖。

硬约束：抬 token α 毁全局玻璃（ADR-0009 v2 明文否决，token 多面共享）；调 P 全局联动会话区且 Desktop 每次启动重置 66（catalog.js 注释，非持久缓解）。可行粒度＝选择器级定面，ADR-0020/0009 两次验证此路径。

## Decision

1. **新增共享生成器 `buildReadingBaseCss(bodyAttribute, opaqueFills)`**（`src/client/runtime.js`，与 `buildFullscreenBaseCss` 同位同律）：命中插件管理页容器 `section[data-plugin-panel="true"]`（宿主 `dsh-client-ui-plugin-manager` 发出的属性钩子，rc.4 活体已验），涂**纯实色皮色** `rgb(...)!important`（ADR-0020 终审配方：主人裁定实底对齐官方观感），明暗两规则，随规则层钉 `position:relative;z-index:0`（ADR-0021 修订二教义：大面积覆盖类规则一律随规则层钉）。
2. **色源与 fullscreen/shell 同源**：riding `--dsw-specific-sidebar-fill` 的 rgb 通道（`parseRgbaChannels` 既有推导，与 ADR-0020 共用同一处 opaqueFills derivation）；皮未 ride 该 token 时返回空串不挂载（fail-closed）。**声明表零新字段，三皮自动生效**（OB/UE/MRZ 均 ride sidebar-fill，grep 实证）。
3. **挂载为随皮事务 style tag `dsh-skins/<id>.reading.css`**：`buildEffects` 内 fullscreen 块之后挂载、`stops.push(remove)`；`refreshSkinStyleTags` 按 `dsh-skins/` 前缀重挂的既有循环自动覆盖新 tag；official 卸载即恢复官方实底。profile 无关：Web 与 Desktop 的插件页为同一组件同一挂点（Desktop shell 规则不含 centerCol 内容页，本规则两端都活跃、非冗余）。
4. **无状态门**：与 fullscreen sheet 不同，插件页 section 由路由挂载/卸载——离页即失配，不存在陈旧层（ADR-0021 修订四教训的「最可靠信号」就是元素自身存在性）；层钉防合成器 churn 即可。
5. **钩子钉子**：`verify-upstream-hooks.mjs` 新增 `data-plugin-panel` 标记在场钉（静态守卫判 dist 在场；**容器唯一性由 headless 门禁运行时断言**——静态 dist 无法可靠判唯一）+ 守卫双模式（pnpm store / desktop-asar 直读）下同判。**代码双端一起修好**（profile 无关，单钩子 Web/Desktop 同时生效）；验收本轮聚焦 Web——Desktop dist（rc.x）属性核对降为非阻塞项，顺延至 desktop 侧验证窗口（Console 只读探针或 asar 直读补核）；若届时证实 rc.x 缺属性，经本 ADR 修订扩展结构钩子选择器，不重开设计（主人 2026-10-30 预授权）。
6. **范围**：`section[data-plugin-panel="true"]` 一个面——探针实证（2026-10-30 web rc.4）：已安装 Tab、插件市场 Tab、settings-* 设置子页（同 section 内路由切换，`< Plugins` 返回键）全部在该容器内渲染，**单钩子即全覆盖、无需扩展清单**（市场 Tab 的 dsh-m 面板另自带 86% α 实底自保护）。section 之外的密集页（上下文洞察、工作区等）不在本轮，后续按同构处理：一处一探针一钉。
7. **门禁与发版**（grill 定谳 2026-10-30）：新增 `scripts/repro-plugin-panel-readability.mjs` 挂 `pnpm test`（红自证 + 修后判据 + `--gate` 宿主不可达显式 SKIP——ADR-0021 修订四配方的**形态**；判据按病灶改定＝容器 computed style 底色不透明且与 sidebar-fill 通道一致＋容器唯一性运行时断言。亮像素判据不适用：0021 的病灶是绘制层序、computed style 无差，本病灶 computed style 即直接判据）；独立 patch 版本（1.5.21）作热部署收编锚点；验证路径＝仓库实现 → 全门禁绿 → 热部署本机 web（HMR 免重启）→ 主人验收 → 正式发版 → web `dshm_upgrade` 装机 → Desktop 侧后续复验。

## Considered Options

- **磨砂变体**（94% 皮色 + blur(14px) saturate(1.3)，0020 v1 原配方）：保壁纸余韵，但大面 GPU blur + 半透明「幽灵感」有 0020 第三次热部署被主人裁定推翻的前科——否决，实色为准。
- **token 加 α floor**（投影核给 bg-base 设最低不透明度）：token 被外壳/内容/右栏多面共享，全局变实毁玻璃（ADR-0009 v2 教义原文否决）——否决。
- **调出厂 P / 使用指引**：全局副作用 + Desktop 启动重置 66，治标不持久——否决。
- **行级 frost**（列表行纳入 frost-family）：frost 语义=浮层，语义污染 + 行数×blur 开销 + hover churn——否决。
- **canvas 采样自适应纱**：时序/复杂度风险（ADR-0021 时序依赖家族全灭教训），YAGNI——否决。

## Consequences

- 插件管理页壁纸被完全遮住（该页失去氛围）——可读性上界与官方观感一致，与 Desktop「壁纸只在会话区显露」语义（ADR-0009 v8）对齐延伸到 Web 内容页。
- 文字对比度由既有 label token（`--dsw-alias-label-primary/secondary`，三皮均已 ride 明暗两套）在实底上承担，无新文字处理。
- `data-plugin-panel` 成为受钉结构面：上游漂移在 check 红灯（fail-closed），运行时不炸。
- client-only 变更：HMR 生效免重启；验证用构建指纹探针（know-how 037 §5）+ headless 亮像素判据（可复用 ADR-0021 repro 脚手架，插件页开→亮像素基线对照）。
- 验收：Web 本机三皮 × 明暗 headless 门禁（repro 脚本亮像素判据）+ `tests/runtime-effects` 挂载/卸载/official 回退/CSS 字节钉 + 主人 web 热部署态实机验收（亮暗切换、市场 Tab、设置子页、返回键）；Desktop 实机复验顺延（非阻塞），属性核对随 desktop 侧验证窗口补办。

## Amendments

- 无（首版）。
