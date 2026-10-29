# 开发者文档

> 本文件面向想读源码、改代码或自制皮肤的贡献者。README 只保留使用者需要的内容，
> 开发者关心的章节统一收敛在这里。

## 目录

- [工作原理](#工作原理)
- [自建一套皮肤](#自建一套皮肤)
- [本地开发与验证](#本地开发与验证)
- [发版](#发版)
- [控制台调试 API](#控制台调试-api)
- [实现耦合的已知边界](#实现耦合的已知边界)

## 工作原理

插件怎么构成。

**双端结构**。客户端负责皮肤与切换界面，Host 负责个性化配置、图库与资产路由。esbuild 产出 `lib/client.js` 与 `lib/index.js`，产物随仓库提交——npm 安装不在目标机器上构建。

**个性化写路径（ADR-0015）**。一切状态写走同一种带前置条件的方言：`PATCH /dsh-skins/config` 的 operations 词汇为 `set | delete | deleteAsset | clearLibrary`（白名单之外即 400），`baseRevision` 过期返回 409；图库删除因会连带回退引用字段，所以也是配置写；`clearLibrary` 服务端展开、单次提交。批量校验失败时响应携带 `params.issues: [{opIndex?, skinId?, key?, assetId?, code}]`（逐项裁决；`opIndex` 标注逐 op 校验的失败位，**终态不变量**的 issue 是状态级裁决、不携带 `opIndex`；`params.code` 保留兼容老读者），客户端据此对悬空引用（`MISSING_ASSET`/`BAD_ASSET`）点名摘除预览并回退（GLOSSARY「悬空预览」），其余错误保脏具名重试。**图库上传豁免前置条件**：纯追加不改写字段，不存在覆盖他人数据的冲突面——这是设计裁决而非缺口。旧式 `DELETE /library/{id}` 路由保留为混版宽容适配器（升级瞬间旧标签页无前置条件直删，语义不变），新客户端一律走 PATCH 方言。

**明暗持久化**。非 loopback 浏览器中，插件监听官方 `theme/change` 事件，把浅色/深色/跟随系统存入 `localStorage["dsh-skins:theme-preference"]`，启动时经官方 `theme.setTheme()` 恢复。loopback 浏览器不启用这一回退，直接使用 DSH 自身的 Host 持久化。

**报错本地化**。所有会显示在界面里的 Host 报错都带稳定错误码与模板参数，客户端据此渲染中英文文案；未知错误码回退为 Host 原始消息。

## 自建一套皮肤

在 `src/client/skins/<id>/index.js` 中导出创建函数，经 `defineSkin`（ADR-0019，`src/client/skins/define-skin.js`）声明规格——工厂持表骨架、段展开与恰好七字段收尾，皮肤只持数据与品牌 JSX：

```js
import { defineSkin } from "../define-skin.js";

export function createMySkin(jsxRuntime) {
  const { jsx } = jsxRuntime;
  function Mark({ size = 24, className }) { /* 品牌图标 JSX */ }
  function Name() { /* 品牌名 JSX */ }

  return defineSkin({
    id: "my-skin",
    label: { zh: "一句话名", en: "My Skin" }, // 或语言中立裸串；两种类型原样过缝
    description: { zh: "一句话描述", en: "One-line description" },
    titleBrand: "My Studio",
    favicon: { href: "data:image/svg+xml,…", mime: "image/svg+xml" }, // 显式 data URL；不发明 JSX→SVG 自动派生——图标/favicon 双轨请照 openbmc 的 ICON_GRADIENTS/ICON_PATHS + id 注入因子化
    anchor: 35, // 出厂锚（GLOSSARY）：随动重基线与模糊铰链共用的原点
    bodyAttribute: "dshMySkin", // 工厂派生作用域 body[data-dsh-my-skin]（camelCase → data-kebab）
    riding: { "--dsw-alias-bg-base": { light: ["R, G, B", 35], dark: ["R, G, B", 35] } }, // 值 = 出厂锚点处烘焙读数，全走 tokenOverrides（ADR-0017 单通道）
    constantTokens: null, // 或 { token: { light, dark } } 常量族（meirenzhi 同款）
    scrim: { kind: "overlay", coefficient: 30, light: "R, G, B", dark: "R, G, B" }, // 或 baked-gradient 分支 { kind, stops: { light: [[rgb,α]×2], dark: […] } }；artLayer 由 backgroundArt 派生
    blur: { max: 12 },
    glassVar: "--dsh-my-skin-glass-blur",
    desktopBlur: { dark: "boost" }, // rate 默认 55，规格不持
    wallpaper: { kind: "assets" }, // 或 legacy-baked：{ kind, placeholder: { light, dark } | null }；sentinel 由工厂派生 builtin:<id>:art
    backgroundArt: { mime: "image/webp", url: "data:image/webp;base64,…" }, // 可选；原画建议独居 <skin>/background-art.js（三皮形态）
    builtinAssets: { /* 额外资产 key → { mime, url }；art 键由 backgroundArt 派生排前 */ },
    badge: { selector: ".dsh-my-badge", colors: { light: { bg: "#…", fg: "#…" }, dark: { bg: "#…", fg: "#…" } }, metrics: { lineHeight: "16px", fontWeight: 600 } }, // 可选；用到 badge 段才必填
    decoration: { light: "R, G, B", dark: "R, G, B" }, // 用户+goal 气泡描边色
    streaming: { decay: "R, G, B" }, // 流式呼吸光条衰减色（惯例 = 暗色品牌主色）
    tints: { frost: { light: "R, G, B", dark: "R, G, B" }, menu: { light: "R, G, B", dark: "R, G, B" } }, // 浮层毛玻璃家族 tint（ADR-0012）
    cssSegments: [ // 有序段清单（ADR-0019 机制 a）：保留名 badge|decoration|streaming|rootclear|frost 展开为装饰/家族调用；裸串段原样透传；段间无自动分隔——"\n"、缩进、注释一律由裸串段自持；裸标识符形状的非保留名一律 throw
      "badge", "\n", "decoration", "\n", "rootclear", "\n", "streaming", "\n",
      "\n/* 品牌自有段（keyframes、氛围规则等裸 CSS）*/\n",
      "frost",
    ],
    Mark, Name,
  });
}
```

然后：

1. 在 `src/client/index.js` 中加入对应的 import 与 `runtime.register(...)`（注册顺序即出厂默认顺序）；
2. 在 `src/shared/personalization/catalog.js` 中登记皮肤的字段声明（`fields[]` 与内置资产），即可自动获得个性化面板——支持 `text / color / image / select / range` 五类字段、`single / locale / colorScheme` 三种值作用域。**皮肤注册与字段登记是两个 seam，`defineSkin` 不吸收字段登记**（ADR-0019 非目标）；
3. `project` 由工厂经 `createProjection(table)` 供给：表形状权威定义见 `src/client/skins/translucency.js` 头注释与 ADR-0013，schema fail-closed——未知规格键、缺必填、未知段名、段参数缺失均直接 throw；无 `project` 的目录皮肤经三层回退 fail closed、**永不挂载**（ADR-0004 已删除 legacy 投影通道，不存在任何兜底适配器）；
4. 工厂返回面即 ADR-0014 的**恰好七字段**生产面 `{ id, label, description, Mark, Name, project, builtinAssets }`——`runtime.register` 对集合外字段直接抛错，interface 变宽必须显式改 `PRODUCTION_FIELDS`；slogan 默认单源 catalog（B14）；
5. 删除皮肤时反向操作；
6. 保留 ID `official` 与兼容别名 `default`，不要用于扩展皮肤。

`label` 与 `description` 接受语言中立的字符串（如品牌名）或 `{ zh, en }` 映射，解析顺序为当前语言 → en → zh。皮肤卡片与 `__DSH_SKINS__.list()` 始终返回解析后的字符串，中英词典由 `tests/dicts.test.mjs` 强制键与占位符双向对齐。

标签页品牌段由声明表的 `titleBrand` 驱动（经投影结果的 `effects.titleBrand` 生效，ADR-0013），接受与 `label` 相同的字符串或 `{ zh, en }` 形式。官方 `DocumentTitle` 投影器会把标签页维护为「会话名 — DeepSeek Harness」，皮肤挂载期间只替换其中的品牌段、保留会话名；选择官方外观或插件卸载时换回官方品牌。

每个皮肤目录自持品牌标识、favicon、品牌 CSS 段与标语，不从其他皮肤目录导入视觉资源；`runtime.js` 与 `sidebar-switcher.js` 只承载通用机制。家族级机制住 `src/client/skins/` 平级共享模块——投影核 `translucency.js`（ADR-0013）、装饰族 `decoration.js`（ADR-0016）、浮层毛玻璃 `frost-family.js`（ADR-0012）、声明表工厂 `define-skin.js`（ADR-0019）——色值与品牌资源仍由各皮自持；原画资产独居各皮 `background-art.js`。

## 本地开发与验证

```sh
pnpm install
pnpm run test      # 构建 + 冒烟测试 + 全部单测（smoke 与 built-host 测的是 lib/ 产物，故每次先重建）
pnpm run check     # 完整门禁：构建 + 语法检查 + ESLint + 测试 + README 配对 + bundle/上游钩子守卫
pnpm run lint      # 单用途 ESLint：tests/ 的 no-dupe-keys + src/ 的 no-undef（对象字面量重复键与悬空绑定直接红；源自 2026-10-21 执行期两处缺陷，已并入 check）
pnpm run watch     # 监听 src/，分别重建 lib/client.js 与 lib/index.js
```

- 客户端 bundle 经 DSH HMR 热更新；Host 源码、`package.json`、`cordis.patch.yml` 或依赖变化后需重启 DSH Web。
- 提交前同时提交源码与重新生成的 `lib/` 两个产物。CI 会复查构建、产物无差异与安装包内容。
- **计划判据四律**（源自 ADR-0016 执行 retro，2026-10-22；④源自 ADR-0017 三轮评审核证纪律，2026-10-23）：① 冻结类约束（「现存期望值禁改」）的断言面清点必须 grep 派生（如 `grep -rln '<被消费符号>' tests/`）后逐文件裁决，禁止凭记忆穷举——本季手工清点曾漏列第三个消费文件，全门禁才暴露；② 「单源收拢/全部派生」类步骤，注释与用户可见文案与代码同清单核对（散文残尾曾顺延一个 checkpoint 才补齐）；③ 「唯一来源」grep 判据显式豁免来源文件自身，只圈消费方目录；④ **判据自证**：每条判据命令先在基线（改动前状态）跑一遍，确认非永真/永假（该红的红、该绿的黑），再进验收——`grep -c` 计 0 时 exit 1，禁入 `&&` 链；判据失配的失败模式必须可观测（如构建指纹探针），防「从未执行的步骤」产生虚假信心。
- **资产行程序化搬运**（源自 ADR-0019 执行实录，2026-10-25 两次）：data URL/内嵌资产等超长行的转录与搬运一律 `git show <rev>:<file> | sed -n 'M,Np'` 程序化抽取拼接，read 显示视图仅供定位——工具显示会截断长行，字节真值只在 git 原文（两次转录滑手均靠投影全等门兜住，但各耗一轮定位往返）。
- 截图脚本内置隐私规程：折叠全部工作区、新建空会话取景、界面强制中文，不泄露任何会话内容。`--gate` 的验收截图默认写到按当前 `package.json.version` 隔离的 `.artifacts/release-gates/v<version>/`（gitignored），只作本地证据，不随 tag 入库；普通捕获仍默认写 `docs/assets`。仅当 README、视觉样式或文档截图引用确实变化时，才显式执行 `node scripts/capture-previews.mjs --skin <id> --out docs/assets` 更新文档图片。发版前运行 `git diff --exit-code -- docs/assets`，无意更新文档截图的版本必须保持该目录零差异。
- **热部署**（web profile 预览未发版态）：`scripts/hot-deploy.sh`——build → 全量测试（**裸退出码，验证命令禁入吞码管道**，2026-10-28 实录：grep 显示测试输出吞掉 fail 2 的退出码，红状态险些直接上线）→ 备份 profile lib → 覆盖 → sha 校验，任一步失败即停、不碰 profile。client-only 变更浏览器刷新生效，**禁在 agent 会话内重启服务**（know-how 037）；须在无沙箱写限制的会话执行（esbuild 子进程 + profile 写，2026-10-28 实录插件 lib 写入属 profiles 只读视图）。回滚命令脚本末尾打印；发版装机后热部署态自然被覆盖。
- **挂点定面**（源自 ADR-0020 四轮热部署实证，2026-10-28）：涉及宿主 UI 挂点（选择器、覆盖层、背景面）的设计与修复，先取目标状态真实 DOM 再写选择器——dockkit 等布局由运行时 JS 计算，静态 grep 推不出层级与几何。取证工具见 know-how 042 `tools/dom-surface-probe.js`（属性面 dump + elementsFromPoint 层叠栈，与官方主题同状态对照跑一遍差异即答案）；无法取 DOM 时选择器标注 provisional 并带装机定面验收步。
- **repro 门禁真浏览器前提**（ADR-0021，2026-10-29）：`pnpm test` 链里的 `scripts/repro-stale-grid-paint.mjs --gate` 需要本机已装配套 chromium——playwright-core 版本与浏览器修订一一对应（1.62.1 → chromium_headless_shell-1234），首次运行前 `npx playwright-core install chromium`（缓存 `~/.cache/ms-playwright`，多版本并存无害）；CI 无活宿主时该步显式 SKIP exit 0。
- 两份 README（中/英）由校验脚本做内容配对；改动任一侧须同步另一侧，详见 `README.i18n.yaml`。
- `verify:hooks`（上游钩子守卫）需要 runtime 才能真跑：CI（ci.yml / release.yml）经 `scripts/ci-install-runtime.mjs` 装配 `scripts/runtime-pin.json` 钉版本的伞包 runtime 后以 strict 模式真跑（ADR-0011）——bump 钉版本即 manifest 重推导触发点，红灯就是升级绊网在设计位置响。本地无 runtime 时守卫打印 `upstream-hooks: SKIPPED`（机器可辨 token）后跳过、`check` 照样绿；本地金标准手跑仍可：设 `DSH_RUNTIME_ROOT` 指向 DSH 运行时根——pnpm store 布局或桌面 asar 解包后的 `dsh/` 目录均受支持（后者走结构化匹配，css-modules 精确哈希支路按 ADR-0006 不作要求）；解包不完整（缺锚点包）会失败，换完整解包再跑。

开发模式安装（本地源码直连，客户端改动即改即见）：

```sh
dsh plugin --profile web add link:<本仓库路径>
```

## 发版

1. `package.json` bump 版本——bump 前先 `npm view <pkg>@<目标版本> --registry=https://registry.npmjs.org/` 确认目标版本未被占用（npm 版本不可重发，撞车只能在发布最末端才发现）；双语 README 如有改动，跑 `node scripts/verify-readme-pairing.mjs --write` 重登记配对哈希；
2. 全门禁 `pnpm run check`——上游钩子守卫由 CI 装配钉版本 runtime 真跑（ADR-0011），本地无需再设 `DSH_RUNTIME_ROOT`；check 末位的 lib-sync 步骤（`git diff --exit-code -- lib/`）保证已提交产物与 src 同步（与 ci.yml/release.yml 的同名守卫一致，2026-10-20 retro 裁定）；
3. 提交源码与重新生成的 `lib/` 产物，打 `vX.Y.Z` tag 并推送；Release workflow 经 npm OIDC Trusted Publishing 发布；
4. **workflow 全绿 ≠ 已上架**：npm 对 provenance 发布有 staged 暂存窗口（scoped 包实测可达约 1 小时），期间 per-version 文档 404、`dist-tags` 停在旧版。用 `npm view <pkg>@<version> --registry=https://registry.npmjs.org/` 每 2 分钟轮询到 200 为止；窗口内重推同一 tag 必撞 `409 Cannot publish over previously staged version`，且 workflow 失败护栏会删除远端 tag；
5. 三键核验齐全再宣布发版成功：per-version 文档 200、`dist-tags.latest` 推进、packument `time` 字段推进。
6. 开发期间凡触碰 `src/` 的 checkpoint 必须一并提交重建后的 `lib/`（本仓库 lib 随源码入库；只改测试/文档的 checkpoint 无需构建）——中途快照 src/lib 不自洽，会让旧 commit 不经 build 的直接运行用上旧 lib（2026-10-20 实现评审 R2 裁定）。

## 控制台调试 API

```js
__DSH_SKINS__.list();                  // 列出扩展皮肤，不包含 official
__DSH_SKINS__.select("official");      // 恢复官方界面
__DSH_SKINS__.active();                // 当前选择 ID
__DSH_SKINS__.themePreference();       // 浏览器保存的配色偏好；可能为 null
```

`/?skin=<id>` URL 参数与 `localStorage["dsh-skins:active"]` 的优先级关系见 `src/client/runtime.js` 的 `resolveSelectedId`。

## 实现耦合的已知边界

以下边界属于实现细节，从 README 的使用者视角移到这里：

- OpenBMC 用户气泡描边使用版本相关类 `.Sixlwa_bubble`；该类变化只影响描边，token 配色不受影响。哈希与结构钩子的唯一来源在 `src/client/skins/decoration.js` 的 `BUBBLE_HOOKS`（ADR-0016）：上游重建导致哈希漂移时，重推导只改该对象一处，守卫 `verify-upstream-hooks.mjs` 与 lib 钉测试同源消费、全链路自动同步。
- 标签页品牌段替换依赖官方 `DocumentTitle` 投影器的固定文案「DeepSeek Harness」与「 — 」分隔符；投影器实现变化时只影响标签页品牌段，其余界面不受影响。
- 品牌标语经当前 DSH locale 字典接口替换，皮肤卸载时恢复；升级 DSH locale 实现后需要复核。
