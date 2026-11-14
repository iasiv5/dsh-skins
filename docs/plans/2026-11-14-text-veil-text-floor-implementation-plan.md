# 文字纱与文字地板实施计划（ADR-0027）

## 目标

- 壁纸暴露区的常驻文字对比度保证（ADR-0027）：投影核新增**随动地板钳制**（riding 条目 `[rgb, baked]` → `[rgb, baked, floor?]`，派生 alpha = `max(pt(baked), floor)`），三皮 `--dsw-specific-sidebar-fill` / `--dsw-specific-input-major` 按门禁反解值填地板；文字色地板（前景侧）+ composer 实体面边界（1.4.11 3:1）+ hero/品牌位文字侧修法同步落地。
- 硬门禁 `scripts/verify-contrast.mjs` 进 `pnpm run check`：内置壁纸分区亮度统计 fixture（sha256 防陈旧）× 独立重实现投影公式 × 手抄 TEXT_FLOOR 文字色金值表，逐壁纸 × 皮肤 × 明暗 × web/desktop 出厂断言 4.5 / 3.0 / 3:1；门禁红灯形态 = 复现 2026-11-14 基线失败行（判据自证）。
- 出厂值 35/55/66 不动；official 态由构造豁免；openbmc/uefi 地板取 baked 值（出厂零像素变化，纯低 P/用户壁纸保护）；meirenzhi 出厂可见变化如实申报（侧栏变实一档、输入框面变实出边界、品牌/标语文字加深）。
- 顺手项（共识 Q6-R2）：面板标题提级（13–14px 主级色）+ 图库空态提示提色。
- GLOSSARY（文字纱/文字地板/通透度修订/投影核枚举）与 ADR-0027 已随共识轮落笔，不在本计划任务内。

## 架构快照

- **地板钳制（唯一机制核，translucency.js）**：

```js
// 现行（translucency.js:37-39）
const pt = (baked) => Math.min(100, Math.max(0, P + baked - anchor));
const alpha = (rgb, baked) => `rgba(${rgb}, ${pct(pt(baked))})`;
// 扩展后：riding 条目值 [rgb, baked, floor?]
const alphaF = (rgb, baked, floor) =>
  `rgba(${rgb}, ${pct(Math.max(pt(baked), floor ?? 0))})`;
```

两位小数格式规则不变（ADR-0004:16 沿用）。floor 缺省 = 无地板（现行为逐字节不变）。`pt` 语义不动；钳制只抬低不削高（P≥锚点时 pt≥baked≥floor 的皮零变化）。

- **门禁合成模型（verify-contrast.mjs）——三类输入、两种信任级别**：**数学独立重实现**（投影公式/合成，禁 import src 的公式代码）；**背景侧输入 import 三皮声明表现值**（riding rgb/baked/floor、锚点、纱参——门禁裁的是现实状态而非平行副本，不设第二手抄背景表：既消除多表漂移面，又使 Task 9 撤地板探针真实有效；载体 = 三皮 `export { SPEC }`，defineSkin 返回面是生产面七字段、表在闭包内，ADR-0014 冻结不动）；**文字侧契约手抄**（TEXT_FLOOR 表 + 阈值常量，translucency-contract GOLD 手抄纪律同源）。分区有效背景亮度 = 内置壁纸分区亮度 p95（fixture）→ 依次叠 openbmc/uefi art-scrim stops（或 meirenzhi body::after 纱 30t²，按 P 公式）→ 目标 token alpha（含地板钳制，取自 import 现值）→ 与 TEXT_FLOOR 表文字色求 WCAG 比。参考视口 1912×948 cover-fit 采样近似，p95 取向保守；桌面会话区（`_centerCol` 直绘、无 filter）同栈去 blur。断言面：web 出厂（55/55/35）+ desktop 出厂（66）× 亮暗 × 三皮 × 内置壁纸全集。
- **TEXT_FLOOR 金值表（手抄，禁从被测代码生成——translucency-contract GOLD 先例）**：每行 = 皮肤 × 明暗 × 表面（sidebar_text / composer_placeholder / hero_slogan / brand / composer_border）→ 文字（或边框）色的 RGB 字面量。宿主样式文字（侧栏项、占位符、标语）的色源按 Task 1 取证裁决：宿主可骑 token → constantTokens 常量覆写；否则 → staticCss 结构局部名规则（进守卫清单）。
- **通道归属（ADR-0027 Decision 1-4）**：纱 = riding floor（投影核）；文字色 = constantTokens 或 staticCss（Task 1 裁决）；边界 = staticCss 常量段；hero = 宿主 DOM 钩子（locale 覆写不走 CSS，runtime.js:592-606——钩子类名活体取证后进守卫）；品牌位 = 插件自有组件 CSS 直改。
- **形状冻结不破**：ADR-0014 生产面七字段与声明表 12 字段集零增删——floor 是 riding 条目值域内部扩展；新增常量走既有 `constantTokens`；新增 CSS 走既有 `staticCss` 段拼接。

