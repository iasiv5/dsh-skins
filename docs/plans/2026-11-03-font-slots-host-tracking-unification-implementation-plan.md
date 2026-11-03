# 字体槽位与宿主跟随统一实施计划（ADR-0025）

## 目标

- 三皮字体声明统一为「宿主跟随」：openbmc / uefi-harness / meirenzhi 的 `spec.fonts` 全部为 `{ text: null, code: null }`，删除三皮残留的 alias 层字体 token（openbmc `--dsw-font-family` + `--ds-font-family-code`、uefi `--dsw-font-family`）。
- 字体参数化地基：`defineSkin` 新增必填 `fonts` 段（槽位枚举 `{text, code}`、值三态、fail-closed 校验），派生进 `constantTokens`（形状冻结两层：ADR-0014 生产面七字段与投影声明表字段集均不变——评审 R-1 残尾校正），发射目标恒为宿主 **default 层** token——修复现行 alias 层覆写压制宿主用户字体偏好（`--dsh-font-family-text/code`）的层级冲突 bug。
- 防漂移地基：导出 `HOST_DEFAULT_TEXT / HOST_DEFAULT_CODE`（逐字拷贝自 runtime 0.2.1-rc.5），verify:hooks 新增字面量锚点，宿主升级改栈时红灯提示重拷。
- 守卫：`tests/font-slots.test.mjs` 承载层级守卫（强形式）与发射门 golden；translucency-contract 的字体 golden 迁出，该文件回归纯通透度主题。
- 像素影响面（诚实申报）：唯一可见变化 = openbmc 代码区 JetBrains Mono 回落宿主默认（装了 JBM 的机器）。正文「零像素」的依据与口径（评审 R-3 定稿）：①平台解析链推演——macOS/Windows 三皮删 alias 前后首命中位逐项相同（-apple-system / Segoe UI）；②本机（gates/repro 环境）fc-match 探针实证——三栈首命中位全落同一字体（DejaVu Sans：uefi 前=sans-serif/后=Helvetica Neue，openbmc 前后=Helvetica Neue），repro gate 与 docs/assets（本计划不重生成）零字体像素变化；③Linux fontconfig 别名链存在环境差异面（本机恰为 DejaVu==DejaVu，其他发行版可能不同），该面以 Task 8 主人目验①为实证门。JetBrains Mono 栈封存于 ADR-0025，一行 `code: '<栈>'` 即复活。
- 版本 1.5.27（主人 2026-11-03 发版时定版修订：1.6.0 → 1.5.27，沿 1.5.x patch 流水；纯 `lib/client.js` 变更，发版说明免重启）。

## 架构快照

- **宿主字体三层链（本轮取证，0.2.1-rc.5 实测）**：

```
第1层 用户字体偏好（宿主设置 UI，FONT_ROLES = text/code/terminal）
      → body 内联 style：--dsh-font-family-text / -code / -terminal
        （setFontFamily 是唯一字体写入口；bootstrapFontFamilies 从 document.body.style 读回）
第2层 皮肤默认层（本计划皮肤槽位的发射目标）
      --dsh-font-family-text-default / --dsh-font-family-code-default
第3层 resolved alias（应用消费口，theme 包 body 样式表规则复合两层）
      body{ --dsw-font-family: var(--dsh-font-family-text, var(--dsh-font-family-text-default)), var(--dsh-font-family-text-default);
            --ds-font-family-code: var(--dsh-font-family-code, var(--dsh-font-family-code-default)), var(--dsh-font-family-code-default); }
```

组合语义＝用户偏好前置、皮肤默认殿后、宿主缺省兜底。现状 openbmc/uefi 经 tokenOverrides 直写第 3 层 alias（body 内联恒胜样式表），第 1 层用户偏好被静默压制——本计划把发射目标下沉到第 2 层后三层各归其位。

- **define-skin.js 新增导出（唯一权威定义，ADR-0025）**：

```js
// src/client/skins/define-skin.js
export const FONT_TOKENS = {
  text: "--dsh-font-family-text-default",
  code: "--dsh-font-family-code-default",
};
// 值逐字拷贝自 runtime 0.2.1-rc.5 @deepseek-ai/dsh-client-ui-theme lib/client.js
// 的 base_css_default `:root` 块（--dsh-font-family-text-default / -code-default）；
// 漂移由 scripts/verify-upstream-hooks.mjs 字面量锚点盯住（Task 4）。
export const HOST_DEFAULT_TEXT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
export const HOST_DEFAULT_CODE = '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"';
```

