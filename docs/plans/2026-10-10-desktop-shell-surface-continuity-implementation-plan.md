# DSH Desktop 外壳与中央内容区连续性实施计划

> **执行顺序覆写（2026-10-10，用户后续明确改目标并确认）：** 用户要求将已实现的候选直接作为 `@iasiv5/dsh-skins@1.5.2` 发布到 npm 默认 `latest`，随后在另一台 DSH Desktop 上实验（用户选择个人日常 profile）。这覆盖原计划“Task 1 Windows baseline 必须先于 Task 4/5”的发布顺序，但不代表 Desktop A/B 已通过。当前 agent 只在 Linux 修改、检查及发版，不访问或改动该机器/profile；发布为未完成 Windows A/B 的实验构建，不加新的 Desktop verified 文案。Windows marker、enabled、personalization synced、三皮肤 A/B、P=0/100 与 Web fallback 验收仍待用户在目标 Desktop 上执行/反馈；Task 7 文档承诺继续等 Task 6 通过。正式发布使用仓库 `.github/workflows/release.yml` 的严格 `vX.Y.Z` tag + npm OIDC 流程；其默认 npm dist-tag 为 `latest`。OIDC staging 入账可能延迟，依 know-how 018 三键轮询，不在 staging 窗口内重推同一 tag。

## 目标

- 在 Windows DSH Desktop 中改善三套皮肤的浅色表面过渡；以 OpenBMC 深色作为自定义深色参照，并检验 UEFI／美人志深色的协调度。
- 保留现有 AppFrame 几何：中央内容区仅左上角 16px 圆角；caption renderer 背景与侧栏继续共用 `--dsw-specific-sidebar-fill`；内容区继续使用 `--dsw-alias-bg-base`。
- 保留各皮肤品牌色、现有 `panelOpacity` 范围／默认值、浅色 `+0.05` 与深色 `+0.17` 的侧栏增量；不新增设置字段、不改配置 schema、不改半径。
- 用既有 `panelOpacity` 派生 Windows Desktop 专用壁纸背景层轻模糊；P=0 时新增模糊为 0。Web 与无 Windows caption marker 的环境保持原行为。
- 不触碰 Desktop 菜单摆位、系统窗口按钮或 OS 原生材质。若实测问题只剩这些原生层，停止并另立 DSH Desktop/layout 接口计划，不用 CSS Modules 哈希选择器绕过。

## 架构快照

- 当前 DSH `0.2.0-rc.2` AppFrame 在 `[data-windows-titlebar]` 下用 `--dsw-specific-sidebar-fill` 绘制 frame 顶栏伪元素和侧栏；中央内容区使用 `--dsw-alias-bg-base` 并保留左上 16px 圆角。
- dsh-skins 把各皮肤壁纸绘制到皮肤专属 `body::before`（fixed、cover、center）；该背景层在不同视口 y 坐标显示不同画面。半透明 surface 即使读取同一外壳 token，最终像素仍会透出不同的底图内容。现有 `backdrop.blur` 同时服务 Web 与 Desktop，因此不直接改它来做 Desktop-only 调整。
- 新增的内部效果字段 `backdrop.desktopBlur` 只在 `html[data-windows-titlebar]` 下覆盖皮肤自己的 `body::before` 图片层 filter；Web 不含该 marker，继续使用现有 `backdrop.blur`。没有新的 DSH Host API、皮肤设置或持久化字段。
- 首轮 Desktop 视觉候选：额外模糊量 `extra(P)=P/55 px`，`P=panelOpacity`；Desktop 总背景模糊 `min(24, currentBackdropBlur + extra(P))`。OpenBMC 深色不加额外模糊，保留为已认可的参照；其它皮肤/模式按候选验证。P=0 时 `extra=0`，P=55 时为 1px，P=100 时额外量不超过 1.82px。
- `desktopBlur` 是 A/B 候选而非既成发布承诺：对比“当前无 Desktop 附加模糊”与上述候选，若候选不能改善浅色过渡或使壁纸过糊，则停在视觉验收门，不擅自加大数值或改 alpha 间距。

## 全局约束

