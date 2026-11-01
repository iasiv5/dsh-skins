# ADR-0023 重落地：Linux Web 实机验证记录（脱敏）

- 日期：2026-11-02
- 版本：`@iasiv5/dsh-skins` 1.5.25（未发布；发版须主人拍板）
- 产品树基线：`c505332`（产品树 src / lib / assets / locale / package.json 与 `409dfde` 零差异；其后的提交只改动 `scripts/hot-deploy.sh` 与 `docs/`）
- 验证环境：本机 Linux DSH Web 实例（loopback 访问），宿主 release 0.2.1-rc.5（来源：页面启动数据的 release 字段）
- 验收机裁量：依 ADR-0023 Amendment（2026-11-01，验收机裁量）。desktop 真机目检延后至下次 Windows 会话；本记录仅覆盖 Linux Web 机真机项
- 私有证据（截图、原始日志、工作区相关信息）保存于工作区 `01_docs` 下的 `dsh-skins-verification/`，不入库

## 结论（本机范围）

- 机器可判项全部通过；视觉粗判三套皮肤均正常。
- 冷加载默认壁纸闪现属于既有设计行为（§7.1），见下节；是否接受由主人决定。
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

## 冷加载默认壁纸闪现（待主人决定）

- 事实：stored 为 meirenzhi 的冷加载，挂载先按默认壁纸 `yuntai` 进行，配置快照同步后热更新为用户覆盖 `yinyue`。
- 来源：design §7.1 既有机制（「先按默认挂载，同步后热更新」）。db05a2d 已存在该注释与机制；`src/client/personalization/config-client.js` 在 db05a2d..HEAD 之间零改动，`src/client/index.js` 仅一行用户图库资产 URL 构造变化。
- 本机测量（候选，无网络拦截，每臂 n=5，交错，fresh context，同宿主同配置；rAF 采样 `body::before` 的取值，非绘制时刻）：默认壁纸样式生效至用户壁纸样式生效的间隔中位数 578 ms（区间 486–625）；首次配置响应到用户壁纸样式生效的间隔中位数 543 ms（区间 455–592）。
- 限制：与 pre-ADR 的比较不能得出结论。拦截式对照臂自身带有拦截开销，且替换客户端会改变页面环境；跨会话差异约 200 ms，低于该量级的差异不可靠。因此本记录不给出 ADR-0023 的增量数字。
- 决定项（主人）：(1) 接受本次发版范围内的该既有行为，并在发布说明中注明（推荐）；或 (2) 发版前修复，候选方案为「缓存上次生效的壁纸引用用于首挂载」或「配置同步前不挂载壁纸层」。

## 探针与记录更正

- 本轮曾报出两项数字，已撤回且不在本记录中作结论：(a)「候选 config→热更新间隔比 pre-ADR 长约 190–300 ms」；(b)「pre-ADR 臂默认可见中位数 681 ms」。二者源于拦截式对照臂的路由范围过宽，混入了页面环境差异。
- 矩阵记录中 uefi 条目的 scopeAttrs 为空，是探针正则缺陷，已在清单中以 `flash-frames` 为准。

## 复现要点（脱敏）

- 门禁：`pnpm run check` 退出码 0；`node scripts/verify-delivery.mjs`（打印 `ran over 7 packaged file(s)`，无 SKIPPED）；`node scripts/verify-bundle-guard.mjs`。
- 生效探针：宿主下发的 dsh-skins 客户端前缀逐字节包含候选 `lib/client.js`，其后仅追加宿主的 sourceMappingURL 注释；磁盘 profile 的客户端与候选 sha256 一致。
- 资产：7 个打包 `b_` 资产的活体字节与包内文件逐一相等；浏览器层 7 个 `b_` 响应全部 200，无配置写入。
- 负对照：缺席键 `b_missing-skin_missing-key` 返回 404。