- **`spec.fonts` 形状（必填，进 REQUIRED）**：

```js
fonts: {
  text: null,   // null = 宿主跟随（不发射 token）；三皮统一出厂态
  code: null,
  // 非法值一律 throw：空串、未知槽、数组、缺 light/dark、多余键、非字符串
  // 品牌默认字体写法（未来皮）：text: '"LXGW WenKai", ' + HOST_DEFAULT_TEXT
  // 明暗分档写法：code: { light: "...", dark: "..." }（与 tokenOverrides 形状对齐）
}
```

- **deriveFonts 校验与派生规则（精确契约）**：`fonts` 须为普通对象（null/数组/字符串 throw）；槽键 ∈ `FONT_TOKENS` 键集，未知槽 throw `Unknown font slot: <slot>`；值三态——`null` 跳过不发射、非空字符串 fan-out 为 `{light: v, dark: v}`、空串 throw、对象须自有键恰为 `light`/`dark` 且均为非空字符串（缺键/多余键/空串/非字符串 throw）。输出 `{ [token]: { light, dark } }`。
- **合并点（defineSkin 收尾）**：`deriveFonts(spec.fonts)` 产物并入投影声明表 `table.constantTokens`（浅拷贝合并，不改写 `spec.constantTokens` 原对象）；两者皆空时 `table.constantTokens` 保持 `null`（原语义）。`translucency.js` 零改动——投影核既有 `tokenOverrides = { ...constantTokens }` 通道自动承载。形状不变约束分两层：ADR-0014 工厂 return 生产面七字段（`{id, label, description, Mark, Name, project, builtinAssets}`）零改动（fonts 不出厂）；投影声明表（defineSkin 内部 table，12 字段）仅 `constantTokens` 字段内容变化、字段集不变。
- **层级修复的用户可见语义**：修后用户在宿主设置填字体 → 三皮激活态下都生效（前置）；皮肤经 `fonts` 只能提供「默认」（殿后）；`fonts` 全 null 时 = 宿主跟随。
- **守卫形态（共识第 7 条「三件套」的落地等价式，交付时向主人点名）**：「槽键集守卫」由构造保证承载——`fonts` 进 REQUIRED（缺段 throw）+ `deriveFonts` 槽枚举校验（未知槽 throw），编译期即拦，优于测试后验；`tests/font-slots.test.mjs` 承载余下两件：**层级守卫**（强形式：三皮 tokenOverrides 中 font 系键 ⊆ `Object.values(FONT_TOKENS)`）与**发射门 golden**（三皮全 null ⇒ **每皮** font 系键集合均为空集——逐皮断言，不用交集/并集形态：交集对「单皮发射、他皮零」假绿，评审 R-15）。
- **共识第 7 条「translucency-contract 字体 golden 迁出」**：删 `OPENBMC_FONT_UI`/`OPENBMC_FONT_CODE`/`UEFI_FONT_UI` 常量与 golden 表字体键，golden 头注同步；ADR-0016 历史文档不追改，迁移由 ADR-0025 交代。
- **锚点形态（verify-upstream-hooks.mjs 第 8 组——manifest 现有编号至 7. shell frame，撞号已校正，仿 SERVICE_API_ANCHORS 模式）**：读 `readAll("dsh-client-ui-theme")`，needle 由 `HOST_DEFAULT_TEXT/CODE` 构造——**裸 token 名前缀** `"--dsh-font-family-text-default:" + esc(HOST_DEFAULT_TEXT)`（不依赖相邻声明序：`:root{` 前缀对 code-default 不成立——rc.5 的 :root 块内 code-default 前面是 `;`，评审 Round 1 探针已证），其中 `esc = (s) => s.replaceAll('"', '\\"')`（theme lib 的 base_css_default 是 JS 字符串、引号带反斜杠转义，逐字节比对必须先转义）；失败文案 `font default stack drift: <slot> — host default stack changed; re-copy HOST_DEFAULT_* from the runtime theme package (ADR-0025)`。常量经 import 单源消费（BUBBLE_HOOKS 先例），守卫与皮肤同源。
- **已完成前置（不在本计划任务内）**：GLOSSARY.md「字体」分类三词条（字体槽位 / 宿主跟随 / 用户字体偏好）+「皮肤声明表」枚举同步，已随共识轮落笔。

## 全局约束