- 目标仓库为 `dsh-skins`；本轮按用户确认把包版本从 `1.5.1` 提升到 `1.5.2` 并经 npm `latest` 发布，以供 Desktop 实验；尚无新的 Windows Desktop visual verification 承诺。
- 使用仓库既有 Node 22 / pnpm 10.34.5 环境；不新增依赖，不改 `peerDependencies`、`dsh.client.platform`、`CONFIG_VERSION` 或存储字段。
- `panelOpacity` 仍为 0–100、step 1；OpenBMC／UEFI 出厂值 55，美人志 35。现有 alpha 增量（浅色 +0.05、深色 +0.17）、既有壁纸纱和非 Desktop blur 曲线保持不变。
- 保留 DSH host 16px 圆角；不定位 `.centerCol` 等 CSS Modules 类，不给原生 menu/window controls/Mica 等 OS 材质套皮肤。
- Desktop enhancement 仅在稳定公开的 `html[data-windows-titlebar]` marker 下生效；marker 不存在时回退到原来的 skin 背景行为。普通 DSH Web 不得命中新增规则。
- 本轮 agent 只在 Linux 修改、构建与验证，不操作任何 Windows Desktop/profile。用户明确选择自行在另一台 DSH Desktop 的个人日常 profile 安装 `1.5.2` 实验；该手工试验由用户承担其 profile 风险。若后续 agent 代做 Desktop 视觉测试，仍必须使用专用、可丢弃的 Windows test account/profile，不得改动主 profile、会话、工作区或 skin settings。
- Desktop candidate 安装只能使用 Desktop Shell 所拥有的 Plugins 页面 / profile manager；不要使用标准 `dsh plugin --profile desktop` CLI carrier，除非实际 Desktop capability preflight 明确确认该入口受支持。
- 浏览器/桌面验收不得泄露会话内容：空 test account、折叠工作区，截图只留在 gitignored `.artifacts/`，不提交到 `docs/assets`。
- 已按共识更新 `GLOSSARY.md` 的「通透度」语义；本计划不得把原生菜单布局或 OS 按钮材质扩进该术语。

## 输入工件

- 设计来源：本会话 `/grill-with-docs` Q1–Q10 共识；Q9 采用原生 DSH 的结构层级作浅色参照、OpenBMC 深色作自定义深色参照，Q10 同意保留壁纸可见度并做 Desktop-only 轻模糊 A/B。
- `GLOSSARY.md`：已确认的「通透度」语义。
- 当前 SkinEffects 契约：`docs/plans/design-1.0.0-personalization.md` §3/§3a。
- `src/client/runtime.js` 的 `backdropCss()`／`variablesCss()`、`src/client/personalization/projector.js` 的 `normalizeEffects()`。
- `src/client/skins/openbmc-harness/index.js`、`src/client/skins/uefi-harness/index.js`、`src/client/skins/meirenzhi/index.js` 的 `project()`。
- 当前 Windows layout 合约：`@deepseek-ai/dsh-client-ui-layout@0.2.0-rc.2` 的 `AppFrame` 与 `html[data-windows-titlebar]`；DSH theme presenter 以 `color-scheme` 与 body alias token 分发明暗色。
- Desktop Plugins 页面证据：`@deepseek-ai/dsh-client-ui-plugin-manager/README.zh.md` 的「安装一个组合包」支持 absolute local path/tarball；`@deepseek-ai/dsh-plugin-manager` 的 `inspect()`／`installBundle()` 由 Desktop shell 服务提供，并由 Desktop 自己持有 profile。
- Desktop profile 操作红线：`01_docs/dsh-intall-know-how/020-dshm-desktop-immediate-install-channel.md`；本计划不改等待期策略。
- 测试入口：`tests/personalization-projector.test.mjs`、`tests/meirenzhi-skin.test.mjs`、`tests/runtime-effects.test.mjs`、`tests/upstream-hooks.test.mjs`。
- 仓库验证入口：`package.json` scripts、`docs/developers.md` 与 `scripts/capture-previews.mjs`。

## 文件结构与职责

