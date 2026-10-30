# 阅读底（插件面板实色底）实施计划

## 目标

按已批准的 ADR-0022 实现「阅读底」：皮肤激活态下给插件面板路由容器（`section[data-plugin-panel="true"]`）涂纯实色皮色底（明暗两套、随规则层钉），消除「文字浮在壁纸上」的可读性事故；配套守卫钉、headless 门禁、测试钉与发版收编。

## 架构快照

- 机制住共享模块：`src/client/runtime.js` 新增导出 `buildReadingBaseCss(bodyAttribute, opaqueFills)`，与 `buildFullscreenBaseCss`（ADR-0020）同位同律——同色源（riding `--dsw-specific-sidebar-fill` 的 rgb 通道）、同 fail-closed（`opaqueFills === null` 返回空串不挂载）、同事务挂载（`buildEffects` 内随皮 style tag，`stops.push(remove)`）。
- 配方：纯实色 `rgb(...)!important`（ADR-0020 终审配方），明暗两规则，随规则层钉 `position:relative;z-index:0`（ADR-0021 修订二教义）。无状态门：路由容器元素自身挂载/卸载即信号（ADR-0021 修订四「最可靠信号」教义）。
- 声明表零新字段；三皮自动生效；profile 无关（Web/Desktop 同一容器，代码双端一起修，验收按主人裁定先聚焦 Web）。
- 门禁走 0021 修订四配方：headless 复现脚本 + `--gate`（宿主不可达显式 SKIP exit 0）+ served 指纹探针（`--fingerprint-only`）。
- 范围排除（B5）：本轮仅 `data-plugin-panel` 容器一个面；section 外密集页（上下文洞察、工作区等）不在本轮——防顺手扩面的机制保障＝T2 字节钉（选择器字面量钉死生成器输出，实现漂移必红）。

## 全局约束（逐字继承）

- client-only 变更，HMR 生效免重启；**禁在 agent 会话内重启 DSH 服务**（know-how 037）。
- 机制住共享模块、皮肤只持声明表；声明表零新字段；色源唯一＝riding sidebar-fill rgb 通道；皮未 ride → 空串跳过挂载（fail-closed）。
- 固定值配方不随通透度联动（frost 家族同律）。
- 大面积覆盖类规则一律随规则层钉（ADR-0021 修订二）。
- 构建/验证命令须在无沙箱写限制会话执行（esbuild spawn 子进程；热部署写 profile）。
- 验证命令裸退出码，禁入吞码管道；预计 >90s 的命令以 `run_in_background` 起跑。
- 冻结面断言面清点（评审代跑复核 2026-10-30，B10 支撑面）：①`smoke-test.cjs`（466 行）＝具名 tag 特征串断言＋eval(lib/client.js)，无全量 tag 计数钉——新增 `reading.css` tag 不触雷；②`scripts/verify-bundle-guard.mjs`＝字节上限钉（`BASELINE_CLIENT_BYTES = 776_360`，现行 lib/client.js 3,370,517B，本轮新增约 1–2KB，slack 充裕）＋WebP 标记钉（本轮不碰壁纸）——安全；③`scripts/verify-readme-pairing.mjs`＝仅 README 配对钉（本轮不碰 README）——安全。
- 发版按 `docs/developers.md`「发版」节 + know-how 018（npmjs 直查转正、窗口内不重推 tag、两阶段监视）。
- 无额外版本/依赖下限变化（playwright-core@1.62.1 已是 devDependency）。

## 输入工件

- 设计：`docs/adr/0022-plugin-panel-reading-base.md`（已批准，CHECKPOINT B 2026-10-30）
- 取证：`~/workspace/01_docs/research/2026-10-30-dsh-skins-plugin-panel-readability.md`（§8 grill 决议）
- 先例实现：`buildFullscreenBaseCss`（runtime.js）、`scripts/repro-fullscreen-collapse.mjs`、守卫 sidebarRight 钉块（verify-upstream-hooks.mjs ~387-396）、`scripts/hot-deploy.sh`