- 形状冻结（两层，指涉已按仓库真值校正——评审 R-1）：ADR-0014 工厂 return 生产面恰好七字段（`{id, label, description, Mark, Name, project, builtinAssets}`，register 白名单钉死）不得增删；投影声明表（ADR-0013/0019 内部 table，12 字段：bodyAttribute/titleBrand/favicon/anchor/riding/constantTokens/scrim/blur/glassVar/desktopBlur/wallpaper/staticCss）字段集不得增删——字体派生只入其中 `constantTokens` 字段的内容。
- 三皮 `riding` 与 `cssSegments` **零字节改动**（cssSegments 头注明言「禁止手改字节」——ADR-0004 锚点字节不变式载体）。
- 判据自证四律（developers.md「计划判据四律」）：每条判据命令先在基线跑一遍确认非永真/永假，再进验收；`grep -c` 计 0 时 exit 1，禁入 `&&` 链。
- 退出码卫生：验证输出经管道必须 `set -o pipefail`（dsh-m/docs/CODING-STANDARDS.md）。
- 测试禁入吞码管道（developers.md 热部署条 2026-10-28 实录：裸退出码）。
- `docs/assets` 零差异纪律：本计划不得更新文档截图，发版前 `git diff --exit-code -- docs/assets` 必须零差异。
- 开始实现前确认当前分支：若在 `main`/`master` 且未经主人明确同意，先停下确认。
- 版本下限/依赖限制：无额外全局约束（不改依赖树、不动 `cordis.patch.yml`、不动 `lib/index.js`——免重启纪律的前提）。

## 输入工件

- 设计来源：grill-with-docs 共识清单（本会话 2026-11-03 三轮对齐，主人逐条确认「按推荐」），12 条定案见共识表。
- 取证锚点（实施时复核用，行号为 2026-11-03 读数，以符号锚点为准）：
  - 宿主 default 层定义：`~/.local/share/dsh-runtime/node_modules/.pnpm/@deepseek-ai+dsh-client-ui-theme@*/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js` 内 `base_css_default` 的 `:root{--dsh-font-family-text-default:…}` 与 `--dsh-font-family-code-default:…`。
  - alias 复合规则与用户钩子：同文件 base_css_default 的 `body{--dsw-font-family:var(--dsh-font-family-text,…)` 段；`FONT_ROLES`（text/code/terminal）与 `fontFamilyVariable()`。
  - 现行皮肤字体 token：openbmc `src/client/skins/openbmc-harness/index.js` constantTokens 内 `--dsw-font-family`/`--ds-font-family-code` 两键（~:130-141）；uefi `src/client/skins/uefi-harness/index.js` `--dsw-font-family` 一键（~:84-87）。
  - 字体 golden：`tests/translucency-contract.test.mjs` `OPENBMC_FONT_UI`/`OPENBMC_FONT_CODE`（~:287-288）、golden 键（~:307-308）、`UEFI_FONT_UI`（~:323）与 golden 键（~:341）、golden 头注「④ font stack」字样（~:281-285）。
  - 守卫锚点先例：`scripts/verify-upstream-hooks.mjs` `SERVICE_API_ANCHORS` 循环（~:242-264）、`packages` Map 构建（~:102-124）、头注 manifest 清单（~:14-40）。
  - defineSkin 必填检查与测试基座：`src/client/skins/define-skin.js` `REQUIRED`/`KNOWN_KEYS`/`defineSkin`；`tests/define-skin.test.mjs` `minSpec()`（~:30，现含 `constantTokens: null`）与 REQUIRED 全键参数化用例（~:55-65）。

## 文件结构与职责

- Create: `tests/font-slots.test.mjs` — 层级守卫 + 发射门 golden（字体关注点独立测试文件，decoration-family.test.mjs 先例）。
- Create: `docs/adr/0025-font-slots-and-host-tracking.md` — 裁定记录（三层链取证、槽位表、null 语义、层级守卫裁定、brand/terminal/区域槽预留分析、JBM 封存、catalog 毕业路径）。
- Create: `docs/plans/`（本文件）。
- Modify: `src/client/skins/define-skin.js` — `fonts` 进 REQUIRED；新增 `FONT_TOKENS`/`HOST_DEFAULT_TEXT`/`HOST_DEFAULT_CODE`/`deriveFonts` 导出与收尾合并。
- Modify: `src/client/skins/openbmc-harness/index.js` — 删两键、加 `fonts` 段 + JBM 指针注释。
- Modify: `src/client/skins/uefi-harness/index.js` — 删一键、加 `fonts` 段。
- Modify: `src/client/skins/meirenzhi/index.js` — 加 `fonts` 段。
- Modify: `tests/define-skin.test.mjs` — `minSpec()` 补 `fonts`；新增派生/校验矩阵用例。
- Modify: `tests/translucency-contract.test.mjs` — 字体 golden 迁出。
- Modify: `scripts/verify-upstream-hooks.mjs` — 第 8 组字面量锚点 + 头注 manifest 补条目（现有编号至 7. shell frame，评审 R-8 校正撞号）。
- Modify: `docs/developers.md` — spec 示例加 `fonts` 行 + 字体槽位小节。
- Modify: `package.json` — version 1.5.26 → 1.5.27。
- Build artifacts: `lib/client.js`（构建产物随仓库提交，pre-commit/lib-sync 守卫对账）。