- Create: `docs/plans/2026-10-10-desktop-shell-surface-continuity-implementation-plan.md` — 本实施计划。
- Modify: `docs/plans/design-1.0.0-personalization.md` §0 与 §3a — 记录已冻结 SkinEffects backdrop 契约的可选 Desktop-only blur 扩展及 fallback。
- Modify: `src/client/personalization/projector.js` — 验证并保留可选 `backdrop.desktopBlur: { light, dark }`，取值为有限数值 0–24px。
- Modify: `src/client/runtime.js` — 只在 `html[data-windows-titlebar]` 下为皮肤拥有的 `body::before` 输出 Desktop blur 规则；保留原 base/Web 规则及其 teardown 行为。
- Modify: `src/client/skins/openbmc-harness/index.js` — 生成 light Desktop 候选，dark 保留 OpenBMC 基线。
- Modify: `src/client/skins/uefi-harness/index.js` — 生成浅／深 Desktop 候选，维持紫色 token 与 alpha 增量。
- Modify: `src/client/skins/meirenzhi/index.js` — 按现有 P=35 二次曲线生成浅／深 Desktop 候选，保留壁纸纱、基础 blur 与品牌色。
- Modify: `tests/personalization-projector.test.mjs`、`tests/meirenzhi-skin.test.mjs`、`tests/runtime-effects.test.mjs`、`tests/upstream-hooks.test.mjs` — 固定字段校验、投影值、Desktop selector、Web fallback 与极值行为。
- Regenerate: `lib/client.js` — 由 `pnpm run build` 从 `src/client/` 生成，必须和源码一起交付。
- Modify after Desktop E2E passes: `README.md`、`README.en.md`、`README.i18n.yaml`、`docs/developers.md` — 同步说明 Windows Desktop renderer 背景效果、验证方式、原生控件边界及已验证版本。
- Already updated: `GLOSSARY.md` — Q6 已按确认更新；除非审阅发现语义错误，不重复改写。
- No change: `docs/assets/`、`package.json`、`pnpm-lock.yaml`、`cordis.patch.yml`、DSH host/layout source。

## 任务清单

### Task 1: 准备隔离的 Windows Desktop test account 与稳定版 baseline

- 目标：所有 Desktop baseline/candidate 证据都来自专用 test account/profile；不触碰用户主 profile、原会话或个人设置。
- 文件：测试图与状态记录写入 gitignored `.artifacts/release-gates/v1.5.1/desktop-surface/baseline/`；test account 的 DSH_HOME/profile 与产品日常账户分离。
- 接口契约：Consumes 用户提供的专用 Windows test account、DSH Desktop `0.2.0-rc.2` 和已发布 `@iasiv5/dsh-skins@1.5.1`；Produces stable-package baseline 与空 test account 的 UI 初始条件。
- 验证范围：测试 account/profile 隔离、baseline bundle 已启用、personalization state 完成同步、空会话与截图无隐私内容。

- [ ] Step 1: 确认隔离测试环境
- Action: 使用专用 Windows test account 登录，并启动已安装的 DSH Desktop `0.2.0-rc.2`；确认它使用该账户独立的 DSH_HOME/Desktop profile。若桌面安装是 per-user，则只在这个 test account 使用官方安装包安装同一 Desktop build。不得复用或写入个人 account/profile；没有隔离测试账号时停下，请 owner 提供。
- Expected: Desktop 与所有本地 sessions/preferences 归属 test account；个人 profile、workspace 与浏览器状态不在测试操作范围。
- [ ] Step 2: 通过 Desktop-owned Plugins 页面安装 stable baseline
- Action: 确认 Desktop 自带的 Plugins 页面可读取 Desktop profile；在 Add plugin 输入 `@iasiv5/dsh-skins@1.5.1` 做 non-mutating `inspect`，确认命中正确 package 与 bundle patch 后再安装。安装完成后明确点击页面提供的「立即启用」，不可直接关闭对话框；若 manager 返回 `restart-required`，先完整退出并重启 Desktop，再继续检查；从 `listBundles` 确认该 bundle `version=1.5.1`、`enabled=true`；等待 `window.__DSH_SKINS__.personalization.getState().status === 'synced'`，再用 `window.__DSH_SKINS__.active()` 确认 runtime 已加载。
- Run (Windows PowerShell, read-only):
  ```powershell
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
  $ProfileDir = Join-Path $DshHome 'profiles\desktop'
  $Manifest = Get-Content -Raw (Join-Path $ProfileDir 'package.json') | ConvertFrom-Json
  $Manifest.dependencies.'@iasiv5/dsh-skins'
  Select-String -Path (Join-Path $ProfileDir 'pnpm-lock.yaml') -Pattern '@iasiv5/dsh-skins' -Context 1,8
  ```
