# 内置资产出仓实施计划（builtin 壁纸/原画并入宿主资产路由）

## 目标

- 把美人志 6 张内置精选壁纸与 uefi 原画从 `lib/client.js` 内联 base64 迁移为宿主 `/dsh-skins/assets/b_<skin>_<key>.webp` 路由交付，`lib/client.js` 从 3,375,471 字节降到 400KB 以内（目标约 330KB）。
- openbmc 原画（出厂皮默认视觉资产）保持内联；favicon/Mark data URL 不动。
- 全部改造遵循 ADR-0023（docs/adr/0023-builtin-assets-external-delivery.md），以 1.5.22 发版。

## 架构快照

- 交付通道并轨：宿主在既有 `/dsh-skins/assets/` prefix 路由上加 `b_` 键回退链（store.serveAsset → builtin 资产 → 404），响应头（immutable + etag(sha256) + CORP + nosniff）原样继承；trusted metadata 源是随包分发的 `assets/manifest.json`。
- 客户端零接口变化：`builtinAssets` 仍是 `{url, mime}`，url 由新 helper `builtinAssetUrl(skinId, assetKey)` 单源构造（根相对 + `?v=<插件版本>`，版本经 esbuild define 自 package.json 注入）；投影核、panel 缩略图、assetResolver 消费端不改语义。
- 生成链：`build-meirenzhi-wallpapers.mjs` 改为 emit webp 文件 + URL 表；新增 `scripts/build-builtin-manifest.mjs` 扫描 assets 目录生成 manifest（uefi 手迁文件经它入册）。
- 守卫反转：verify-bundle-guard 改为固定代码上限 + 单行长度上限 + manifest 漂移校验（原字节护栏值逐字保留）。
- 两个壁纸敏感 repro gate 增加 settled 确定性等待，阈值不动；`runtime.select()` 增加生效壁纸预热。

## 全局约束（自 ADR-0023 逐字继承）

- 版本：`1.5.22`；peer floor、engines、平台要求不变。
- 编码参数（产品 2026-09-01 方案 B 裁决）：WebP、quality 80、width 2560、不做逐图降质搜索——逐字保留。
- 字节护栏原值：单张 ≤ 640,000 字节；meirenzhi 合计 ≤ 2,300,000 字节（转移至 manifest 校验，数值不变）。
- 规则：出厂皮肤（openbmc）的默认视觉资产内联，其余内置资产一律外置；manifest 与 assets 目录不得出现 openbmc 条目。
- fail-open：内置资产取不回时底色+纱层照常呈现，不触发皮肤失效。
- gate 阈值不放宽；壁纸等待超时按既有叙事单列 INVALID。
- GLOSSARY.md 零改动。
- 公开仓库脱敏：本计划与 ADR 不含本机 IP、端口、路径等私有值。
- 环境前提（Windows desktop 机）：esbuild 构建命令需 danger-full-access 会话（ask/read-only 沙箱首次必报 spawn EPERM，按提示升级重试一次）；预计超过 90 秒的命令（`pnpm test`）以 run_in_background 起跑；任何 npm pack/publish 链先设 `npm_config_cache` 到 workspace 内路径（如 `<workspace>/.npm-ci-cache`；`<workspace>`＝本机工作区根目录占位符，执行时替换，具体路径不入公开仓）。

## 输入工件

- 设计决策：docs/adr/0023-builtin-assets-external-delivery.md
- 事实底账：本仓 grill 会话调查（bundle 构成实测、desktop 转发机制 main.js:12406-12415/8268-8299、测试依赖面清单）
- 门禁/发版惯例：docs/developers.md（「发版」节、verify:hooks）

## 文件结构与职责