## 任务清单

### Task 1: defineSkin 字体槽位派生（红灯先行）

- 目标：`spec.fonts` 成为必填段；三态校验 fail-closed；派生进 `constantTokens`；导出槽位表与宿主默认栈常量。
- 涉及文件：`tests/define-skin.test.mjs`、`src/client/skins/define-skin.js`。
- 接口契约：
  - Consumes: 现行 `defineSkin` 收尾段与 `REQUIRED`/`KNOWN_KEYS`（define-skin.js ~:40-75）；`minSpec()`（define-skin.test.mjs ~:30）。
  - Produces: `FONT_TOKENS`、`HOST_DEFAULT_TEXT`、`HOST_DEFAULT_CODE`、`deriveFonts(fonts)`（供 Task 3 守卫 import 单源、Task 4 锚点 import 常量）；`fonts` 进 `REQUIRED`。
- 步骤：
  1. `tests/define-skin.test.mjs`：`minSpec()` 补 `fonts: { text: null, code: null }`；新增用例组「字体槽位派生（ADR-0025）」：
     - `fonts` 段缺失 → `Missing required`：测试文件内的手抄 required 数组（:57-60，非 import 自源码）**同步补 `"fonts"`**——该数组正是「数组漂移即有钉可拦」的钉子（用例注释 Q5-① 自述目的），minSpec 补 `fonts` 与数组补 `"fonts"` 同步做，缺一即假绿；
     - null 槽 → `table.constantTokens` 无 font 系键（全 null 且无 constantTokens 的 minSpec 变体 → `constantTokens` 仍为 `null`）；
     - 字符串值 → 发射 `{light: v, dark: v}` 同值 fan-out（键 = `FONT_TOKENS[slot]`）；
     - `{light, dark}` 对象 → 逐字发射；
     - 非法矩阵逐个 `assert.throws`：空串 / 未知槽 / `fonts: null` / `fonts: "x"` / 数组 / `{ light: "a" }` 缺 dark / `{ light, dark, extra }` 多余键 / 非字符串值；
     - 字体派生与 `spec.constantTokens` 共存 → 合并且原对象不被改写（`Object.isFrozen` 不要求，断言原对象键集不变即可）。
  2. 跑红：`node --test tests/define-skin.test.mjs`——**红灯形态 = 整文件 ESM 加载失败**（新用例 import 尚不存在的 `FONT_TOKENS` 等导出，评审 R-12）叠加 Unknown spec key / REQUIRED 未含的用例红；整文件红属本任务设计内预期，红灯输出记录进执行日志。
  3. `src/client/skins/define-skin.js` 实现：`REQUIRED` 数组加 `"fonts"`（`KNOWN_KEYS` 由展开自动含）；按架构快照契约实现 `FONT_TOKENS`/`HOST_DEFAULT_TEXT`/`HOST_DEFAULT_CODE`/`deriveFonts`；收尾处派生合并（两者皆空保持 `null`）；头注补一行「字体槽位派生（ADR-0025）」。
  4. 跑绿：`node --test tests/define-skin.test.mjs` 全绿。
- 验证：`node --test tests/define-skin.test.mjs`；判据自证——步骤 2 的红灯输出落执行日志（证明非永真）。

### Task 2: 三皮接入 fonts 段并删除 alias 层字体 token

- 目标：三皮统一 `fonts: { text: null, code: null }`；openbmc/uefi 删除 alias 层字体 token；JBM 指针注释落位。
- 涉及文件：`src/client/skins/openbmc-harness/index.js`、`src/client/skins/uefi-harness/index.js`、`src/client/skins/meirenzhi/index.js`。
- 接口契约：
  - Consumes: Task 1 的 REQUIRED(`fonts`)（缺段即 throw，接入是被强制的）。
  - Produces: 三皮 `spec.fonts` 就位（Task 3 守卫的断言对象）；openbmc/uefi constantTokens 不再含 `--dsw-font-family`/`--ds-font-family-code`/`--dsw-font-family`。
