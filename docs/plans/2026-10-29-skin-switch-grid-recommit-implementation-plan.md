# 皮肤切换后 rail 不绘制（绘制层序回归）修复实施计划 v2

> v2（2026-10-29）：按主人裁决将修复机制由 grid nudge 家族切换为 z-index
> 绘制层序规则（评审核证7 实证 nudge 机理前提不成立；z-index 双环境有效）。
> v1 的 nudge 设计（authored+1px+no-clobber）整体废弃；其在评审中确立的
> 判据体系（相对基线三态、指纹前置、基线有效性）与形态矩阵被继承。
> 文件名沿用 v1（历史沿革见 ADR-0021），任务编号沿用以便台账对照。

## 目标

运行中切换皮肤（窄视口、侧栏收起为 rail 态）后，宿主合成器把中栏画到
sidebarCol 之上——rail（底色+图标）视觉消失而 layout 与命中测试正常
（「看不见但可点」）。修复：dsh-skins 挂肤时为 sidebarCol 注入一条静态
绘制层序规则（`position:relative; z-index:1`，作用域=皮肤 body 属性），
使侧栏列在层叠序上恒高于中栏，根除该绘制态。

验收基准：与主人手机同 signature 的 headless 复现（切肤后 rail 图标可见、
布局健全）；真机（主人手机）复验通过。

## 架构快照

- **根因模型（v2，证据链）**：历次实测 layout/命中测试始终正确、仅绘制错、
  显式提升 sidebarCol 层叠序**每次**都能修复（重启前 dark 环境 `t-raise-col`
  与重启后 light 环境评审 3/3）——定性为皮肤切换样式大 churn 后合成器对
  frame 子元素的**绘制层序错乱**（中栏越序压住 sidebarCol），而非「陈旧列
  状态」。nudge 家族（重写 gtc 触发重提交）被否决：重启前非确定三结局
  （无效/塌陷/偶发修复，评审 R6 实证）、重启后 +1px 变体 0/6 完全无效
  （used 值变化不再触发重提交，核证7）——机理前提跨环境不可靠，弃用。
- **修复形态**：静态 CSS、随皮肤生命周期挂卸（buildEffects 挂、stop 链卸），
  无运行时调度、无时序依赖。原 B2「切肤时执行一次不分支」、B3
  「data-animating 保护」两项裁决随 nudge 机制一并废止；B1 的验收基线
  （同 signature headless 复现→图标可见）不变、机制由主人 2026-10-29
  裁决变更为 z-index。原 B8 挂接点语义映射为 CSS 挂卸生命周期
  （select 皮肤→挂；select 官方/dispose→卸；restorePrevious→经 buildEffects
  重挂）。官方态（无皮肤属性）无保护——官方切换路径安全性的既有实证
  （probe13 出厂→官方后 rail 健康 2288）+ T6 spot-check 复核。
- **层叠副作用面（ADR-0021 详录，T6 矩阵实证）**：`[class*="_handle"]`
  z-11、`[class*="_overlayLayer"]` z-20、`[class*="_leadingSeat"]` z-15（宿主
  布局包）与自有换肤弹层 `.dsh-skins-pop` z-60（sidebar-switcher.js:159，
  非宿主层）——均高于 sidebarCol 的 z-1，不受影响；收起动画期间
  侧栏滑块画在中栏之上＝正确视觉（真实轨道不重叠，该断言只在陈旧几何下
  起效，与修复意图自洽）；darwin/windows（collapsedWidth=0，
  侧栏整列隐藏）无重叠面；fullscreen rightbar 为独立列、overlayLayer
  盖全帧，不受影响。前端 CSS z 全集另附 ADR 逐项清点（评审核证8）。
- **范围外（如实记录，不修）**：①官方皮肤态（无皮肤 body 属性）的冷加载
  偶发坏态（核证7 观测 2/5）属宿主侧问题，dsh-skins 无挂点，ADR 记观察；
  ②2026-10-29 11:39 重启后匿名会话主题默认翻 light + UI 英文的环境变化
  ——主人已裁决「另查、不阻塞」，独立调查项，不属本计划。

## 全局约束（继承自共识、裁决与仓库规则）

- 主人裁决记录（2026-10-29）：①B1 机制变更＝z-index 绘制层序规则转正
  （nudge 家族废弃；B2/B3 随机制废止）；②D1＝A——repro 脚本按 B5 挂进
  check 门禁；③B1 验收基线（同 signature headless 复现→图标可见）不变。