## 全局约束

- 判据自证四律（developers.md）：每条判据命令先在基线跑一遍确认非永真/永假再进验收；`grep -c` 计 0 时 exit 1，禁入 `&&` 链。
- 退出码卫生：验证输出经管道必须 `set -o pipefail`。
- 测试禁入吞码管道（裸退出码）。
- `docs/assets` 零差异纪律：本计划不得更新文档截图；`git diff --exit-code -- docs/assets` 终验必须零差异（活体取证截图落 scratch，不入仓）。
- 声明表 12 字段与生产面七字段冻结（ADR-0014）；三皮 `cssSegments` 既有段零字节改动（新增内容只走新增段/既有段内新增规则按 Task 6 裁决，若裁决为「既有段禁改」则以新段追加）。
- GOLD 手抄纪律：TEXT_FLOOR（文字侧）与 translucency-contract GOLD 表一律手抄期望值，禁止从被测代码再生成（tests/translucency-contract.test.mjs:7-12 头注先例）；门禁背景侧输入**不设第二手抄表**（import 声明表现值，门禁裁现实——见架构快照三类输入），故无 GATE_RIDING 表。
- 活体测量纪律：Task 1 前先读 `01_docs/agent-ops/README.md`「活体测量」；只读捕获、不改宿主态、不重启服务（know-how 037）。
- 开始实现前确认当前分支：若在 `main`/`master` 且未经主人明确同意，先停下确认。每任务前 `test -d node_modules`。
- 版本下限/依赖限制：无额外全局约束（零新依赖；playwright-core 为既有 dev 能力，repro gate 先例）。

## 输入工件

- 设计来源：grill-with-docs 共识（2026-11-14 四轮，主人逐轮「按推荐」）+ ADR-0027 + GLOSSARY 词条（已落笔）。
- 量化基线：`01_docs/dsh-skins-audit/contrast-baseline-2026-11-14.md` + 测量脚本 `.dsh-research/scratch/skins-contrast/{measure.py,derive_alpha.py,derive_fg.py}` + `contrast-baseline.json`。
- 取证锚点（行号为 2026-11-14 读数，以符号锚点为准）：
  - 投影核：`src/client/skins/translucency.js:37-39`（pct/pt/alpha）、`:41-47`（riding 展开）、`:54-65`（纱两形态）、`:83-87`（blur/桌面增益）。
  - 声明表现值：sidebar-fill = mrz `["250, 249, 246", 40]/["18, 18, 26", 52]`、openbmc `["238, 246, 251", 60]/["13, 30, 44", 72]`、uefi `["238, 235, 255", 60]/["25, 20, 48", 72]`；input-major = mrz `40/45`、openbmc `60/65`、uefi `62/55`（各皮 index.js riding 表）。
  - GOLD：`tests/translucency-contract.test.mjs:24-77`（GOLD 表）+ `:143-347`（逐皮断言）；`tests/meirenzhi-skin.test.mjs:68-108`；`tests/personalization-projector.test.mjs:211-407`；`smoke-test.cjs:386-414`。
  - defineSkin 校验基座：`src/client/skins/define-skin.js` REQUIRED/KNOWN_KEYS；`tests/define-skin.test.mjs` minSpec。
  - 运行时 token 取证源：web 机 `~/.local/share/dsh-runtime/node_modules/.pnpm/@deepseek-ai+dsh-client-ui-layout@*/…/lib/client.js` 与 `dsh-client-ui-theme@*/…`（font-slots 计划先例路径）；CI 侧由 `scripts/ci-install-runtime.mjs` 装配 `.dsh-ci-runtime/`。
  - 守卫清单先例：`scripts/verify-upstream-hooks.mjs` 头注 manifest（现有编号至 9——9. sidebar fade，2026-11-12 加入；锚组循环模式）。
  - 截图管线：`scripts/capture-previews.mjs --gate`（发版门）；`screenshots.json` 孤儿（零消费者，Task 10 裁定退役）。