- 步骤：
  1. openbmc：constantTokens 内删 `--dsw-font-family`、`--ds-font-family-code` 两键（其余键**逐字节不动**）；constantTokens 块之后、`scrim` 之前插入：
     ```js
     // 字体槽位（ADR-0025）：宿主跟随。JetBrains Mono 历史代码栈封存于
     // docs/adr/0025-font-slots-and-host-tracking.md「JBM 封存」，一行
     // code: '<封存栈>' 即复活。
     fonts: { text: null, code: null },
     ```
  2. uefi：constantTokens 内删 `--dsw-font-family` 键；同位置插入 `fonts: { text: null, code: null },`（注释一行：`// 字体槽位（ADR-0025）：宿主跟随。`）。
  3. meirenzhi：constantTokens 块之后、`scrim` 之前插入同款 `fonts` 段 + 一行注释。
  4. 三皮 `riding`/`cssSegments`/其余 constantTokens 键零字节（改完 `git diff` 逐文件目检确认只有上述增删）。
- 验证：`node --test tests/define-skin.test.mjs` 绿（三皮经工厂构造不再 throw）；`node --test tests/translucency-contract.test.mjs` **预期红且仅字体 golden 红**（OPENBMC/UEFI 字体键断言失败）——可观察预期失败，落执行日志；红项之外全绿。
- 注意：meirenzhi 的 `SPEC.constantTokens` 注释块（「用户气泡…」等）零改动。

### Task 3: 字体 golden 迁出 + font-slots 两件套

- 目标：translucency-contract 回归纯通透度主题；新守卫文件就位并全绿。
- 涉及文件：`tests/translucency-contract.test.mjs`、`tests/font-slots.test.mjs`（Create）。
- 接口契约：
  - Consumes: Task 1 `FONT_TOKENS`/`deriveFonts`；Task 2 三皮产物；translucency-contract 的 `projectorFor`/`GOLD`/`FACTORIES` helper 模式（~:98-105：三皮调用形态统一为 `createXxx({ jsx: () => null })`，meirenzhi 仅工厂形参名为 jsxRuntime——文件头段自取，评审 R-7 措辞对齐）。
  - Produces: `tests/font-slots.test.mjs`（后续维护字体断言的唯一住址）。
- 步骤：
  1. translucency-contract：删 `OPENBMC_FONT_UI`/`OPENBMC_FONT_CODE`（~:287-288）、`UEFI_FONT_UI`（~:323）三常量；删 OPENBMC golden 两字体键（~:307-308）与 UEFI golden 一字体键（~:341）；golden 头注（~:281-285）中「④ font stack」字样改为「字体槽位已迁 ADR-0025（tests/font-slots.test.mjs）」；其余零改动。
  2. Create `tests/font-slots.test.mjs`，头注引 ADR-0025；自持 `const ANCHORS = { openbmc: 55, uefi: 55, meirenzhi: 35 }`（GLOSSARY「出厂锚」，注释注明与 translucency-contract GOLD 同源照抄原因：跨测试文件不 import 测试件）；复用 projectorFor 模式构造三皮投影：
     - **层级守卫（强形式）**：三皮 `project(anchor).tokenOverrides` 中匹配 `/font/i` 的键集合 ⊆ `Object.values(FONT_TOKENS)`（`FONT_TOKENS` 从 `../src/client/skins/define-skin.js` import 单源）；
     - **发射门 golden**：**逐皮**断言 font 系键集合为空集（`assert.deepEqual(fontKeys, [])` 形态；非交集/并集形态——交集对「单皮发射、他皮零」假绿，评审 R-15）。三皮全 null ⇒ 零发射，宿主跟随证明。
  3. 跑绿：`node --test tests/font-slots.test.mjs tests/translucency-contract.test.mjs` 全绿（Task 2 的预期红在此关闭）。
- 验证：上述 `node --test` 命令；判据自证（归属本任务，评审 R-4）：临时在任一皮 `spec.constantTokens` 加回 `"--dsw-font-family": { light: "x", dark: "x" }` → `node --test tests/font-slots.test.mjs` 红且失败项为层级守卫 → 还原 → 绿；红绿输出 tee 落盘 scratch log（console 即焚，取证靠落盘）。

### Task 4: verify:hooks 字面量锚点（第 8 组）