## 文件结构与职责

- Modify: `src/client/runtime.js` —— 新增导出 `buildReadingBaseCss`（紧随 `buildFullscreenBaseCss` 之后）；`buildEffects` 内 fullscreen 挂载块之后新增 reading 挂载块（复用同处 `opaqueFills` 推导）
- Modify: `scripts/verify-upstream-hooks.mjs` —— sidebarRight 标记钉 if/else 链（grep 锚 `data-sidebar-right-open`）之后插入 plugin-manager 标记钉
- Modify: `tests/runtime-effects.test.mjs` —— 新增 reading-base 测试组（import 面加 `buildReadingBaseCss`）
- Modify: `package.json` —— `test` 脚本在 `repro-fullscreen-collapse.mjs --gate` 之后接线新门禁
- Create: `scripts/repro-plugin-panel-readability.mjs` —— headless 验收门禁（0021 配方）
- Modify: `lib/client.js` —— 构建产物随源码同提交（`pnpm run check` 的 `git diff --exit-code` 要求）
- 已完成不入任务：`docs/adr/0022-*.md`、`GLOSSARY.md`（阅读底词条）、research 报告

## 生成器精确输出（T1 字节钉与 T2 实现的共同契约）

（选择器以本节规格为准：`[data-plugin-panel="true"]` 属性钩子、无标签限定——宿主换标签名仍命中；正文其他处的 `section[data-plugin-panel="true"]` 为描述性口径，不构成实现约束。）

```js
export function buildReadingBaseCss(bodyAttribute, opaqueFills) {
  if (opaqueFills === null) return "";
  const body = `body[${datasetAttribute(bodyAttribute)}]`;
  const panel = ' [data-plugin-panel="true"]';
  return [
    "/* dsh-skins reading base (ADR-0022): solid skin-tone base under the plugin panel route container — the live page paints the whole route transparent over the wallpaper while the official theme paints an opaque bg token (DOM-dump evidence 2026-10-30), so text sits on a translucent token x wallpaper composite; solid matches the official look. Element-bound: the route leaves the DOM with the page, no state gate needed. Layer pin per ADR-0021 amendment doctrine (large-area cover rules always carry the pin). */",
    `${body}${panel}{position:relative;z-index:0;background-color:${opaqueFills.light}!important}`,
    `${body}[data-ds-dark-theme]${panel}{position:relative;z-index:0;background-color:${opaqueFills.dark}!important}`,
  ].join("\n");
}
```

openbmc fixture（`"dshOpenbmcSkin"`, `{ light: "rgb(238, 246, 251)", dark: "rgb(13, 30, 44)" }`）的两条规则字面量（测试字节钉用）：

```
body[data-dsh-openbmc-skin] [data-plugin-panel="true"]{position:relative;z-index:0;background-color:rgb(238, 246, 251)!important}
body[data-dsh-openbmc-skin][data-ds-dark-theme] [data-plugin-panel="true"]{position:relative;z-index:0;background-color:rgb(13, 30, 44)!important}
```

## 任务清单

### Task 1: 环境预检与基线

- 目标：确认工作区可构建、可测试，记录基线。
- 涉及文件：无改动。
- 步骤：
  1. `cd ~/workspace/dsh-skins && test -d node_modules || pnpm install --frozen-lockfile`
  2. `git status --short`（预期恰三项：`M GLOSSARY.md`、`?? docs/adr/0022-plugin-panel-reading-base.md`、`?? docs/plans/2026-10-30-plugin-panel-reading-base-implementation-plan.md`——均为已批准的文档改动，一并入 Task 6 提交，不算脏）
  3. `git branch --show-current`（预期 main；主人批准本计划即在 main 实施的同意）
  4. `pnpm run build`（基线绿，确认工具链健康）
- 验证：四条命令 exit 0。
- 环境前提：danger-full-access 会话（esbuild spawn）。

### Task 2: 红——reading-base 测试组先行