## 文件结构与职责

- Create: `tests/text-floor.test.mjs` — 地板钳制语义测试（clamp 数学、official 豁免构造、P=0/锚/100 行为、riding 形状校验矩阵）。
- Create: `scripts/capture-wallpaper-stats.mjs` — 内置壁纸分区亮度统计采集（playwright-core canvas，参考视口 cover-fit，输出 fixture + sha256）。
- Create: `scripts/fixtures/wallpaper-luminance.json` — 统计 fixture（提交入库；采集脚本可重生成且确定性）。
- Create: `scripts/verify-contrast.mjs` — 硬门禁（独立重实现投影合成 + TEXT_FLOOR 手抄表 + 断言；背景侧 import 三皮 SPEC 现值，三类输入见架构快照）。
- Create: `docs/verification/2026-11-14-text-floor-preflight.md` — Task 1 活体取证记录（复测数值、token/选择器裁决、DOM 类名）。
- Modify: `src/client/skins/translucency.js` — alpha 地板钳制（ riding 展开传 floor）。
- Modify: `src/client/skins/define-skin.js` — riding 值形状校验（2/3 元数组、floor 0–100 整数）。
- Modify: `src/client/skins/{meirenzhi,openbmc-harness,uefi-harness}/index.js` — riding 条目填 floor；按 Task 1 裁决加 constantTokens 文字色或 staticCss 新段（textfloor：文字色规则 + composer 边框）；meirenzhi 品牌组件亮色渐变暗化。
- Modify: `tests/translucency-contract.test.mjs`、`tests/meirenzhi-skin.test.mjs`、`tests/personalization-projector.test.mjs`、`tests/define-skin.test.mjs`、`smoke-test.cjs` — GOLD/断言手抄同步。
- Modify: `scripts/verify-upstream-hooks.mjs` — manifest 新组（Task 1 新钉的结构局部名/token 锚点）。
- Modify: `src/client/personalization/panel.js`（或其样式常量）— 面板标题提级 + 图库空态提示提色。
- Modify: `package.json` — `verify:contrast` script + check 链插入 + version bump（实施时读现值 +1 patch，沿 1.5.x 流水，主人定版）。
- Modify: `README.md`、`docs/developers.md` — 0% 语义行、个性化段文字纱提及、声明表 floor 文档、门禁说明。
- Delete: `screenshots.json`（孤儿清单，语义由 fixture/capture-previews 承担；Task 10 执行，主人可否决）。
- Build artifacts: `lib/client.js`（随仓提交产物，先 build 后 add 再 check 顺序不变式）。

## 任务清单

### Task 1: 活体取证 preflight（主人协作，只读）

- 目标：关闭三个实施前未知数——①三行亮度纠缠复测（mrz-3 占位、desktop 占位、openbmc/uefi chip——ADR-0027 Q3-2.5 裁定不据此定参）；②composer 容器与 hero 标语的宿主结构局部名；③侧栏文字/占位文字/标语的色源裁决（宿主可骑 token 清单 vs 结构局部名）。
- 涉及文件：无代码改动；产出 `docs/verification/2026-11-14-text-floor-preflight.md`。
- 接口契约：
  - Consumes: 本机 DSH web 活实例（loopback，现役已发皮肤态）；`01_docs/agent-ops/README.md`「活体测量」纪律。
  - Produces: preflight 文档（Task 5 地板定值、Task 6 通道裁决、Task 6 守卫锚点的唯一依据）。