- 目标：宿主 default 层栈字面量漂移成为升级绊网；`HOST_DEFAULT_*` 与守卫单源。
- 涉及文件：`scripts/verify-upstream-hooks.mjs`。
- 接口契约：
  - Consumes: Task 1 `HOST_DEFAULT_TEXT`/`HOST_DEFAULT_CODE`（import from `../src/client/skins/define-skin.js`）；既有锚点组结构（~:242-264）与 `packages`/`readAll`（~:102-127）；本机 runtime `~/.local/share/dsh-runtime` 存在（web 机事实）。
  - Produces: `pnpm run check` 链内的新锚组（发版门禁自动承载）。
- 步骤：
  1. 头注 manifest 清单追加第 8 条（现有 manifest 编号至 7. shell frame——头注 ~:40-47、代码 :340，评审 R-8 实证）：`8. font defaults  the :root default stacks for text/code still match HOST_DEFAULT_TEXT/CODE verbatim (ADR-0025 skins emit the default layer, not the alias)`。
  2. 新锚组（仿 SERVICE_API_ANCHORS 的 pkg→anchors→label 循环）：pkg `dsh-client-ui-theme`，label `font default stacks (ADR-0025)`；anchors 两条，构造式用**裸 token 名前缀**（不依赖相邻声明序——`:root{` 前缀对 text-default 成立、对 code-default 不成立：rc.5 的 :root 块内 code-default 前面是 `;` 不是 `:root{`，评审 Round 1 探针已证）：`"--dsh-font-family-text-default:" + HOST_DEFAULT_TEXT.replaceAll('"', '\\"')` 与 code 同构；断言 `source.includes(anchor)`，失败文案按架构快照（含 `re-copy HOST_DEFAULT_*` 指令）。
  3. 跑绿：`node scripts/verify-upstream-hooks.mjs`（本地真跑，非 SKIPPED——输出无 `SKIPPED` token）。
  4. 基线自证：临时把 `HOST_DEFAULT_TEXT` 任一字符改掉 → 守卫红且文案含 `font default stack drift` → 还原 → 绿。红/绿输出落执行日志。
- 验证：`node scripts/verify-upstream-hooks.mjs` + 基线红绿对；本任务不进 CI 假绿面（本地 runtime 真跑，CI 由 ci.yml 装配钉版本 runtime 承接）。

### Task 5: developers.md 作者文档同步

- 目标：新皮肤作者能从文档直接写出正确的 `fonts` 段。
- 涉及文件：`docs/developers.md`。
- 接口契约：
  - Consumes: Task 1 最终 schema（以实现为准回填文档）；spec 示例块（~:40-66，锚点行 `constantTokens: null, // 或 { token: { light, dark } } 常量族（meirenzhi 同款）`）。
  - Produces: 无下游依赖。
- 步骤：
  1. spec 示例块 `constantTokens` 行后插入：`fonts: { text: null, code: null }, // 必填（ADR-0025）：字体槽位；null=宿主跟随；字符串=明暗同栈；{light,dark}=分档；复合宿主默认栈用 HOST_DEFAULT_TEXT/CODE（define-skin.js 导出）前置拼接`。
  2. 示例块后追加「字体槽位」小节（≤10 行）：两类槽位与覆盖面（正文=一切内容区文字含标题/绘画区；代码=代码块与行内 code）、三层级联次序（用户偏好前置/皮肤默认殿后/宿主缺省兜底）、**禁入 alias 层**（`--dsw-font-family`/`--ds-font-family-code` 由层级守卫拦截）、brand/terminal/区域槽为预留不开（指向 ADR-0025）。
- 验证：目检 + `pnpm run verify:readme` 仍绿（README 未动，配对哈希不受影响）。

### Task 6: ADR-0025 落盘

- 目标：裁定记录可考古（含 JBM 封存值与复活写法）。
- 涉及文件：`docs/adr/0025-font-slots-and-host-tracking.md`（Create）。
- 接口契约：
  - Consumes: Task 1-5 全部最终形态（ADR 引用真实符号名与测试文件名）。
  - Produces: 无下游依赖。