- 目标：先写失败测试，钉死生成器契约。
- 涉及文件：`tests/runtime-effects.test.mjs`
- 接口契约
  - Consumes: 「生成器精确输出」节的实现规格与 openbmc 字面量；文件既有 import 行（`from "../src/client/runtime.js"`）与 DOM stub 挂载套路（照抄 fullscreen 测试组，grep 锚 `dsh-skins/openbmc.fullscreen.css`）
  - Produces: 测试组「reading base」——T3 实现的唯一验收方
- 步骤：
  1. import 行加 `buildReadingBaseCss`
  2. 新增测试组，覆盖六个断言面：
     a. 挂载：openbmc 皮挂载后 `dom.styleTag("dsh-skins/openbmc.reading.css")` 非空
     b. 字节钉：`assert.equal(tag.textContent, buildReadingBaseCss("dshOpenbmcSkin", { light: "rgb(238, 246, 251)", dark: "rgb(13, 30, 44)" }))` + 两条规则行按「生成器精确输出」节字面量逐字断言
     c. 卸载：`official` 回退后 tag 为 null（断言文案对齐既有风格 `"...must unmount with the skin"`）
     d. A→B 切换：meirenzhi→openbmc 后旧皮 reading tag 消失、新皮在场
     e. 三皮 parity：meirenzhi / uefi-harness 挂载测试各加一行 reading tag 在场断言
     f. fail-closed 单元钉：`assert.equal(buildReadingBaseCss("dshXSkin", null), "")`
  3. `node --test tests/runtime-effects.test.mjs`
- 验证：新断言红（`reading.css` tag 不存在 / 导出不存在），既有断言全绿。若因 export 不存在直接语法失败，也算红（记录输出）。

### Task 3: 绿——生成器与挂载块

- 目标：最小实现让 Task 2 全绿。
- 涉及文件：`src/client/runtime.js`
- 接口契约
  - Consumes: 「生成器精确输出」节（逐字实现）；`datasetAttribute`（runtime.js 既有内部函数）；`buildEffects` 内既有 `opaqueFills` 推导块（grep 锚 `const fullscreenTag = styleTag`）
  - Produces: 导出 `buildReadingBaseCss(bodyAttribute, opaqueFills)`；运行时 tag `dsh-skins/<skin.id>.reading.css`（消费方：T5 门禁指纹 `--fingerprint-only`、T7 热部署效果检查；T10 装机复查复用）
- 步骤：
  1. `buildFullscreenBaseCss` 函数之后新增 `buildReadingBaseCss`（含 ADR-0022 注释头，逐字按规格）
  2. 插入点＝`buildEffects` 内外层 `{ const fills = ... }` 作用域块（`opaqueFills` const 声明块，grep 锚 `const fullscreenTag = styleTag`）**内部**、`if (fullscreenCss !== "") { … }` 闭括号之后——与 fullscreen 共享同一 `opaqueFills`；勿放到该块外（超作用域，编译失败）。插入内容：

```js
        // Reading base (ADR-0022): the plugin panel route container paints
        // solid — same opaqueFills derivation as the shell/fullscreen rules;
        // skipped (fail-closed) when the skin does not ride
        // --dsw-specific-sidebar-fill. Profile-neutral: the route container is
        // identical on Web and Desktop.
        const readingCss = buildReadingBaseCss(effects.bodyAttribute, opaqueFills);
        if (readingCss !== "") {
          const readingTag = styleTag(`dsh-skins/${skin.id}.reading.css`, readingCss);
          stops.push(() => readingTag.remove());
        }
```

  3. `node --test tests/runtime-effects.test.mjs` → 全绿
  4. `pnpm run build` 重建 `lib/client.js`
- 验证：步骤 3 exit 0；步骤 4 exit 0；`git status --short` 显示 `lib/client.js` 变更（预期）。

### Task 4: 守卫钉