- 步骤：
  1. 读「活体测量」节；浏览器（ZCode browser 工具）打开 loopback DSH，确认现役皮肤与出厂值（mrz 35 亮色起）。
  2. 全分辨率截图四态：mrz 亮色（慕沛灵/银月各一）、mrz 深色、openbmc 亮色+深色 chip 特写、desktop 会话区；PNG 落 scratch（不入仓）。
  3. 复测：以 `measure.py` 同款区域跑 Otsu 双聚类，记录三行新数值与极性判定；与基线并排写入 preflight 文档。
  4. DOM 取证：DevTools/JS 注入读 composer 容器、hero 标语元素、侧栏导航项的局部类名与 computed color；`~/.local/share/dsh-runtime` grep `--dsw-` token 清单中语义为文字色/边框色的候选。
  5. 裁决表落盘：每表面一行「色源 = token X（constantTokens 通道）| 结构局部名 Y（staticCss 通道 + 守卫）」。
- 验证：preflight 文档含四态数值表 + 裁决表；复测脚本与原始数据路径可回溯。
- 环境：主人本机；若沙箱拦浏览器/截图，按提权流程征得同意。

### Task 2: 壁纸统计 fixture + 采集脚本

- 目标：门禁的壁纸侧数据地基：确定性、可重生、sha256 防陈旧。
- 涉及文件：`scripts/capture-wallpaper-stats.mjs`（Create）、`scripts/fixtures/wallpaper-luminance.json`（Create）。
- 接口契约：
  - Consumes: 三皮壁纸模块（`src/client/skins/meirenzhi/wallpapers.js`、`*/background-art.js`）解析内置壁纸字节；playwright-core + 本机 chromium（repro gate 既有前提）。
  - Produces: fixture（Task 3 门禁唯一壁纸数据源）。
- 步骤：
  1. 采集脚本：参考视口 1912×948，对每张内置壁纸按 cover-fit 计算各分区（web：sidebar_strip x0.015–0.115/y0.165–0.345、hero_band x0.48–0.68/y0.36–0.41、composer_area x0.36–0.72/y0.425–0.535；desktop：center 列 hero/composer 同 y 带映到 x0.175–1.0）内像素亮度 p50/p95；记录每张壁纸 sha256。canvas 采样在 `--allow-file-access` 形态的 playwright 页面完成或经 data: URL 注入，二者取一写死。
  2. 生成 fixture 并提交；脚本重跑输出与已提交 fixture 逐字节一致（确定性自证）。
  3. 判据自证：临时改 fixture 任一数值 → `node scripts/capture-wallpaper-stats.mjs --check` 红并报 sha/数值失配 → 还原 → 绿。
- 验证：`node scripts/capture-wallpaper-stats.mjs --check` 退出码 0（两次连跑 + 篡改红/还原绿，输出落执行日志）。

### Task 3: verify-contrast 门禁（红灯形态 = 复现基线）

- 目标：硬门禁上线并以红灯证明其判据力：红灯行集合 ≈ 基线失败行集合。
- 涉及文件：`scripts/verify-contrast.mjs`（Create）、三皮 `index.js`（**仅加 `export { SPEC };` 导出行**——import 载体，见步骤 1；riding 值零改动零行为变化）、`package.json`。
- 接口契约：
  - Consumes: Task 2 fixture；TEXT_FLOOR 初版手抄表（以**现行**文字色填——mrz 品牌渐变中亮色值、Task 1 裁决的宿主文字色字面量）；ADR-0010 先例的独立重实现纪律。
  - Produces: `pnpm run check` 链新成员 `verify:contrast`（插在 verify:hooks 之后）；Task 9 全绿的验收器。
- 步骤：
  1. 载体前置：三皮 `index.js` 末尾加 `export { SPEC };`——defineSkin 返回面为生产面七字段（define-skin.js:176-184），声明表在闭包内不可达，唯一现值通道是模块级 SPEC 导出（模块内 `const SPEC` 现无导出，三皮 grep 实证）；导出行零行为变化，若 build 后 lib 产物 diff 非零 → 停下排查（IIFE 入口不应携带内部导出，lib-sync 断言兜底）。
  2. 独立重实现合成模型公式（架构快照三类输入口径：公式禁 import src；背景侧 token 值/锚点/纱参经 `import { SPEC } from "../src/client/skins/<id>/index.js"` 取现值；TEXT_FLOOR 与阈值手抄）；断言函数 `(fgL, bgCompositeL, threshold) => ratio`。
  3. TEXT_FLOOR 初版表手抄（现行色值）；跑 `node scripts/verify-contrast.mjs`。
  4. **预期红灯**：mrz 亮色出厂 sidebar/placeholder/hero(2.58 行)/brand/footer 相关断言红、composer 边界断言红、desktop 会话区占位红（以 Task 1 复测值为准）；openbmc/uefi 全部文字行绿。红灯行与基线数值逐行对照（±0.3 容差）写入执行日志——这就是门禁的判据自证。
  5. `package.json` 加 `"verify:contrast": "node scripts/verify-contrast.mjs"`，check 链（package.json:86 verify 序列）插入 verify:hooks 之后。