- Create: `src/host/builtin-assets.js` — 宿主 builtin 资产服务：`createBuiltinAssetServer({ assetsDir, manifest })` → `{ serveBuiltinAsset(url) }`，解析 `b_<skinId>_<assetKey>.webp`（正则 `/^b_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*\.webp$/`，与 BUILTIN_REF_PATTERN 字符集对齐、无下划线歧义），查 manifest、读文件，返回 `{ buffer, meta: { mime, byteLength, sha256 } }` 或 null。
- Create: `src/client/builtin-assets.js` — 客户端 URL 单源：`builtinAssetUrl(skinId, assetKey, extension = "webp")` 返回 `/dsh-skins/assets/b_<skinId>_<assetKey>.<extension>?v=<__DSH_SKINS_ASSET_REV__>`。
- Create: `assets/meirenzhi/b_meirenzhi_{yuntai,mupeiling,ziling,nangongwan,nangongque,yinyue}.webp` — 生成产物，入库。
- Create: `assets/uefi-harness/b_uefi-harness_art.webp` — 自现有 base64 一次性抽出，入库（sha256 入 manifest 金钉）。
- Create: `assets/manifest.json` — 生成产物，入库；entries 数组：`{ skinId, assetKey, file, mime, bytes, sha256 }`。
- Create: `scripts/build-builtin-manifest.mjs` — 扫描 `assets/**/*.webp`，按文件名反解 skinId/assetKey，计算 sha256/bytes，写 manifest.json。
- Create: `scripts/lib/wallpaper-settled.mjs` — gate 用确定性等待 helper：`awaitWallpaperSettled(page, { timeoutMs = 10000 })`，in-page 探针读 computed `body::before` background-image 的 url，`new Image()` onload/onerror 收口；无外置 url 时立即通过；超时 throw 带 `WALLPAPER_SETTLED_TIMEOUT` 标记的错误；实际等待发生时输出 `wallpaper settled in <N>ms` 日志。配套 `tests/wallpaper-settled.test.mjs` 桩页三态单测。
- Create: `scripts/ab-delivery-compare.mjs` — 新旧通道渲染 A/B 验收脚本（**自建双树夹具**：每树 http.Server + smoke 同构模块桩的真浏览器页；详见 Task 11 夹具设计；解码器用 paint-metrics）。
- Create: `tests/select-preload.test.mjs` — 预热纯函数单测。
- Modify: `src/index.js`（apply()）— 解析 assets 目录（`join(dirname(fileURLToPath(import.meta.url)), "..", "assets")`，src 与 lib 两种布局均指向包根）+ best-effort 读 manifest，构造 `serveBuiltinAsset` 传入路由（manifest 缺失时传 undefined，路由自然 404，维持 fail-open）。
- Modify: `src/host/personalization-routes.js`（assets prefix 路由）— handler 回退链 `store.serveAsset(url) ?? options.serveBuiltinAsset?.(url)`，响应头块不动。
- Modify: `src/client/index.js` — assetResolver 用户分支直拼 `/dsh-skins/assets/…` 孪生收敛为 `configClient.assetUrl(meta)`。
- Modify: `src/client/runtime.js` — `select(id)` 挂预热：新导出纯函数 `resolvePreloadUrl(skins, personalization, skinId, defaultRef)` + select 内三行接线（typeof Image 守卫）。
- Modify: `src/shared/personalization/catalog.js` — 新导出 `defaultWallpaperRef(skinId)`（读既有 wallpaper 字段 default，不新增字面量来源）。
- Modify: `src/client/skins/meirenzhi/wallpapers.js` — 再生成为 URL 表（import helper，保留溯源头注）。
- Modify: `src/client/skins/uefi-harness/background-art.js` — 改为 helper 常量 + provenance 头注。
- Modify: `scripts/build-meirenzhi-wallpapers.mjs` — emit webp 文件 + URL 表 wallpapers.js，收尾调 `node scripts/build-builtin-manifest.mjs`（NODE_BIN 环境覆盖缝，沿用既有 toolFromEnv 模式）；字节护栏 fail 逻辑原样。
- Modify: `scripts/build-client.mjs` — clientOptions 增 `define: { __DSH_SKINS_ASSET_REV__: JSON.stringify(version) }`（version 读 package.json）。
- Modify: `scripts/verify-bundle-guard.mjs` — 新公式（见 Task 6）。
- Modify: `scripts/repro-fullscreen-collapse.mjs`、`scripts/repro-stale-grid-paint.mjs` — 插入 settled 等待（前者 gotoSettled 后一次；后者每 hop 后）。
- Modify: `smoke-test.cjs`（:410 断言）— data-URL 断言改为路由 URL 断言。
- Modify: `package.json` — version 1.5.22；files 增 `"assets"`。
- Modify: `tests/personalization-routes.test.mjs` — b_ 路由用例（200 + 头 + 404 + 非法键）。
- Modify: `tests/built-host.test.mjs` — 自构建产物 lib 起服务命中 b_ 资产。
- Modify: `tests/meirenzhi-skin.test.mjs`（:31）、`tests/personalization-projector.test.mjs`（:225 按皮分支/:345）、`tests/translucency-contract.test.mjs`（:158/:176 legacy 分支按皮分支）— 真资产金值按皮肤归属改造：uefi/meirenzhi 改路由 URL，openbmc 保持 data-URL（runtime-effects:201 与 projector:278 均为 openbmc 钉，不改，作哨兵）；favicon/Mark 钉不动。
- Modify: `tests/build-meirenzhi-wallpapers.test.mjs` — 生成器行为改钉文件+URL 表产物。
- Modify: `tests/personalization-catalog.test.mjs` — defaultWallpaperRef 用例。
- Modify: `docs/developers.md` — 资产交付通道节 + 「自建一套皮肤」配方改写（外置规则 + 出厂皮例外）。
- 稳定边界：`src/client/skins/define-skin.js`、`translucency.js`、projector、panel.js、`src/client/skins/openbmc-harness/*` 零改动。
- 接口依赖：Task 1/2 产出 `serveBuiltinAsset` 与 `builtinAssetUrl`；Task 3/4 消费 helper 并产出 manifest 与资产文件；Task 5 消费 Task 3/4 产物改金值；Task 6 消费 manifest；Task 7/8 相对独立；Task 11 依赖 Task 7 的 settled helper 与 Task 10 的全绿；Task 9-12 收口。

## 任务清单

### Task 1: 宿主 builtin 资产服务模块与路由并轨

- 目标：`GET /dsh-skins/assets/b_meirenzhi_yuntai.webp` 能从包内 assets 目录返回字节，头语义与用户资产一致。
- Files
  - Create: `src/host/builtin-assets.js`
  - Modify: `src/index.js`（apply()）
  - Modify: `src/host/personalization-routes.js`（assets prefix handler）
  - Test: `tests/personalization-routes.test.mjs`
- 接口契约
  - Consumes: `assets/manifest.json` 的 entry 形状 `{ skinId, assetKey, file, mime, bytes, sha256 }`（本任务先以测试内联 fixture 定义形状；真实 manifest 由 Task 3/4 产出）。
  - Produces: `createBuiltinAssetServer({ assetsDir, manifest })` → `{ serveBuiltinAsset(url): { buffer, meta: { mime, byteLength, sha256 } } | null }`。**URL 预处理契约（对齐 store.serveAsset 语义，store.js:710-713）**：输入为完整请求 URL（含 query）——先 `String(url).split("?")[0]` 剥 query，再取 `/dsh-skins/assets/` 前缀后的单段，才做 `^b_[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*\.webp$` 匹配（真实客户端 URL 恒带 `?v=`，漏剥即全线 404）；`mountPersonalizationRoutes(hostContext, { store, trustedHosts, serveBuiltinAsset })` 新可选参。
- 验证范围：`node --test tests/personalization-routes.test.mjs` 全绿（含新 b_ 用例）。

- [ ] Step 1: 写失败测试
  - 在 `tests/personalization-routes.test.mjs` 追加用例：临时目录放 `meirenzhi/b_meirenzhi_yuntai.webp`（任意字节）+ 内存 manifest entry（sha256 用 node:crypto 实算）；起路由后 (a) GET `b_meirenzhi_yuntai.webp` 与 GET `b_meirenzhi_yuntai.webp?v=1.5.22` 均得 200、`cache-control` 含 `immutable`、etag 为 `"<sha256>"`、`cross-origin-resource-policy: same-origin`、字节相等（带 query 用例钉死预处理契约——真实客户端恒带 `?v=`，无 query 用例对漏剥实现不敏感）；(b) GET `b_meirenzhi_nosuch.webp` 得 404；(c) GET `b_.._x.webp`、`b_meirenzhi_yuntai.png`（非法扩展）得 404；(d) 不传 `serveBuiltinAsset` 选项时 b_ 请求 404（fail-open 默认）。
- Run: `node --test tests/personalization-routes.test.mjs`
- Expected: 新用例失败（模块/参数不存在），既有用例仍绿。
- [ ] Step 2: 运行并确认失败
  - Run: `node --test tests/personalization-routes.test.mjs`
- Expected: 新增用例红，报 cannot resolve `../src/host/builtin-assets.js` 或断言 404≠200。
- [ ] Step 3: 写最小实现
  - 新建 `src/host/builtin-assets.js`（正则解析 + manifest 查找 + `readFileSync(join(assetsDir, entry.file))`，文件名必须与 entry.file 完全一致才返回）；`src/index.js` apply() 内构造 assetsDir 与 best-effort manifest（读失败 → serveBuiltinAsset 传 undefined）；`personalization-routes.js` handler 改 `store.serveAsset(url) ?? options.serveBuiltinAsset?.(url)`，null 走既有 404。
