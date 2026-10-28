# Web 右栏全屏态霜面底（免透字）

---
status: accepted
date: 2026-10-28
---

## 背景

Web 形态下 riding 表把 `--dsw-alias-bg-base` 改写为 rgba（ADR-0013/0017），右栏列（`_rightbarCol`，底色即该 token）在全屏（AppFrame 挂 `data-rightbar-fullscreen`）时整列半透明，叠在 centerCol 聊天内容与 body::before 壁纸上：输入框文字透出、可读性受损。停靠态同一 rgba 窄条浮于壁纸上正是玻璃感来源，必须保留。Desktop 已有同题教义（ADR-0009 `[data-rightbar-col] > *` 与 `_pane_` 实底），但整段被 `html[data-windows-titlebar]` 门控，Web 从不生效。

## Decision

- 新增共享生成器 `buildFullscreenBaseCss(bodyAttribute, opaqueFills)`（`src/client/runtime.js`，与 `buildShellAlignmentCss` 同位同律）：`data-rightbar-fullscreen` 期间给 `[class*="_rightbarCol"]` 盖 94% 皮色 + blur(14px) saturate(1.3)，明暗两套；frost 家族固定值配方，不随通透度联动。
- 色源与 Desktop shell 同源：riding `--dsw-specific-sidebar-fill` 的 rgb 通道（`parseRgbaChannels` 既有推导）；皮未 ride 则返回空串不挂载。声明表零新字段，三皮自动生效。
- 挂载为随皮事务 style tag `dsh-skins/<id>.fullscreen.css`；profile 无关（Web 活跃；Desktop 被既有实底 occupant 规则覆盖，冗余无害）。
- 钩子钉子：`data-rightbar-fullscreen` 属性钩子、`*_rightbarCol` 结构钩子、页面级 `*_rightbarCol` 唯一性清单（verify-upstream-hooks.mjs，ADR-0006/0011 教义）。
- 停靠态零改动：选择器带状态属性，非全屏永不命中。

## Considered Options

- **全屏纯实色**（Desktop `opaqueFills` 规则直接放开到 Web）：最简、教义一字不差——被否：全屏观感退回官方死底，丢失皮肤氛围（2026-10-28 CHECKPOINT A 主人裁定保玻璃语境）。
- **帧级纱幕**（全屏时给 frame 本体盖色）：改动面大于需求、波及动画/拖拽帧——否决（YAGNI）。

## Consequences

- 全屏透字变不可读柔光；壁纸余韵以 94% 浓度隐约保留；浓度 94% 为装机实测起点，见大字残影升 96%（frost tip 先例）。
- `*_rightbarCol` 成为受钉结构面：上游漂移在 check 红灯（fail-closed），运行时不炸。
- 停靠态玻璃感、frost family、Desktop shell alignment、通透度投影核均不受影响。

## Amendments

- **2026-10-28（首版当日热部署实证修订）**：全屏透出面不止栅格列轨道——dockkit 全屏面板（occupant，`[data-rightbar-col] > *`）绝对定位、右缘锚定，max-width（100vw−侧栏）可超出轨道（≈45% 视口）悬挂于 centre 之上；悬挂区无列底可依，仍透聊天文字。主人红框实证：轨道区 94% 底已生效变色、悬挂区未变。霜面底据此扩为双表面（列轨道 + 全屏 occupant，配方 94%+blur(14px) saturate(1.3) 不变），与 Desktop ADR-0009 的 occupant 实底教义同层归一。选择器仍全部状态限定于 `[data-rightbar-fullscreen]`，停靠态零改动不变。
- 无（首版）。
