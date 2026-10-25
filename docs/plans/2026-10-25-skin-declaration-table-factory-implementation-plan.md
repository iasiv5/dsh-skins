# 皮肤声明表工厂收拢实施计划（ADR-0019）

## 目标

- 新增 `defineSkin(spec)` 工厂（`src/client/skins/define-skin.js`），吸收三皮 `skins/*/index.js` 重复的 ~150–170 行声明表脚手架：表骨架、三类派生（SCOPE / `scrim.artLayer` / `wallpaper.sentinel`）、装饰四件套调用、`createProjection(table)` + 恰好七字段收尾（ADR-0019 Decision 1–4）。
- 三皮迁移为纯规格 + 品牌 JSX；OB favicon 因子化（双串逐字节保全）；OB/UE `BACKGROUND_ART` 出仓为各皮资产文件（Decision 5–6）。
- 验收门（Decision 7）：三皮 × {light, dark} × P∈[0,100] 步进 1（606 点）`project()` 九键输出 + `favicon` + `builtinAssets` + `Mark/Name` 渲染树与改前**逐字节全等**；全门禁全绿；既有四套测试零改动。
- 发版：client-only、外部形状零变化；随下一自然 1.5.x 搭车，不占独立版本。

## 架构快照

- **工厂三层规格**（ADR-0019 Decision 2）：直传（`id/label/description/titleBrand/favicon {href, mime}/anchor/bodyAttribute/riding/constantTokens(可 null)/scrim(overlay|baked-gradient 两分支原样)/blur/glassVar/desktopBlur{dark}/wallpaper{kind,placeholder?}/builtinAssets/装饰参数(decoration、streaming、可选 badge)/tints/Mark/Name`——`href` 为 data URL 串，皮内中间量（如 UE 的 `faviconSvg`）不入规格）；派生（`SCOPE`←`bodyAttribute`；`scrim.artLayer`+`builtinAssets.art`←`backgroundArt {mime,url}`；`wallpaper.sentinel`＝`builtin:<id>:art`，**仅 `kind:"legacy-baked"` 且 `backgroundArt` 给定时派生**——`{kind:"assets"}` 皮（MRZ）无 sentinel、无派生 art）；默认（`desktopBlur.rate`＝55）。`bodyAttribute` 属直传必填（共识终稿 Q11 派生行的前提，此处澄清）。`builtinAssets` 合成序＝派生 `art` 键在前、规格 `builtinAssets` 键按字面序展开（现状三皮无碰撞，Task 2 用例钉死）。
- **`cssSegments` 段展开**（Decision 3；2026-10-25 计划评审 P1 主人裁定 a）：具名段 `badge | decoration | streaming | rootclear | frost` → 工厂查表展开（`badgeCss(scope, selector, colors, metrics)` / `decorationCss(scope, colors)` / `streamingCss(scope, {decay})` / `rootClear(scope)` / `frostFamilyCss(scope, tints)`）；裸字符串段原样；**段间无自动分隔——工厂恒等拼接（`''` 连接）零插入**，一切段间字节（`\n`、缩进、空行）连同空白/注释由裸串段自持（并入相邻裸串段）；三皮现有段序逐一保留；未知段名 throw。字节可达性：OB 五个具名段与 UE frost 段前的 2 空格缩进，均作前导裸串段内容安放；MRZ 现状 `join("\n")` 的段间 `\n` 并入前段段尾。
- **字节保真机制**：工厂展开只做恒等拼接，字节责任全在规格数据；终裁＝606 点投影输出全等门（`staticCss` 是 `project()` 九键之一，天然在门内；`favicon` 经 table、`builtinAssets` 经返回值，均入快照域）。
- **快照工具**：`scripts/projection-snapshot.mjs`（迁移期专用，收口删）——对三皮工厂扫 P 0–100 × {light,dark}（606 点，已含 contract 夹具全部特征点 P=0/35/55/66/100；投影不感知 profile，desktop 66 即 P=66 行）；jsx 传**记录式 stub**（`jsx(type, props, ...kids)` 返回 `{type, props, kids}` 纯记录对象，不执行副作用），每皮另采 `Mark({size:24})` 与 `Name()` 渲染树入快照域（B5 favicon「双串保全」中 JSX 半边的字节判据）；`project(values, assets)` 的入参构造仿 `tests/translucency-contract.test.mjs` 既有夹具。**覆盖度声明**：legacy-baked 用户自传图分支不在快照 values 域——迁移不改 `resolveImageRef` 调用点语义，该分支由 translucency-kernel / translucency-contract 既有钉看守。

## 全局约束

