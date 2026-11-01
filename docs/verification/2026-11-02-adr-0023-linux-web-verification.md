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

## 冷加载默认壁纸闪现（已修复：首屏提示，待独立复核）

- 决定（主人，2026-11-02）：发版前修复。
- 事实（修复前）：stored 为 meirenzhi 的冷加载，挂载先按默认壁纸 `yuntai` 进行，配置快照同步后热更新为用户覆盖 `yinyue`。机制为 §7.1 既有设计。修复前候选在本机无网络拦截条件下（每臂 n=5，交错，fresh context）测得：默认样式生效至用户样式生效的中位数 578 ms（区间 486–625）。ADR-0023 相对 pre-ADR 的增量未能干净测量，不作增量结论（见「探针与记录更正」）。
- 修复：客户端在每次普通模式同步成功后缓存各皮肤覆盖值与被引用的图库元数据（localStorage `dsh-skins:first-paint-hint`）；同步前挂载与资产解析读取该缓存，快照到达后以服务器为准。细节见 `docs/developers.md`「首屏提示」。
- 单测：`tests/first-paint-hint.test.mjs` 8 条（红灯复演：实现前 4 条行为测试失败；实现后 8/8 通过；全部单测 410/410）。
- 活体验证（临时持久化 profile，独立于真实浏览器；未写服务器配置；控制台日志与原始 JSON 见私有目录）：
  - 首次访问（无缓存）：先显示 `yuntai`（约 2.35 s），约 0.76 s 后切到 `yinyue`。这是一次性行为，属于有意保留。
  - 热冷加载 ×3（有缓存）：首个挂载即为 `yinyue`（约 1.39–1.79 s），无 `yuntai` 请求，挂载后无任何切换。
  - 陈旧缓存（人为设为 `yuntai`）：先 `yuntai`，同步后收敛到服务器的 `yinyue`；收敛后缓存被刷新，再次冷加载直接为 `yinyue`。
- 注意：修复只对「已在该浏览器完成过一次新版加载」的用户生效；新版首次加载会写入缓存，之后的冷加载生效。

## 探针与记录更正

- 本轮曾报出两项数字，已撤回且不在本记录中作结论：(a)「候选 config→热更新间隔比 pre-ADR 长约 190–300 ms」；(b)「pre-ADR 臂默认可见中位数 681 ms」。二者源于拦截式对照臂的路由范围过宽，混入了页面环境差异。
- 矩阵记录中 uefi 条目的 scopeAttrs 为空，是探针正则缺陷，已在清单中以 `flash-frames` 为准。

## 复现要点（脱敏）

- 门禁：`pnpm run check` 退出码 0；`node scripts/verify-delivery.mjs`（打印 `ran over 7 packaged file(s)`，无 SKIPPED）；`node scripts/verify-bundle-guard.mjs`。
- 生效探针：宿主下发的 dsh-skins 客户端前缀逐字节包含候选 `lib/client.js`，其后仅追加宿主的 sourceMappingURL 注释；磁盘 profile 的客户端与候选 sha256 一致。
- 资产：7 个打包 `b_` 资产的活体字节与包内文件逐一相等；浏览器层 7 个 `b_` 响应全部 200，无配置写入。
- 负对照：缺席键 `b_missing-skin_missing-key` 返回 404。
