# ADR-0023 重落地：Linux Web 实机验证记录（脱敏）

- 日期：2026-11-02
- 版本：`@iasiv5/dsh-skins` 1.5.25（未发布；发版须主人拍板）
- 产品树基线：`c505332`（产品树 src / lib / assets / locale / package.json 与 `409dfde` 零差异；其后的提交只改动 `scripts/hot-deploy.sh` 与 `docs/`）
- 验证环境：本机 Linux DSH Web 实例（loopback 访问），宿主 release 0.2.1-rc.5（来源：页面启动数据的 release 字段）
- 验收机裁量：依 ADR-0023 Amendment（2026-11-01，验收机裁量）。desktop 真机目检延后至下次 Windows 会话；本记录仅覆盖 Linux Web 机真机项
- 私有证据（截图、原始日志、工作区相关信息）保存于工作区 `01_docs` 下的 `dsh-skins-verification/`，不入库

## 结论（本机范围）

- 机器可判项全部通过；视觉粗判三套皮肤均正常。
- 冷加载默认壁纸闪现（§7.1 既有机制）已按主人决定在发版前修复，见下节。
- 未覆盖：desktop 真机（延后）；CI 中 every-commit 任务在 push 后的实际运行（本地逐提交模拟 21/21 通过）。

## 清单结果

| 项 | 结果 | 要点与证据 |
|---|---|---|
| 三皮切换（openbmc / uefi-harness / meirenzhi） | 通过 | 切换后各皮肤作用域属性就位（逐帧记录 `flash-frames`：openbmc、meirenzhi、uefi-harness 三种作用域集合均出现）；无 pageerror；openbmc 美术为内联（无 `b_` 请求，符合 Decision 2）；uefi 的 `b_uefi-harness_art` 200 + immutable + etag；视觉粗判正常。注：矩阵记录中 uefi 条目的 scopeAttrs 为空，是探针正则缺陷（uefi 作用域属性名为 `data-dsh-uefi-harness`），以 `flash-frames` 为准 |
| meirenzhi 内置精选全链路（7 个 `b_` 资产） | 通过 | 浏览器层 7 个不同资产全部 200（immutable、etag）：打开美人志面板的 6 个缩略图（`b_meirenzhi_*`）+ UEFI 美术（选择皮肤时的背景）；全程未写入配置（revision 不变）。资产字节 7/7 与包内文件逐一相等。证据：`network-7of7`（浏览器层）、`asset-bytes-7of7`（活体字节） |
| 通透度 0→100→35 随动 | 通过 | 壁纸区域亮度标准差 46.2 / 19.9 / 2.95（0 / 35 / 100），单调；内容底色 alpha 0 / 0.35 / 1；配置测后逐项还原（revision 907→910，其余一致） |
| 霜面底 / 阅读底 | 通过 | 霜面底：单测「fullscreen base」（94% 霜面配方字节钉、状态作用域，402/402 通过）+ `repro-fullscreen-collapse --gate` PASS（收起后绘制连续）。阅读底：`repro-plugin-panel-readability --gate` PASS（实色压在壁纸之上，填充 rgba 0.72） |
| 冷缓存首载 fail-open（中止全部 `b_` 请求） | 通过 | 页面正常渲染，UI 不挡，纱层仍在；无 pageerror，仅记录两条资源 ERR_FAILED |
| 切肤零闪烁（bb63036 语义） | 通过 | `repro-stale-grid-paint --gate` 6/6；切换期间逐帧采样 117 帧：空样式标签 0 帧、皮肤样式缺失 0 帧；单测覆盖 sweep 同步性与同肤热更新不 sweep |
| 资产字节与路由头 | 通过 | 资产 200、`image/webp`、`cache-control: private, max-age=31536000, immutable`、etag 与内容 sha256 一致；缺席键 404（落盘：`negative-control-404`） |
| 热部署往返（临时 profile，仓库外） | 通过 | 有 assets 与无 assets 两种场景：部署 → 执行打印的回滚指令 → 逐字节等于部署前快照。注：首次运行时脚本仍为工作区修改态，随后提交为 `af44c61`；评审方在 `c505332` 上独立复跑通过 |
| desktop 真机 | 延后 | 依 Amendment（验收机裁量）；下次 Windows 会话补做 |

## 冷加载默认壁纸闪现（已修复并经独立复核：首屏提示，评审 R4–R6）