- Expected: baseline 通过 Desktop shell-owned manager 安装；`listBundles` 确认 `version=1.5.1` 且 `enabled=true`；本地日志记录 exact spec、resolved version、tarball/source 与 integrity；等待 personalization 状态为 `synced`。若 Plugins 页面不可用或 inspect/age/peer 预检拒绝安装，停止，不改等待期策略或使用个人 profile。
- [ ] Step 3: 检查 Desktop marker 与取景条件
- Action: 在 Desktop DevTools Console 执行 `document.documentElement.hasAttribute('data-windows-titlebar')`；记录截图画布 1056×770、Windows display scale 与应用 zoom；UI 设为 zh-CN。
- Expected: marker 表达式为 `true`；若 false 或无法读到，停止，不基于不匹配的宿主布局验收。
- [ ] Step 4: 捕获 stable factory 与受控 baseline
- Action: 确认 test account 是空环境，打开空会话并折叠所有工作区。分别捕获三套皮肤浅色／深色 factory 状态，共 6 张 PNG：`openbmc-light-factory.png`、`openbmc-dark-factory.png`、`uefi-harness-light-factory.png`、`uefi-harness-dark-factory.png`、`meirenzhi-light-factory.png`、`meirenzhi-dark-factory.png`。在 test account 的 Personal Library 选同一张无隐私测试壁纸，把 `panelOpacity` 设为 55，再捕获 6 张：`openbmc-light-p55-common-wallpaper.png`、`openbmc-dark-p55-common-wallpaper.png`、`uefi-harness-light-p55-common-wallpaper.png`、`uefi-harness-dark-p55-common-wallpaper.png`、`meirenzhi-light-p55-common-wallpaper.png`、`meirenzhi-dark-p55-common-wallpaper.png`。
- Expected: baseline 12 张尺寸一致且不含会话标题/正文；日志记录 skin/scheme/P/wallpaper、image/overlay scrim、base blur、resolved stable package version/source/hash。若没有合适的共同测试壁纸，先请 owner 提供，不用含 UI/文字的截图。
- [ ] Step 5: 检查 baseline 工件
- Check: 逐张查看 12 张 stable baseline 与 metadata；确认截图和空会话仅在 disposable test account，主用户 profile 无改动。
- Expected: stable package 与测试样本可复现；主 profile、原 session/workspace 和设置未受影响。

### Task 2: 更新 SkinEffects backdrop 契约并实现 Desktop-only runtime 效果

- 目标：冻结可选 `desktopBlur` 语义，并在 runtime 中只为 Windows Desktop marker 生成壁纸层 blur。
- 文件：`docs/plans/design-1.0.0-personalization.md` §0／§3a、`src/client/personalization/projector.js`、`src/client/runtime.js`、`tests/personalization-projector.test.mjs`、`tests/runtime-effects.test.mjs`、`tests/upstream-hooks.test.mjs`。
- 接口契约：
  - Consumes: 现有 SkinEffects `backdrop.blur`、`imageLight/imageDark` 与 `bodyAttribute`。
  - Produces: 可选 `backdrop.desktopBlur: { light, dark }`，值为有限数 0–24px；只在 `html[data-windows-titlebar]` 下覆盖皮肤的 `body::before` 背景图 filter；缺省或 marker 不存在时沿用原行为。
- 验证范围：`NaN`、`Infinity`、`-Infinity`、负值和 >24 均拒绝；Desktop selector 只匹配 Windows marker；普通 Web 的 CSS 规则与现有 blur 完全不变。

- [ ] Step 1: 写失败的契约与 runtime/bundle 测试
- Change: 在 `tests/personalization-projector.test.mjs` 添加 desktopBlur 缺省、合法 pair、NaN、正负 Infinity、负值和大于 24 值的测试；在 `tests/runtime-effects.test.mjs` 添加 marker-scoped CSS、blur=0 不生成 filter/transform、Web base backdrop 保持不变的测试，并对运行时生成的 marker + body selector 组合做断言；在 `tests/upstream-hooks.test.mjs` 对 built `lib/client.js` 分别检查 `html[data-windows-titlebar]` marker 与三套 skin body attribute 均存在，并确认没有依赖 Host `.centerCol` CSS Module selector。完整组合 selector 是 runtime 用 `bodyAttribute` 动态拼接的结果，不应要求其作为静态完整字符串出现在 bundle 中。
- [ ] Step 2: 运行并确认失败
- Run:
  - `node --test tests/personalization-projector.test.mjs tests/runtime-effects.test.mjs`
  - `pnpm run build && node --test tests/upstream-hooks.test.mjs`
- Expected: 第一条因 desktopBlur 未被 normalizer 保留、runtime 未生成 marker rule 而失败；第二条从未修改的源码重建旧 bundle 后，因 Desktop selector 缺席而失败；现有皮肤行为测试不应新增失败。
- [ ] Step 3: 更新接口文档与 runtime
- Change: 在 `docs/plans/design-1.0.0-personalization.md` §0 追加日期决策，§3a 扩展 SkinEffects backdrop contract（optional pair、0–24px、Windows marker、Web fallback、无持久化/schema 影响）；`normalizeEffects()` 验证并冻结 optional pair；`backdropCss()` 在基础 Web rule 后生成 Desktop marker rule，为非零 blur 配套 `transform:scale(1.02)`，0px 不输出 filter/transform。不得加入 Hash/class selector。
- [ ] Step 4: 运行并确认通过
- Run: `node --test tests/personalization-projector.test.mjs tests/runtime-effects.test.mjs && pnpm run build && node --test tests/upstream-hooks.test.mjs`
- Expected: interface/runtime tests 通过；built client 含 marker-scoped rule；P0/Web 无新增 backdrop effect。

