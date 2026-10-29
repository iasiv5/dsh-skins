# 皮肤切换后侧栏 rail 不绘制（绘制层序回归）的修复

---
status: accepted
date: 2026-10-29
---

## 背景

主人手机实拍（2026-10-29 双截图对照）：OpenBMC 皮肤下，收起为 rail 态的左
侧栏图标全部不可见，但点击对应位置仍有反应（命中测试正常）；官方皮肤同状态
图标可见。headless 复现（422x800 窄视口、官方→皮肤运行中切换）确认：layout
与命中测试始终正确、仅绘制结果错误——中栏内容越序压住整条 sidebarCol（连
底色一起消失），宽屏展开态与冷加载（皮肤态）为低发面。

## 根因模型演进史（三次定谳，证据链）

1. **「换肤弹层盖住 rail」——被主人双截图像素级测量否决**：两图弹层卡片几何
   完全一致（左缘同位），官方下图标画在卡片外清晰可见；前提不成立。
2. **「陈旧 grid 列状态 / 合成器重提交（grid nudge）」——被两轮实证否决**：
   重启前同一 nudge 代码三结局随帧时序漂移（宿主快速回写→无效；不回写→
   单列塌陷且二次 nudge 链式污染；中间态→偶发修复）；重启后 +1px 确定性
   变体 0/6 完全无效（inline 时间线全程正确而像素无变化）——「used 值变化
   →合成器重提交」的机理前提跨环境不可靠。
3. **「绘制层序（paint order）」——经双环境实证确立**：历次实测中显式提升
   sidebarCol 层叠序**每次**都能修复（重启前 dark 环境 raise-col 探针、
   重启后 light 环境 3/3 复跑），定性为皮肤切换样式大 churn 后合成器对
   frame 网格兄弟列的绘制次序错乱，而非列几何陈旧。

主人裁决（2026-10-29）：z-index 方案转正为主修复；nudge 家族废弃
（原 B2「切肤时执行一次」、B3「动画保护」两项随机制废止；B1 的验收基线
「同 signature headless 复现→图标可见」不变）。

## Decision

- 新增纯函数 `sidebarPaintOrderCss(bodyAttribute)`（`src/client/runtime.js`，
  与 backdrop/vars 生成器同位同律），产出单条静态规则：
  `body[data-dsh-<attr>-skin] [class*="_sidebarCol"]{position:relative;z-index:1}`
  挂载为随皮事务 style tag `dsh-skins/<id>.paintorder.css`（stop 链自动回收，
  同皮重挂幂等覆写）。无运行时调度、无时序依赖。
- 作用域＝皮肤 body 属性：皮肤激活态（含冷加载）即受保护——比「仅切换时
  触发」的时序修复覆盖面大（冷加载即坏的皮肤态低发族同样被覆盖）；官方态
  无属性、无规则（官方切换路径安全性的既有实证＋T6 spot-check 复核）。
- 钩子钉子：复用既有 `*_sidebarCol` 结构钩子（verify-upstream-hooks.mjs
  layout 专属白名单），零新钩子。

### 层叠副作用面清点（2026-10-29 评审核证8 逐项亲核）

- 宿主布局包：`[class*="_handle"]` z-11、`[class*="_overlayLayer"]` z-20、
  `[class*="_leadingSeat"]` z-15——均高于 z-1，拖拽/悬浮/覆盖层不受影响。
- 自有换肤弹层 `.dsh-skins-pop` z-60（sidebar-switcher.js）——非宿主层，
  高于 z-1。
- 前端 CSS z 全集＝0/1/2/6/70/100/101/1000/1100 逐项归属：z-0 唯一主人是
  中心列树行 hover 括号伪元素（in-flow 内容、几何不可达 rail 条）；z-1/2/6
  为中心内容内部件（同 z-1 的浮层经 portal 后挂、DOM 序仍在侧栏之上）；
  z≥70 门户层。无实际回归。
- 收起动画期：真实轨道不重叠，「侧栏画在中栏之上」只在陈旧几何下起效、
  与修复意图自洽（B4② 实测覆盖）。