- **G0 测试面例外（逐条穷尽）**：
  1. `tests/define-skin.test.mjs`：允许**新增**（schema fail-closed、派生、段展开钉）。
  2. `tests/translucency-contract.test.mjs`、`tests/decoration-family.test.mjs`、`tests/meirenzhi-skin.test.mjs`、`tests/runtime-effects.test.mjs`：**零改动、零新增**（import 面已核实不变）。
  3. 其余全部测试文件：零改动。执行中如遇未列测试变红 → 停下说明，不猜。
- **范围红线**：`translucency.js` / `decoration.js` / `frost-family.js` / `runtime.js` / `catalog.js` / `src/client/index.js` / panel / sidebar-switcher / host 侧全部**不碰**；三皮对外工厂名与签名不变（`createOpenBmcHarness(jsxRuntime)` / `createUefiHarness({jsx})` / `createMeirenzhiSkin(jsxRuntime)`，`src/client/index.js` 注册面零改动）；`label` 两种类型原样过缝不强转。
- **接口冻结红线**：Task 4（MRZ 试点过全等门＋全门禁绿）起，`defineSkin` **既有规格字段/键名/段名禁改**，仅允许新增可选字段；被迫改动 → 停下说明并重开裁决。
- **计划判据四律**（developers.md「本地开发与验证」）：①冻结类断言面清点必须 grep 派生逐文件裁决；②「单源收拢」类步骤的注释与代码同清单核对（四件套「规则唯一来源在 decoration.js」归位注释 6 份收敛为工厂内 1 份）；③「唯一来源」grep 判据显式豁免来源文件自身；④**判据自证**——每条判据先在基线跑一遍，确认非永真/永假；`grep -c` 计 0 时 exit 1，禁入 `&&` 链。
- **lib 纪律**：凡触碰 `src/` 的 checkpoint 一并提交重建后的 `lib/`；构建（esbuild）在 danger-full-access 沙箱会话执行（工作区 AGENTS 约定，本会话已满足）。
- **命令环境**：Windows 主机 bash（pnpm 经 PATH）；预计 >90 秒的命令以 `run_in_background` 起跑。
- **分支**：仓库惯例直接在 main 迭代；开工前需主人明确同意在 main 直接执行（先例 2026-10-21/10-22/10-24）。

## 输入工件

- 设计文档：`docs/adr/0019-skin-declaration-table-factory.md`（含 grill 共识 Q1–Q20 附录）。
- 领域词汇：`GLOSSARY.md`「皮肤声明表」词条（已落，随 Task 0 提交）。
- 事实基线：三皮 index.js 现状（OB 表 1622–1698 / UE 1043–1108 / MRZ 91–186；段序与差分见 ADR-0019 背景）；`docs/developers.md`「自建一套皮肤」配方（Task 7 改写对象）。

## 文件结构与职责

| 文件 | 动作 | 职责变化 |
|---|---|---|
| `src/client/skins/define-skin.js` | 新建 | `defineSkin(spec)`：schema 校验（中间档）、三层规格、段展开、派生、七字段收尾 |
| `src/client/skins/openbmc-harness/background-art.js` | 新建 | OB 原画数据模块（`BACKGROUND_ART` 常量 + 溯源注释） |
| `src/client/skins/uefi-harness/background-art.js` | 新建 | UE 原画数据模块（同上） |
| `tests/define-skin.test.mjs` | 新建 | schema fail-closed / 派生 / 段展开 / 默认值钉 |
| `scripts/projection-snapshot.mjs` | 新建（迁移期，Task 8 删） | 基线生成 `--out` / 逐点比对 `--compare` |
| `.artifacts/define-skin-migration/projection-baseline.json` | 生成（gitignored，Task 8 删） | 改前 606 点快照（P=66 行即 desktop 出厂点） |
| `src/client/skins/openbmc-harness/index.js` | 修改 | 瘦身为 defineSkin 规格 + 品牌 JSX + favicon 因子化常量 |
| `src/client/skins/uefi-harness/index.js` | 修改 | 瘦身为 defineSkin 规格 + 品牌 JSX |
| `src/client/skins/meirenzhi/index.js` | 修改 | 瘦身为 defineSkin 规格 + 品牌 JSX（试点） |
| `docs/developers.md` | 修改 | 「自建一套皮肤」配方改写为 defineSkin 版 |
| `GLOSSARY.md` / `docs/adr/0019-*.md` / 本计划 | 已改/新建 | Task 0 文档 checkpoint 提交 |
| `lib/client.js` | 再生 | 随每个 src checkpoint 重建提交 |

## 任务清单

### Task 0：文档 checkpoint + 基线三查

