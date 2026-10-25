# 皮肤声明表工厂收拢：defineSkin 单源三皮脚手架

---
status: accepted
date: 2026-10-25
---

## 背景

2026-10-25 架构评审（improve-codebase-architecture 流程：双子代理独立走查 + 三方差分 + 主人钢人裁决）选定本仓库当日唯一最优优化任务。ADR-0012（浮层毛玻璃家族）→ 0013（通透度投影核）→ 0016（装饰族+声明表完成度）→ 0017（riding 单通道）逐层吸收了 CSS 字节、数学与机制，但三皮 `skins/*/index.js` 仍持 **~150–170 行同构「表脚手架」**：表骨架形状（scrim/blur/glassVar/desktopBlur/wallpaper）、三类可派生知识（SCOPE 选择器、`scrim.artLayer`、`wallpaper.sentinel`——各皮以字面量重复 4–5 处或手写派生）、装饰四件套调用、`createProjection(table)` + 恰好七字段收尾。实证修订压力：openbmc/uefi 是全仓最热源文件（近 60 提交被触及 21/19 次），ADR-0016 C1 / 0016 表完成度 / 0017 riding 退役三轮均为三皮锁步形状编辑——仓为此立「计划判据四律」（2026-10-22 retro 起因正是锁步编辑漏列消费文件）。活体 locality 失效：openbmc favicon 手写再序列化（~17 行、渐变 id 重排 a–d）与 uefi 已因子化的 `LOGO_WHITE/LOGO_RED` 并存——拷贝式继承传播不了改进。

## Decision

1. **新增 `src/client/skins/define-skin.js` 导出 `defineSkin(spec)`**：直接产出 ADR-0014 恰好七字段生产对象 `{id,label,description,Mark,Name,project,builtinAssets}`（含 `project`）；`PRODUCTION_FIELDS` fail-closed 语义单点化。与 `translucency.js`（投影核）、`decoration.js`、`frost-family.js` 平级的第四个家族级共享模块；核保持纯数学不持 schema。
2. **规格三层**：直传数据（`id/label/description/titleBrand/favicon/anchor/bodyAttribute/riding/constantTokens(可 null)/scrim(两分支原样)/blur/glassVar/desktopBlur{dark}/wallpaper{kind,placeholder?}/builtinAssets(额外资产)/装饰参数(decoration、streaming、可选 badge)/tints/Mark/Name`）；工厂派生（`SCOPE`←`bodyAttribute`；`scrim.artLayer`+`builtinAssets.art`←`backgroundArt`；`wallpaper.sentinel`←`id`+`art`）；工厂默认（`desktopBlur.rate`=55，从规格除名）。`label` 两种类型（string / {zh,en}）皆合法、原样过缝。
3. **`cssSegments` 有序段清单**：具名段 `badge | decoration | streaming | rootclear | frost` + 裸字符串槽位（段间注释、meirenzhi 七条氛围规则的家）；工厂持具名段→调用的展开映射，**段间无自动分隔——工厂恒等拼接零插入**，一切段间字节（`\n`、缩进、空行）与空白/注释由裸串段自持；三皮现有顺序逐一保留；未知段名 throw。
4. **schema 校验中间档**：未知顶层规格键 throw、缺必填 throw；**不做**深层值形状校验（kernel 分支知识不抄进工厂，防第二解释器）。
5. **OB favicon 因子化**：四条 path d 串 + 渐变数据提为共享常量、id 以注入参数供给两种拼装——favicon 串（短 id a–d）与 JSX Mark（长 id）**各自逐字节保全**，不统一 id 拼法。
6. **原画出仓**：OB/UE `BACKGROUND_ART` 巨串（各占文件 83%/85% 字节）移各皮 `<skin>/background-art.js`（溯源注释；meirenzhi「资产独居一文件」形态，无需生成管线）。
7. **验收门（Q16 勘误版）**：三皮 × {light,dark} × P∈[0,100] 步进 1（606 点）`project()` 九键输出 + `favicon` + `builtinAssets` 与改前**逐字节全等**（比对基线＝改前快照，迁移期库存、收口移除，永久回归由既有金栏契约测试承担）；bundle 层只走常规 lib-sync 门禁；全门禁全绿。既有四套测试（translucency-contract / decoration-family / meirenzhi-skin / runtime-effects）**零改动**（已核实 import 面全部不变）。
8. **迁移与冻结**：meirenzhi 试点（最小）→ 首过全等门＋全门禁绿＝**接口机器冻结**（后续禁改 `defineSkin` 既有规格字段，仅允许新增可选字段）→ OB → UE。每 checkpoint 重建 lib 一并提交。
9. **非目标**：不吸收 `catalog.js` 字段登记（catalog 是客户端/Host 共享缝，皮肤注册与字段登记保持两步）；不统一装饰段顺序（保序即纪律）；不发明 favicon 自动派生。
10. **发版**：client-only、外部形状零变化（投影输出全等）、HMR 生效、零像素；随下一自然 1.5.x 搭车，不占独立版本。GLOSSARY「皮肤声明表」词条立案同日落档。