- [ ] Step 4: 运行并确认通过
  - Run: `node --test tests/personalization-routes.test.mjs`
- Expected: 全绿。
- [ ] Step 5: 可选 checkpoint commit
  - Run: `git add src/host/builtin-assets.js src/index.js src/host/personalization-routes.js tests/personalization-routes.test.mjs && git commit -m "feat(host): builtin asset serving over /dsh-skins/assets b_ keys (ADR-0023)"`

### Task 2: 客户端 URL 单源 helper 与构建期版本注入

- 目标：`builtinAssetUrl()` 成为唯一 URL 构造点，版本经 define 注入，assetResolver 用户分支孪生收敛。
- Files
  - Create: `src/client/builtin-assets.js`
  - Modify: `scripts/build-client.mjs`（clientOptions.define）
  - Modify: `src/client/index.js`（assetResolver 用户分支）
  - Test: 新增 `tests/builtin-assets.test.mjs`（client helper 为纯函数，直接单测）
- 接口契约
  - Consumes: package.json `version`（构建期）。
  - Produces: `builtinAssetUrl(skinId, assetKey, extension = "webp")`；版本注入采用 **define 键 `globalThis.__DSH_SKINS_ASSET_REV__`**（esbuild 仅对全名属性访问键做字面替换；裸 define 键不替换源码中 `globalThis.X` 形态的引用——评审 esbuild 0.28.2 最小探针 v9-esbuild-define.log 实证），源码保持 `globalThis.__DSH_SKINS_ASSET_REV__ ?? "0"` 兜底（直跑单测合法，产物中兜底被字面替换消灭）。
- 验证范围：`node --test tests/builtin-assets.test.mjs` 绿 + `node scripts/build-client.mjs` 后产物含 `?v=1.5.21`（构建时 package.json 版本，此时未 bump）且零 `__DSH_SKINS_ASSET_REV__` 标识符残留。

- [ ] Step 1: 写失败测试
  - `tests/builtin-assets.test.mjs`：断言 `builtinAssetUrl("meirenzhi", "yuntai") === '/dsh-skins/assets/b_meirenzhi_yuntai.webp?v=0'`（兜底 rev）；`builtinAssetUrl("uefi-harness", "art")` 对应 `b_uefi-harness_art.webp`；非法字符入参（含下划线/大写/斜杠）throw。
- Run: `node --test tests/builtin-assets.test.mjs`
- Expected: 模块不存在，红。
- [ ] Step 2: 运行并确认失败
  - Run: `node --test tests/builtin-assets.test.mjs`
- Expected: cannot resolve。
- [ ] Step 3: 写最小实现
  - helper 落地（参数校验复用 BUILTIN_REF_PATTERN 字符集，版本读取 `globalThis.__DSH_SKINS_ASSET_REV__ ?? "0"`）；`build-client.mjs` 读 package.json version，以 define 键 **`globalThis.__DSH_SKINS_ASSET_REV__`** 注入（勿用裸键——不替换 globalThis.X 引用，产物将恒 `?v=0`）；`src/client/index.js` 用户分支改 `configClient.assetUrl(meta)`（config-client.js:732-735 既有方法，签名 `assetUrl(meta)` 返回 `/dsh-skins/assets/<id>.<ext>`）。
- [ ] Step 4: 运行并确认通过
  - Run: `node --test tests/builtin-assets.test.mjs && node scripts/build-client.mjs`
  - 再抽查：`node -e "const s=require('fs').readFileSync('lib/client.js','utf8'); if(!s.includes('?v=1.5.21')||s.includes('__DSH_SKINS_ASSET_REV__')) process.exit(1); console.log('rev ok')"`（danger-full-access 会话执行构建；判据对「注入失败恒 ?v=0」敏感——弱断言 `includes('?v=')` 会被 ?v=0 骗过）。
- Expected: 测试绿；构建成功；抽查输出 `rev ok`（产物含 `?v=1.5.21`、零标识符残留）。
- [ ] Step 5: 可选 checkpoint commit
  - Run: `git add src/client/builtin-assets.js scripts/build-client.mjs src/client/index.js tests/builtin-assets.test.mjs lib && git commit -m "feat(client): builtinAssetUrl single source + build-time asset rev (ADR-0023)"`

### Task 3: 壁纸出仓迁移与生成器改造

- 目标：6 张壁纸字节自 wallpapers.js 内联 base64 解码迁入 `assets/meirenzhi/`，wallpapers.js 变 URL 表；生成器 emit 形态同步改造（shim 测试钉住模板，供未来素材再生成用）。
- Files
  - Create: `scripts/build-builtin-manifest.mjs`
  - Create: `assets/meirenzhi/b_meirenzhi_{yuntai,mupeiling,ziling,nangongwan,nangongque,yinyue}.webp`（迁移产物，入库）
  - Create: `assets/manifest.json`（生成入库）
  - Modify: `src/client/skins/meirenzhi/wallpapers.js`（重写为 URL 表，溯源头注原样保留）
  - Modify: `scripts/build-meirenzhi-wallpapers.mjs`（emit 形态改造）
  - 临时: `<workspace>/.dsh-research/extract-mrz-wallpapers.mjs`（workspace gitignore 区一次性解码脚本，不入库）
  - Test: `tests/build-meirenzhi-wallpapers.test.mjs`
- 接口契约
  - Consumes: Task 2 `builtinAssetUrl`；Task 1 manifest entry 形状；旧 wallpapers.js 头注中的逐张源 sha256（迁移校验基准）。
  - Produces: `WALLPAPER_YUNTAI` 等 6 导出（值=helper URL）；manifest meirenzhi 6 entries；assets 目录布局 `assets/<skinId>/b_<skinId>_<assetKey>.webp`；生成器新 emit 模板（shim 钉住，与手写 wallpapers.js 结构逐字一致）。
- 验证范围：生成器 shim 测试绿；解码迁移逐张 sha256 与旧头注一致；manifest 6 条、Σbytes=2,210,918（≤2,300,000 且与旧 TOTAL_WEBP_BYTES 逐字一致）、单张 ≤640,000；新 wallpapers.js 零 `data:image`。