1. **存档 commit**：工作区三份文档——GLOSSARY「皮肤声明表」词条（已改）、ADR-0019（已建）、本计划——纯文档 checkpoint 提交（不触 src，无需重建 lib），使 `git status` 干净。
2. `pnpm run test` 全绿（基线）；记录 `git rev-parse HEAD` 为基线 commit。
3. **断言面 grep 派生**（四律①）：`grep -rn 'createProjection\|BACKGROUND_ART\|frostFamilyCss\|decorationCss\|streamingCss\|badgeCss\|rootClear\|TINTS' src/ tests/ scripts/` 逐文件裁决「改/不改」，与 G0 清单及文件结构表比对；差异 → 停下说明。**预期命中裁决表**（以下文件必被 grep 命中但均零改动，防首轮误绊；保护不变量已核）：
   - `tests/overlay-frost.test.mjs`（直测 frost-family.js）／`tests/translucency-kernel.test.mjs`（直测投影核）——两模块不在改动面；
   - `tests/upstream-hooks.test.mjs`——lib/client.js **子串钉**（`includes`/`split` 计数断言，:23/:39–72；非全文件哈希）：钉的 decoration/kernel 输出串与 scope 属性经全等门保全；
   - `tests/brand-seat-coexistence.test.mjs`——消费三皮工厂面：工厂名/签名/返回面不变；
   - `tests/personalization-catalog.test.mjs`／`tests/personalization-projector.test.mjs`——catalog/projector 不在改动面；
   - `smoke-test.cjs`／`scripts/verify-bundle-guard.mjs`——built lib 行为/结构守卫：重建后行为面不变（check 门内即验）。
4. **判据自证**（四律④）：`grep -c 'createProjection(table)' src/client/skins/openbmc-harness/index.js src/client/skins/uefi-harness/index.js src/client/skins/meirenzhi/index.js` → 基线各 = **1**（收口后 = 0，证非永真永假）。

验证：`pnpm run test` 绿；grep 裁决表与 G0/文件结构表一致；三皮收尾计数基线 = 1/1/1。

### Task 1：投影快照工具 + 基线生成（含 sabotage 自证）

1. 写 `scripts/projection-snapshot.mjs`：
   - `--out <file>`：import 三皮工厂（jsx 传记录式 stub：`jsx(type, props, ...kids)` 返回 `{type, props, kids}` 纯记录对象），对每皮 × {light,dark} × P 0..100 步进 1（606 点，含 contract 夹具特征点 0/35/55/66/100），采集 `project(values, assets)` 九键 + `table` 侧 `favicon` + `builtinAssets` + `Mark({size:24})`/`Name()` 渲染树，以稳定键序 JSON 序列化落盘；入参 `values/assets` 构造仿 `tests/translucency-contract.test.mjs` 既有夹具（legacy-baked 用户自传图分支不在域，见架构快照覆盖度声明）。
   - `--compare <file>`：逐点逐键字节比对；首个不等点输出 `skin/mode/P/key` 与双侧前 200 字符；全等输出 `PROJECTION-BYTES-EQUAL <点数>` 且 exit 0，任何不等 exit 1。
2. 基线生成（未迁移代码上）：`node scripts/projection-snapshot.mjs --out .artifacts/define-skin-migration/projection-baseline.json`。
3. **sabotage 自证**（四律④）：改基线 JSON 中一处键值字节（如某 `staticCss` 串内一个字符）→ `node scripts/projection-snapshot.mjs --compare .artifacts/define-skin-migration/projection-baseline.json` 必须 exit 1 且报出被改点位；还原后再跑必须 `PROJECTION-BYTES-EQUAL 606`。
4. `pnpm run lint` 绿（新脚本入 eslint 面）。

验证：自证双向通过；基线文件存在于 `.artifacts/define-skin-migration/`（gitignored，不入库）。

Produces：`scripts/projection-snapshot.mjs`、基线 JSON、比对命令口径。Consumes：Task 0 基线 commit。

**基线丢失再生路径**（跨会话执行时）：`git worktree add ../dsh-skins-baseline <Task-1-commit>` 后在 worktree 内跑同命令 `--out`（该 commit 已含本脚本），拷回 `.artifacts/` 即可。

### Task 2：define-skin 红钉（不落库）

