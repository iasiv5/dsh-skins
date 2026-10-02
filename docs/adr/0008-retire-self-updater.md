# 退役自更新器，更新职责移交 dsh-m 市场

---
status: accepted
date: 2026-10-03
---

插件不再自带更新器：npm registry 检查、精确版本安装、失败自动回滚、更新栏 UI 与
`/dsh-skins/update`、`/dsh-skins/restart` 路由整体移除。更新发现交给 dsh-m 市场的头部
升级角标与 `dshm outdated/upgrade`，执行交给 `dsh plugin update`（市场升级与 CLI 等价）。
动因：dsh-m 的升级链路（peer 预检、releaseAge 预检、发版延迟处理）已覆盖本插件的全部
更新场景，插件内并行维护一套检查/安装/回滚机制是重复负债；且更新检查每次打开皮肤
切换器都直连 registry.npmjs.org，是一层可去除的网络依赖。取舍：失去「先备份再安装、
失败自动回滚」的事务与「Agent 运行中阻止重启」的安全门——前者由包管理器的精确版本
加 lockfile 完整性校验兜底（失败的最坏情形是插件未加载，重装旧精确版本即恢复），后者
由 dsh-m 与宿主的重启流程接管。本 ADR 部分取代 0005：npm 作为唯一分发渠道的决策不变，
废除的只是「插件自己检查并安装自己」的机制。

## Constraints

- npm 仍是唯一分发渠道：dist-tag 只用 latest，严格 X.Y.Z，安装形态是精确版本固定（继承 0005）。
- 配置与图库数据目录 `$DSH_HOME/dsh-skins/` 与插件安装目录物理隔离的承诺不变，任何升级通道都不得触碰。
- 桌面 profile 的升级受 npmmirror 同步滞后与 minimumReleaseAge 等待期约束；产品内不绕过（know-how 020 红线）。

## Consequences

- 皮肤切换器不再有更新栏；`detectInstallSource`、`update-cache.json` 缓存与 `link:`/`github:` 来源引导随之消失——`link:` 开发安装照常工作，只是没有更新语义。
- 升级失败的恢复路径 = `dsh plugin add --profile web @iasiv5/dsh-skins@<旧精确版本>`。
- README、GLOSSARY 与 docs/developers.md 的自更新描述、ADR-0005 的自更新器机制描述一并退役。