### Task 3: 在三套 skin 中投影 Desktop blur 候选

- 目标：用现有 `panelOpacity` 生成轻度 Desktop 背景层 blur，保持 alpha delta、Web blur、默认值和存储契约不变。
- 文件：`src/client/skins/openbmc-harness/index.js`、`src/client/skins/uefi-harness/index.js`、`src/client/skins/meirenzhi/index.js`、`tests/personalization-projector.test.mjs`、`tests/meirenzhi-skin.test.mjs`。
- 接口契约：
  - Consumes: Task 2 `backdrop.desktopBlur` pair、各皮肤现有 `panelOpacity` 与 `backdrop.blur`。
  - Produces: `extra(P)=P/55 px`；Desktop total `min(24, currentBackdropBlur + extra(P))`。OpenBMC dark 不加额外 blur；OpenBMC light 与 UEFI／MeirenZhi 两种模式应用候选。
- 验证范围：factory P、P=0、P=55、P=100；固定 `--dsw-specific-sidebar-fill`／`--dsw-alias-bg-base` 数值和 +0.05/+0.17 delta；普通 Web 的 `backdrop.blur` 逐字不变。

- [ ] Step 1: 写失败的三皮肤投影金值
- Change: OpenBMC、UEFI factory P=55 与 MeirenZhi factory P=35 的 Desktop blur pair 测试覆盖浅/深；并对 P=0/P=55/P=100 锁定 extra 曲线、上限和 OpenBMC dark baseline。
- [ ] Step 2: 运行并确认失败
- Run: `node --test tests/personalization-projector.test.mjs tests/meirenzhi-skin.test.mjs`
- Expected: 新 desktopBlur golden 断言失败；既有 token alpha、壁纸纱、base blur 金值保持通过。
- [ ] Step 3: 更新三个 skin projectors
- Change: 各 `project()` 从自身现有 P 曲线求出 `desktopBlur` pair；OpenBMC dark 使用原 `backdrop.blur`，其它目标模式按 `min(24, base + P/55)`；不动 `tokenOverrides` 的底色或 alpha delta。
- [ ] Step 4: 运行并确认通过
- Run: `node --test tests/personalization-projector.test.mjs tests/meirenzhi-skin.test.mjs`
- Expected: 三套 skin 的 Desktop blur/端点 golden 通过；Web `backdrop.blur`、alpha 与 asset semantics 与现有 golden 完全一致。

### Task 4: 生成并暂存可供 Desktop Plugins 页面安装的 candidate tarball

- 目标：从已验证源码生成可读的本地 tarball，并送到 disposable test account 的 Windows `%TEMP%`。
- 文件：`dsh-skins/.artifacts/release-gates/v1.5.1/desktop-candidate/`（本地产物，不入库）。
- 接口契约：Consumes Task 2–3 的源码与生成 bundle；Produces 一个 `@iasiv5/dsh-skins@1.5.1` tarball 与可核对 SHA-256。
- 验证范围：target Desktop Plugins 页面可 `inspect()` absolute local tarball；profile 安装只由 Desktop shell-owned Plugin Manager 完成。

- [ ] Step 1: 构建并打包
- Run: `pnpm run build && pnpm pack --pack-destination .artifacts/release-gates/v1.5.1/desktop-candidate`
- Expected: pnpm 输出一个 `.tgz`，包内 `lib/client.js` 含 Desktop marker rule，且含 `cordis.patch.yml`；记录实际文件名及 SHA-256。
- [ ] Step 2: 在 test account 暂存 candidate
- Action: 通过 owner 批准的共享目录/文件传输方式，把上述 `.tgz` 放到 disposable Windows test account 的 `%TEMP%\dsh-skins-candidate.tgz`；用 PowerShell `Get-FileHash "$env:TEMP\dsh-skins-candidate.tgz" -Algorithm SHA256` 与 Step 1 记录值比对。若无获批传输通道，停止并请 owner 提供一个；不启动临时 HTTP server。
- Expected: Windows temp tarball 与仓库 build artifact 的 SHA-256 相同。

### Task 5: 通过 Desktop-owned Plugins 页面安装并验证 candidate