- 结构钩子纪律：`[class*="_sidebarCol"]` 已被 `scripts/verify-upstream-hooks.mjs`
  钉住（layout 专属白名单），新增用法不触警、不新增未钉钩子。
- `playwright-core@1.62.1` 已在 devDependencies（package.json:90，评审 R22
  核实）——**零依赖变更**；本机缓存的 chromium-1248 属 1.64.1 配套，
  首跑门禁前需 `npx playwright-core install chromium` 一次（评审 dry-run
  验证有效），前提记入 developers.md。
- 仓内构建命令（esbuild 家族）在 danger-full-access 会话执行；
  `core.autocrlf=true` 幻影 M 以 `git diff --exit-code` 为准；
  发版纪律见 `docs/developers.md`「发版」节、热部署纪律同节
  （`scripts/hot-deploy.sh`）。

## 文件结构与职责

| 文件 | 动作 | 职责 |
|---|---|---|
| `docs/adr/0021-skin-switch-sidebar-paint-order.md` | 新建 | 根因模型演进史（含 nudge 家族否决史与实证索引）、z-index 裁决、层叠副作用面清点、官方态冷坏态观察、环境另查立案注记 |
| `GLOSSARY.md` | 修改 | 收录：Rail、绘制层序回归（paint-order regression）、Compositor recommit（历史术语，标注已废弃） |
| `src/client/runtime.js` | 修改 | 新增 `sidebarPaintOrderCss(bodyAttribute)`；`buildEffects` 挂/卸 `dsh-skins/<id>.paintorder.css` 标签 |
| `src/client/sidebar-switcher.js` | 修改 | 换肤弹层卡片挂 `data-skin-id={skin.id}` 稳定标识（评审 R21） |
| `tests/runtime-effects.test.mjs` | 修改 | paint-order 标签挂/卸/内容断言（含 restorePrevious 路径） |
| `tests/sidebar-switcher.test.mjs` | 修改 | 卡片 `data-skin-id` 断言 |
| `scripts/repro-stale-grid-paint.mjs` | 新建 | headless 复现/验收脚本：指纹前置、冷基线健全性自检+重试、相对基线三态判据、`--gate`/`--fingerprint-only`/`--no-fingerprint`/`--collapse-expand`/`--skin-id` |
| `package.json` | 修改 | `test` 链插入 `node scripts/repro-stale-grid-paint.mjs --gate`（D1=A；仅脚本串改动，依赖零变更） |
| `docs/developers.md` | 修改 | 补一行本地跑真浏览器门禁前提（chromium install 命令与缓存说明） |
| `lib/client.js`、`lib/index.js` | 构建产物 | `pnpm run build` 生成，不手改 |

## 任务清单

### T1 落 ADR-0021 与 GLOSSARY 术语

- ADR-0021 内容：背景（主人双截图实拍）→ 根因模型演进史（「弹层遮挡」被
  截图否决 →「陈旧列状态/nudge」被三结局+核证7 实证否决 →「绘制层序」经
  双环境 z-index 实证确立）→ 裁决（z-index:1 转正，主人 2026-10-29；nudge
  家族弃用理由与证据索引：`railfix-plan-review-scratch/logs/`）→ 层叠副作用
  面逐项清点（handle z-11 / overlayLayer z-20 / leadingSeat z-15 / 自有
  `.dsh-skins-pop` z-60 / 收起动画期 / darwin / windows / fullscreen
  rightbar；另附前端 CSS z 全集清点行——0/1/2/6/70/100/101/1000/1100
  逐项归属，评审核证8：z-0 唯一主人是中心列树行 hover 括号伪元素、
  in-flow 几何不可达 rail 条；z-1/2/6 为中心内容内部件、同 z-1 弹窗经
  portal 后挂仍在上方；z≥70 门户层；frost-family backdrop-filter 目标
  全为门户层元素、无一在 sidebarCol 内；ADR-0009 titlebar 模式正交性
  推理：sidebarCol 的 background:0 0 与 position/z-index 属性正交、
  caption ::before 因 frame padding-top 与 sidebarCol 无几何重叠）→
  官方态冷坏态观察（范围外）→ 环境另查立案注记（匿名主题翻转，
  不阻塞）→ 验证证据（探针结论与修复前后亮像素对比）。