- 决定（主人，2026-11-02）：发版前修复。
- 事实（修复前）：stored 为 meirenzhi 的冷加载，挂载先按默认壁纸 `yuntai` 进行，配置快照同步后热更新为用户覆盖 `yinyue`。机制为 §7.1 既有设计。修复前候选在本机无网络拦截条件下（每臂 n=5，交错，fresh context）测得：默认样式生效至用户样式生效的中位数 578 ms（区间 486–625）。ADR-0023 相对 pre-ADR 的增量未能干净测量，不作增量结论（见「探针与记录更正」）。
- 修复：客户端在每次普通模式同步成功后缓存各皮肤覆盖值，以及被这些覆盖值引用到的图库条目（仅被引用的，localStorage `dsh-skins:first-paint-hint`）；同步前挂载与资产解析读取该缓存，快照到达后以服务器为准。新缓存超过大小上限或写入被存储拒绝时尽力删除旧缓存（删除也被拒绝时旧缓存可能保留，见 `developers.md`）；库条目的 id、mime 与扩展名不合格时丢弃。细节见 `docs/developers.md`「首屏提示」。
- 单测：`tests/first-paint-hint.test.mjs` 13 条。R4 复核后新增 3 条（大图库只缓存被引用条目、超限删除旧缓存、不合格库条目丢弃）；R5 复核（F5）后新增 2 条（写入被拒绝时删除旧缓存；所有写入都被拒绝时仍能启动并以服务器为准）。F5 的 2 条新测试中，「写入被拒绝时删除旧缓存」实现前红灯，「所有写入被拒绝时仍能启动」为守护用例（实现前后均通过）；实现后 13/13 通过；全部单测 415/415。
- 活体验证（临时持久化 profile，独立于真实浏览器；未写服务器配置）。两次独立运行（执行方与评审方）定性结论一致，计时数字因运行而异：
  - 首次访问（无缓存）：先显示 `yuntai`，随后切到 `yinyue`。执行方：yuntai 挂载约 2.35 s，约 0.76 s 后切换；评审方：yuntai 约 2.34 s，切换间隔约 0.65 s。这是一次性行为，属于有意保留。
  - 热冷加载（有缓存）：首个挂载即为 `yinyue`，无 `yuntai` 请求，挂载后无任何切换。挂载时刻：执行方约 1.39–1.79 s；评审方约 1.84–2.04 s。
  - 陈旧缓存（人为设为 `yuntai`）：先 `yuntai`，同步后收敛到服务器的 `yinyue`；收敛后缓存被刷新，再次冷加载直接为 `yinyue`。执行方：yuntai 约 1.37 s、yinyue 约 1.95 s；评审方：yuntai 约 1.84 s、yinyue 约 2.42 s。
- 注意：修复只对「已在该浏览器完成过一次新版加载」的用户生效；新版首次加载会写入缓存，之后的冷加载生效。

## 探针与记录更正

- 本轮曾报出两项数字，已撤回且不在本记录中作结论：(a)「候选 config→热更新间隔比 pre-ADR 长约 190–300 ms」；(b)「pre-ADR 臂默认可见中位数 681 ms」。二者源于拦截式对照臂的路由范围过宽，混入了页面环境差异。
- 矩阵记录中 uefi 条目的 scopeAttrs 为空，是探针正则缺陷，已在清单中以 `flash-frames` 为准。

## 复现要点（脱敏）

- 门禁：`pnpm run check` 退出码 0；`node scripts/verify-delivery.mjs`（打印 `ran over 7 packaged file(s)`，无 SKIPPED）；`node scripts/verify-bundle-guard.mjs`。
- 生效探针：宿主下发的 dsh-skins 客户端前缀逐字节包含候选 `lib/client.js`，其后仅追加宿主的 sourceMappingURL 注释；磁盘 profile 的客户端与候选 sha256 一致。
- 资产：7 个打包 `b_` 资产的活体字节与包内文件逐一相等；浏览器层 7 个 `b_` 响应全部 200，无配置写入。
- 负对照：缺席键 `b_missing-skin_missing-key` 返回 404。

## 用户图库图片（上传）的壁纸验证

