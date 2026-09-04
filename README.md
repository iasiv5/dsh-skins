# dsh-skins — DSH Web 多皮肤插件

[![Release](https://img.shields.io/github/v/release/iasiv5/dsh-skins?label=Release&sort=semver)](../../releases)
[![CI](https://img.shields.io/github/actions/workflow/status/iasiv5/dsh-skins/ci.yml?branch=main&label=CI)](../../actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/iasiv5/dsh-skins?label=License)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@iasiv5/dsh-skins?label=npm)](https://www.npmjs.com/package/@iasiv5/dsh-skins)
[![DSH Web](https://img.shields.io/badge/DSH%20Web-0.1.1--rc.2%20verified-2563eb)](#faq)

[English](./README.en.md) · 中文

为 DeepSeek Harness Web 换上可热切换的品牌皮肤，随时一键回到官方界面。

![凡人修仙传 · 美人志 — 出厂默认壁纸「云台雅集」](docs/assets/preview-meirenzhi-1.webp)

## 30 秒上手

本节回答：怎么装上、怎么换皮肤。

```sh
dsh plugin --profile web add @iasiv5/dsh-skins
```

1. 执行上面的安装命令。
2. 重启 DSH Web（例如 `systemctl restart` 对应的服务，按你的部署方式而定）。
3. 刷新页面。
4. 点击侧栏底部的「皮肤切换」，挑选皮肤。

首次安装且尚无已保存的选择时，默认启用「凡人修仙传 · 美人志」（出厂皮肤）。需要可复现安装时，固定到精确版本（与一键更新落地后的形态完全一致）：

```sh
dsh plugin --profile web add @iasiv5/dsh-skins@1.0.0
```

更新与卸载：

```sh
dsh plugin --profile web update @iasiv5/dsh-skins    # 更新
dsh plugin --profile web remove @iasiv5/dsh-skins    # 卸载
```

安装了 [dsh-m](https://github.com/iasiv5/dsh-m) 插件市场的话，也可以直接在 DSH Web 界面里一键安装 / 卸载本插件。

<details>
<summary>把安装交给 Agent（提示词安装法）</summary>

把下面这段整体复制给 DSH Web 里的 Agent：

```text
帮我安装 DSH 皮肤插件 @iasiv5/dsh-skins：
1. 执行 dsh plugin --profile web add @iasiv5/dsh-skins；
2. 安装成功后重启 DSH Web（若由 systemd 管理，重启对应服务即可）；
3. 最后提醒我刷新页面。
若安装失败，把命令输出原样发给我，最多重试一次。
```

</details>

## 五款外观

本节回答：有哪些皮肤、各是什么气质。

| 选择 ID | 类型 | 描述 |
|---|---|---|
| `official` | 内置选项 | 素笺玄墨 · 留白生辉 · 本色天成 |
| `meirenzhi` | 正式皮肤 · 出厂默认 | 云鬓花颜 · 霞衣夜月 · 凡尘问道 |
| `openbmc` | 正式皮肤 | 冰绡叠浪 · 风雷入画 · 缥碧盈卷 |
| `uefi-harness` | 正式皮肤 | 紫电初醒 · 流霞渐染 · 绀青成韵 |
| `tgcf` | 正式皮肤 | 千灯引路 · 朱红鎏金 · 长夜同明 |

- `official` 恢复 DeepSeek Harness 官方品牌、背景与 favicon，并保留皮肤切换器与官方明暗配色。
- `meirenzhi`（凡人修仙传 · 美人志）是**非官方粉丝作品**，与《凡人修仙传》版权方无关联、未获授权；内置 6 张壁纸均为 AI 生成粉丝画作，掌天瓶站点图标采用产品主人提供的图样，BEAUTY 徽章由 HTML/CSS 绘制，萤火粒子由 CSS 伪元素与径向渐变绘制，均不含官方素材。绯红鎏金亮暗双态，出厂标语「风起凡尘 · 红颜问道」。
- `openbmc`（OpenBMC Harness）：品牌位沿用 OpenBMC 项目官方 logo 的字标字形与蓝绿品牌渐变，仅作标识用途，权利归 OpenBMC 项目所有；背景铺「左风右雷」风雷原画，冰蓝缥碧亮暗双态，出厂标语「察于未萌 · 治于未乱」。
- `uefi-harness`（UEFI Harness）：品牌位用 UEFI Forum 官方标志（权利说明见「已知边界」）；背景铺「集成电路」电路板原画，紫电绀青亮暗双态，出厂标语「启于固件 · 行于万象」。
- `tgcf`（天官赐福 · 百无禁忌）是**非官方粉丝作品**，与《天官赐福》版权方无关联、未获授权；出厂壁纸为 AI 生成粉丝画作，站点图标与飘蝶装饰均为原创代码绘制的 SVG，不含任何官方素材。暗色朱红鎏金、亮色素白金线，出厂标语「百无禁忌」。
- 每套皮肤明暗各一套配色，跟随「外观配色」自动切换。

## 界面预览

以下均为浏览器实拍，四套扩展皮肤新旧俱备；图中壁纸随时可在个性化面板里更换（见下一节）。

### 凡人修仙传 · 美人志（出厂默认）

| | |
|---|---|
| ![云台雅集 · 合照（出厂默认壁纸）](docs/assets/preview-meirenzhi-1.webp) | ![紫灵（亮色）](docs/assets/preview-meirenzhi-2.webp) |
| ![南宫阙（深色）](docs/assets/preview-meirenzhi-3.webp) | ![银月（亮色）](docs/assets/preview-meirenzhi-4.webp) |
| ![慕沛灵（亮色）](docs/assets/preview-meirenzhi-5.webp) | ![南宫婉（亮色）](docs/assets/preview-meirenzhi-6.webp) |

单人壁纸依次为：紫灵、南宫阙（深色）、银月、慕沛灵、南宫婉；首张为出厂默认「云台雅集 · 合照」。

### 天官赐福 · 百无禁忌

| | |
|---|---|
| ![花城 · 银蝶灯笼（深色）](docs/assets/preview-tgcf-1.webp) | ![谢怜 · 云海宫阙（亮色）](docs/assets/preview-tgcf-2.webp) |

### OpenBMC Harness

![左风右雷（出厂壁纸 · 深色）](docs/assets/preview-openbmc-1.webp)

### UEFI Harness

![集成电路（出厂壁纸）](docs/assets/preview-uefi-1.webp)

## 个性化：壁纸、标语与通透度

本节回答：能调什么、怎么调、配置存哪。

每套皮肤的关键视觉都开放调整。点击皮肤卡片右侧的齿轮按钮，换肤弹层旁会展开该皮肤的个性化面板（窄窗口时上下堆叠）。四套皮肤（`tgcf` / `openbmc` / `uefi-harness` / `meirenzhi`）共用同一组可调项：

| 可调项 | 能做什么 | 出厂值 |
|---|---|---|
| **壁纸** | 从皮肤自带的「内置精选」里挑，或上传自己的图片进「个人图库」 | 各皮肤的默认画作 |
| **标语** | 新会话页的引导语，中文、英文各一份 | 皮肤出厂标语 |
| **通透度** | 0–100% 单值联动三个视觉层：面板底色、壁纸遮罩、模糊。0% 纯壁纸完全透出，100% 完全遮蔽 | tgcf / meirenzhi 35，openbmc / uefi-harness 55 |

![个性化面板 — 以美人志为例：内置壁纸网格、图库上传、中英标语与通透度旋钮](docs/assets/preview-personalization.webp)

### 上传自己的壁纸（个人图库）

- 支持 PNG / JPEG / WebP / GIF：单张 ≤ 20MB，GIF ≤ 12MP；动画 WebP 与 SVG 不收。
- 支持一次多选，逐张自动上传，逐张播报进度与失败原因。
- 图库没有数量上限，所有皮肤共用一份。
- 删除被引用的图片或清空图库前，会先列出全部受影响的皮肤与字段，确认后才会执行。

### 即改即存，无需保存

- 面板内任何修改立即生效，停顿约半秒自动写入配置。
- 双标签页约 1 秒内自动同步；离线时写入控件自动禁用，不会静默丢改动。
- 「恢复默认」是唯一带二次确认的操作：先列出将被重置的设置，确认后立即回出厂并自动保存。
- 面板展开时点击其他皮肤卡片，面板会随即切到该皮肤的设置。

### 配置存在哪、会不会丢

- 配置与图库存于 `$DSH_HOME/dsh-skins/`，与插件安装目录物理隔离：升级、回滚、一键更新都碰不到它。
- 配置只存「改过什么」：未改动的字段自动跟随新版本的默认值，已下线字段的残留会在加载时自动清理。
- 配置文件损坏时进入恢复模式：只重建索引、隔离坏文件，绝不清除你的图片。
- 上传走魔数校验与尺寸上限；并发写入按字段合并，互不覆盖。

## 皮肤切换器

本节回答：切换器里有什么、怎么用。

侧栏底部的「皮肤切换」弹层包含两个区块：

1. **外观配色**：浅色、深色、跟随系统。调用官方主题服务，与「设置 → 通用 → 外观」保持同步。
2. **选择皮肤**：第一项为 DeepSeek Harness（官方），其后是扩展皮肤。点击立即切换并持久化，弹层保持打开，方便连续预览。

![皮肤切换器弹层 — 外观配色与皮肤列表](docs/assets/preview-switcher.webp)

侧栏收起时，入口收为圆形调色盘图标；多个 `sidebar.footer.action` 入口会纵向排列、互不遮挡。选择「官方」只撤销扩展皮肤，不动你的明暗偏好。

URL 也能切皮肤：`/?skin=official`、`/?skin=meirenzhi`、`/?skin=openbmc`、`/?skin=uefi-harness`、`/?skin=tgcf`。

## 一键更新与安全设计

本节回答：怎么更新、为什么敢让它自己装。

打开皮肤切换器时，Host 会检查 npm registry 上 `@iasiv5/dsh-skins` 的最新正式版（latest 标签）；发现新版本后，更新栏会显示当前版本、最新版本与 npm 版本页链接：

1. 点击「更新」，下载、安装、校验自动完成；
2. 点击「立即重启」（或选「稍后」），新版本重启后生效；
3. 有 Agent 正在运行时阻止重启，任务结束后再试。

每一步都有代码校验，不靠信任：

- 只接受严格的 `X.Y.Z` 正式版本号（npm latest 标签）；
- 校验远端包名、仓库标识与版本元数据一致（含 `dist.integrity` 完整性摘要）；
- 实际安装固定到该精确版本，不跟随语义化版本范围漂移；
- 安装后复验 profile 与已安装包，失败自动恢复原版本；
- systemd 等服务管理器下，重启交回服务的 `Restart` 策略，不硬杀进程。

## FAQ

**怎么彻底回到官方界面？**
在皮肤切换器中选择「DeepSeek Harness（官方）」，或访问 `/?skin=official`。它撤销扩展皮肤的品牌、背景与 favicon，保留皮肤切换器与官方明暗配色，也不会改动你的浅色/深色/跟随系统偏好。

**更新失败会怎样？**
更新遵循「先备份、再安装」的事务流程，任何校验失败都会自动恢复原版本，弹层显示失败原因（中英双语）。仍失败时可用 `dsh plugin --profile web update @iasiv5/dsh-skins` 手动更新。

**支持哪些 DSH Web 版本？**
已使用 DSH Web `0.1.1-rc.2` 验证。同系列 rc 版本理论上兼容，未经验证的版本不作承诺。

**外观偏好在不同的浏览器间同步吗？**
在 DSH 所在机器的浏览器（loopback）上，偏好由 DSH Host 持久化，天然共享。其他远程浏览器由插件将偏好存入本地 `localStorage`，各浏览器独立、互不覆盖。

**个性化配置会随升级丢吗？**
不会。配置与图库存放在 `$DSH_HOME/dsh-skins/` 数据目录，自更新只替换插件安装目录，物理上碰不到它；回滚同样保留。只有磁盘级损坏可能丢失配置——那时恢复模式仍会保住图库图片。

## 已知边界

- 其他皮肤插件也可能修改 body 背景、品牌位或 favicon；应避免同时启用多个视觉皮肤插件。
- `openbmc` 的品牌位沿用 OpenBMC 项目官方 logo 的字标字形与品牌渐变色，仅作标识用途，权利归 OpenBMC 项目所有。
- `uefi-harness` 的标志为 UEFI Forum 官方商标（红色立方体，源自 uefi.org 发布的 uefi_logo_red.gif，经 Wikimedia Commons「Logo of the UEFI Forum.svg」矢量描摹嵌入），仅作标识用途，权利归 UEFI Forum 所有。
- `tgcf` 为非官方粉丝作品：名称与意象取自《天官赐福》，与墨香铜臭、哔哩哔哩等版权方无任何关联，未获得授权；全部内置视觉为原创代码绘制，不含官方素材。若版权方提出异议，将以中性名称（如「千灯 · 朱红鎏金」）重新发布该皮肤。

## License

[MIT](./LICENSE)

---

想读源码、自制皮肤或参与开发？请看 [docs/developers.md](./docs/developers.md)（工作原理、皮肤开发指南、本地验证与调试 API）。