- 目标：宿主漂移在 check 阶段红灯。
- 涉及文件：`scripts/verify-upstream-hooks.mjs`
- 接口契约
  - Consumes: 既有 `readAll` 助手与 pnpm store 包扫描（`dsh-client-ui-plugin-manager` 已在扫描范围内，无需登记扫描逻辑）；插入锚＝sidebarRight 标记钉 if/else 链（grep 锚 `stale-fullscreen hook dead`）的闭括号之后
  - Produces: `pnpm run verify:hooks` 覆盖 `data-plugin-panel` 钉
- 步骤：插入

```js
const pluginManager = readAll("dsh-client-ui-plugin-manager");
if (!pluginManager) {
	problems.push("reading-base hook dead: dsh-client-ui-plugin-manager not found in the runtime store — package layout drifted (ADR-0022)");
} else if (!pluginManager.includes("data-plugin-panel")) {
	problems.push('reading-base hook dead: "data-plugin-panel" no longer in dsh-client-ui-plugin-manager — the plugin panel route marker drifted, re-derive the ADR-0022 selectors');
}
```

  （缩进对齐文件既有 tab 风格；问题文案与相邻钉同构。）
- 验证：`pnpm run verify:hooks` exit 0（本机 store rc.4 的 plugin-manager lib 含 `data-plugin-panel`，已在活体 DOM 验证过）。人为反向验证：临时把判定串换成 `data-plugin-panel-x` 跑一次应红灯，还原后复跑绿（红自证留输出）；还原后另跑 `git diff --exit-code -- scripts/verify-upstream-hooks.mjs` 确认零差异，防还原失败把脏改动带进 T6。

### Task 5: headless 门禁脚本与接线

- 目标：可红可绿的自动验收，挂入 test 管线。
- 涉及文件：Create `scripts/repro-plugin-panel-readability.mjs`；Modify `package.json`
- 接口契约
  - Consumes: `playwright-core`（devDep 1.62.1；本门禁不消费 `paint-metrics`——主判据是 computed style，非亮像素计数）；live host（默认 `http://127.0.0.1:3080`）；T3 产出的 `dsh-skins/<id>.reading.css` tag
  - Produces: CLI `node scripts/repro-plugin-panel-readability.mjs [--url U] [--viewport WxH] [--fingerprint-only] [--no-fingerprint] [--gate]`；exit 0 PASS/SKIP · 1 FAIL · 2 REVIEW（官方态且非 gate）· 3 INVALID（导航失败/面板缺失）；截图产物 `repro-reading-<n>.png`
- 脚本规格（逐条实现，注释头对齐 repro-fullscreen-collapse.mjs 的 ADR/流程/模式/退出码格式）：
  1. 冷加载 base URL；`goto` 失败且 `--gate` → 打印 `SKIP: host unreachable` exit 0（非 gate 则 exit 1）
  2. 皮肤检测：`Object.keys(document.body.dataset).find((k) => /^dsh.+Skin$/.test(k))`；无 → `--gate` 打印 `SKIP: official skin active` exit 0，否则 exit 2
  3. 指纹探针：`!!document.querySelector('style[data-plugin-css$=".reading.css"]')`；`--fingerprint-only` 模式打印在场与否，exit 0/1（热部署效果检查用）
  4. 主判据（非 fingerprint-only）：点 `getByText(/^(插件|Plugins)$/, { exact: true })` 进插件页，等 `[data-plugin-panel]` 出现；页面内求值：
     - `[data-plugin-panel="true"]` 节点数 === 1（唯一性钉），否则 FAIL
     - 容器 rect.width ≥ 0.6 × innerWidth（页面在位 sanity），否则 INVALID
     - computed `backgroundColor` 解析 alpha === 1（不透明），否则 FAIL
     - 取 `getComputedStyle(document.body).getPropertyValue("--dsw-specific-sidebar-fill")` 解析 rgb 通道，与容器底色通道三元组逐值相等（明暗自适应——token 计算值本身已随模式解析），否则 FAIL
  5. PASS 打印判据行（bg/fill/mode），截图，exit 0
  6. `package.json` 的 `test` 在 `node scripts/repro-fullscreen-collapse.mjs --gate` 之后接 `&& node scripts/repro-plugin-panel-readability.mjs --gate`
  7. `.gitignore` 追加一行 `repro-*.png`（现行仅精确列 repro-cold/collapse/rail 三个文件名，本门禁产物 `repro-reading-<n>.png` 不被覆盖——防 T5 起产物在 git status 留 ?? 噪音、误入 T6 提交）