- 验证：红灯集合与基线并排表落执行日志；`pnpm run verify:contrast` 裸退出码非零（预期红，禁入 && 链）。

### Task 4: 投影核地板钳制（红灯先行）

- 目标：`alpha` 地板钳制 + riding 值形状校验，机制核先行全绿。
- 涉及文件：`tests/text-floor.test.mjs`（Create）、`tests/define-skin.test.mjs`、`src/client/skins/translucency.js`、`src/client/skins/define-skin.js`。
- 接口契约：
  - Consumes: 现行 `pct/pt/alpha`（translucency.js:37-39）与 riding 展开点（:41-47）；defineSkin REQUIRED/KNOWN_KEYS 校验基座。
  - Produces: 钳制后的投影核（Task 5 三皮填值、Task 3 门禁转绿的被测对象）；riding 三元值形状契约。
- 步骤：
  1. `tests/text-floor.test.mjs`（头注引 ADR-0027）：自持 mini 投影（独立重实现）——用例组：①floor 缺省 = 现行为逐字节不变（同参两版 alpha 输出相等）；②P=0 时 floor 生效（`max(pt(baked), floor)`：mrz sidebar light baked 40/floor 60 → P=0 输出 `rgba(250, 249, 246, 0.60)`——0.05 被抬到 0.60）；③锚点处 floor>baked 时输出 = floor（出厂抬升语义）；④P=100 恒 1.00 不被削；⑤official 构造豁免：单元层断言钳制只存在于声明皮 riding 展开路径（official 无声明表 → 无 riding 条目可钳），集成层引用既有 smoke-test.cjs:428-431（official 切换释放 token layer 断言）覆盖，不在单测重复造注册序断言；⑥形状校验矩阵：floor 非数值/负数/>100/小数 → defineSkin throw；二元数组行为不变。
  2. `tests/define-skin.test.mjs`：minSpec riding 条目补三元变体用例（缺省二元仍合法）。
  3. 跑红：`node --test tests/text-floor.test.mjs`（import 的钳制行为不存在 → 断言红；红灯输出落日志）。
  4. 实现：translucency.js alpha 增 floor 形参（展开点透传 riding 条目第三元）；define-skin.js riding 值校验扩展（2/3 元、floor 为 0–100 整数，非法 throw）。
  5. 跑绿：`node --test tests/text-floor.test.mjs tests/define-skin.test.mjs` 全绿。
- 验证：上述 node --test；判据自证 = 步骤 3 红灯落日志。
- 注意：本任务不改任何皮的 riding 值——translucency-contract / smoke 在此任务后仍应全绿（floor 缺省 = 行为不变）。

### Task 5: 三皮填地板 + GOLD 手抄同步

- 目标：三皮 riding 条目落 floor 值；金值断言面按手抄纪律更新到位。
- 涉及文件：三皮 `index.js`、`tests/translucency-contract.test.mjs`、`tests/meirenzhi-skin.test.mjs`、`tests/personalization-projector.test.mjs`、`smoke-test.cjs`（门禁背景侧 import 声明表现值——本任务零门禁改动，verify:contrast 红灯行变化即真实观测）。
- 接口契约：
  - Consumes: Task 1 preflight 复测值 + Task 3 门禁红灯行（定值依据）；Task 4 钳制语义。
  - Produces: 三皮最终 floor 值（Task 6 文字色/边框值反解的背景侧输入）；全 GOLD 一致。