- `GLOSSARY.md` 追加：**Rail**（收起态侧栏的 55px 图标条，宿主
  `_sidebarCol` 内）、**绘制层序回归**（合成器把同层网格兄弟画错次序，
  layout/命中正常而绘制错）、**Compositor recommit**（历史术语：轻推 gtc
  换取合成器重提交；已废弃，词目保留以防旧文档误读）。
- 验证：两文件存在且内容完整；GLOSSARY 无实现细节混入。

### T2 失败测试先行（tests/runtime-effects.test.mjs + sidebar-switcher.test.mjs）

- runtime-effects 断言组（复用现有 DOM stub 与驱动用例，无 rAF 依赖）：
  1. `select(皮肤)` 成功后 head 存在
     `style[data-plugin-css="dsh-skins/<id>.paintorder.css"]`，内容恰为
     `body[data-dsh-<attr>-skin] [class*="_sidebarCol"]{position:relative;z-index:1}`
     （选择器作用域与规则体逐字断言）；
  2. `select(官方)` / dispose 后该标签被移除（stop 链）；
  3. `restorePrevious` 成功恢复分支重建该标签（buildEffects 重跑路径，复用
     :322 失败重建测试的驱动模式）。
- sidebar-switcher 断言：换肤弹层每张卡片根节点带
  `data-skin-id="<skin.id>"`，官方卡为稳定常量（实现取官方皮肤 id
  `official`，断言钉住该值）。
- 验证：`node --test tests/runtime-effects.test.mjs tests/sidebar-switcher.test.mjs`
  新用例红（未实现）。

### T3 实现（src/client/runtime.js + sidebar-switcher.js）

- runtime.js：新增纯函数（放 buildEffects 附近）并接线：

```js
/** Sidebar paint-order guard (ADR-0021): after a skin switch the compositor
 * can paint the center column over the sidebar column — layout and
 * hit-testing stay correct while the collapsed rail stops painting
 * ("invisible but clickable"). Pin the sidebar column one explicit step up
 * the stacking order so its grid sibling can never overpaint it. Static CSS
 * on the skin's own lifecycle: mounted with the skin, removed with it; no
 * runtime scheduling, no timing dependence. */
function sidebarPaintOrderCss(bodyAttribute) {
  return `body[${datasetAttribute(bodyAttribute)}] [class*="_sidebarCol"]{position:relative;z-index:1}`;
}
```

  （作用域构造沿用 runtime.js 现有 `datasetAttribute()`——与 backdropCss
  内联构造同款，评审 R23③ 命名对齐。）`buildEffects` 内与 backdrop/vars
  同模式挂载 style 标签（id=`dsh-skins/${skin.id}.paintorder.css`），
  stop 链自动回收。
- sidebar-switcher.js：换肤卡片根节点加 `data-skin-id={skin.id}`（官方卡
  取常量 `official`）。
- 验证：`node --test tests/*.test.mjs` 全绿（T2 断言转绿且无回归）。

### T4 headless 复现/验收脚本（scripts/repro-stale-grid-paint.mjs）

- playwright-core 启动 chromium → 视口（默认 422x800）→ 打开 `--url`
  （默认 `http://127.0.0.1:3080`）。
- **步骤 0 运行时指纹（默认开启）**：页面枚举
  `performance.getEntriesByType("resource")` 中含 `dsh-skins` 的 bundle，
  fetch served 字节断言包含 `paintorder`；缺失即
  `ERROR: served bundle lacks fix` 非零退出（旧 bundle 不得产出 PASS；
  resource 条目缺失时降级扫 `document.scripts`）。
- **冷基线健全性自检（评审 R20：冷加载可能即坏，不得假设健康）**：按
  `--skin-id` 经 `data-skin-id` 定位卡片（R21——不依赖 UI 文案语言）选目标
  皮肤，冷加载后检查 sidebarCol rect 健康 + brightCold ≥ 100；不健康则重载
  重试（≤2 次）；仍不健康 → `INVALID: baseline unhealthy` 非零退出（环境态
  问题与修复判据分离）。
- 测量定义（写死，评审 R10）：亮像素＝sidebarCol rect 区域内满足
  `lum = 0.2126·R + 0.7152·G + 0.0722·B > 60` 的像素数；基线与测后区域同源
  （冷加载时 sidebarCol 的 bounding rect；展开形态随形态取列本体——R13②）。
