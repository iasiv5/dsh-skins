# 推翻 §9a：legacy 皮肤全面个性化

---
status: accepted
date: 2026-09-01
supersedes: design-1.0.0-personalization.md §9a 终态裁决（未立过 ADR）
---

1.0.0 的字段目录把 openbmc / uefi-harness 定为「legacy 皮肤」：仅开放 wallpaper 字段，默认投影必须与 0.6.0 行为逐字节等价（§9a 终态，`catalog.js` 注释与 `personalization-projector.test.mjs` 真实工厂字节断言双重锁定）。产品主人裁决：三套皮肤在功能上应当一致——tgcf 有的「标语 | Slogan」与「通透度 | Transparency」，openbmc / uefi-harness 也要有。§9a 的本意是升级安全（默认观感不许漂移），而不是永久的能力封顶；本 ADR 把升级安全重述为一个可以与功能一致性共存的更弱不变量。

## Decision

- **推翻 §9a 的「仅 wallpaper」限制**：openbmc / uefi-harness 各自声明与 tgcf 同构的 `slogan`（text×locale，maxLength 40）与 `panelOpacity`（range×single，0–100）字段；目录由此实现「除官方皮肤外全部皮肤同一标准字段集」。
- **新不变量取代字节等价**：默认投影的派生串与各皮肤工厂的烘焙串**逐字节相等**（含 `rgba(R, G, B, a)` 的空格与两位小数格式），由存活的「REAL factories project their baked defaults verbatim」测试与两皮肤契约测试（金值断言）共同钉死。字面含义从「≡ 0.6.0」改为「≡ 当前烘焙值」——openbmc/uefi 皮肤文件在 1.0.0 全程零改动，两者数值上等价。
- **每皮肤内联 `project()`**：曲线是皮肤专属视觉知识，与 tgcf 同构地写在各自模块里（字面量烘焙点表），不设共享 helper（仅两个消费者，tgcf 亦不适用）。三段式曲线：随动 token alpha 线性 `P/100` 且每 token 带由烘焙值反推的固定增量、默认 P=55 由烘焙 `bg-base` 0.55 反推、blur `24·max(0,(P−55)/45)²` 以默认点为锚二次爬坡（P=55 处 0，P=100 处 24 即 `normalizeEffects` 上限）；浮层族 token（bg-overlay/menu/selector/tip/nav 态/气泡）固定不随旋钮（tgcf 裁决 #16 同款原则）。
- **格式细则**：派生 alpha 一律 `(points/100).toFixed(2)` 两位小数——这是字节等价不变量的格式前提（`String(60/100)` 产出 `"0.6"` ≠ 烘焙 `"0.60"`，禁用）。
- **scrim 载体不变**：纱仍拼接在 `imageLight/imageDark` 字符串内按 P 计算，不迁 `backdrop.overlay` 通道；legacy 壁纸语义原样保留——用户图走裸 `url("…")`，纱不上用户图；openbmc 保留 `BACKGROUND_ART === ""` 的占位兜底分支。
- **blur 双层语义**：与 tgcf 完全同机制——`backdrop.blur > 0` 时 runtime 给壁纸 `::before` 层加 `filter:blur(Npx);transform:scale(1.02)`（`runtime.js:132-134`），面板霜层由玻璃规则（`--dsh-{openbmc,uefi}-glass-blur` 变量 + 仅在 blur>0 时追加的 `backdrop-filter` 静态规则）承担。即 P>55 起「壁纸模糊与面板霜同步增强」，不存在「只霜面板不糊壁纸」的分离语义；默认 P=55 处两者均为 0，默认观感与今天逐像素一致。
- **`makeLegacyProjector` 删除**：两皮肤自带 `project()` 后零调用者，按 ADR-0002「死设施全删」传统移除；缺 `project` 的目录皮肤经既有三层回退自然 fail closed。
- **`slogan` 默认值与皮肤静态字典同源**（tgcf 裁决 #4 同款约束），由 `personalization-catalog.test.mjs` 的同源不变量测试钉死。

### 升级语义（0.6.0 → 1.0.0，git 考古结论）

- 0.6.0 无任何个性化存储（仅 `update-cache.json` 与 `profiles/web/`）；首升用户首次 `GET /dsh-skins/config` 触发懒初始化，`state.json` 从头创建（revision 0），**字段默认值永不落盘**——新字段对首升路径的存储/路由/状态机增量 side effect 为零；localStorage 键两版本完全相同，零新键；`CONFIG_VERSION` 保持 1，不 bump。
- **降级不对称**（单向兼容设计的必然）：降回 0.6.0 = `state.json`/`assets/` 成为 0.6.0 完全不读的孤儿文件，字节级原样保留、可无损再升级；降回旧 1.0.0-dev 中间版本 = 新字段键被该构建的加载规范化当未知键**静默剔除并 revision+1 落盘**（不可逆）。发布演练（release checklist）覆盖两段往返证据。