- 步骤：
  1. 定值规则（ADR-0027）：openbmc/uefi 两 token floor = 各自 baked（纯低 P 保护，出厂零变化）；mrz sidebar-fill light floor = 门禁反解值（≤ baked+25 = ≤65），dark floor = baked；mrz input-major light/dark floor = 实体面反解值（不受 +25 帽约束，预计 85–90，最终以门禁 4.5/3:1 全绿的最小值定版）。
  2. 三皮 riding 表填第三元（其余逐字节不动）。
  3. GOLD 手抄更新：translucency-contract GOLD 表 riding 条目补 floor 列并更新受影响派生串（mrz 出厂/低 P 点值行）；meirenzhi-skin riding 期望值；personalization-projector 的 REAL-factories/曲线金值中受 floor 影响的 rgba 串；smoke 的 openbmc 默认锚断言（openbmc floor=baked → 理论零变化，若断言失败即实现事故，停下排查）。
  4. 跑绿：`node --test tests/`（全目录）+ `pnpm run test`（smoke/repro 全链）。预期：仅 Task 3 门禁仍红（文字侧未落地），其余全绿。
- 验证：全 test 链绿 + `pnpm run verify:contrast` 红灯行数不增且逐行记录（双侧推导预期：背景侧单独几乎不转绿文字行——转绿集合以门禁实测为准，文字侧关键行〔占位/品牌/hero〕此阶段必须仍红），并排表落日志。

### Task 6: 文字色地板 + composer 边界 + hero 钩子（按 Task 1 裁决落地）

- 目标：前景侧三件就位，门禁文字行具备转绿条件。
- 涉及文件：三皮 `index.js`（constantTokens 或 cssSegments 新段）、`scripts/verify-upstream-hooks.mjs`、`scripts/verify-contrast.mjs`（TEXT_FLOOR 终版）。
- 接口契约：
  - Consumes: Task 1 裁决表（通道 + 类名）；Task 5 最终 floor 值（文字色反解的背景侧输入）。
  - Produces: TEXT_FLOOR 终版色值（Task 9 门禁全绿对象）；守卫清单新锚组。
- 步骤：
  1. 按裁决表逐表面落地：token 通道 → constantTokens 常量键（明暗成对）；选择器通道 → cssSegments 追加 `textfloor` 段（颜色规则 + composer 边框 `border: 1px solid rgba(...)`，边界色对壁纸 p95 ≥3:1 反解）。**作用域字面量钉**：新段选择器一律 `body[data-<kebab(bodyAttribute)>]` 形态（Q3 钉，tests/define-skin.test.mjs:205 测试侧独立重推 kebab——写错即红，按事故纪律停摆），与三皮既有段形态一致。
  2. hero：按 Task 1 钩子形态落地（类名规则则入 textfloor 段并进守卫；token 则入 constantTokens）；mrz 标语色暗化至门禁 3.0 达标值，openbmc/uefi 出厂达标不改（低 P 由常量色天然兜底）。
  3. `verify-upstream-hooks.mjs` manifest 追加第 10 组（现编号至 9. sidebar fade——不得撞号；新钉结构局部名：composer 容器、hero 元素；label `text floor anchors (ADR-0027)`），锚点形态仿第 8 组字面量锚。
  4. TEXT_FLOOR 表更新为终版色值（verify-contrast.mjs 内手抄）。
- 验证：`node scripts/verify-upstream-hooks.mjs` 本地真跑绿（无 SKIPPED）；`pnpm run verify:contrast` 仅剩 brand 行（Task 7）或全绿。
- 注意：cssSegments 既有段零字节；若裁决需要改既有段内规则，停下回报主人裁决（全局约束）。

### Task 7: 品牌位组件色修（meirenzhi 亮色）

- 目标：MeiRenZhiName/MeiRenZhiMark 亮色渐变暗化达 4.5:1（门禁 brand 行转绿）。
- 涉及文件：`src/client/skins/meirenzhi/index.js`（品牌组件 CSS）、`scripts/verify-contrast.mjs`（TEXT_FLOOR brand 行）。
- 接口契约：
  - Consumes: Task 6 终版背景（品牌位处于侧栏列，吃 sidebar-fill 地板后的合成背景）。
  - Produces: TEXT_FLOOR brand 行终值（Task 9）。