- 前提动作（先于红自证三连）：页面求值探皮肤态——`Object.keys(document.body.dataset).find((k) => /^dsh.+Skin$/.test(k))` 须在场。**official 态下三连读法全变**（①`--no-fingerprint` 预期 exit 2 REVIEW、②`--gate` 仍 SKIP exit 0、③`--fingerprint-only` 预期 SKIP exit 0），此时不按 FAIL 误判脚本缺陷，改在 Task 7 热部署后补跑标准判据。
- 验证（红自证三连，live host 此刻仍跑旧 lib 1.5.20 **且皮肤激活态**——2026-10-30 实测 dshOpenbmcSkin 暗色在场）：
  - `node scripts/repro-plugin-panel-readability.mjs --no-fingerprint` → **预期 FAIL exit 1**（底色透明＝病灶在身）
  - `node scripts/repro-plugin-panel-readability.mjs --url http://127.0.0.1:9 --gate` → **预期 SKIP exit 0**
  - `node scripts/repro-plugin-panel-readability.mjs --fingerprint-only` → **预期 exit 1**（reading tag 不在场）
- 注意：Task 6 完成前 `pnpm test` 管线的本 gate 段对 live host 会红——属预期，不误判为回归。

### Task 6: checkpoint commit

- 目标：自然边界落盘（repo 惯例：源码与 lib 同提交）。
- 涉及文件：全部已改文件 + `lib/client.js` + `docs/adr/0022-plugin-panel-reading-base.md` + `GLOSSARY.md` + 本计划文档 `docs/plans/2026-10-30-plugin-panel-reading-base-implementation-plan.md`（评审终版，随 T6 入库——docs/plans 已有 16 份入库先例）
- 步骤：`docs/adr/0022-plugin-panel-reading-base.md` frontmatter `status` 改 `accepted`（去「草案」括注——设计已经 CHECKPOINT B 主人批准；实机验收门独立存在于 Task 9，不通过按 ADR 修订流程处置，与 status 语义解耦）→ `git add <上述路径>` → `git commit`（信息体例对齐近期提交：`feat(skins): 插件面板阅读底——路由容器实色免透字（ADR-0022）`）
- 验证：`git status --short` 仅剩无关项或为空；`git log --oneline -1` 显示新提交。

### Task 7: 热部署与 live 实测

- 目标：本机 web profile 预览态，主人验收前置。
- 涉及文件：profile `~/.dsh/profiles/web/node_modules/@iasiv5/dsh-skins/lib/`（由脚本操作）
- 接口契约
  - Consumes: `scripts/hot-deploy.sh`（自带 build + smoke + 单测 + 备份 + 覆盖 + sha 校验，fail-fast；备份落 `~/.dsh-skins-hotfix-backups/<ts>/`）；Task 3/5 产物
  - Produces: live host 运行新 lib（reading tag 在场）
- 步骤：
  1. `bash scripts/hot-deploy.sh`（danger-full-access；client-only，浏览器刷新即生效，不重启服务）
  2. `node scripts/repro-plugin-panel-readability.mjs --fingerprint-only` → exit 0
  3. `node scripts/repro-plugin-panel-readability.mjs` → PASS exit 0，留截图产物
- 验证：三条命令的预期退出码；截图目检插件页实底生效。

### Task 8: 全量门禁

- 目标：收口绿。
- 步骤：`pnpm run check`（含 lockfile/build/smoke/双 repro 门禁/node tests/lint/readme/bundle/hooks/lib diff-free）
- 验证：exit 0。此时 live host 已是新 lib，repro 门禁段应绿。本任务是基线 B8「全门禁绿」的实际达成点（偏离声明见执行纪律：热部署前 repro 门禁对旧 lib 必红，T7→T8 为唯一可达序）。

