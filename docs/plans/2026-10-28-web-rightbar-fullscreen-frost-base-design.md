# 设计：Web 右栏全屏态霜面底（免透字） · 保留停靠态半透明

状态：**草稿 / 待审批**（CHECKPOINT A 已过：2026-10-28 主人选定「方案 A · 霜面底」）
皮：`@iasiv5/dsh-skins` 三皮共享机制；宿主：DSH Web 0.2.1-rc.4（`dsh-client-ui-layout@0.2.1-rc.4` 实证）

## 1. 背景与目标

### 1.1 现象

- 图一（官方皮肤）：右栏全屏（`data-rightbar-fullscreen`）后底色不透明，聊天输入框文字不透出。
- 图二（dsh-skins 任意皮）：全屏后壁纸与聊天文字透过面板可见，可读性受损。
- 图三（dsh-skins）：**非全屏**停靠态右栏半透明浮于壁纸上——玻璃感，**必须原样保留**。

### 1.2 根因（已核实）

| 环节 | 事实 | 证据 |
|---|---|---|
| 全屏状态钩子 | AppFrame 根元素挂 `data-rightbar-fullscreen`（data 属性，布局契约） | `dsh-client-ui-layout/lib/client.js` frame JSX |
| 右栏列底色 | `.pI_x6G_rightbarCol{background:var(--dsw-alias-bg-base)}`，官方 token 实色 | 同上，样式表 |
| 皮肤改写 | riding 表把 `--dsw-alias-bg-base` 改写为 rgba（α 随通透度 P 浮动，ADR-0013/0017） | `src/client/skins/*/index.js` riding 声明 |
| Web 壁纸 | dsh-skins 画在 `body::before/::after`（fixed, z-index:-1），全透面均叠于其上 | `src/client/runtime.js` `backdropCss()` |

透字 = 半透明右栏列（rgba bg-base）叠在 centerCol 聊天内容 + body::before 壁纸之上。非全屏时同一 rgba 窄条浮在壁纸上，恰是图三的玻璃感来源——**同一机制，两种语境**：背后是装饰（壁纸）→ 半透明是资产；背后是内容（聊天文字）→ 半透明是缺陷。

### 1.3 仓库既有教义

`runtime.js` `buildShellAlignmentCss`（ADR-0009，Desktop 形态）已为此表面写过实底规则：

- `[data-rightbar-col] > *` 全屏 occupant 盖 `rgb()` 实色（注释原话 "so translucent panel surfaces never float over chat text"）；
- 但整段被 `html[data-windows-titlebar]` 门控，**Web 从不生效**。

本设计 = 把该教义按"全屏态限定"移植到 Web，底色从实色放宽为霜面（94% + blur），停靠态零改动。

## 2. 范围与非范围

**范围**
1. 新增共享生成器 `buildFullscreenBaseCss(bodyAttribute, opaqueFills)`（`src/client/runtime.js`，与 `buildShellAlignmentCss` 同位同律：机制住共享模块，色值由 riding 派生，皮肤声明表**零新字段**）。
2. 新增随皮挂载/卸载的 style tag：`dsh-skins/<id>.fullscreen.css`（与 shell tag 同一事务块）。
3. `scripts/verify-upstream-hooks.mjs` 新增三个钉子：`data-rightbar-fullscreen` 属性钩子、`*_rightbarCol` 结构钩子、页面级 `*_rightbarCol` 唯一性清单。
4. 单测：生成器契约测试。

**非范围**
- 停靠态（非全屏）一切样式——零改动；
- frost family（ADR-0012）各浮层面——不动；
- 通透度旋钮 P 与全屏底色**不做联动**（frost 教义：浮层族固定值）；
- Desktop shell alignment（ADR-0009）——不动；
- `data-rightbar-col` / `_pane_`（dockkit 桌面形态）——Web 无此形态，不动；
- 全屏过渡动画——不加（属性翻转即变色，实测若违和另立议题）。

## 3. 方案比较（CHECKPOINT A 已裁决）

| | 方案 A · 霜面底（**选定**） | 方案 B · 全屏纯实色 | 方案 C · 帧级纱幕（否决） |
|---|---|---|---|
| 思路 | 全屏时右栏列盖 94% 皮色 + blur(14px) saturate(1.3) | 同选择器盖 `rgb()` 实色 | 全屏时给 frame 本体盖色 |
| 透字 | 变不可读柔光（主人实测过的 frost 配方） | 100% 消除 | 100% 消除 |
| 皮肤氛围 | 保留色调与壁纸余韵 | 退回官方死底 | 连未覆盖区壁纸一并抹掉 |
| 教义归一 | 与 frost 浮层族同配方 | 与 Desktop `opaqueFills` 一字不差 | 无先例 |
| 改动面 | 列级，精准 | 列级，精准 | 帧级，波及动画/拖拽帧，超需求 |

否决 C 的理由：改动面大于需求且无教义先例（YAGNI）；已有更精准的列级挂点。

## 4. 关键边界与组件职责

### 4.1 生成器（新，`src/client/runtime.js`）

```js
buildFullscreenBaseCss(bodyAttribute, opaqueFills)
```

- **负责**：产出全屏态右栏列底 CSS 文本；输入只有 bodyAttribute 与 opaqueFills（`{light, dark}` rgb 串或 null）。
- **被谁用**：runtime 挂载块（4.2）。
- **依赖**：无 DOM、无宿主 API——纯函数，可单测。
- **稳定契约**：输出选择器形状（见 4.3）；`opaqueFills === null` 时返回空串（调用方跳过 tag）。