- 步骤：
  1. 亮色渐变止色暗化（保持鎏金识别度的最小暗化量，以门禁反解值为下限）；深色态零改动（基线 4.58x 达标）。
  2. TEXT_FLOOR brand 行手抄更新（verify-contrast.mjs 内）。
- 验证：`pnpm run verify:contrast` brand 行绿；`node --test tests/meirenzhi-skin.test.mjs` 绿（若该文件钉组件色值则同步手抄）。

### Task 8: 插件自有 UI 顺手项（面板标题 + 图库空态提示）

- 目标：面板标题提级（13–14px 主级色，层级倒挂修复）+ 图库空态提示提色至 4.5:1。
- 涉及文件：`src/client/personalization/panel.js`（PANEL_CSS 常量）、`tests/personalization-panel.test.mjs`（冻结断言面，只读约束源）。
- 冻结约束：PANEL_CSS 规则行数冻结 59（personalization-panel.test.mjs:791-792，「45 shell + 59 panel = 104」ownership ratchet）——本任务**仅就地改既有规则行**（pop-title 情境规则、pz-muted），零新增/零删除规则行；若确需新规则行，停下报主人并同步该测试，不得改断言迁就。
- 接口契约：
  - Consumes: 现行 `.dsh-skins-pop-title`（sidebar-switcher.js:176）与 `.dsh-skins-pz-muted`（panel.js:86）样式；弹层 frost 86% 底（frost-family.js:43-45）。
  - Produces: 无下游依赖（Task 9 全链回归覆盖）。
- 步骤：
  1. 面板标题样式提级：12px 次级 → 13.5px 主级色 + 500 字重（与字段标签拉开层级）。
  2. `.dsh-skins-pz-muted` 图库空态场景提色（ frost 底上 ≥4.5:1 反解；通用 muted 微文案色一并校核）。
  3. 跑 `pnpm run test`（smoke 断言弹层词条/结构不受影响）。
- 验证：`pnpm run test` 绿；对照 verify_crops 式目检截图（scratch，不入仓）确认层级/可读性。

### Task 9: 门禁全绿 + 判据自证全集

- 目标：verify:contrast 全绿；四律自证收口。
- 涉及文件：无新改动（验收任务；若红则回 Task 5/6/7 修值，禁改门禁迁就）。
- 接口契约：
  - Consumes: Task 3-8 全部产出。
  - Produces: 全绿执行日志（发版前置证据）。
- 步骤：
  1. `pnpm run verify:contrast` 退出码 0。
  2. 四律自证：门禁对「人为撤掉任一 floor」红（临时改回值 → 红 → 还原 → 绿）；TEXT_FLOOR 任一行篡改红；输出落日志。
  3. `pnpm run check` 全链绿（此时 verify:contrast 已在链内）。
- 验证：裸退出码 0 × 3；日志含撤地板红/还原绿证据。

### Task 10: 文档同步 + screenshots.json 退役

- 目标：作者文档与用户文档对齐新语义；孤儿清单收编。
- 涉及文件：`README.md` + `README.en.md`（双语配对门，缺一 verify:readme 必红）、`README.i18n.yaml`（--write 重录）、`docs/developers.md`、`screenshots.json`（Delete）。
- 接口契约：
  - Consumes: Task 5/6 最终值（文档写实测语义而非意图）。
  - Produces: 无下游依赖。
- 步骤：
  1. README：`个性化`节「通透度」行补一句「文字承载区设有常驻文字纱地板（ADR-0027），0% 时除文字衬底外全透」；FAQ 增一条「为什么 0% 时侧栏/输入框仍有一层底？」。**双语配对门**：README.en.md 同步同两处（verify-readme-pairing.mjs:3-8 两侧 blob-hash 必须同变），改完 `node scripts/verify-readme-pairing.mjs --write` 重录 README.i18n.yaml。
  2. developers.md：声明表文档补 riding 第三元 floor 说明（0–100、缺省无地板、+25 增量帽与 input-major 豁免）、`verify:contrast` 门禁小节（fixture 重生成命令、TEXT_FLOOR 手抄纪律）。
  3. 删 `screenshots.json`（零消费者，preview 清单语义由 capture-previews/门禁 fixture 承担）——若主人否决则保留并从计划移除。