## Considered Options

- **弱吸收版（工厂只产 `{table, project}`）**——被否：七字段收尾 ~15 行 ×3 存活，schema 知识仍三份，吸收不彻底。
- **工厂定死统一装饰段顺序**——被否：投影输出字节全等门要求保序；段序差异无行为意义，字节保全优先于工厂优雅。
- **工厂吸收 catalog 字段登记**——被否：catalog 是客户端/Host 共享 seam（Host store 消费同源校验），融合让客户端概念渗入共享层。
- **JSX→SVG favicon 自动派生**——被否：聪明但脆；显式数据 + uefi 式因子化已消灭双轨，无需魔法。
- **全严格 schema 校验（深层值形状）**——被否：会把 kernel 的分支知识抄进工厂，制造第二解释器——ADR-0018 刚消灭的东西。
- **`lib/client.js` 逐字节全等作门**——被否（grill 勘误）：源结构重构必然改 bundle 字节；ADR-0017 先例比对的是投影输出串，非 bundle。

## Consequences

- 表 schema 单源（locality）：下一次表形状演进（新旋钮/新家族段）落 `define-skin.js` 一处＋各皮数据行；第四张皮 ≈30 行声明即可接入。三皮 index.js 瘦身为纯规格＋品牌 JSX（OB/UE 原画另居资产文件）——AI-navigability：读一张皮＝读全。
- 结构绊线：`createProjection(table)` 收尾只住 `define-skin.js` 一处，三皮 index.js 归零（grep 判据见实施计划）。
- 迁移期基建（`scripts/projection-snapshot.mjs` + `.artifacts` 基线）收口移除；永久回归由 translucency-contract 金栏（手工独立基线＋测试侧复算）承担。
- `lib/client.js` 字节变化随各 checkpoint 再生同提交；developers.md「自建一套皮肤」配方改写为 `defineSkin` 版；README 零改动。
- OB favicon 双轨（手写再序列化）消灭，品牌图元单源；渐变 id 双拼法保留（字节保全裁决）。

## Amendments

-（待发版收口时补记。）

## 附录：grill 共识（Q1–Q20，2026-10-25 会话存档）

三轮 grill ＋一次勘误重开（Q16）＋一次重立（Q20），主人逐轮「按推荐」裁定：

1. **Q1→Q16** 验收门勘误：投影输出逐字节全等（606 点＋favicon＋builtinAssets）取代「lib 逐字节全等」（后者对源结构重构不可达成）。
2. **Q2–Q4** 工厂直接吐七字段生产对象；新文件 `define-skin.js` 平级四大家族模块；GLOSSARY「皮肤声明表」＋导出名 `defineSkin`。
3. **Q5–Q9** 不吸收 catalog 登记；favicon 显式数据不发明魔法；四件套进工厂（有序段清单保字节）；原画出仓并入；MRZ 试点先行。
4. **Q10–Q15** ADR-0019 全序列；规格字段清单/派生/默认定稿；段清单语法 fail-closed；校验中间档；OB favicon 双串字节保全。
5. **Q17–Q19** ADR 骨架（非目标三条＋弱吸收版裁弃入档）；task 切分 T0–T5；换钉清单（新增仅 `tests/define-skin.test.mjs`，既有四套零改动）。
6. **Q20 重立** 评审两点位由主人组织（计划评审→执行→产物评审）；试点冻结走机器门（全等门＋门禁绿），不默认占人评轮。

**计划评审 P1 勘误（2026-10-25 计划评审 R1，主人裁定候选 a）**：原 Decision 3「段间以 `\n` 连接、段间空白/注释并入相邻裸串段」与仓库现实联合不可满足逐字节全等门——OB 五个具名段插值行首有 2 空格缩进（openbmc-harness/index.js:171–193）、UE frost 段前有 2 空格缩进（uefi-harness/index.js:89），固定 `\n` 分隔符在「具名段独立＋裸展开」下无处安放（评审 probe7 穷尽实证；MRZ 现状即数组 `join("\n")` 不受影响）。修订为：段间无自动分隔，工厂恒等拼接零插入，一切段间字节由裸串段自持。B7 全等门不动。

**计划评审 P2 增补（同日）**：验收门（Decision 7）快照域另含 `Mark({size:24})` / `Name()` 渲染树（经记录式 jsx stub 采集）——B5「favicon 双串保全」中 JSX 半边的字节判据；Decision 7 原文维持 Q16 历史口径，以本增补为准。
