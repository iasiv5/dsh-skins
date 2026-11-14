# Task 1 活体取证 preflight（文字纱与文字地板 · ADR-0027）

- 日期：2026-11-14。取证方式：**Agent 自取证**（主人外出改派）——playwright-core 1.62.1 + 本机 chromium headless，活实例 `http://127.0.0.1:3080`。
- 零写入证据：`GET /dsh-skins/config` revision **1106 → 1106**（三轮取证前后一致）；皮肤切换走自动化 context 自身 localStorage（`/?skin=`，runtime.js resolveSelectedId）；亮色态 = 拦截 document `data-ds-theme-source` 与 settings RPC 响应改写（每臂足迹：document:1 + settings-rpc:3，已记录于各 dom.json）；银月壁纸 = config 响应改写（拦截 2 次）。宿主持久层零写入。
- 本机状态：现役 mrz + 壁纸覆盖 mupeiling，无 P 覆盖（出厂 35 = anchor，riding 按 baked 原值应用——下表骑值实证吻合即证）。
- 原始产物（scratch，不入仓）：`.dsh-research/scratch/skins-contrast/` 下 `captures/*.png|*.dom.json`、`measure-results.json`、`measure-extra.json`、`measure-chip.json`、`color-forensics.json`、`placeholder-forensics.json`、`net-recon.json`、`exec-log.md`。

## 1. riding 骑值实证（P=35=anchor，live computed vs 声明表）

| token | 模式 | live 应用值 | 声明表 baked | 判定 |
|---|---|---|---|---|
| `--dsw-specific-sidebar-fill` | light | rgba(250, 249, 246, 0.4) | ["250, 249, 246", 40] | ✓ 逐字 |
| `--dsw-specific-sidebar-fill` | dark | rgba(18, 18, 26, 0.52) | ["18, 18, 26", 52] | ✓ 逐字 |
| `--dsw-specific-input-major` | light | rgba(250, 249, 246, 0.4) | ["250, 249, 246", 40] | ✓ 逐字 |
| `--dsw-specific-input-major` | dark | rgba(18, 18, 26, 0.45) | ["18, 18, 26", 45] | ✓ 逐字 |

载体：侧栏列根 div（类 pI_x6G_sidebarCol）与 composer card（类 uV2eYG_card）computed backgroundColor。

## 2. 色源裁决表（Task 5 定值 / Task 6 落地与守卫的唯一依据）

| 表面 | 宿主/自有 | 实测文字色（light / dark） | 色源裁决 | 通道 |
|---|---|---|---|---|
| 侧栏导航主字（14px，插件/歸藏设计…） | 宿主 | rgb(15,17,21) / rgb(249,250,251) | `--dsw-alias-label-primary`（neutral-bluish-1000/50） | **constantTokens** |
| 侧栏 muted 字（会话列表行、空态「暂无会话」13px）＝**基线侧栏失败行族** | 宿主 | rgb(129,133,140)（#81858c＝bluish-600） | `--dsw-alias-label-tertiary` | **constantTokens** |
| composer 占位（16px） | 宿主 | 非 `::placeholder` 伪元素——Lexical 编辑器渲染型占位：`[data-composer-input="true"]` + `data-placeholder` 属性（data-phase=plain/inert）；字形色规则在宿主 app 哈希类 CSS 内，不可骑 token | 结构**属性选择器** `[data-composer-input="true"]`（稳定非哈希，可进守卫） | **staticCss（属性选择器）+ 守卫** |
| hero 标语（26px/500，pXSMma_titleGroup > span） | 宿主 | rgb(15,17,21) / rgb(249,250,251)（=label-primary，textShadow: none） | DOM 钩子 = `pXSMma_titleGroup` 结构类（哈希类，**provisional**，Task 6 装机定面复核）+ 文字色=常量族 | **constantTokens（色）+ 守卫（锚）** |
| 品牌位（凡人修仙传字标 + BEAUTY 徽） | 插件自有（MeiRenZhiName/Mark 组件） | 组件源码即可取证（src/client/skins/meirenzhi/index.js），金渐变 bg-clip 在组件内部 | 插件自有组件 CSS 直改 | **组件 CSS（Task 7）** |
| composer 容器边界 | 宿主 composer card（uV2eYG_card） | **现役 0px 无边界**（与基线 1.00x 一致） | 新增 staticCss 常量边框（textfloor 新段） | **staticCss（Task 6）** |
| 底栏入口（主题切换/插件市场/更多 + switcher/dshm 按钮） | 宿主 label + 插件自有按钮 | rgb(15,17,21) / rgb(249,250,251) | `--dsw-alias-label-primary`（宿主字）→ constantTokens；`button.dsh-skins-switcher-btn`/`button.dshm-entry`（插件自有，零改动） | **constantTokens** |