- 验证：`pnpm run verify:readme` 绿；`git diff --exit-code -- docs/assets` 零差异。

### Task 11: 版本 bump + 全门禁 + 主人活体目验

- 目标：可发布工作树；美学终审过目（ADR-0010 Q7 惯例）。发版不在本计划范围（主人另行安排）。
- 涉及文件：`package.json`、`lib/client.js`。
- 接口契约：
  - Consumes: Task 1-10 完成；developers.md 发版序列第 1-2 步（仅 bump/build/check，不含 tag/push）。
  - Produces: 主人「过」的活体验收结论。
- 步骤：
  1. 联网 npm 命令前置 `npm_config_cache` 指 workspace 内路径（workspace AGENTS.md「npm 调用」条目，否则 EROFS）：`npm_config_cache=<workspace 缓存路径> npm view @iasiv5/dsh-skins@<目标版本> --registry=https://registry.npmjs.org/` 确认未占用；`package.json` version = 现值 +1 patch。
  2. **先 build 后 add 再 check**（顺序不变式，font-slots Task 7 先例）：`pnpm run build` → `git add -A` → `pnpm run check`（链内含 verify:contrast）。
  3. `git diff --exit-code -- docs/assets` 零差异。
  4. 热部署（`bash scripts/hot-deploy.sh`，know-how 037 纪律；**须在主人本机非沙箱会话执行**——hot-deploy.sh:9 前提「无沙箱写限制」，agent 会话被拦则由主人在本机跑）后请主人目验：①mrz 亮色出厂（慕沛灵+银月）侧栏/输入框/标语/品牌可读性；②深色与 openbmc/uefi 出厂近零变化确认；③通透度拖到 0% 与 100% 两端行为（地板语义目证）；④Desktop 会话区同查；⑤面板标题层级观感。任何一步不符 → 停下排查，不得带病收口。
- 验证：`pnpm run check` 退出码 0；主人显式确认（对话记录）；`lib/client.js` 含 `rev = "<新版本>"` 字面量探针。

## 任务间接口契约（汇总）

| 产出 | 生产者 | 消费者 |
|---|---|---|
| preflight 文档（复测值/通道裁决/类名） | Task 1 | Task 3（TEXT_FLOOR 初版）、Task 5（定值）、Task 6（落地+守卫） |
| 壁纸统计 fixture | Task 2 | Task 3（唯一壁纸数据源） |
| verify:contrast 门禁（红灯） | Task 3 | Task 5/6/7（转绿对象）、Task 9（验收器）、Task 11（check 链） |
| 投影核钳制 + riding 三元形状 | Task 4 | Task 5（填值）、Task 3（被测公式） |
| 三皮 floor 值 + GOLD 同步 | Task 5 | Task 6（文字色反解背景）、Task 9 |
| TEXT_FLOOR 终版 + 守卫第 10 组 | Task 6 | Task 7（brand 背景）、Task 9 |
| 品牌终值 | Task 7 | Task 9 |
| 活体验收「过」 | Task 11（主人） | 发版决策（不在本计划） |

## 执行纪律

- 开始实现前批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每任务完成即跑该任务验证，红灯/绿灯输出一律落执行日志。
- 设计内红灯共两处：Task 3 门禁首跑（预期红 = 基线复现）、Task 4 步骤 3（钳制用例红）——其余任何红都是事故：停下排查，不猜。
- 行号漂移以符号锚点为准；计划与仓库现实不符立即停下说明，不以记忆重写判据（判据四律①）。
- Task 1 涉活宿主：只读捕获、不改态、不重启；主人不在场则该任务挂起等待，不远程代替目验。
- 当前分支若为 `main`/`master`，开始实现前先取得主人同意。

## 最终验证

1. `pnpm run check` 退出码 0（含 verify:contrast 全绿、守卫第 10 组、lib-sync 零尾差）。
2. `pnpm run verify:contrast` 单独跑退出码 0；撤任一 floor → 红 → 还原 → 绿（判据自证）。
3. `git diff --exit-code -- docs/assets` 零差异。
4. Task 1 preflight 文档与 TEXT_FLOOR/GOLD 手抄值互洽（抽查三行）。
5. Task 11 主人五步目验「过」。