- 目标：使用 Windows Desktop 实际拥有的 package-manager service 安装 candidate，并确认 candidate bundle 已启用且渲染。
- 文件：只修改 disposable test account 的 Desktop profile；不触碰主用户 profile、普通 Web profile 或 Desktop Host 文件。
- 接口契约：Consumes Task 4 的绝对 tarball 路径；Produces Desktop manager inspection result、enabled candidate bundle、loaded marker rule。
- 验证范围：Desktop Plugins 页必须可用；先 non-mutating `inspect`，只确认绝对 tarball spec 被接受及本地路径可读，不期待 tarball inspect 返回包名/版本/bundle metadata；包名、版本与 patch 由 Task 4 manifest 证据及安装后的 `listBundles`/style tag 核验；不使用标准 `dsh plugin --profile desktop` CLI，也不绕过 `minimumReleaseAge`。

- [ ] Step 1: 验证 Desktop manager 与 stable baseline 状态
- Action: 在 disposable test account 的 Desktop Plugins 页面只读查看 `listBundles`，确认 stable baseline `@iasiv5/dsh-skins@1.5.1` 为 enabled，页面可返回 package spec/version；若没有 Desktop-owned Plugins 页面或 baseline 不可读，停止，不调用标准 `dsh` CLI。
- Expected: manager capability 与 test profile 状态明确，尚未改变 profile。
- [ ] Step 2: 预检 absolute local tarball spec
- Action: 在 Add plugin 输入框粘贴 PowerShell `Join-Path $env:TEMP 'dsh-skins-candidate.tgz'` 输出的绝对路径，等待 Desktop shell `pluginManager.inspect()` 结果；只读确认 `Test-Path "$env:TEMP\dsh-skins-candidate.tgz"` 为 true 且 SHA-256 与 Task 4 相同。
- Expected: `inspect` 只返回 `status=accepted`、`kind=tarball`、`bundle=null` 是正常结果（tarball inspect 不读取包内 manifest）；包名/版本/patch 由 Task 4 的 tarball manifest 和安装后的 `listBundles` 验证。若 inspect 拒绝 spec 或文件/hash 不符，停止、不安装。
- [ ] Step 3: 在现有 stable package 上安装 local candidate
- Action: 不卸载 stable baseline；从 Add plugin 对话框用已 inspect 的绝对 tarball spec 执行 in-place install；安装完成后点击页面提供的「立即启用」，不可直接关闭。若 Desktop manager 返回 `restart-required`，按 Step 4 完全退出并重启 Desktop；不编辑 profile 文件或等待期策略。
- Expected: Desktop manager 成功把当前 test profile 的 dependency source 更新到本地 tarball，candidate 已启用；若 manager 拒绝已安装包的本地 spec，停止并向 owner 报告，不改用标准 CLI。
- [ ] Step 4: 重启并读取 candidate 的可观察标识
- Action: 完整退出并重新启动 Desktop；确认 test profile 的 personalization `getState().status === 'synced'`；从 `listBundles` 核对 enabled package version，再切换三套 skin，在 DevTools Console 执行 `(() => { const id = window.__DSH_SKINS__.active(); const tag = document.querySelector('style[data-plugin-css="dsh-skins/' + id + '.backdrop.css"]'); return { id, desktopRule: tag?.textContent.includes('html[data-windows-titlebar]') ?? false }; })()`。
- Expected: `listBundles` 显示 candidate `@iasiv5/dsh-skins@1.5.1` enabled；每个 skin 的 `id` 符合当前切换状态且 `desktopRule === true`；candidate 保持安装及启用供 Task 6 A/B。

### Task 6: 执行 center-corner Desktop A/B 与 Web fallback 检查

- 目标：直接验收中央内容区左上 16px arc 与相邻外壳的过渡；不把已共享的 caption/sidebar fill token 误当成唯一验收点。
- 文件：候选证据写入 gitignored `.artifacts/release-gates/v1.5.1/desktop-surface/candidate/`，不提交用户截图。
- 接口契约：Consumes Task 1 stable baseline、Task 3 projector map、Task 5 已加载 candidate；Produces 同条件全景与 corner crop、scrim/overlay/blur 记录及 pass/fail rubric。
- 验证范围：三 skin × light/dark Desktop factory 与 P=55 common-wallpaper 场景；P=0/P=100 projector endpoints；普通 Web marker absence。