## 3. 复测数值（Otsu 双聚类，重建件 measure.mjs；区域=视口分数坐标，1912×948）

三行纠缠（ADR-0027 Q3-2.5）全分辨率复测：

| 纠缠行 | 态 | 复测值 | 基线参照 | 判读 |
|---|---|---|---|---|
| mrz 占位 | 亮（慕沛灵/银月） | **1.36 / 1.34**（暗色 1.87） | 1.43–3.08 | ✓ 量级吻合，失败向 |
| desktop 占位 | — | **本机无 desktop 实例，不可取证**（web 机） | 1.95 | 申报缺席；门禁 fixture 覆盖 desktop 分区（公式路径） |
| openbmc/uefi chip（composer 上方 chips 带） | 亮 | openbmc **4.44** / uefi **4.29** | 半分辨率不可测 | 全分辨率首测：**贴线（<4.5）**，门禁 p95 保守口径下由公式定论 |
| 同上 | 暗 | openbmc **6.25** / uefi **7.51** | — | ✓ 通过向 |

全态区域表：见 scratch `measure-results.json`（六区域 × 七态）。要点：亮色 composer_placeholder 全部失败向（1.21–1.36）；暗色全部通过向（3.65–4.12 占位、5.7–10.66 边界）。

## 4. 锚行回归结论（步骤 0 申报）

- 严格 ±0.05 锚**不可达**：基线原图与 measure.py 原区域标注在共识机（本机缺席），区域只能按语义重建。
- **物理 reconciled**：重建「侧栏导航主字」箱位读数 5.0–6.1（通过）与基线侧栏 1.54–2.73（失败）表面矛盾，补测「侧栏会话列表 muted 字」箱位得 **1.99（慕沛灵）/ 1.13（银月）**，正落基线区间——基线「侧栏」行族语义 = **muted 次要字压白纱底**（本表 §2 第二行），非导航主字。占位行与暗色行量级均吻合。
- **纪律处置**：重建读数只作方向性支持证据，**不作为 Task 5/6 定值依据**；定值唯一依据 = 门禁公式路径（Task 2 fixture p95 + 独立重实现投影公式 + TEXT_FLOOR 手抄色，ADR-0027 D7 机制裁定）。建议主人回机后取回共识机原目录关闭锚环（计划外建议）。
- hero 行注意：本机实测 hero 主字 5.94–6.17（通过向）与基线 3.0–4.6（贴线/失败向）存在同类环境/区域语义差；hero 阈值 3.0 的达标判定以门禁公式为准，Task 6 修法（DOM 钩子文字侧）按门禁反解值定色。

## 5. 守卫锚点清单（Task 6 verify-upstream-hooks 第 10 组输入）

1. `[data-composer-input="true"]`（composer 输入根，属性选择器稳定）
2. `[data-composer-input] > [data-placeholder]` 渲染型占位机制（Lexical）
3. `pXSMma_titleGroup`（hero 标语结构类，**provisional**——装机定面复核后钉死）
4. 侧栏列根 riding 载体（本表 §1 载体行；装机复核哈希类）
5. composer card 容器（uV2eYG_card，**provisional**）

## 6. 环境注意（供后续任务）

- headless chromium 对 `ws://127.0.0.1:3080/api/remote.mux` 报 `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`（本机 chromium 行为，run2 起）→ 亮色态侧栏会话列表为空（「暂无会话」），不影响区域测量；暗色态（run1）WS 正常、列表在册。截图含真实会话名的暗色态仅存 scratch。
- console 噪音：`[client-store] plugins.bundle.config` slot dup（宿主侧既有）；WS 重连错误 ×N（同上）。
