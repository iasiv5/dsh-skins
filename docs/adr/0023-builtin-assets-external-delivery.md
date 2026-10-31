# 内置资产出仓：builtin 壁纸/原画并入宿主资产路由（client bundle 减重）

---
status: accepted
date: 2026-10-31
---

## 背景

架构评审（improve-codebase-architecture 流程 + 双子代理只读调查交叉确认）坐实：`lib/client.js` 实测 3,375,471 字节，其中 **94.4% 是内联图片数据**——美人志 6 张内置精选 base64 共 2,948,223 字符（87.3%）、openbmc/uefi 原画 232,989 字符（6.9%），真实代码仅约 190KB。出厂注册序 openbmc → uefi → meirenzhi（src/client/index.js），**默认用户为他们从未选用的美人志壁纸支付每次页面加载约 20-50ms 主线程阻塞 + 约 6-7MB RSS**（web/desktop 双端、每次刷新）。且增长是契约性的：verify-bundle-guard 公式 = 代码基线 + ΣWebP×4/3 + slack，基线两次棘轮只升不降（770,785 → 776,360），MAX_TOTAL_WEBP_BYTES=4,700,000 祝福约 7MB 的 bundle。

通道事实（子代理逐行核验）：

- **同缝已有两个真实 adapter**：用户图库资产走 `/dsh-skins/assets/` HTTP 路由（immutable + etag + CORP + path rebuilt from trusted metadata，personalization-routes.js），内置资产走 JS 内联 data-URL；`assetResolver`（src/client/index.js）的 `{url, mime}` 形状两态同构，投影核与 panel 缩略图逐字消费 url、零感知来源。
- **Desktop `dsh-app://app/` 可达性机制实证**（dsh-desktop 0.2.1-rc.5，main.js:12406-12415/8268-8299）：protocol.handle 白名单外一切路径经 forwardWebRequest 转发给 Desktop Host 同一 webServer；content-type/etag/cache-control 头透传；loopback fence 全过；同通道 `/config` 当日活写入（revision 525）旁证。
- **无禁令**：22 篇 ADR 零裁决此题；产品 2026-09-01 方案 B 裁决只钉编码参数（WebP q80 / 2560 宽 / 无逐图搜索）；design doc「embed-in-JS、零 asset loader」是通道描述非排他性禁令。
- **持久化零迁移**：壁纸选择存 ref（`builtin:<skin>:<key>`，BUILTIN_REF_PATTERN），从不存 URL——URL 形态变化对存量配置不可见。

## Decision

1. **范围**：美人志 6 张内置精选 + uefi 原画外置；openbmc 原画（出厂皮默认视觉资产）留内联；各皮 favicon/Mark data URL 不动。
2. **规则升格**：「**出厂皮肤的默认视觉资产内联，其余内置资产一律外置**」——措辞钉「出厂皮肤」而非具体皮肤名，出厂皮换人时规则自动跟随；第四张皮肤上线对非用户 bundle 成本≈0。
3. **通道并轨**：`/dsh-skins/assets/` 前缀新增 `b_<skinId>_<assetKey>.<ext>` 键类（skinId/assetKey 字符集不含下划线，与 BUILTIN_REF_PATTERN 对齐，解析无歧义）；`assets/manifest.json`（生成期产出、随包分发）为 trusted metadata 唯一来源；响应头继承既有 `private, max-age=31536000, immutable` + `etag("<sha256>")` + CORP same-origin + nosniff。
4. **缓存击破**：内置资产 URL 携带 `?v=<插件版本>`（构建期自 package.json 注入）；插件升级即天然换 URL 重取一次，immutable 语义安全，无需内容寻址文件名。
5. **URL 单源**：客户端 `builtinAssetUrl(skinId, assetKey)` 为唯一构造点；index.js assetResolver 用户分支对 `/dsh-skins/assets/` 的直拼孪生随迁移收敛至 `configClient.assetUrl`。
6. **fail-open 契约**：内置资产取不回时底色+纱层照常呈现、不挡任何 UI、不触发皮肤失效回退；**不并入「悬空预览」**——后者是「用户编辑注定无法保存须点名回退」的领域语义，前者是瞬时基础设施状态，归并会污染词条。
7. **守卫公式改形**：verify-bundle-guard 从增长棘轮退化为**固定代码上限 + 单行长度上限**（防巨串回潮）；ΣWebP 漂移守卫（单张 ≤640,000 / meirenzhi 合计 ≤2,300,000，原值原样逐字保留）转移至 manifest 校验。
8. **gate 时序契约**：repro-fullscreen-collapse 与 repro-stale-grid-paint 增加壁纸 settled 确定性等待（computed `body::before` 背景 URL 探针 + Image onload），**阈值不放宽**；等待超时按既有叙事单列 INVALID 而非 FAIL；repro-plugin-panel-readability（纯 computed-style）与 paint-metrics 不受影响。
9. **预热增强（随批、非发版阻塞）**：`runtime.select()` 时预热目标皮肤生效壁纸（catalog 默认 ref + overrides 解析，仅外置 URL 时 `new Image()` 预热）——以零常驻字节封死「首换观感」路径。
10. **验收**：计算样式逐字段等价（除 background-image url 外零漂移）+ headless 像素 A/B（图片经路由取回后渲染）+ smoke/goldens 再生 + desktop 本机实机（`b_` 资产 200、内置壁纸全链路、三皮目检、通透度随动）+ 冷缓存首载 fail-open 呈现确认；web 实机补课为发版后动作（ADR-0017 amendment 先例：headless 全绿即发，实机补课）。
11. **版本与发布**：独立正式版本 `1.5.22`；发版走 developers.md「发版」节 + npm staged 轮询纪律（know-how 018）。