- [ ] Step 1: 捕获 candidate 与圆角 crop
- Action: 用 Task 1 完全相同的尺寸、scale、zoom、空会话及工作区状态，重复六张 factory 和六张 P=55 截图；候选 PNG 沿用 baseline 文件名并存入 `candidate/`。每张全景图另存 64×64 px crop：以中央内容区左上圆角可见点为坐标，向 shell 一侧和标题栏一侧各取 16px，再向内容区内延伸 48px；baseline/candidate crop 使用同一记录坐标。记录每张图的 wallpaper ref、P、image/overlay scrim、base blur、desktopBlur。
- Expected: baseline/candidate 全景与 crop 成对；每个 crop 同时显示外壳、完整圆角弧和内容表面；不使用 CSS Modules class 定位。
- [ ] Step 2: 检查 P=0/P=100 endpoint
- Action: 在每个 skin 的 light/dark Desktop 中把 `panelOpacity` 设为 0 和 100，观察壁纸可见度与正文/菜单可读性，并记录矩阵结果；测试 profile 是 disposable，不需恢复生产值。
- Expected: projector tests 覆盖每个 skin × scheme 的两个端点；P=0 的新增 blur 为 0、内容底色/遮罩归零而外壳最低填充仍可读；P=100 现有 base blur cap/α=1 合约不变。
- [ ] Step 3: 按固定 rubric 判读边角
- Check: 并排比较 baseline/candidate 的 64×64 corner crops 与全景。记录：(a) caption backing/侧栏继续共享同一个 renderer fill token；(b) 16px arc 读作内容区边界而非独立凸起，其他角与分隔线保持直角；(c) wallpaper 仍可辨认；(d) 正文/网页菜单可读。OS 原生窗口按钮/菜单只作观察项，不纳入 dsh-skins 视觉 pass/fail；若 skin overlay 覆盖其 hit area，记录为集成风险。
- Expected: OpenBMC dark 不退化；OpenBMC light 与 UEFI/MeirenZhi light 的透底断层减弱；dark UEFI/MeirenZhi 对齐 OpenBMC dark 的层级感且保留品牌色；alpha delta 与 host radius 不变。若 1px@P55 candidate 未改善 seam 或壁纸辨识度下降，停止并请求重新对齐，不提高 blur 或改 alpha/radius。
- [ ] Step 4: 验证普通 Web fallback
- Action: 在普通 DSH Web 页面 DevTools 执行 `document.documentElement.hasAttribute('data-windows-titlebar')`；确认返回 `false`。同时以 Task 2 runtime test 与 built bundle test 复核所有新增 blur selector 都以 `html[data-windows-titlebar]` 为祖先；不在 Web profile 安装候选。
- Expected: Web marker 为 false，Desktop-only rule 不匹配普通 Web；Desktop profile candidate install 不改变 Web profile。此项不以旧版 Web 截图冒充 candidate Web E2E。
- [ ] Step 5: 复核隔离与保存结果
- Check: 确认测试账号与产品日常账号不同；确认所有 A/B 截图/日志都不含 session title/body；保留 test profile candidate 供 owner 审阅，不自动删除或改动主 profile。
- Expected: A/B 证据可复核，生产 Desktop/Web profiles 未被修改；测试 profile 的稳定 baseline 与 candidate 版本/source/hash 都有记录。

### Task 7: 更新双语用户文档与开发者验收边界

- 目标：准确描述 Desktop renderer 背景效果、单一通透度语义、原生控件边界与 Web/Desktop 两条验证方式。
- 文件：`README.md`、`README.en.md`、`README.i18n.yaml`、`docs/developers.md`；`GLOSSARY.md` 已完成，不重复修改。
- 接口契约：Consumes Task 6 通过的 Desktop E2E/owner visual approval；Produces 中英文一致的支持版本与原生层边界说明，以及 Desktop 手动验收指引。
- 验证范围：不声称 skin 控制 native menu placement、window buttons 或 OS material；未通过 Desktop E2E 时不加入 Desktop verified 版本承诺。

- [ ] Step 1: 更新中英文用户 README
- Change: `README.md` 与 `README.en.md` 同步说明 Windows Desktop renderer caption/sidebar backing 跟随 skin shell fill；`Translucency` 仍为单一 panelOpacity，P=0 时 shell 可保留最小可读填充；原生菜单排布、系统按钮与 OS 材质仍由 DSH/OS 控制。FAQ 仅在 Desktop E2E 通过后把 `0.2.0-rc.2` 列入 Windows Desktop renderer verification。
- [ ] Step 2: 更新开发者验证说明
- Change: `docs/developers.md` 本地验证节说明 `capture-previews.mjs` 只验证普通 Web；Windows Desktop enhancement 必须通过 marker/load 预检与 Task 6 手动矩阵；local tarball candidate 通过 Desktop-owned Plugins 页面，而非未验证的标准 CLI carrier。
- [ ] Step 3: 重新记录并验证 README pair
- Run: `node scripts/verify-readme-pairing.mjs --write && pnpm run verify:readme`
- Expected: `README.i18n.yaml` 记录新的 zh/en blob hashes，输出 `README pairing OK`；开发者文档与 Task 6 通过条件一致。