### Task 9: 主人 web 验收（人工）

- 目标：实机目检通过，放行发版。
- 验收清单（交给主人）：
  1. 刷新页面 → 侧栏进「插件」：整页实色皮色底、壁纸在该页隐去
  2. 亮/暗主题切换各看一遍：两态文字与图标清晰
  3. 「插件市场」Tab：面板正常（dsh-m 自带实底不受干扰）
  4. 任一设置子页（如 Subagent）进入/返回：子页同为实底、无残影
  5. 会话区玻璃感与壁纸不受影响（回归面）
- 验证：主人确认。不通过 → 按 ADR-0022 修订流程回设计，不现场改配方。

### Task 10: 发版 1.5.21 与收编

- 目标：正式版发布、web 装机、账实归一。
- 接口契约
  - Consumes: `docs/developers.md`「发版」节；know-how 018（两阶段监视 `01_docs/dsh-intall-know-how/tools/release-monitor.sh`、npmjs 直查、窗口内不重推 tag）；know-how 008（registry verified/描述收尾，另轮）；产品内 `dshm_upgrade` 通道
  - Produces: `@iasiv5/dsh-skins@1.5.21` 装机；热部署态退役
- 步骤：
  1. `package.json` 版本 → `1.5.21`，提交并推 tag `v1.5.21`（发版提交体例照 git log 近例 `release: 1.5.20`）
  2. GitHub Actions Release run 监视；publish 成功 ≠ 上架——按 018 用 release-monitor.sh 轮询 registry 转正（npmjs 直查）
  3. registry 转正后产品内 `dshm_upgrade` 装机
  4. 收编核验：装机 lib 与发布 tarball 逐字节一致（024 先例）；`--fingerprint-only` 仍绿；备份目录 `~/.dsh-skins-hotfix-backups/` 留档至下次升级
- 验证：npm per-version 200 / dist-tags 覆盖 1.5.21 / 装机一致性核验通过。
- 环境前提：gh/OIDC 发布链路可用；与主人协调发版时点。Desktop 侧安装复验顺延（主人裁定，非阻塞）：届时 Desktop 升级即含本修复，属性核对按 ADR-0022 非阻塞条款补办。

## 执行纪律

- 开始实现前批判性复查本计划；发现缺项/矛盾/命名漂移先修计划再动手。
- 按任务顺序执行，不无声跳步、合并或改目标；每任务完成即跑其验证。
- 阻塞、重复失败或计划与仓库现实不符 → 停下说明，不猜。
- Task 5 之后、Task 7 之前，`pnpm test` 管线的 reading-gate 段对 live host 预期红（旧 lib），勿误判。
- **基线 B8 顺序偏离声明**：B8 字面「全门禁绿 → 热部署」在本机不可达——repro 门禁对 live host 真跑判据，热部署前旧 lib 必红（host 常驻可达，`--gate` SKIP 无法规避；3080 唯一实例红线排除第二实例）。实际序＝两段门禁：热部署前**静态/单测门**（T2/T3 单测 + hot-deploy.sh 内建 build+smoke+单测 fail-fast）→ 热部署后 **live 判据门**（T8 `pnpm run check` 全量绿）。B8 要素全覆盖，仅「全门禁绿」的达成点后移至 T8；此偏离随本计划提交主人批准。
- 全部任务完成后输出修改摘要（文件清单 + 验证结果 + 截图产物路径）。

## 最终验证

1. `pnpm run check` exit 0（Task 8）
2. `node scripts/repro-plugin-panel-readability.mjs` PASS（Task 7/8 双达）
3. `node scripts/repro-plugin-panel-readability.mjs --fingerprint-only` exit 0（装机态复查，Task 10 后再跑一次）
4. 主人 web 验收通过（Task 9）