- [ ] Step 1: 写失败测试（改造 `tests/build-meirenzhi-wallpapers.test.mjs`）
  - 既有 shim 模式跑生成器到临时目录：断言产出 6 个 `assets/meirenzhi/b_meirenzhi_*.webp` 文件、`manifest.json` 含 6 条 meirenzhi entries（bytes/sha256 与 shim 输出一致）、wallpapers.js 为 URL 表（import helper、零 `data:image` 字面量）；临时目录无泄漏断言保留。
- Run: `node --test tests/build-meirenzhi-wallpapers.test.mjs`
- Expected: 新断言红（生成器仍产 data-URL 模块）。
- [ ] Step 2: 运行并确认失败
  - Run: `node --test tests/build-meirenzhi-wallpapers.test.mjs`
- Expected: 红。
- [ ] Step 3: 解码迁移（一次性、确定性，无需仓外素材）
  - 写 `<workspace>/.dsh-research/extract-mrz-wallpapers.mjs`：解析现 wallpapers.js 六个导出常量的 base64 → `Buffer.from(b64, "base64")` → 写 `assets/meirenzhi/b_meirenzhi_<key>.webp`。校验判据（头注溯源 sha256 是**源图**哈希——生成器对 `--src` 源文件取哈希（build-meirenzhi-wallpapers.mjs:138），与 webp 编码字节不可比；可证伪对照取 bytes）：(a) 逐张解码 bytes 与头注 webp bytes 列逐一相等——yuntai 283460 / mupeiling 315928 / ziling 415498 / nangongwan 283616 / nangongque 495218 / yinyue 417198；(b) Σ === 2,210,918（wallpapers.js:15 `TOTAL_WEBP_BYTES` 标记）；任一不符退出非零。随后手写新 wallpapers.js（URL 表 + 原溯源头注逐字保留 + **删除标记行 :15-17**——`TOTAL_WEBP_BYTES`/`ENCODE_WIDTH`/`ENCODE_QUALITY` 三行不再产出；Task 6 Step 1 的「旧守卫红」依赖此删除，若保留则旧公式 limit=776,360+2,947,891+20,480≈3,744,731，新 bundle ~330KB 下旧守卫仍绿）。manifest 的 sha256 为解码后新算值（金钉，无旧值可交叉验证）。
  - Run: `node <workspace>/.dsh-research/extract-mrz-wallpapers.mjs`
  - Expected: 六张全部 `bytes ok`、`Σ ok`；`assets/meirenzhi/` 出现 6 文件。
- [ ] Step 4: 生成器与 manifest 脚本改造
  - `build-meirenzhi-wallpapers.mjs`：转码参数（方案 B）逐字不动；emit 段改「写 webp 文件 + 按 Step 3 手写模板生成 wallpapers.js + 末尾 `execFileSync(process.env.NODE_BIN ?? "node", ["scripts/build-builtin-manifest.mjs"])`」（沿用既有 toolFromEnv 覆盖缝模式）；字节护栏 fail 逻辑原样。新建 `scripts/build-builtin-manifest.mjs`：扫描 `assets/**/*.webp` 按文件名反解 skinId/assetKey、算 sha256/bytes、写 manifest.json；发现 openbmc 条目即失败（出厂皮规则，ADR-0023 Decision 2）。
  - Run: `node scripts/build-builtin-manifest.mjs`
  - Run: `node --test tests/build-meirenzhi-wallpapers.test.mjs`
  - Run: `node -e "const m=require('./assets/manifest.json');const mrz=m.entries.filter(e=>e.skinId==='meirenzhi');const sum=mrz.reduce((a,e)=>a+e.bytes,0);if(mrz.length!==6||sum!==2210918||sum>2300000||mrz.some(e=>e.bytes>640000))process.exit(1);console.log('manifest ok',sum)"`
- Expected: manifest 生成；shim 测试绿；`manifest ok 2210918`。
- [ ] Step 5: checkpoint commit
  - Run: `git add scripts/build-meirenzhi-wallpapers.mjs scripts/build-builtin-manifest.mjs assets src/client/skins/meirenzhi/wallpapers.js tests/build-meirenzhi-wallpapers.test.mjs && git commit -m "feat(assets): meirenzhi wallpapers externalized via one-shot decode + manifest (ADR-0023)"`

### Task 4: uefi 原画出仓

- 目标：uefi `BACKGROUND_ART` 巨串迁移为 assets 文件 + helper 常量。
- Files
  - Create: `assets/uefi-harness/b_uefi-harness_art.webp`
  - Modify: `src/client/skins/uefi-harness/background-art.js`
  - Modify: `assets/manifest.json`（经 Task 3 的 manifest 脚本再生）
- 接口契约
  - Consumes: Task 2 helper；Task 3 `scripts/build-builtin-manifest.mjs`。
  - Produces: manifest 中 `uefi-harness:art` entry；其 sha256 同时以**字面量硬编码进 verify-bundle-guard.mjs**（Task 6 回填消费——金钉住在守卫源码而非 manifest，防 manifest-vs-manifest 永真比对）。
- 验证范围：解码 bytes 与现内联串 base64 解码长度相等（可证伪）；manifest 含该条目；background-art.js 零 `data:image`。

- [ ] Step 1: 写当前状态检查
  - Run: `node -e "const s=require('fs').readFileSync('src/client/skins/uefi-harness/background-art.js','utf8');console.log(s.includes('data:image/webp'))"`
- Expected: `true`（当前为内联巨串，还不满足目标）。
- [ ] Step 2: 迁移
  - 写 `<workspace>/.dsh-research/extract-uefi-art.mjs`（同 Task 3 模式，gitignore 区一次性脚本）把现 base64 解码写 `assets/uefi-harness/b_uefi-harness_art.webp`；校验判据（可证伪表述，避免自指永真）：解码 bytes === 现内联串 base64 解码长度，且 sha256 为**新算值**落档 manifest 金钉（Task 6 守卫将逐字校验该钉）。`background-art.js` 重写为 helper 常量 + provenance 头注（sha256/bytes/来源：自 1.5.21 内联串逐字节迁出）。
- Change: 文件与常量如上。
- [ ] Step 3: manifest 再生
  - Run: `node scripts/build-builtin-manifest.mjs`
- Expected: manifest 含 meirenzhi 6 + uefi 1 共 7 条。
- [ ] Step 4: 确认通过
  - Run: `node --test tests/personalization-projector.test.mjs tests/meirenzhi-skin.test.mjs`（此时尚未改金值，预期 **红在 uefi 相关金值**——这是 Task 5 的输入信号，不是本任务失败条件）；`node -e "const m=require('./assets/manifest.json');const e=m.entries.find(x=>x.skinId==='uefi-harness');if(!e)process.exit(1);console.log(e.sha256)"`