- 步骤：按 docs/adr/ 既有篇目形态写（`# 标题` + `---status: accepted / date---` 前置块 + `## 背景` / `## Decision` / `## Consequences` / `## Amendments`，`## Considered Options` 可选——仓内无 ADR-FORMAT 约定文件，评审 R-13 校正悬空引用）：背景（现状不一致 + alias 层压死用户偏好的取证：三层链、body 内联恒胜、bootstrapFontFamilies 读回）；Decision（default 层发射、fonts 必填三态、null=宿主跟随、层级守卫强形式、宿主常量导出+字面量锚点、锚点作用域语义——packages Map 为多版本并集、锚点「任一已装版本命中即过」，升级残留期防漏报而非钉单版本，严格单版本钉版由 CI runtime-pin 装配承担【评审 R-9】、brand/terminal/区域槽预留分析——brand 无用户钩子未来只能直打 alias、terminal 无 default 层与消费面、区域槽待宿主开钩子）；JBM 封存段（完整栈字面量 `'"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace'` + 复活写法一行）；Consequences（唯一像素变化申报、catalog 毕业路径：字体值未来降级为 catalog 默认层、同一发射门合成「用户值 ?? 皮肤默认」）。
- 验证：目检（编号 0025 与 docs/adr/ 现有 0001-0024 不冲突）；文中符号名与代码逐一对照（FONT_TOKENS/HOST_DEFAULT_*/font-slots.test.mjs）。

### Task 7: 版本 bump + 全门禁

- 目标：1.5.27 就绪，`pnpm run check` 全绿。
- 涉及文件：`package.json`、`lib/client.js`（构建产物）。
- 接口契约：
  - Consumes: Task 1-6 完成；developers.md 发版序列第 1-2 步。
  - Produces: 可发布工作树（Task 9 直接 tag）。
- 步骤：
  1. `npm view @iasiv5/dsh-skins@1.5.27 --registry=https://registry.npmjs.org/` 确认目标版本未被占用（developers.md 发版第 1 步；期望 exit码非零/404）。
  2. `package.json` version → `1.5.27`；README 未改动，跳过 `verify-readme-pairing --write`（若有疑虑跑 `pnpm run verify:readme` 确认绿）。
  3. **先 build 后 add 再 check**（顺序不变式：add 必须晚于最后一次以目标版本号执行的 build——Task 1-6 仅跑 node --test 不触发 build，进 Task 7 时工作树 lib/ 仍是 HEAD 旧产物，add 先于链内 build 会暂存旧产物必红；评审 R-14 残尾）：
     - 3a. `pnpm run build`——以 1.5.27 刷新工作树产物（build 确定性：唯一版本相关注入 = `define: { "globalThis.__DSH_SKINS_ASSET_REV__": JSON.stringify(version) }`（build-client.mjs :22-23），无时间戳/随机盐，同版本两次 build 字节相同）；
     - 3b. `git add -A`——暂存区 = 新产物 + 全部源码改动（check 尾位 lib-sync `git diff --exit-code -- lib/index.js lib/client.js` 的语义是**工作树 vs 暂存区**）；
     - 3c. `pnpm run check`——链内 build 再产相同字节（确定性）→ 尾位 diff 零 → 绿（链内 build → node --check → lint → test（含 smoke/repro gate/全部 node --test）→ verify:readme → verify:bundle → verify:hooks → verify:delivery → lib-sync 尾差检查）。pre-commit 在 Task 9 也因此天然过（暂存区已含新产物）。
  4. `git diff --exit-code -- docs/assets`（零差异纪律）。
- 验证：`pnpm run check` 退出码 0（裸退出码，禁吞码管道）；docs/assets 零差异。
- 环境：`test -d node_modules` 先行；repro gate 需本机 chromium（playwright-core 配套，首次 `npx playwright-core install chromium`）；本会话 workspace-write 沙箱下若 esbuild/profile 写被拦，按提权流程征得同意后重试该命令。

### Task 8: 热部署 + 活体三步目验（主人出手）

- 目标：层级修复与像素申报的活体验收。
- 涉及文件：无代码改动；`scripts/hot-deploy.sh` 执行。
- 接口契约：
  - Consumes: Task 7 构建产物；developers.md 热部署条（build → 全量测试 → 备份 profile lib → 覆盖 → sha 校验；回滚命令脚本末尾打印）；know-how 037（client-only 免重启、禁在 agent 会话内重启服务、验证用构建指纹探针）。
  - Produces: 主人「过」的活体验收结论（Task 9 的前置）。
- 步骤：
  1. `bash scripts/hot-deploy.sh`（须在无沙箱写限制的会话执行——profile 写与 esbuild 子进程；若被沙箱拦按提权流程征得同意）。
  2. 浏览器刷新后请主人目验三步：① 三皮各切一遍，正文/标题字体无变化感（零像素实证门，主人环境观测为准；Linux 浏览器的预期差异面已申报于目标节——若主人在 Linux 浏览器目验且发现正文字体变化，按目标节口径判读而非事故）；② 宿主设置填自定义正文字体（如楷体）→ 三皮激活态下都生效（层级修复活证）；③ openbmc 激活看代码区：JetBrains Mono 回落 SF Mono/Consolas（唯一预期可见变化，亲眼过目）。
  3. 主人回「过」即关闭活体验收；任何一步不符 → 停下排查，不得带病进 Task 9。