1. 新增 `tests/define-skin.test.mjs`，用例（此时全红＝模块不存在）：
   - 未知顶层规格键 → `defineSkin({ ...最小合法规格, stray: 1 })` throw `/Unknown spec key/`；
   - 缺必填（`id` 为例，其余必填同法逐个参数化）→ throw `/Missing required/`；
   - 未知 `cssSegments` 段名 → throw `/Unknown segment/`；
   - SCOPE 派生：`bodyAttribute: "dshOpenbmcSkin"` → 段展开产物含 `body[data-dsh-openbmc-skin]`；
   - `backgroundArt` 给定时：`scrim.artLayer` ＝ `, url(<art>)`、`builtinAssets.art` ＝ `{mime, url}`、`wallpaper.sentinel` ＝ `builtin:<id>:art`；`wallpaper {kind:"assets"}`（无 backgroundArt）→ 不派生 sentinel、`builtinAssets` 无派生 `art` 键（MRZ 现状语义）；
   - `builtinAssets` 合成序：派生 `art` 键在前、规格 `builtinAssets` 键按字面序展开（deepEqual 钉键序）；
   - `desktopBlur.rate` 缺省 → 55；
   - 返回面恰好七字段（`Object.keys` deepEqual）且 `label` 原样过缝（string 与 {zh,en} 两参数化）。
2. `node --test tests/define-skin.test.mjs` → 红（`Cannot find module .../define-skin.js`）＝改前证伪。
3. 不 checkpoint（红态不落 main，与 Task 3 绿态合并落库；先例 ADR-0018 Task 1 纪律）。

验证：红因＝模块缺失（非夹具错误）。

### Task 3：defineSkin 最小实现（转绿，纯 schema 层无消费者）

1. 写 `src/client/skins/define-skin.js`：`REQUIRED`/`KNOWN_KEYS`/`SEGMENT_NAMES` 常量表；段展开映射（badge/decoration/streaming/rootclear/frost 五具名段，参数从规格对应字段取）；`''` 恒等拼接（段间无自动分隔，分隔字节由裸串段自持）；派生函数（`scopeOf` kebab 转换、`artLayer`、`sentinel`、`builtinAssets` 合成＝派生 `art` + 规格 `builtinAssets`）；`desktopBlur.rate` 默认 55；`createProjection(builtTable)` 收尾，返回恰好七字段。
2. `node --test tests/define-skin.test.mjs` 全绿；`pnpm run lint` 绿（新 src 与测试文件入 eslint 面）；`pnpm run test` 全绿（define-skin 未被任何皮 import，esbuild 产物不变：`git status -- lib/` 应干净）。
3. **Checkpoint commit**：`src/client/skins/define-skin.js` + `tests/define-skin.test.mjs`（lib 无差异，不涉）。

验证：单测绿 + 全测绿 + lib 零差异。

Produces：`defineSkin(spec)` 可用接口（Task 4–6 消费）。Consumes：Task 2 红钉。

### Task 4：MRZ 试点迁移（首过全等门 + 机器冻结）

1. `meirenzhi/index.js` 改写：TINTS/RIDING/constantTokens/table 数据与 Mark/Name 移入 `defineSkin` 规格；现状 CSS 数组序（badge→decoration→rootclear→streaming→7 条氛围裸串〔breathe / ::before / drift-a / drift-b / #root::before / #root::after / reduced-motion〕→frost）转 `cssSegments`（现状 `join("\n")` 的段间 `\n` 并入前段段尾；空白/注释同入裸串段）；`favicon: {href: MARK_URL, mime: "image/webp"}`；六键壁纸入 `builtinAssets`；对外签名 `createMeirenzhiSkin(jsxRuntime)` 不变。
2. `pnpm run test` 全绿（translucency-contract / meirenzhi-skin 零改动通过＝金栏独立基线佐证）。
3. `node scripts/projection-snapshot.mjs --compare .artifacts/define-skin-migration/projection-baseline.json` → `PROJECTION-BYTES-EQUAL 606`（OB/UE 未动，天然全等；MRZ 为本任务实证）。
4. `pnpm run check` 全绿（lib-sync：重建后 lib/client.js 合法变化，同提交入库）。
5. **Checkpoint commit**：MRZ 迁移 + lib 重建。**接口机器冻结自此生效**（全局约束红线）。

验证：三查全绿＋全等门过。

### Task 5：OB 迁移（favicon 因子化 + 原画出仓）

1. `openbmc-harness/background-art.js` 新建：`BACKGROUND_ART` 常量迁入 + 溯源注释（鎏金电路板原画，1920×1080 WebP）。
2. favicon 因子化：四条 path d 串与渐变数据（coords/stops）提为模块级共享常量；`FAVICON_DATA_URL`（短 id a–d）与 `OpenBmcMark` JSX（长 id）经 id 注入参数各自重拼——**双串字节保全**，终裁＝全等门（favicon 在快照域内）。执行注意：重拼保持 Mark/Name 对象字面量 props 键位不动（键序挪动会使 Mark 渲染树快照 JSON 差一字节）。
3. `openbmc-harness/index.js` 改写为 defineSkin 规格：段序 badge→decoration→streaming→rootclear→frost（注释转裸串段）；`backgroundArt` 入规格（派生 artLayer/sentinel/builtinAssets.art）；`PLACEHOLDER_LIGHT/DARK` 入 `wallpaper.placeholder`。
4. `pnpm run test` 绿 → `--compare` `PROJECTION-BYTES-EQUAL 606` → `pnpm run check` 绿。
5. **Checkpoint commit**：OB 迁移 + background-art.js + lib。