### Task 8: 完成仓库门禁与安装包检查

- 目标：确认源码、bundle、测试、README、hook guard 与打包文件一致。
- 文件：生成的 `lib/client.js`、`docs/assets/` 检查与 npm artifact。
- 接口契约：Consumes Task 2–7 的完成结果；Produces 可以由普通编码 agent/人工执行的已审阅实现候选。
- 验证范围：完整项目测试、bundle/README/hook guards、包文件清单和截图工件边界。

- [ ] Step 1: 完整项目检查
- Run: `pnpm run check`
- Expected: build、语法、smoke、全测试、README pairing、bundle guard、upstream hooks 全通过。
- [ ] Step 2: 文档截图资产边界检查
- Run: `git diff --exit-code -- docs/assets`
- Expected: exit code 0；Web preview assets 未被 Desktop 视觉迭代顺手改写。
- [ ] Step 3: 安装包清单检查
- Run: `pnpm pack --pack-destination .artifacts/release-gates/v1.5.1/package`
- Expected: `pnpm pack` 成功；tarball 包含更新后的 `lib/client.js`、cordis patch、双语 README 与必需 manifest 文件，不包含 `.artifacts` 截图。

## 执行纪律

- 开始实现前先批判性复查整份计划；如果发现缺项、矛盾、命名不一致或验证命令无效，先修计划。
- 执行顺序补充（2026-10-10，按用户最新指示）：Task 1 Windows stable baseline 尚未就绪时，可先在 Linux 完成 Task 2–3 的纯源码与自动测试；这不豁免 Task 1。Task 1 必须在 Task 4 打包/传输和 Task 5 candidate 安装之前完成；在 baseline 通过前不得改动任何 Desktop profile 或安装 candidate。其余仍不得跳过 baseline、enabled 状态、alpha 不变式、Desktop marker、candidate manager capability check 或 A/B 后的数据检查。
- 每个代码任务都先补失败测试、运行确认失败，再做最小实现并运行其验证命令；每个文档/手工任务均有明确的前后状态检查。
- Windows candidate 只在 disposable test account 使用 Desktop-owned Plugins 页面安装；保留 stable baseline，在已安装包上 inspect absolute tarball spec 并做 in-place install，依 manager 的 `restart-required` 结果完整重启后验证 candidate。若该 manager 页面不支持本地 tarball、拒绝 spec 或要求绕过策略，立即停止，不卸载 active baseline、不调用未验证的标准 `dsh plugin --profile desktop` CLI。
- Desktop 视觉 A/B 是人工 reviewer gate：截图不满足 Task 6 通过条件时立即停止，不要擅自调大 blur、改 alpha delta、改圆角或碰 native 控件。
- 如果 Desktop 问题只能通过改变窗口按钮/OS 材质或私有 CSS Modules 类修复，停止此计划，另行提出 DSH host 接口设计；不要把 Host/OS 改动塞进 dsh-skins PR。
- 不启动替代 DSH Web 服务；普通 Web marker 检查基于现有页面；Web profile 不安装 candidate。
- `lib/client.js` 与源码必须一起提交；不改 package version、依赖、peer 范围或配置 schema。
- 全部任务完成后输出修改摘要，并保留 `.artifacts` 内 Desktop evidence；不把含用户界面的测试截图提交到 README assets。

## 最终验证

从 `dsh-skins` 仓库根目录，在 Node 22 / pnpm 10.34.5 下依次运行：

1. `pnpm run check` — 期望完整通过。
2. `git diff --check` — 期望无空白错误。
3. `git diff --exit-code -- docs/assets` — 期望无输出、exit code 0。
4. `pnpm pack --pack-destination .artifacts/release-gates/v1.5.1/package` — 期望打包成功。
5. 复核 `.artifacts/release-gates/v1.5.1/desktop-surface/` 下 stable baseline/candidate 的完整截图、corner crops、P、wallpaper、blur/scrim 值记录；确认主用户 Desktop/Web profile 未改动，candidate 仍只在 test account。

## 审阅 Checkpoint

计划写好后交给用户审阅；计划获批前不进入代码实现。若用户修改候选 blur、隔离 profile 要求、Desktop manager carrier 或 corner-crop rubric，先改本计划并重新运行一次 inline 自检，再请求审阅。