### 4.2 挂载（`runtime.js` 现有事务块内，shell tag 旁）

- 复用既有推导：riding `--dsw-specific-sidebar-fill` → `parseRgbaChannels` → `opaqueFills{light,dark}`（现有挂载块内已算出，直接传入生成器，不重复实现）——**不新增声明表字段**，三皮自动生效。
- 新 tag `dsh-skins/<id>.fullscreen.css`，随皮 mount/unmount（同 `stops` 事务）。
- profile 无关（投影核同律：本模块不知道自己跑在哪个 profile）；Desktop 上新规则与既有实底 occupant 规则叠加无冲突（occupant 已实底，列底 94% 在其后不可见）。

### 4.3 产出 CSS（形状契约）

```css
/* 明 */
body[data-dsh-<kebab>] [data-rightbar-fullscreen] [class*="_rightbarCol"]{
  background-color:color-mix(in srgb, rgb(R,G,B) 94%, transparent)!important;
  backdrop-filter:blur(14px) saturate(1.3);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);
}
/* 暗：同选择器 + [data-ds-dark-theme]，色换 opaqueFills.dark */
```

- 色源 = opaqueFills（即停靠态侧边栏同族色相）→ 全屏观感是"同一根侧边栏的浓缩"，非外来色。
- 94% + blur(14px) saturate(1.3)：frost family 配方（86% 常规 / 96% tip 特例），大面取 94% 起步，装机实测微调（见 §8）。
- `!important`：对齐 Desktop shell 规则先例，压过 layout 包的 `var(--dsw-alias-bg-base)` 直写。
- 选择器安全性：`data-rightbar-fullscreen` 仅 frame 挂载；`_rightbarCol` 类名运行时唯一（2026-10-28 全 runtime grep 实证，仅 dsh-client-ui-layout 一处；`_centerCol` 不含该子串，无误匹配）。

### 4.4 上游钩子钉子（`scripts/verify-upstream-hooks.mjs`）

按 ADR-0006/0011 教义新增（check 门禁，CI provisioned runtime 真跑）：

1. **属性钩子**：`dsh-client-ui-layout` 必须继续 ship `data-rightbar-fullscreen`（同 dark-hook 检查形态）；
2. **结构钩子**：layout 必须有 `.*_rightbarCol` 类选择器；
3. **页面级清单**：`*_rightbarCol` 只允许 layout 一家 ship，新出现即 fail（同 `_frame`/`_sidebarCol` 清单律）。

## 5. 数据流

```
各皮声明表 riding["--dsw-specific-sidebar-fill"]（既有，零改动）
  → runtime 挂载块 parseRgbaChannels → opaqueFills{light,dark}（既有推导，复用）
  → buildFullscreenBaseCss(bodyAttribute, opaqueFills)（新）
  → style tag "dsh-skins/<id>.fullscreen.css"（新，事务挂载）
  → 用户点全屏 → frame 挂 data-rightbar-fullscreen → 规则命中 → 列底霜面
  → 退出全屏 → 属性摘除 → 规则失配 → 停靠态原样（图三）
```

## 6. 错误处理与回退

| 场景 | 行为 |
|---|---|
| 皮未 ride sidebar-fill（opaqueFills=null） | 生成器返回空串 → 不挂 tag（与 shell alignment 同律，静默降级） |
| 宿主旧版无 `data-rightbar-fullscreen` | 属性永不匹配 → 规则惰性，无副作用 |
| 上游类名/属性漂移 | verify-upstream-hooks check 红（CI fail-closed），运行时不炸 |
| 卸皮/切 official | tag 随事务卸载，恢复宿主原状 |

## 7. 测试策略

1. **单测（新 `tests/fullscreen-base.test.mjs` 或并入既有契约测试）**：以 openbmc 声明为夹具断言——选择器形状逐字节、94% color-mix、blur 双前缀、明暗两套、`null → ""`。
2. **钩子门禁**：`verify-upstream-hooks.mjs` 三钉子入 `check`（CI 真跑，ADR-0011）。
3. **手动验收（Web profile，任意皮）**：
   - 停靠态右栏玻璃感与改前逐像素一致（图三基准）；
   - 全屏后聊天输入框文字与壁纸文字均不可辨（图二修复）；
   - 明/暗两模式、三皮各过一遍；官方皮不受影响；
   - 全屏↔停靠往返无残留底色；
   - 全屏态右栏列内部浮层/下拉定位正常（评审 B1 增补，2026-10-28：列底 backdrop-filter 创建 stacking context/containing block，列内若有 fixed 后代其定位基准随之改变——94% 定值实测时顺带观察）。

## 8. 未决事项

1. **94% 浓度**：装机实测定值（主人 frost tip 两轮实测先例为 96%；大面 94% 起步，若全屏仍见大字号内容残影则提至 96%）。
2. **过渡动画**：默认不加；实测属性翻转瞬间变色若违和，另立小议题。
3. 实施时按仓库惯例落 **ADR-0020**（编号顺延）并在 GLOSSARY 登记术语（霜面底 / fullscreen base）。

## 9. 里程碑（供 writing-plans 拆解）

1. 生成器 + 单测（纯函数，先行）；
2. 挂载块接线（复用 opaqueFills 推导）；
3. 三钉子入 verify-upstream-hooks；
4. `check` 全绿 + Web 装机手动验收（§7.3）+ 定 94% 浓度。