### Task 6：UE 迁移（原画出仓）

1. `uefi-harness/background-art.js` 新建（冰窟双翼神鸟原画，2237×1080 → 1920×927 WebP，溯源注释）。
2. `uefi-harness/index.js` 改写为 defineSkin 规格：段序 rootclear→streaming→decoration→frost（无 badge）；favicon 已因子化（`LOGO_WHITE/LOGO_RED`）不动，入规格 `favicon: {href: favicon, mime: "image/svg+xml"}`（`faviconSvg` 为皮内中间量，encodeURIComponent 产出 href 后入规格）；`wallpaper.placeholder: null` 原样。
3. `pnpm run test` 绿 → `--compare` `PROJECTION-BYTES-EQUAL 606` → `pnpm run check` 绿。
4. **Checkpoint commit**：UE 迁移 + background-art.js + lib。

### Task 7：developers.md 配方改写（纯文档）

1. 「自建一套皮肤」节改写为 `defineSkin` 规格配方：三层规格、`cssSegments` 段清单、派生/默认说明、favicon 显式数据（含 OB 式 id 注入因子化范例）；表形状权威定义仍指 `translucency.js` 头注释；`PRODUCTION_FIELDS` 七字段语义与三层回退 fail-closed 表述不变；「实现耦合的已知边界」各条复核不受影响。
2. README 双语零改动（实现细节不入 README；`verify:readme` 配对不受影响）。
3. **Checkpoint commit**（纯文档）。

### Task 8：终验 + 迁移基建退役 + 结构钉

1. `pnpm run check` 全绿。
2. `node scripts/projection-snapshot.mjs --compare .artifacts/define-skin-migration/projection-baseline.json` → `PROJECTION-BYTES-EQUAL 606`（**终跑后再退役**）。
3. 删 `scripts/projection-snapshot.mjs` 与 `.artifacts/define-skin-migration/`（工具与基线同生灭；永久回归由金栏契约测试承担）。
4. **结构钉**（四律③：豁免来源文件自身）：`grep -rn 'createProjection(table)' src/client/skins/openbmc-harness/index.js src/client/skins/uefi-harness/index.js src/client/skins/meirenzhi/index.js` → 零命中（shell 判：`! grep -q ...`）；`grep -c 'createProjection' src/client/skins/define-skin.js` = **1**（唯一来源绊线）。
5. 测试面 diff 清点：全仓 `git diff --stat` 与 G0/文件结构表逐项比对；差异 → 停下说明。
6. 输出修改摘要；**Checkpoint commit**（基建退役）。ADR-0019 Amendment 留待实际发版（搭车 1.5.x）时补记。

## 执行纪律

- **回退口径**：Task 4/5/6 每皮独立 checkpoint＝回退单元（`git revert` 单 commit 即回退一皮）；Task 3 工厂与 Task 0 文档各自独立；Task 2 红钉不落库。
- 开始实现前，先批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；**接口冻结红线**（Task 4 起）与 G0 测试面例外是硬边界。
- 每完成一个任务，运行该任务定义的验证；验证不过不算完成。
- 遇阻塞、重复失败或计划与仓库现实不符（如行段漂移、遇未列测试变红、全等门首 diff），立即停下说明，不猜。
- 全部任务完成后，运行最终验证并输出修改摘要；产物评审由主人组织（Q20 两点位流程）。

## 最终验证

- `pnpm run check` 全绿（构建 + ESLint + 测试 + README 配对 + bundle/上游钩子守卫 + lib-sync）。
- 投影输出全等门终跑 `PROJECTION-BYTES-EQUAL 606`（Task 8 步骤 2，退役前执行）。
- 结构绊线：三皮 index.js `createProjection(table)` 零命中；`define-skin.js` 计 = 1。
- 测试面 diff：仅新增 `tests/define-skin.test.mjs`，既有四套及全部其余测试零改动。

## 审阅 Checkpoint

- 本计划与 ADR-0019 为 T0 成稿，待主人送**计划评审**；评审意见修订后，开工前确认 main 直接执行（分支纪律）。