- 验证：主人显式确认（对话记录）；辅助探针（评审 R-10 校正口径）：`lib/client.js` 含 minified 产物字面量 `rev = "1.5.27"`（verify-bundle-guard 的 `rev\s*=\s*"…"` RegExp 断言）+ `?v=` 模板在位——浏览器资产 URL 的 `?v=1.5.27` 由运行时模板展开，连续串 `?v=<版本>` 按设计不出现于产物。

### Task 9: 提交、tag 与发版轮询

- 目标：v1.5.27 上架 npm 并三键核验。
- 涉及文件：git 索引（commit 含 `lib/` 产物——pre-commit 拦「产物变了 lib 未暂存」）。
- 接口契约：
  - Consumes: Task 7 check 绿 + Task 8 主人「过」；developers.md 发版序列 + know-how 018（npmjs 直查轮询、窗口内不重推 tag）+ know-how 008（registry 描述/verified 收尾）；agent-ops「发版与 npm 轮询」节（tee 必须 `set -o pipefail`；一过性失败先同命令复跑）。
  - Produces: npm `1.5.27` 正式版本。
- 步骤：
  1. 单 commit 全量提交（src + tests + scripts + docs + lib 产物 + package.json），提交信息沿仓史风格：`feat(skins): 字体槽位与宿主跟随统一（ADR-0025，1.5.27）`。
  2. `git tag v1.5.27 && git push origin <branch> v1.5.27`（分支非 main 需按仓库 PR 流程；直接 main 提交以执行纪律的前置分支确认为准）。
  3. GitHub Actions release/publish workflow 跑完后进入 staged 窗口轮询：`npm view @iasiv5/dsh-skins@1.5.27 --registry=https://registry.npmjs.org/` 每 2 分钟一次至 200（scoped 包实测可达约 1 小时；窗口内严禁重推 tag）。
  4. 三键核验齐全才宣布成功：per-version 文档 200、`dist-tags.latest` 推进到 1.5.27、packument `time` 字段推进。
  5. registry 描述/verified 收尾按 know-how 008。
- 验证：三键核验输出（命令与结果落执行日志）；`npm view @iasiv5/dsh-skins version --registry=https://registry.npmjs.org/` 返回 `1.5.27`。

## 任务间接口契约（汇总）

| 产出 | 生产者 | 消费者 |
|---|---|---|
| `FONT_TOKENS` / `HOST_DEFAULT_TEXT` / `HOST_DEFAULT_CODE` / `deriveFonts` | Task 1 | Task 3（守卫 import）、Task 4（锚点 import）、Task 5（文档引用） |
| REQUIRED(`fonts`) + 校验矩阵 | Task 1 | Task 2（三皮接入被强制） |
| 三皮 `spec.fonts` 就位 + alias 键删除 | Task 2 | Task 3（断言对象） |
| `tests/font-slots.test.mjs` | Task 3 | 后续维护（字体断言唯一住址）；Task 7 check 链 |
| 锚点第 8 组 | Task 4 | Task 7 `pnpm run check` |
| 活体验收「过」 | Task 8（主人） | Task 9（发版前置） |

## 执行纪律

- 开始实现前批判性复查整份计划；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行，不无声跳步、合并步或改变任务目标；每任务完成即跑该任务验证，红灯/绿灯输出一律落执行日志。
- 设计内红灯共三处（评审 R-12 补全）：Task 1 步骤 2（整文件 ESM 加载失败 + 用例红）、Task 2（字体 golden 红）、Task 3/Task 4 的判据自证红（各自基线步骤内）——其余任何红都是事故：停下排查，不猜。
- 遇阻塞、重复失败或计划与仓库现实不符（行段漂移、锚点失配），立即停下说明，不以记忆重写判据（判据四律①）。
- 当前分支若为 `main`/`master`，开始实现前先取得主人同意。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

1. `pnpm run check` 退出码 0（含新守卫文件、锚点第 8 组、verify:delivery 包级真启动、lib-sync 零尾差）。
2. `node scripts/verify-upstream-hooks.mjs` 本地真跑绿（无 SKIPPED token）。
3. `git diff --exit-code -- docs/assets` 零差异。
4. Task 8 主人三步目验「过」。
5. Task 9 三键核验齐全 + `npm view` 返回 1.5.27。
