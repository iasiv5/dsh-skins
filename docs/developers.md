# 开发者文档

> 本文件面向想读源码、改代码或自制皮肤的贡献者。README 只保留使用者需要的内容，
> 开发者关心的章节统一收敛在这里。

## 目录

- [工作原理](#工作原理)
- [自建一套皮肤](#自建一套皮肤)
- [本地开发与验证](#本地开发与验证)
- [控制台调试 API](#控制台调试-api)
- [实现耦合的已知边界](#实现耦合的已知边界)

## 工作原理

插件怎么构成、更新事务怎么落地。

**双端结构**。客户端负责皮肤与切换界面，Host 负责 npm registry 检查、安全安装与重启。esbuild 产出 `lib/client.js` 与 `lib/index.js`，产物随仓库提交——npm 安装不在目标机器上构建。

**更新事务**（Host）：

- 检查结果缓存在 `$DSH_HOME/dsh-skins/update-cache.json`，有效期 1 小时并跨 DSH 重启保留。已是最新时不显示更新栏；网络失败时可在弹层底部手动重试。
- 更新开始前重新检查安装来源。只有 npm 安装（`@iasiv5/dsh-skins`）的版本允许一键更新：`link:` 安装显示「本地开发模式」并禁用在线更新，`file:`、tar 包与旧 `github:` 来源提示迁移且不会被覆盖。
- 安装完成后校验 profile 依赖固定到精确版本、bundle 注册与已装包元数据；任何一步失败，自动恢复更新前的 npm 安装。
- 重启安全：检测运行中的 Agent 并阻止；服务管理器环境（探测 `INVOCATION_ID`/`NOTIFY_SOCKET`）以非零码退出，把重启交回 `Restart` 策略；脱离服务管理器运行时才使用内置的脱离重拉助手。

**明暗持久化**。非 loopback 浏览器中，插件监听官方 `theme/change` 事件，把浅色/深色/跟随系统存入 `localStorage["dsh-skins:theme-preference"]`，启动时经官方 `theme.setTheme()` 恢复。loopback 浏览器不启用这一回退，直接使用 DSH 自身的 Host 持久化。

**报错本地化**。所有会显示在界面里的 Host 报错都带稳定错误码与模板参数，客户端据此渲染中英文文案；未知错误码回退为 Host 原始消息。

## 自建一套皮肤

在 `src/client/skins/<id>/index.js` 中导出创建函数：

```js
export function createMySkin({ jsx }) {
  function Mark({ size = 24 }) { /* 返回图标 */ }
  function Name() { /* 返回品牌名 */ }

  return {
    id: "my-skin",
    label: "My Skin",
    description: { zh: "一句话描述", en: "One-line description" },
    bodyAttr: "dshMySkin",
    Mark,
    Name,
    favicon: "data:image/svg+xml,...",
    faviconMime: "image/svg+xml",
    title: "My Skin",
    css: `body[data-dsh-my-skin] { /* DSH tokens */ }`,
    art: "",
    scrimLight: "",
    scrimDark: "",
    placeholderLight: "linear-gradient(...)明色",
    placeholderDark: "linear-gradient(...)暗色",
    slogans: { zh: "中文标语", en: "English slogan" },
  };
}
```

然后：

1. 在 `src/client/index.js` 中加入对应的 import 与 `runtime.register(...)`；
2. 在 `src/shared/personalization/catalog.js` 中登记皮肤的字段声明（`fields[]` 与内置资产），即可自动获得个性化面板——支持 `text / color / image / select / range` 五类字段、`single / locale / colorScheme` 三种值作用域；
3. 需要自定义「值 → 效果」映射时，在皮肤工厂上提供 `project(values, assets)` 纯函数；不提供则走与旧皮肤逐字节等价的内置适配器；
4. 删除皮肤时反向操作；
5. 保留 ID `official` 与兼容别名 `default`，不要用于扩展皮肤。

`label` 与 `description` 接受语言中立的字符串（如品牌名）或 `{ zh, en }` 映射，解析顺序为当前语言 → en → zh。皮肤卡片与 `__DSH_SKINS__.list()` 始终返回解析后的字符串，中英词典由 `tests/dicts.test.mjs` 强制键与占位符双向对齐。

`title`（可选）改写浏览器标签页的品牌段，接受与 `label` 相同的字符串或 `{ zh, en }` 形式。官方 `DocumentTitle` 投影器会把标签页维护为「会话名 — DeepSeek Harness」，皮肤挂载期间只替换其中的品牌段、保留会话名；选择官方外观或插件卸载时换回官方品牌。

每个皮肤目录自持品牌标识、favicon、CSS、背景与标语，不从其他皮肤目录导入视觉资源；`runtime.js` 与 `sidebar-switcher.js` 只承载通用机制。

## 本地开发与验证

```sh
pnpm install
pnpm run test      # 构建 + 冒烟测试 + 全部单测（smoke 与 built-host 测的是 lib/ 产物，故每次先重建）
pnpm run check     # 完整门禁：构建 + 语法检查 + 测试 + README 配对 + bundle 守卫
pnpm run watch     # 监听 src/，分别重建 lib/client.js 与 lib/index.js
```

- 客户端 bundle 经 DSH HMR 热更新；Host 源码、`package.json`、`cordis.patch.yml` 或依赖变化后需重启 DSH Web。
- 提交前同时提交源码与重新生成的 `lib/` 两个产物。CI 会复查构建、产物无差异与安装包内容。
- 截图脚本内置隐私规程：折叠全部工作区、新建空会话取景、界面强制中文，不泄露任何会话内容。`--gate` 的验收截图默认写到按当前 `package.json.version` 隔离的 `.artifacts/release-gates/v<version>/`（gitignored），只作本地证据，不随 tag 入库；普通捕获仍默认写 `docs/assets`。仅当 README、视觉样式或文档截图引用确实变化时，才显式执行 `node scripts/capture-previews.mjs --skin <id> --out docs/assets` 更新文档图片。发版前运行 `git diff --exit-code -- docs/assets`，无意更新文档截图的版本必须保持该目录零差异。
- 两份 README（中/英）由校验脚本做内容配对；改动任一侧须同步另一侧，详见 `README.i18n.yaml`。

开发模式安装（本地源码直连，客户端改动即改即见）：

```sh
dsh plugin --profile web add link:<本仓库路径>
```

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

- OpenBMC 用户气泡描边使用版本相关类 `.gdEzaW_bubble`；该类变化只影响描边，token 配色不受影响。
- 标签页品牌段替换依赖官方 `DocumentTitle` 投影器的固定文案「DeepSeek Harness」与「 — 」分隔符；投影器实现变化时只影响标签页品牌段，其余界面不受影响。
- 品牌标语经当前 DSH locale 字典接口替换，皮肤卸载时恢复；升级 DSH locale 实现后需要复核。