- 切肤流：弹层选官方 → 再按 `--skin-id` 选目标皮肤 → Escape → 等 1s →
  取 brightAfter / rectAfter / frame inline gtc。
- 参数：`--url`、`--viewport WxH`、`--skin-id <id>`（openbmc-harness /
  meirenzhi / uefi-harness；缺省 openbmc-harness）、`--collapse-expand`
  （切肤前收起→展开各一次，B4②）、`--no-fingerprint`（红基线跑法）、
  `--fingerprint-only`（仅探针，热部署生效判据）、`--gate`（门禁模式）。
- 三态判据（实现期校准定稿，2026-10-29；相对基线体系继承评审
  R7/R13/R15/R18，检测器与协议按活宿主实测增强）：
  - **环境规范化（dark signature）**：匿名回环工作区的持久主题在 11:39
    重启后翻 light（另查立案），而 light 主题下亮像素判据天然失明
    （整条 rail 亮、图标像素淹没）且 cold 即坏家族频发——脚本先经产品
    Dark 主题卡（正常持久写、UI 可逆）规范化到 dark 签名（与主人手机
    一致），再取基线；
  - **基线健全性（R20）**：dark 签名＋rect 健康＋brightCold ≥ 100＋
    **边缘 activity ≥ 30**（light-cold 坏态的指纹＝bright 满格而
    edges=0；边缘=条带内相邻像素亮度突变数，评审实证 healthy=166 /
    broken=0——最锐利信号）＋重载重试 ≤3，仍坏 → INVALID 非零退出；
  - **K=6 往返协议**：回归是间歇性的（未修复构建单次复现率实测 1/3–3/5），
    单趟门禁会假绿；6 趟全过制把红假绿率压到 ~(1-repro)^6 ≈ 0.4%，静态
    规则使绿侧每趟确定干净；
  - 每趟三信号：brightAfter ∈ [70%,300%]·brightCold、cold↔after 逐像素
    diff < 10%（坏族实测 19.9–34.9%，pass 族 ≈0–1.4%）、edges ≥ 50%·
    edgesCold（<25% 直接 FAIL）；rect 稳定、gtc 非空；
  - 裁决：任一趟 FAIL（diff≥20% ∨ bright<50% ∨ edges<25%）→ exit 1；
    全过 → exit 0；其余（[10,20) diff 灰带等）→ REVIEW exit 2 落
    `repro-rail.png`。
- `--gate` 语义（D1=A）：先探测 `--url` 可达性——不可达（CI 无活宿主，
  ci.yml:28/release.yml:33 均跑 check）→ 打印
  `SKIP repro-stale-grid-paint (no live host at <url>)` exit 0（显式跳过非
  静默绿）；可达 → 步骤 0 + 全量判据。
- 验证：对未修复构建（无 paintorder）以 `--no-fingerprint` 跑出 FAIL（红
  基线）；`--fingerprint-only` 对未修复构建输出 ERROR（探针自证）。

### T5 构建与全门禁（含 D1=A 挂载与红绿自证）

- `test` 链插入：
  `"test": "pnpm run build && node smoke-test.cjs && node scripts/repro-stale-grid-paint.mjs --gate && node --test tests/*.test.mjs"`；
  developers.md 补 chromium install 前提一行。
- **执行顺序修正（实现期发现，2026-10-29）**：`--gate` 打的是活宿主 served
  bundle——部署前必红（指纹 ERROR），红绿自证只能在部署态做。顺序调整为：
  本任务先 `pnpm run build` + `node --test tests/*.test.mjs` + lint +
  verify:*（除 repro 外的门禁面），**随后 T6 热部署，再回本任务完成门禁面**：
  1. 绿：部署态跑 `pnpm run test`（含 repro `--gate`）→ 全绿；
  2. 红：用 hot-deploy.sh 部署「移除 paintorder 挂载」的临时构建 →
     `node scripts/repro-stale-grid-paint.mjs --gate` 必须非零（指纹 ERROR
     或 FAIL）→ 恢复正式构建重部署 → 复跑全绿。红不了即门禁形同虚设。
- 验证：check 全绿、红绿自证完成、exit 0。

### T6 热部署 + 真浏览器验收