### 前瞻原则

- **官方皮肤（DeepSeek Harness 宿主默认外观）永不进入个性化目录**——它是「还其正印」的本貌，没有可编辑字段。
- **本仓库未来新增的代码级皮肤一律声明同一标准字段集**（wallpaper + slogan + panelOpacity，除非该皮肤的视觉语言结构性地不适用某字段，须在 ADR 中记录）；ADR-0002 移除的「用户运行时自带主题包」机制不因本条复活，若重现须重新设计评审。

### 被否方案

- **共享曲线 helper（`makeTranslucencyProjector(bakedTable)`）**：只有两个消费者，tgcf 的二次曲线不适用，抽象属投机；字面量烘焙表让「默认=烘焙」的审查成为肉眼比对。
- **slogan 走 legacy 投影通用化（`values.slogan ?? skin.slogans` 一行改动）**：会让同一字段类别存在两条机制通道（slogan 走共享投影、panelOpacity 走皮肤投影）；通透度反正强制要求 per-skin `project()`，机制统一优先。
- **scrim 迁 `backdrop.overlay` 通道（tgcf 同构）**：引入第二合成面（伪元素叠加与既有烘焙层的相互作用）需重新逐像素验证，且改变「纱不上用户图」的 legacy 语义；留在 image 字符串内计算是唯一零风险的字节等价路径。

## Consequences

- 面板对三皮肤呈现同一组控件（wallpaper/标语/通透度），schema 驱动的渲染、存储、校验、存量规范化零改动即生效；`dicts.js` 通用 labelKey 复用，无新词条。
- 目录的 `panelOpacity` 默认值出现皮肤间差异（tgcf 30 / openbmc、uefi-harness 55）——这是「默认锚定各自烘焙视觉」的直接结果，属预期而非漂移。
- openbmc/uefi 的随动族 token 在运行时经 `tokenOverrides` 行内样式覆盖静态 CSS 同名 token（宿主 ThemePresenter 以 `body.style.setProperty` 落值，行内优先级更高）；默认 P 时覆盖值 ≡ 烘焙值，视觉不变。
- 三层回退语义不变：投影/解析失败 → 默认重投 → fail closed；新增字段的非法覆写经 layer-1 回落默认并报 issues。
- §9a 的历史原文在设计文档修订史中保留（v2.7 注记指向本 ADR），不追溯改写历史段落。

## Amendments

- 无（首版）。

## 附录：grill 共识 13 项决策（Q1–Q13，2026-09-01 会话存档）

1. **Q1** 正式推翻 §9a；附带完成 0.6.0→最新版升级 side-effect 分析（结论见上文升级语义）。
2. **Q2** 交付物路径：grill 共识 → 实施计划（`docs/plans/`）→ 审后执行。
3. **Q3** slogan 默认值 = 各皮肤现有烙死文案，中英文两份同源。
4. **Q4** 通透度契约与 tgcf 同一「单旋钮三联动」（底色/遮罩/模糊），各皮肤自持曲线。
5. **Q5** 实现位置路线乙：两字段都走 per-skin `project()`；前瞻口径为「除官方皮肤外，自定义皮肤都可个性化」。
6. **Q6** 兼容测试改法：字节等价断言收窄为「未覆写新字段时的默认投影」（执行中演化为：真实工厂字节断言存活 + 两皮肤契约金值测试）。
7. **Q7** scrim 载体保持在 `imageLight/Dark` 字符串内按 P 计算，不迁 overlay 通道。
8. **Q8** 曲线三段式：线性主 alpha + 每 token 固定增量（默认 P 精确回烘焙值）、默认 P=55 由烘焙 bg-base 反推、blur 以默认点为锚二次爬坡（上限 24px）；浮层族固定。
9. **Q9** 「自定义皮肤」= 本仓库未来代码级皮肤；用户运行时主题包不复活（ADR-0002 不逆转）。
10. **Q10** 文档四件：ADR-0004、design v2.7 注记、`CONTEXT.md` 官方皮肤词条、catalog §9a 注释改写。
11. **Q11** 落入未发布的 1.0.0，升级故事保持单段。
12. **Q12** `project()` 内联实现（字面量烘焙表），不提共享 helper。
13. **Q13** `makeLegacyProjector` 删除。