- Expected: manifest 条目在；金值红留待 Task 5。
- [ ] Step 5: checkpoint commit
  - Run: `git add assets src/client/skins/uefi-harness/background-art.js && git commit -m "feat(assets): uefi background art externalized (ADR-0023)"`

### Task 5: 真资产金值与 smoke 断言更新（按皮肤归属精准改造）

- 目标：真资产钉按皮肤归属改造——uefi/meirenzhi 侧改路由 URL，openbmc 侧保持 data-URL。断言面清单为 grep 派生（`grep -rn "data:image" tests/ smoke-test.cjs`），遵守 developers.md 判据四律①（冻结类断言面禁止手工清点）。
- Files
  - Modify: `smoke-test.cjs`（:410）
  - Modify: `tests/meirenzhi-skin.test.mjs`（:31）
  - Modify: `tests/personalization-projector.test.mjs`（:225 按皮分支、:345）
  - Modify: `tests/translucency-contract.test.mjs`（:158/:176 legacy 分支按皮分支）
  - Modify: `tests/built-host.test.mjs`（新增用例：自构建产物 lib 起服务命中 `b_` 资产 200——消费 Task 3/4 的 manifest 与资产文件；不归 Task 1 的原因：Task 1 时资产尚未存在，该用例必 404）
  - 不改（哨兵，误改即红）：`tests/runtime-effects.test.mjs`（:200-201 是 openbmc shell-alignment 真资产钉——openbmc 留内联）；`tests/personalization-projector.test.mjs`:278（openbmc P=0 floor）；全部夹具桩（define-skin / overlay-frost / translucency-kernel / meirenzhi-skin:7 桩）与 favicon/Mark 钉。
