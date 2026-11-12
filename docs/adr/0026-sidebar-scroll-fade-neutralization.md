# ADR-0026：侧栏会话列表 scroll-fade 渐隐纱的中和

## 状态 / 日期

Accepted · 2026-11-12

## 背景

主人截图报告（web 浅色 + 皮肤）：侧栏左下角、底部菜单（主题切换/插件市场/更多）
上方有一道明显分割线；深色模式下同位置也有一条、只是对比弱。官方主题（无皮肤）
同状态无此线。

按 know-how 042 三探针定面（本机 playwright + 截图像素剖面）：

- 像素剖面：缝线以上 ~24 行存在单调亮度渐变（浅色 +10..18、深色 -8 对称），在
  footArea 顶边一行硬截断回基线；官方主题同区域全平（249,250,251 恒定）。
- DOM dump：`dsh-client-ui-sidebar` 在 `*_scrollRegion`（position:relative）内挂
  24px 高的 `*_scrollFade` span（absolute; bottom:0; pointer-events:none），
  `background-image: linear-gradient(transparent, var(--dsw-specific-sidebar-fill))`
  ——列表内容渐隐进侧栏填充色的「纱」。
- 根因：官方主题该 token 不透明，纱按构造与背景同色隐形；皮肤把
  `--dsw-specific-sidebar-fill` 骑成部分透明（openbmc 0.6 / meirenzhi 0.40）后，
  纱在壁纸上**再叠一层** 0→α 的着色层，到 footArea 顶边硬截断——即截图的亮带与
  分割线。深色模式同构（叠深色纱，对比弱）。

## 决策

皮肤挂载期间按皮肤作用域中和这条纱：

```css
body[data-dsh-<skin>] [class*="_scrollFade"]{background-image:none!important}
```

- 由 runtime 按 `--dsw-specific-sidebar-fill` 的 riding 事实发射
  （`dsh-skins/<id>.sidebarfade.css`，与 paintorder/shell/fullscreen/reading 同家族、
  同生命周期）：不骑该 token 的皮肤不发射——官方不透明填充下纱按构造隐形，无谓动它。
- 结构钩子只钉局部名 `_scrollFade`（哈希前缀随宿主构建漂移）；
  `verify-upstream-hooks.mjs` 新增第 9 条 manifest 检查钉 `dsh-client-ui-sidebar`。

### 被否决的替代

- **mask-image 在滚动容器上做内容渐隐**：mask 使滚动容器成为分组元素，会困住/裁剪
  内部 position:fixed 后代；宿主自己选 painted-gradient span 而非 mask 应为同因。
- **把纱改骑成「更合理」的实色**：任何 token 色着色层对半透明填充都必须在边界成缝，
  只是强弱问题；不解决。
- **不修（上游问题）**：官方不透明下确实无此症状，属皮肤半透明化的交互面；按仓库
  惯例（ADR-0009/0020/0021/0022 同族）皮肤侧负责中和与自身 riding 相关的宿主面。

## 后果

- 皮肤态下列表内容在滚动边界回到硬裁切（pre-veil 宿主行为）；换取壁纸透出区无色带
  无缝线。两侧 README/docs 已同步（developers.md 已知边界条目）。
- 守卫第 9 条使宿主重命名 `_scrollFade` 局部名时 `check` 变红，防止静默失效；
  runtime-effects 两个新用例钉字节与生命周期；upstream-hooks 测试钉 lib 产物字节。