- frost 家族 backdrop-filter 目标（dialog/panel/pop/float/overlay）全为
  门户层元素、无一在 sidebarCol 内——新建层叠上下文不影响其采样。
- `position:relative` 无偏移＝零布局位移，grid 轨道测量正交。
- ADR-0009 titlebar 模式正交：sidebarCol 的 `background:0 0` 与
  position/z-index 属性正交；caption ::before 因 frame padding-top 与
  sidebarCol 无几何重叠。
- darwin / windows-titlebar（collapsedWidth=0、侧栏整列隐藏）：无重叠面；
  fullscreen rightbar 为独立列、overlayLayer 盖全帧，不受影响。

## Considered Options

- **换肤弹层避让 rail**（方案一）：被主人双截图否决（弹层几何两态一致，
  前提不成立）。
- **grid nudge 家族**（写回计算值/清除 → authored+1px+no-clobber 确定性
  变体）：评审四轮打磨后仍被核证7 否决——重启前三结局非确定、重启后
  完全无效；机理依赖合成器时序行为，随时可被宿主/Chromium 更新静默打破。
- **z-index:1 绘制层序规则**（转正）：双环境实证有效、静态无时序依赖、
  直击「绘制次序」根因——采纳。

## Consequences

- rail「看不见但可点」在皮肤激活态（含冷加载）根除；官方态冷加载偶发
  坏态（核证7 观测 2/5，宿主侧、无皮肤属性挂点）不在本修复范围，如遇
  以重载自愈为准记录。
- `*_sidebarCol` 既有钉子面不变；上游漂移仍在 check 红灯。
- 验收基础设施沉淀：`scripts/repro-stale-grid-paint.mjs`（相对基线三态
  判据＋served-bytes 指纹前置＋冷基线健全性自检）挂入 `test` 门禁
  （`--gate`：宿主不可达显式 SKIP，CI 零负担）。
- 环境另查（2026-10-29 11:39 重启后匿名会话主题默认翻 light＋UI 英文，
  磁盘零变化）：独立调查项，不阻塞本修复（主人裁决）。

## Amendments

- **2026-10-29（第二面终版修法：全屏→停靠定点重绘钩子；层钉与层序试验全撤销）**：
  上述层钉路线（position:relative → isolation:isolate → z-2 → 空 pane 守卫
  四次试验）each 引发新回归（全屏铺进右栏 / 盖不住左栏+透字 / 空壳层盖 UI），
  全部撤销，fullscreen.css 回归 ADR-0020 原样字节。终版修法＝runtime 挂
  MutationObserver 监听 `[data-sidebar-right-panel]` 从 fullscreen→其他，
  双 rAF 内移除并重挂本皮 fullscreen.css 标签——用已实证的「大样式失效强制
  重绘」解卡，作用域仅自身标签。教训句：**同族疾病的两个面要用各自已被实证
  的解卡手段——rail 面用层钉（持续保护），停靠面用事件驱动定点重绘；跨面
  复用层序手段每次都引入新回归。**
- **2026-10-29（同一疾病第二面：全屏→停靠陈旧帧，层钉扩展）**：主人在 web
  形态发现——右栏面板全屏（开始页）→点「收起侧边栏」后，布局已正确切换
  （right="push"、侧栏展开 286px、center 1083px，Console 实测），但画面停在
  旧的全屏帧；官方皮肤同流程正常；**拔掉 `openbmc.fullscreen.css` 立即弹回**
  （二分实证，`backdrop.css` 拔除无效）。即：ADR-0020 的三条全屏实底规则
  （`background-color:rgb()!important`，无 filter）在「属性失配 + 大面积
  实底→半透明重绘」churn 下同样触发陈旧绘制。处置：三条目标
  （rightbarCol/dockPanel/dockPane）统一加 `position:relative;z-index:0`
  层钉——沿用本 ADR 主修复的已验证手法（定位层强制独立重绘；z=0 低于一切
  门户层）。字节钉（fullscreen-base byte-pinned）与 ADR-0020 语义同步更新。
  教训句：**皮肤半透明表面 + 宿主状态属性churn = 合成器陈旧帧的高危组合，
  凡大面积覆盖类规则，一律随规则层钉。**
- 无（首版）。