- 接口契约
  - Consumes: Task 3/4 产物 URL 形态 `/dsh-skins/assets/b_<skin>_<key>.webp?v=<rev>`（断言取路径段，`?v=` 部分用 includes 容忍）；url( 双引号包装形态沿 translucency.js:59 `url("${url}")`。
  - Produces: 全绿的真资产测试面；openbmc 哨兵断言原样存活。
- 验证范围：`node --test tests/meirenzhi-skin.test.mjs tests/runtime-effects.test.mjs tests/personalization-projector.test.mjs tests/translucency-contract.test.mjs tests/built-host.test.mjs` 绿；`node smoke-test.cjs` 绿。

- [ ] Step 1: 运行确认当前失败面
  - Run: `node scripts/build-client.mjs && node smoke-test.cjs`（danger-full-access 会话）
  - Run: `node --test tests/meirenzhi-skin.test.mjs tests/runtime-effects.test.mjs tests/personalization-projector.test.mjs tests/translucency-contract.test.mjs`
- Expected: 红 = smoke:410、meirenzhi-skin:31、projector:225/345（uefi 分支）、translucency-contract:158/:176（uefi 迭代）；**绿 = runtime-effects 全文件、projector:278（openbmc 钉）**——此绿即「未误改」哨兵。
- [ ] Step 2: 改断言（逐处映射）
  - smoke:410 → 断言含 `url("/dsh-skins/assets/b_meirenzhi_yuntai.webp`。
  - meirenzhi-skin:31 → startsWith `/dsh-skins/assets/b_meirenzhi_`。
  - projector:225（"the REAL openbmc and uefi factories…" 循环两皮）→ 按 `skin.id` 分支：openbmc 断言 `includes(", url(data:image/webp")` 原样；uefi 断言 `includes(", url(/dsh-skins/assets/b_uefi-harness_art")`。
  - projector:345（uefi P=0）→ `includes(", url(/dsh-skins/assets/b_uefi-harness_art")`。
  - translucency-contract:158/:176 legacy 分支 → 按 skinId 分支：openbmc 保持 `includes(", url(data:image/webp")`；uefi 改 `includes(", url(/dsh-skins/assets/b_uefi-harness_art")`。
  - favicon/Mark 断言（meirenzhi-skin:22/:39-40、projector:25/:230/:445）不动。
- Change: 仅断言字符串与分支逻辑。
- [ ] Step 3: 确认通过
  - Run: `node scripts/build-client.mjs && node smoke-test.cjs && node --test tests/meirenzhi-skin.test.mjs tests/runtime-effects.test.mjs tests/personalization-projector.test.mjs tests/translucency-contract.test.mjs tests/built-host.test.mjs`
- Expected: 全绿（runtime-effects 与 projector:278 的绿证明 openbmc 哨兵未动；built-host 新用例：自构建产物 lib 起服务命中 `b_` 资产 200）；此时 `lib/client.js` 应已降到 ~330KB（用 `node -e "console.log(require('fs').statSync('lib/client.js').size)"` 记录实测值，Task 6 要用）。
- [ ] Step 4: checkpoint commit
  - Run: `git add smoke-test.cjs tests lib && git commit -m "test: real-asset goldens split by skin (uefi route URL, openbmc inline sentinel) + built-lib b_ integration (ADR-0023)"`

### Task 6: verify-bundle-guard 改形

- 目标：守卫从增长公式变固定闸门 + manifest 漂移校验。
- Files
  - Modify: `scripts/verify-bundle-guard.mjs`
- 接口契约
  - Consumes: Task 5 记录的实测代码体积；`assets/manifest.json`；uefi sha256 金钉（Task 4 产出值，回填为守卫源码内字面量）。
  - Produces: 新守卫不变式：(a) `lib/client.js` ≤ 实测值 + 20,480 slack（ratchet 钉死，注释记录换算）；(b) 任一行长度 ≤ 150,000（openbmc 原画行 ~139,457 在界内，巨串回潮即红）；(c) manifest：entries 唯一、files 存在且 bytes 与实际文件一致、**每个资产实算文件 sha256 === entry.sha256**（内容级比对，同长度篡改可检出）、单张 ≤ 640,000、meirenzhi Σ ≤ 2,300,000、uefi art 实算 sha256 === 硬编码金钉（三比对：实算 vs manifest vs 守卫内字面量）、无 openbmc 条目。
- 验证范围：`node scripts/verify-bundle-guard.mjs` 绿；人为破坏自检（临时改动一行超限）能红（自检后还原）。

- [ ] Step 1: 写当前状态检查
  - Run: `node scripts/verify-bundle-guard.mjs`
- Expected: 红——wallpapers.js 标记行已不存在（Task 3 移除），旧公式读不到 `TOTAL_WEBP_BYTES`。
- [ ] Step 2: 重写守卫
  - 按接口契约 (a)(b)(c) 重写；头注记录：旧公式与两次棘轮史、新语义「资产永远进不了 bundle」、ratchet 基线来源。
- Change: 全文件重写。
- [ ] Step 3: 确认通过
  - Run: `node scripts/verify-bundle-guard.mjs`
- Expected: `✓ bundle guard OK` 且输出固定上限与 manifest Σ。
- [ ] Step 4: 破坏性自检
  - Run: 临时在 manifest 删一条 entry → `node scripts/verify-bundle-guard.mjs`（预期红：files 不一致）→ 还原 → 再绿。
- Expected: 红/绿受控。
- [ ] Step 5: checkpoint commit
  - Run: `git add scripts/verify-bundle-guard.mjs && git commit -m "guard: fixed client budget + manifest drift checks (ADR-0023)"`

### Task 7: 壁纸敏感 gate 的 settled 确定性等待（离线可证伪）

- 目标：两个像素 gate 在量测前等壁纸取回+解码完成，阈值不动；等待逻辑的正确性**离线可证伪**——管线 gate 默认皮肤是 openbmc（B9 永久 inline，等待恒 no-op）且 gate 为 live-host 连接模式（URL 默认 web 机实例，desktop 机不可达即 SKIP），生效性不能靠管线运行证明。
- Files
  - Create: `scripts/lib/wallpaper-settled.mjs`
  - Create: `tests/wallpaper-settled.test.mjs`（桩页三态单测）
  - Modify: `scripts/repro-fullscreen-collapse.mjs`（gotoSettled 后调一次）
  - Modify: `scripts/repro-stale-grid-paint.mjs`（每 hop 量测前调用）
- 接口契约
  - Consumes: playwright-core `page`（两 gate 既有依赖；单测用桩页/桩 Image）。
  - Produces: `awaitWallpaperSettled(page, { timeoutMs })`——三态契约：(a) computed `body::before` 背景为外置 `/dsh-skins/assets/b_` url 时，等 in-page `Image` onload/onerror 收口；(b) 无外置 url（inline data-URL / 无壁纸）立即通过；(c) 超时 throw 错误 message 含 `WALLPAPER_SETTLED_TIMEOUT`，gate 捕获后按既有叙事报 INVALID（不得报 FAIL/PASS，对齐 63d080a 先例）。实际等待发生时输出一行日志 `wallpaper settled in <N>ms`（生效痕迹）。
- 验证范围：`node --test tests/wallpaper-settled.test.mjs` 三态全绿；两 gate 在可达 live host 环境（CI）运行时输出 settled 日志；本机无 live host 时 `--gate` 记录 SKIP 行为（exit 0，既有语义）。

- [ ] Step 1: 写失败测试
  - `tests/wallpaper-settled.test.mjs` 用桩页三态断言：外置 url → Image onload 后 resolve（桩页注入可控 Image）；inline data-URL / 无壁纸 → 同步通过（零等待）；假 url 挂起 + `timeoutMs: 50` → throw 含 `WALLPAPER_SETTLED_TIMEOUT`。另断言等待发生时日志行被打出。
- Run: `node --test tests/wallpaper-settled.test.mjs`
- Expected: 红（helper 不存在）。
- [ ] Step 2: 运行并确认失败
  - Run: `node --test tests/wallpaper-settled.test.mjs`
- Expected: 红。
- [ ] Step 3: 实现 helper 与两处接入
  - helper 按接口契约实现（探针读 computed `body::before` background-image，正则取 url，`new Image()` 收口；无外置 url 立即过；等待时打 `wallpaper settled in Nms`）。接入：fullscreen-collapse 在 `gotoSettled` 后、首次量测前调用；stale-grid-paint 在每 hop 量测前调用；两 gate catch 分支识别 `WALLPAPER_SETTLED_TIMEOUT` → INVALID 文案。
  - **插入点非对称说明（有意设计，勿「补全」）**：stale-grid 的 hop 插等待、cold baseline（gotoSettled 后立即量）不插——冷载壁纸请求已被 gotoSettled 的 networkidle 语义覆盖；hop 无导航，原仅有 1000ms waitForTimeout 屏障。
- [ ] Step 4: 确认通过
  - Run: `node --test tests/wallpaper-settled.test.mjs && node scripts/repro-fullscreen-collapse.mjs --gate && node scripts/repro-stale-grid-paint.mjs --gate`（gate 为 live-host 模式：本机不可达 → 记录 SKIP 输出即符合预期；可达（CI/web 机）→ 绿且见 settled 日志）
- Expected: 三态单测绿；gate PASS/SKIP 按环境如实记录。
- [ ] Step 5: checkpoint commit
  - Run: `git add scripts/lib/wallpaper-settled.mjs tests/wallpaper-settled.test.mjs scripts/repro-fullscreen-collapse.mjs scripts/repro-stale-grid-paint.mjs && git commit -m "test(gates): deterministic wallpaper-settled wait, offline-falsifiable tri-state (ADR-0023)"`

### Task 8: select() 生效壁纸预热

- 目标：换肤瞬间目标壁纸已在缓存，封死首换观感路径。
- Files
  - Modify: `src/shared/personalization/catalog.js`（新导出 `defaultWallpaperRef(skinId)`）
  - Modify: `src/client/runtime.js`（新导出纯函数 `resolvePreloadUrl(skins, personalization, skinId, defaultRef)` + select() 接线）
  - Test: `tests/select-preload.test.mjs`、`tests/personalization-catalog.test.mjs`
- 接口契约
  - Consumes: `BUILTIN_REF_PATTERN`（catalog 既有导出）；`getOverrides(skinId)`（personalization 接口既有方法）。
  - Produces: `defaultWallpaperRef(skinId): string | undefined`；`resolvePreloadUrl(skins, personalization, skinId, defaultRef): string | null`（规则：override 的 wallpaper 字段优先，否则 defaultRef；仅当解析为 builtin 且该皮 builtinAssets[key].url 以 `/dsh-skins/assets/` 开头时返回该 url；用户图库 ref、openbmc 内联 url、official、未知皮 → null）。
- 验证范围：两测试文件绿；smoke 不回归。

- [ ] Step 1: 写失败测试
  - `tests/select-preload.test.mjs`：四类用例（meirenzhi 默认→yuntai url；override `builtin:meirenzhi:yinyue`→yinyue url；override 用户 ref→null；openbmc（内联 data url）→null）。`tests/personalization-catalog.test.mjs`：`defaultWallpaperRef("meirenzhi")==="builtin:meirenzhi:yuntai"`、`("openbmc")==="builtin:openbmc:art"`、未知皮 undefined。
- Run: `node --test tests/select-preload.test.mjs tests/personalization-catalog.test.mjs`
- Expected: 红（导出不存在）。
- [ ] Step 2: 运行并确认失败
  - Run: 同上。
- Expected: 红。
- [ ] Step 3: 写最小实现
  - catalog 读既有字段表实现 defaultWallpaperRef；runtime 实现纯函数并在 `select(id)` 挂三行接线（`typeof Image === "function"` 守卫 + `new Image().src = url`，吞异常）。
- [ ] Step 4: 确认通过
  - Run: `node --test tests/select-preload.test.mjs tests/personalization-catalog.test.mjs && node smoke-test.cjs`
- Expected: 全绿。
- [ ] Step 5: checkpoint commit
  - Run: `git add src/shared/personalization/catalog.js src/client/runtime.js tests/select-preload.test.mjs tests/personalization-catalog.test.mjs && git commit -m "feat(runtime): preload effective wallpaper on select (ADR-0023 Q14)"`

### Task 9: 包元数据与 developers.md

- 目标：npm 包带上 assets 目录；文档反映新通道与规则；版本 1.5.22。
- Files
  - Modify: `package.json`（version、files 增 `"assets"`）
  - Modify: `docs/developers.md`（资产交付通道说明 + 「自建一套皮肤」配方：builtinAssets 外置 + 出厂皮例外 + manifest 再生命令）
- 接口契约
  - Consumes: Task 3/4 的 assets 布局。
  - Produces: `1.5.22` 版本号；`?v=1.5.22` 将在 Task 10 的最终构建中注入。
- 验证范围：`node scripts/verify-readme-pairing.mjs` 绿；`node -e "const p=require('./package.json');if(p.version!=='1.5.22'||!p.files.includes('assets'))process.exit(1)"` 通过。

- [ ] Step 1: 当前状态检查
  - Run: `node -e "const p=require('./package.json');console.log(p.version, p.files.join(','))"`
- Expected: `1.5.21` 且 files 无 assets（未达目标态）。
- [ ] Step 2: 修改
  - version → 1.5.22；files 数组按现序追加 `"assets"`；developers.md 两节改写（引用 ADR-0023）。
- [ ] Step 3: 确认通过
  - Run: `node scripts/verify-readme-pairing.mjs && node -e "const p=require('./package.json');if(p.version!=='1.5.22'||!p.files.includes('assets'))process.exit(1);console.log('meta ok')"`
- Expected: 绿 + meta ok。
- [ ] Step 4: checkpoint commit
  - Run: `git add package.json docs/developers.md && git commit -m "chore: 1.5.22 + ship assets dir + developer docs for external delivery (ADR-0023)"`

### Task 10: 全量验证

- 目标：仓内全部门禁一次全绿 + 体积目标实证。
- Files: 无新改动（只跑命令；发现红则回对应任务修）。
- 接口契约
  - Consumes: Task 1-9 全部产物。
  - Produces: 全绿证据 + `lib/client.js` 实测体积记录（写入 commit message 或 PR 描述）。
- 验证范围：`pnpm test`（build + smoke + 3 gate + node --test 全套）、`pnpm run verify:hooks`、`node scripts/verify-bundle-guard.mjs`、体积断言 < 400,000。

- [ ] Step 1: 依赖自检
  - Run: `node -e "const fs=require('fs');process.exit(fs.existsSync('node_modules')?0:1)"`；缺失则 `pnpm install --frozen-lockfile`。
- Expected: 存在（或恢复后继续）。
- [ ] Step 2: 全量测试（>90s，run_in_background；danger-full-access）
  - Run: `pnpm test`
- Expected: 全绿（构建输出含 `built lib/client.js (<400000 bytes)` 量级）。
- [ ] Step 3: 守卫与钩子
  - Run: `node scripts/verify-bundle-guard.mjs && pnpm run verify:hooks`
- Expected: 双绿。
- [ ] Step 4: 体积与幻影 M 判定
  - Run: `node -e "const s=require('fs').statSync('lib/client.js').size;console.log(s);process.exit(s<400000?0:1)"`；`git diff --exit-code -- lib`（status 有 M 时以 diff 为准，幻影 M 用 `git add` 刷 stat）。
- Expected: 体积断言过；真差异为零（或已入库）。

### Task 11: 新旧通道渲染 A/B（自建双树夹具 + 确定性负对照）

- 目标：实证 ADR-0023 Decision 10 的验收承诺——除 `background-image` 的 url 串外零漂移，1.5.21 内联通道与 1.5.22 路由通道同夹具渲染零差。仓库内**不存在**可复用的「自起服务渲染 client bundle」夹具（repro gate 是 live-host 连接模式、smoke 是假 DOM、routes 测试是假 req/res），本任务自建。
- Files
  - Create: `scripts/ab-delivery-compare.mjs`（入库，供未来通道变更复用）
- 夹具设计（脚本内实现，调用点序全链路）：
  - 每树一台 `http.Server`（127.0.0.1 随机端口）——静态宿主页 + 该树 `lib/client.js`；**新树**额外经 `src/index.js` 的 `apply()` 同构方式挂载个人化路由（`b_` 资产经真实路由取回；旧树壁纸为 data-URL 内联，无需路由）。
  - 宿主页内联与 smoke-test.cjs 同构的 `window.__ModuleLoader__`/模块桩（react/jsx-runtime 等），但以真浏览器 DOM 运行；URL 参数选皮肤/明暗。全链路：宿主页 → `ModuleLoader.load(id)` → bundle 注册工厂 → runtime.apply → backdrop.css → 壁纸 URL 取回（新树走本树路由）。
  - **机理依据**：桩保真度只影响绝对像素、不影响差分——两树经同一宿主页同一桩渲染，判据是差分零。
- 接口契约
  - Consumes: Task 7 `awaitWallpaperSettled`；v1.5.21 tag（git worktree 旧树构建）；`scripts/lib/paint-metrics.mjs` 的 PNG 解码器；transitions 冻结纪律（ADR-0017 纪要 ③：`*,*::before,*::after{transition:none!important}`）。
  - Produces: A/B 判定输出——3 皮 × 明暗 6 cell 的逐像素 δmax 与 computed-style diff 摘要（唯一允许差异字段 = `background-image` 的 url 串）；`--abort-builtin-assets` 负对照模式。
- 验证范围：`node scripts/ab-delivery-compare.mjs --old <旧树> --new .` 输出 6/6 cell δmax=0；`--abort-builtin-assets` 负对照报非零 δ 且 fail-open 断言过。

- [ ] Step 1: 建旧树并构建
  - Run（逐条，danger-full-access）: `git worktree add <workspace>/.dsh-research/dsh-skins-1521 v1.5.21`
  - Run: `pnpm --dir <workspace>/.dsh-research/dsh-skins-1521 install --frozen-lockfile`
  - Run: `pnpm --dir <workspace>/.dsh-research/dsh-skins-1521 run build`
- Expected: 旧树 `lib/client.js` 构建成功。
- [ ] Step 2: 写 A/B 脚本并跑确定性负对照
  - 脚本按夹具设计实现；正式流程：对 3 皮 × 2 明暗各起页（transitions 冻结）、`awaitWallpaperSettled` 后整窗截图，paint-metrics 解码逐像素对比；另 dump `body` 与 pinned 表面集（与 repro-plugin-panel-readability 同集）computed style，diff 仅容 `background-image` url 串。
  - 负对照（确定性，非时序性）：`--abort-builtin-assets` 模式用 playwright route 拦截 **abort** 全部 `/dsh-skins/assets/b_` 请求——期望 (a) 新旧树 δ≠0（壁纸缺席必然可检出，不依赖时序）；(b) **fail-open 实证（断言面按皮分支——runtime.js backdropCss 的 `::after` 纱层规则仅 overlay 型产出，uefi/openbmc 为烘焙型无 `::after`）**：meirenzhi（overlay 型）断言 `body::after` 规则在位且 background-image 含 linear-gradient、`body` 底色照常；uefi（烘焙型）断言 computed `background-image` 仍含 linear-gradient 首层（纱层 gradient 与 art 为同层多背景、独立绘制，art 被 abort 后 gradient 照常画）。二者共同构成 B4 契约 + B5「冷缓存首载 fail-open 呈现」的离线近似。
  - Run: `node scripts/ab-delivery-compare.mjs --old <workspace>/.dsh-research/dsh-skins-1521 --new . --abort-builtin-assets`
- Expected: 报出非零 δ 且 fail-open 断言过（负对照成立，证明非恒真断言）。
- [ ] Step 3: 正式 A/B
  - Run: `node scripts/ab-delivery-compare.mjs --old <workspace>/.dsh-research/dsh-skins-1521 --new .`
- Expected: 6/6 cell δmax=0 且计算样式仅 url 串差异；任何非零 δ → 停下分析（AA 量化残差走 ADR-0017 目测终裁先例并记录）。
- [ ] Step 4: 清理与 checkpoint
  - Run: `git worktree remove <workspace>/.dsh-research/dsh-skins-1521 --force`
  - Run: `git add scripts/ab-delivery-compare.mjs && git commit -m "test: self-hosted dual-tree A/B harness with abort negative control (ADR-0023)"`
- Expected: worktree 移除；脚本入库。

### Task 12: desktop 本机实机验证与发版

- 目标：双端前提收口——desktop 实机验证后按仓内序列发版，web 实机补课清单交付。
- Files
  - 无代码改动；产出验证记录（对话/commit 附注，不入公开仓——脱敏）。
- 接口契约
  - Consumes: Task 10/11 全绿；npm 发版环境（`npm_config_cache` 指向 workspace 内路径）。
  - Produces: npm `1.5.22` registry 转正；desktop 实机验证记录；web 实机补课清单。
- 验证范围：desktop 托盘完全退出重开后——`b_` 资产请求 200（devtools Network 过滤 `dsh-skins/assets/b_`）、内置壁纸（含本机存选 `builtin:meirenzhi:yinyue`）全链路渲染、三皮 × 明暗目检、通透度旋钮 0→100→回厂随动、官方往返/自动保存/重启保留（ADR-0017 amendment 同款清单）；冷缓存首载 fail-open 呈现（壁纸后到不挡 UI）。

- [ ] Step 1: 发版（按 docs/developers.md「发版」节序列）
  - 前提：`npm_config_cache=<workspace>/.npm-ci-cache`；Actions publish 成功后按 know-how 018 两阶段监视脚本轮询 registry 转正（npmjs 直查为准，窗口内不重推 tag）。
- Expected: registry `1.5.22` 可查。
- [ ] Step 2: desktop 升级实机验证
  - 本机 `%USERPROFILE%\.dsh\profiles\desktop\` 插件升级至 1.5.22 → 托盘完全退出重开 → 按验证范围逐项记录。
- Expected: 全项过（任一红 → 停下按 developers.md 排查，不带病发后续）。
- [ ] Step 3: web 实机补课清单交付
  - 输出核对清单（同 Step 2 项 + web 机 DSH 实例 b_ 资产 200）交 web 机执行，24h 内完成（ADR-0017 amendment 先例：headless 全绿即发，实机为补课性质）。
- Expected: 清单交付并跟踪闭合。

## 执行纪律

- 开始实现前，先批判性复查整份计划与 ADR-0023；发现缺项、矛盾、命名不一致或验证命令无效，先修计划再动手。
- 按任务顺序执行（1→12），不无声跳步、合并步或改变任务目标；Task 3 与 Task 4 可互换，Task 11 必须晚于 Task 7 与 Task 10，其余有依赖。
- 每完成一个任务，运行该任务定义的验证；红则停在该任务内修。
- 遇阻塞（如生成器素材不可达、desktop 实机红）、重复失败或计划与仓库现实不符，立即停下说明，不要猜。
- 构建类命令（esbuild 家族）一律 danger-full-access 会话执行；`pnpm test` 等长命令 run_in_background；npm 链先设 `npm_config_cache`。
- 若当前分支为 main 且未获明确同意，开工前先与用户确认分支策略。
- 全部任务完成后运行最终验证并输出修改摘要。

## 最终验证

- `pnpm test`（全链）全绿。
- `node scripts/verify-bundle-guard.mjs` 绿（固定上限 + manifest 漂移）。
- `pnpm run verify:hooks` 绿。
- `node scripts/ab-delivery-compare.mjs` 正式轮 6/6 cell 零差（计算样式仅 url 串差异）。
- `lib/client.js` < 400,000 字节（目标约 330KB），记录实测值。
- desktop 实机验证清单全过；web 补课清单已交付。
- `git log --oneline` 显示 Task 1-9 与 Task 11 各 checkpoint；`git diff --exit-code` 无未入库真差异。

## 审阅 Checkpoint

- 计划正文结束；请审阅。批准前不进入实现，默认执行方为普通编码 agent 或人工执行者。
