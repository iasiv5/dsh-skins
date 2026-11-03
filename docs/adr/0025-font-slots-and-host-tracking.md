# 字体槽位与宿主跟随：皮肤字体声明的 default 层发射

---
status: accepted
date: 2026-11-03
---

## 背景

三皮肤（openbmc / uefi-harness / meirenzhi）的字体声明彼此不一致，且全部打在了错误的层级上：

- **不一致**（ADR-0016 C1「逐字搬运、零像素迁移」有意保留的历史包袱，无任何裁定背书）：openbmc 自持 UI 全栈 + 代码栈（JetBrains Mono 优先、丢 CJK 尾）；uefi 自持截短 UI 栈（无 Hiragino/YaHei/Helvetica Neue/Arial）；meirenzhi 从未声明任何字体 token。三 UI 栈在三大桌面端渲染等价（前置分析 + fc-match 双跑实证，见 Consequences），属纸面不一致；代码栈是唯一可见差异（装了 JetBrains Mono 的机器上换肤代码区字体跳变）。
- **层级错误（实质缺陷）**：宿主 `dsh-client-ui-theme` 的字体系统是三层复合——①用户字体偏好层（设置 UI，`FONT_ROLES = text/code/terminal`，`setFontFamily` 是唯一字体写入口，`bootstrapFontFamilies` 从 `document.body.style` 读回 `--dsh-font-family-text/code/terminal`）；②默认层（`--dsh-font-family-text-default` / `--dsh-font-family-code-default`，:root 定义）；③resolved alias（body 样式表规则复合两层：`var(--dsh-font-family-text, var(…-default)), var(…-default)`——用户偏好前置、默认栈殿后）。openbmc/uefi 经 tokenOverrides 以 body 内联 style 直写第③层 alias，内联恒胜样式表 → alias = 皮肤字面量 → 第①层用户设置**在该两皮下静默失效**（meirenzhi 与无皮肤态正常）。皮肤声明无意间占用了用户偏好的级联位。

## Decision

1. **发射目标恒为 default 层**：皮肤字体声明只允许落 `--dsh-font-family-text-default` / `--dsh-font-family-code-default`，**永不直打 alias**。级联位次由此恒定：用户偏好前置、皮肤表态殿后、宿主默认栈兜底。`tests/font-slots.test.mjs` 层级守卫（强形式：三皮 tokenOverrides 中 font 系键 ⊆ `FONT_TOKENS` 值集）钉死该禁入。
2. **`spec.fonts` 必填，槽位枚举 v1 = `{text, code}`，值三态**：`null`＝宿主跟随（不发射 token）；字符串＝明暗同栈 fan-out；`{ light, dark }`＝明暗分档。未知槽、空串、畸形对象一律 throw（`deriveFonts`，与 cssSegments 同律 fail-closed）。派生经 `defineSkin` 并入 `table.constantTokens`（两层形状冻结：ADR-0014 工厂 return 生产面七字段不变；投影声明表 12 字段字段集不变，仅 constantTokens 内容变化），`translucency.js` 零改动。槽键集语义由 `REQUIRED(fonts)` + 校验矩阵构造保证，不设重复测试。
3. **三皮统一到 `null`（宿主跟随）**：出厂态皮肤零字体发射，正文随宿主默认栈演进。`fonts` 必填使未来新皮肤被强制对字体显式表态，「不定制」也是表态；品牌默认字体经前置复合表达：`text: '"LXGW WenKai", ' + HOST_DEFAULT_TEXT`（default 层殿后语义使宿主演进自动成为回退尾）。
4. **宿主默认栈常量单源导出**：`HOST_DEFAULT_TEXT` / `HOST_DEFAULT_CODE` 逐字拷贝自 runtime 0.2.1-rc.5 `dsh-client-ui-theme` 的 `:root` 块；`verify-upstream-hooks.mjs` 第 8 组字面量锚点（裸 token 名前缀——`:root{` 前缀对 code-default 不成立，rc.5 的 :root 块内其前邻是 `;`；引号需按 JS 字符串字面量转义）盯宿主漂移，漂移即红灯提示重拷。锚点作用域 = packages Map 多版本并集（「任一已装版本命中即过」）——升级残留期防漏报而非钉单版本，严格单版本钉版由 CI runtime-pin 装配承担。
5. **槽位枚举的预留分析（本季不开）**：`brand`（`--dsw-font-family-brand = "Montserrat", var(…text-default)`）有真实消费但无用户钩子、无自有 default 层，未来只能直打 alias（无冲突面），第一张真需品牌字的皮再开槽；`terminal`（FONT_ROLES 有角色但无 default 层定义、无 CSS 消费）纯休眠设置；区域级槽（标题/绘画区/侧栏）宿主无任何钩子，全部汇入 text/code 两口——宿主开钩子再扩枚举。

### JBM 封存

openbmc 历史代码栈（ADR-0016 C1 逐字搬运件，本次统一后退役）：

```
'"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace'
```

复活写法一行：openbmc `spec.fonts` 改 `code: '<上述栈>'`（其余不动）。该差异是本次交付**唯一可见像素变化**（装了 JetBrains Mono 的机器代码区回落 SF Mono/Consolas）；用户亦可改在宿主设置里填自定义代码字体全局达成（修复后此通道在三皮下恢复有效）。

## Consequences

- **像素申报三段式**：①平台解析链推演——macOS/Windows 三皮删 alias 前后首命中位逐项相同（-apple-system / Segoe UI）；②gates/repro 本机 fc-match 实证——三栈首命中位全落同一字体（DejaVu Sans），repro gate 与 docs/assets（本交付不重生成）零字体像素变化；③Linux fontconfig 别名链存在发行版差异面，以活体目验为实证门。
- **行为修复**：宿主用户字体设置在三皮下恢复生效（此前 openbmc/uefi 静默失效）。
- **测试面迁移**：字体断言唯一住址 = `tests/font-slots.test.mjs`（层级守卫 + 发射门逐皮空集 golden）；translucency-contract 回归纯通透度主题；派生校验矩阵归 `define-skin.test.mjs`。ADR-0016 C1 golden 的字体行随之迁出（C1 其余行原样保留）。
- **毕业路径（未来用户级自定义，零重构）**：字体值从 `spec.fonts` 毕业到 personalization catalog 字段（皮肤 spec 值降级为 catalog 默认层），`project(values)` 在同一发射门合成「用户值 ?? 皮肤默认」——发射通道（tokenOverrides → default 层）不变，只换值源。
- **评审遗留（主人裁定不进本交付，待立项）**：①锚点读数收紧至最高版本目录（现由 CI runtime-pin 兜底；立项需解决 pnpm 目录预发布版本排序）；②Chromium computed font-family 实测（注意 computed 值是级联值非命中字体，真渲染差须走截图像素比对路线）；③「红灯先行任务默认注明红灯形态」入 writing-plans 模板（属 dsh-skills 仓，独立小任务）；④涉重启宿主核证以静态审阅 + 免重启判据替代（活体目验归主人）。