- 按 `docs/developers.md` 热部署纪律（`scripts/hot-deploy.sh`）部署
  client-only 变更，HMR 生效、禁重启。生效判据（可观测探针；
  hot-deploy.sh 的 cmp/sha 只是文件级）：
  ```bash
  node scripts/repro-stale-grid-paint.mjs --fingerprint-only
  # 预期 symbol-present（served bundle 字节含 paintorder）；缺符号即
  # ERROR 非零退出，不得继续验收
  ```
- **前置放行条件**：评审以热部署后的真实构建在活宿主复跑修复验证
  （评审已有 z-index 语义 3/3 实证；此处核「实现即规则」——挂载标签的
  内容/作用域与实证规则逐字一致）+ 判据基线校准（三皮肤 brightCold 实测；
  R18 的 <100 路径如有则实录 REVIEW 行为）。
- 形态矩阵（逐条对齐 B4，全部须 PASS 或确认不中招）：
  - B4①：`--viewport 1440x900 --skin-id <id>` 宽屏展开态（区域取列本体；
    确认不中招且 z-index 无副作用）；
  - B4②：`--collapse-expand --skin-id <id>`（收展动画路径上层叠正确性：
    侧栏滑块画在中栏之上、动画终态无残影——z-index 转正后此形态从
    「nudge 保护路径」变为「层叠正确性验证」）；
  - B4③：windows-titlebar——desktop 客户端原生注入、web 会话不可伪造，
    代码审读：规则与平台属性正交、collapsedWidth=0 隐藏列无重叠面 →
    结论记入 ADR 验证节；
  - B4④：darwin——同③审读（collapsedWidth=0、宿主自有渐变底）→ 记入 ADR；
  - B4⑤：三皮肤（openbmc-harness / meirenzhi / uefi-harness）× 官方全互切，
    窄视口逐皮肤 PASS（UEFI 为本次新增覆盖）。
- **OpenBMC→官方 spot-check（评审 R16②）**：切回官方后 rail 可见（官方态
  无皮肤属性、无 paintorder 保护——此测只证「卸载规则不残留、不致坏」；
  官方态冷坏态属宿主侧范围外问题，如偶发以重载自愈为准记录）。
- 交主人手机复验（官方 ↔ OpenBMC 来回切，rail 图标始终可见）。
- 验证：指纹 symbol-present + 矩阵全 PASS + spot-check PASS + 主人真机确认
  （此前不准发版）。

### T7 发版（主人真机确认后）

- 按 `docs/developers.md`「发版」序列：patch 版本号、changelog 记 ADR-0021、
  npm 发版 + know-how 018 staged 轮询（`tools/release-monitor.sh`）、
  registry 收尾按 know-how 008、web 机升级正式版并复跑 `--fingerprint-only`
  + 主用例 PASS。
- 验证：registry latest=新版本；web profile 版本一致；脚本 PASS。

## 任务间接口契约

- T2 Produces：paintorder 标签挂/卸/内容断言与卡片 `data-skin-id` 断言 →
  T3 Consumes（实现须逐字匹配：标签 id 模式 `dsh-skins/<id>.paintorder.css`、
  选择器 `body[data-dsh-<attr>-skin] [class*="_sidebarCol"]`、规则体
  `position:relative;z-index:1`、卡片 `data-skin-id` 取值域）。
- T3 Produces：`sidebarPaintOrderCss` 与卡片稳定标识 → T4/T5/T6 Consumes
  （指纹符号 `paintorder`、`--skin-id` 取值域即皮肤 id）。
- T4 Produces：三态判据与 `--gate`/`--fingerprint-only` 语义 → T5（门禁挂载
  与红绿自证）/ T6（生效判据与矩阵跑法）。

## 执行纪律

- 开始实现前批判性复查本计划；发现缺项/矛盾/验证命令失效先修计划。
- 按任务顺序执行，不无声跳步；每任务完成即跑其验证。
- 构建类命令在 danger-full-access 会话执行；>90s 命令用 run_in_background。
- 阻塞或计划与仓库现实不符立即停下说明。
- 主人裁决（2026-10-29）：直接在 `main` 开工，不开特性分支；阶段性改动
  以 commit 边界留在 main（门禁绿后提交）。

## 最终验证

`pnpm run check` 全绿（红绿自证完成）+ `--fingerprint-only` symbol-present +
T6 形态矩阵与 spot-check 全 PASS + 主人手机复验通过 + T7 发版收尾核验。