- 前提：图库含一张用户上传的图片（JPEG，1280×1280，约 214 KB；显示名与 id 不记入本记录），已被用户设为出厂 openbmc 皮肤的壁纸。
- 图片路由：`/dsh-skins/assets/<id>.jpg` 返回 200，`image/jpeg`，`cache-control: private, max-age=31536000, immutable`，ETag 与响应体 sha256 相等，并与图库记录的 sha256 一致；不存在的 id 返回 404。
- 冷加载时间线（临时持久化 profile，独立于真实浏览器；未写服务器配置，修订号前后一致）：
  - 首访（无缓存）：先显示内置美术，约 0.7 s 后切到用户图片（一次性，有意保留）。采样时曾出现两个相近的内联取值，经按图片身份核对，二者是同一张内置美术，差别仅在随主题变化的渐变遮罩。
  - 热冷加载 ×3（有缓存）：首个挂载即为用户图片，无切换，图片请求均为 200。
  - 陈旧缓存（人为清空覆盖）：先内置美术，同步后收敛到用户图片；收敛后热冷加载直接为用户图片。
- 视觉（粗粒度判读）：热冷加载的截图显示用户图片为 openbmc 背景，界面可读。截图含真实会话标题，仅存于工作区私有目录。
- 未覆盖：用户图片在上传后、同步前的仅有单测覆盖的分支已由本次活体覆盖（热冷加载即是该路径）；桌面真机仍按 Amendment 延后。

## 写入审计日志（实现与状态）

- 配置存储的每次提交（安装、规范化、批量写、上传、删除、恢复确认与清理）追加一行 JSON 到 `audit.jsonl`，字段值只记引用与标量，显示名不写入；单测 5 条（其中 4 条实现前红灯、1 条守护用例）；全部单测 420/420。
- 状态：已生效。经主人批准，于 2026-11-02 11:30（本机时间）由分离式定时器重启宿主（`deepseek-harness.service`），重启后健康检查 200，存储模式 normal，修订号与内容不变。
- 活体验证（经主人批准的通透度往返测试，美人志 0 → 100 → 35，35 即出厂值）：产生 3 次提交，修订号 926 → 929，审计日志恰好 3 条（来源 operations，字段 `panelOpacity` 的差异分别为 `null → 0`、`0 → 100`、`100 → null`，最后一次为 delete）；提交前后的配置内容逐项相同。审计条目不含图库显示名。

## 发版前检查（2026-11-02 准备阶段，基线 c5f774a）

| 项 | 结果 | 要点 |
|---|---|---|
| 版本占用 | 通过 | `npm view @iasiv5/dsh-skins@1.5.25` 为 404（准备阶段复验）；本地无 v1.5.25 tag |
| 发布链路核对 | 通过 | Release workflow 由 `v*` tag 触发：verify-release → 全门禁 → lib 对账 → pack → 产物宿主加载测试 → npm OIDC 可信发布（无需本地凭据）→ GitHub Release；含 staged 重推安全守卫与失败自动删 tag |
| 全量门禁（最终提交） | 通过 | 全新副本于 c5f774a 执行 `pnpm run check` 退出码 0（420/420、repro 三门禁 PASS、delivery 7 资产、bundle 守卫、README 配对、lib 同步）；另于 339496f 亦为 0 |
| 逐提交可构建性（CI every-commit 的本地模拟） | 通过 | db05a2d..c5f774a 共 36 个提交，逐个检出、构建、lib 对账，36/36 通过 |
| verify-release 两式 | 通过 | 无 tag 形式与 `v1.5.25` 形式均退出码 0 |
| pack 内容 | 通过 | 19 项：assets（8）、lib（2）、locale（2）、README 三件、cordis.patch.yml、icon.svg、LICENSE、package.json；无测试或私有文档混入 |
| 脱敏终审 | 通过 | 推送区间新增行对本机绝对路径、公网 IP/域名、反代路径前缀、真实用户资产 id、凭据样式、模型名称全部零命中；两处新增行的本机路径已改为仓库相对/无路径表述后复扫确认 |
| CI 实际运行 | 通过 | push 后首跑全绿：check 1m07s、every-commit-buildable 34s（run 41386084434） |
| npm staged 轮询与三键核验 | 通过 | Release workflow 1m10s 全绿（run 41386235415）；staged 窗口约 3 分钟后三键齐全（per-version 200、dist-tags.latest=1.5.25、packument time 2026-11-02T04:06:39Z）；GitHub Release v1.5.25 带 tarball；已下载发布 tarball 与本地 tag 逐字节比对（client/index/manifest 全 MATCH） |
| desktop 真机目检 | 延后 | 按 Amendment，下次 Windows 会话补做 |
