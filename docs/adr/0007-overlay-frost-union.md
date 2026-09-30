# 浮层毛玻璃并集：把 v1 弹窗配方扩成全浮层面覆盖

---
status: accepted
date: 2026-10-01
---

四套皮肤共享「透纱」美学：面板 token 全部换成半透 rgba，靠 `#root` 霜层与壁纸模糊保可读性。官方皮肤的浮层不透字，不是因为宿主有全局保证，而是官方 token 本就实心；皮肤一旦把 `--dsw-alias-bg-layer-*` / `--dsw-alias-bg-base` 换成半透值，所有消费这些 token 的浮层壳（悬浮窗、对话框、下拉弹层）都变成「薄纱无磨砂」，下层文字清晰透出（图一症状）。

1.1.x 的 v1 配方（`[role="dialog"][aria-modal="true"]`、`.dshm-panel`、`.dshm-compat-dialog`、`.dshm-dshchip-tip`、`.dsh-skins-pop` 统一 86% 皮肤实底 + blur14、`--dsw-mask-blur: blur(10px)`）已覆盖宿主 Modal 与 dsh-m 弹层面板，实机验证干净。对 0.2.0-rc.2 前端 dist 与全部已装插件 client CSS 逐面排查后，确认仍有三类浮层缺口，v2 一并补齐：

1. **dockkit 悬浮窗壳 `._float_<hash>_<n>`**：`background: var(--dsw-alias-bg-layer-2)`，皮肤下 α≈0.56–0.64 且全程无 blur。悬浮窗（含 `floatBody`）内容直接坐在薄壳上，下层文字透出——官方壳实心所以无此问题。选择器 `[class*="_float_"]`：css-modules 局部名 `_float_` 带尾下划线，`_floatTitle_` / `_floatBody_` / `_floatResize_` 均不含该子串，零误伤。
2. **宿主对话框结构兜底 `[class*="_dialog_"]`**：v1 的 role/aria 定位只命中 modal 变体；非 modal 对话框（`_dialog_<hash>_<n>`）不带 `aria-modal`。与 modal 分支重复覆盖无害。
3. **dsh-m 0.7.x 的 `.dsvm-filterpop` / `.dsvm-modalbox`**：fill 是 `color-mix(bg-base 86–94%, transparent)`，皮肤下 bg-base 本身半透，实际 α≈0.47–0.52——筛选下拉正是「菜单被下层文字干扰」的直接来源。
4. **插件自绘遮罩 `.dshm-overlay` / `.dsvm-overlay`**：宿主 Modal 遮罩消费 `--dsw-mask-blur`（v1 已点亮），插件自绘遮罩不消费该 token；补一条 `backdrop-filter: var(--dsw-mask-blur)`，让弹窗四周的页面一并磨砂——即使面板 blur 在弱 GPU/驱动上退化，86% 实底加磨砂遮罩仍兜住可读性。

86% 实底 + blur14 的配方本身维持 v1 裁决不变（tgcf 首版定案）：毛玻璃观感优先，靠透明度兜底而非加实。

## Considered Options

- 调高 `--dsw-alias-bg-layer-*` token 的 alpha——被否：token 同时被页面内卡片/输入框消费，全局变实会摧毁「透纱」美学，且无法区分「浮层」与「面板」。
- 枚举宿主 css-modules 精确哈希（`._float_6nhg2_156`）——被否：哈希随上游重建漂移（ADR-0006 事故），浮层壳必须走结构化局部名。
- 只修用户截图命中的那个面——被否：排查证明缺口是成体系的（token 消费面 × blur 缺失），单点修复下个浮层还会复发。

## Consequences

- `scripts/verify-upstream-hooks.mjs` 新增前端 dist CSS 清单：`_float_` / `_dialog_` 局部名存活、`_float*` 类白名单（float/floatBody/floatHeader/floatResize/floatTitle）、`--dsw-mask-blur` 与 `--dsw-menu-backdrop-filter` token 定义存活；漂移即 `check` 失败。`.dshm-*` / `.dsvm-*` 是 dsh-m 自有稳定类名（同 v1 前提），不入宿主守卫。
- 悬浮窗壳被 frost 后即成为其后代的 backdrop root：窗内插件的二级弹层 blur 只采样窗内内容——观感正确（窗已磨砂），无需处理。
- 四皮肤新增选择器完全同构，仅 tint 色值随皮肤；后续新增浮层面时在 ADR-0007 清单登记后同步四处。

## Amendments

- **2026-10-01（v1.2.0）**：实测补第二类缺口——**下拉菜单面**。host Menu primitives 的 `_material` 层填 `--dsw-menu-surface-fill`（官方默认仅 45–58% α）并整面 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（blur40 saturate150%）；官方壳实心所以清晰，透纱皮肤下 blur 直接把壁纸吃进菜单——暗色发灰、亮壁纸发白，菜单文字不可读（用户实拍：官方清晰 vs 四皮肤下拉看不清）。裁决：四皮肤以各自菜单 tint 族（同 `--dsw-specific-menu` rgb）在 **0.94 α** 接管 `--dsw-menu-surface-fill` 与 `--dsw-alias-menu-group-header-fill`，tgcf/meirenzhi 顺带补齐此前缺失的 `--dsw-specific-menu`（宿主 select 列表框 `._media_` 消费）。菜单保持浮层族固定值（不随通透度旋钮），blur40 保留只管边缘磨砂。
- **2026-10-01（v1.2.2）**：dsh-m 0.8.x 新增吸顶分类条 `.dsvm-chipswrap`（`position: sticky` + `background: var(--dsw-alias-bg-base)`，皮肤下 α0.55 无 blur），市场卡片列表从条下滚过即透字（用户实拍复现，headless 复现一致）——并入 v2 冻层并集（86% 实底 + blur14）。0.8.x 移除的 `.dshm-dshchip-tip`/`.dsvm-overlay` 选择器保留（空匹配无害，兼容旧版插件）。