## Considered Options

- **每皮默认壁纸内联（ minimize 首换卡顿感）——被否**，五点：① data URL 只省 loopback 取回（首换 2-5ms、此后 immutable 缓存 0ms），省不掉异步解码（10-50ms 两种形态同价）且多付 base64 反解；② 收益窗口被换肤自身开销吞没（7 标签两轮拔插 + double-rAF + 200ms sweep，SWEEP_MS=200）；③ 受益人群是「存选恰为默认」的永久萎缩集（本机实证：存选 `builtin:meirenzhi:yinyue` ≠ 默认 yuntai，默认内联对本机用户 100% 死重）；④ 守卫公式重开「代码+Σ默认×4/3」增长洞，洞的边界（为何默认可、非默认不可）永远说不圆；⑤ 正方诉求由 Decision 9 预热以零常驻成本满足。
- **独立 `/dsh-skins/builtin/` 前缀——被否**：同缝两 adapter 归一是本案本体；新前缀造第二路由族，缓存/安全语义重复发明。
- **绝对 URL / configClient base 拼接——被否**：dsh-app:// 转发机制下根相对路径天然同源直达，事实链已排除需求。
- **放宽壁纸敏感 gate 阈值容忍无图基线——被否**：把「壁纸加载失败」洗成绿，恰好废掉两个 gate 对 fail-open 契约的监视能力。
- **fail-closed（取不回即回退官方皮肤）——被否**：壁纸是装饰层，底色+纱链独立成立；瞬时基建状态不应触发换肤级回退。

## Consequences

- `lib/client.js` 约 3.37MB → 约 330KB（代码 ~190KB + openbmc 原画 139.5KB + favicon/Mark 数 KB），**-90%**；每次页面加载双端省约 3MB parse/eval/驻留；npm tarball 体积基本不变（webp 文件随包分发）。
- 增长斜率归零：新皮/新壁纸只进 assets 目录与 manifest，不进 bundle；守卫从棘轮变闸门。
- ADR-0014 生产面七字段形状不变，`builtinAssets` 的 `{url, mime}` 从 data-URL 变路由 URL；投影核、panel 缩略图、assetResolver 消费端零改动。
- 测试改造面（事实调查钉死）：smoke-test.cjs:410、meirenzhi-skin.test.mjs:31、runtime-effects.test.mjs:201、personalization-projector.test.mjs:225/278/345、生成器及其测试、verify-bundle-guard、两个壁纸敏感 repro 增等待；fixture 驱动测试与路由金值（前缀不变）零改动。
- 升级零迁移（ref 持久化）；降级旧版无冲突（资产目录只读新增）。
- GLOSSARY 零改动（交付通道是工程决策非领域语言；「内置精选」定义「皮肤自带的可选壁纸，不可删除」原样成立）。

## Amendments

- 无（首版）。

## 附录：grill 共识（Q1–Q14，2026-10-31 会话存档）

Q1 范围=美人志 6 张+uefi 原画外置、openbmc 留内联、favicon/Mark 不动；Q2 首绘=出厂零窗口、meirenzhi 存选用户接受一次本地取回（缓存后零成本）；Q3 并轨 `/dsh-skins/assets/` 扩 `b_` 键；Q4 fail-open 且不并入悬空预览；Q5 验收=计算样式+像素 A/B+smoke/goldens 再生+desktop 真机+冷缓存首载；Q6 守卫=固定代码上限+漂移守卫转移 manifest（原值逐字保留）；Q7 版本 1.5.22（主人裁决 patch 直发）；Q8 ADR-0023 落档、GLOSSARY 零改动；Q9 出厂内联规则升格（「每皮默认内联」钢人否决，见 Considered）；Q10 Desktop 不可达则 hold（后经事实链证可达，保险丝保留在案）；Q11 双端执行=desktop 本机实测、web headless 全绿即发、web 实机为发版后补课；Q12 URL 根相对+单源 helper+删孪生硬编码；Q13 gate 确定性等待、阈值不放宽、超时单列 INVALID；Q14 select() 预热随批入 ADR、非发版阻塞。
