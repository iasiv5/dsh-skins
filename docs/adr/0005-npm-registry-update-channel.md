# 更新通道迁移 npm registry，包名 scope 化为 @iasiv5/dsh-skins

---
status: accepted
date: 2026-09-05
---

自更新器从「GitHub Releases 检查 + codeload tarball 按 commit SHA 固定安装」整体迁移为「npm registry latest 检查 + 精确版本固定安装」。动因有三：未 scope 的 `dsh-skins` 包名已被第三方（loong-feng 发布的 0.2.0 早期内容副本）占用，本包必须换名；换名后的 scoped 包要求 npm 作为分发渠道；GitHub 未认证 API 限额（60 次/小时）是更新检查的硬上限，npm registry 无此约束。取舍：放弃 GitHub Releases 作为更新真相源（tag 驱动的 CI 仍会创建 GitHub Release 并附 tgz，作为镜像与审计入口），`github:` 安装形态降级为 legacy 来源、不再支持一键更新（界面提示迁移到 npm 源）。

## Constraints

- npm trusted publishing（OIDC）不支持给尚不存在的包预注册发布者（npm/cli#8544 仍 open），全新包的首发无法走 OIDC：本包以人工发布的 `0.0.1` 最小占位包（临时目录、不进 git）完成 bootstrap，随后在 npmjs.com 包设置中挂 trusted publisher（repo `iasiv5/dsh-skins`、workflow `release.yml`、显式允许 direct publish），自 `1.0.0` 起纯 OIDC 发布并自动携带 provenance。`0.0.1` 因此永远没有 provenance。
- 仓库与包必须保持 public——任一侧 private 都会失去 provenance 出处证明。
- 版本策略维持严格 `X.Y.Z`（更新器拒绝预发布与构建后缀），npm dist-tag 只使用 latest。

## Consequences

- `detectInstallSource` 的可更新形态收敛为 npm 单通道：`link:` 显示开发模式并保护，`file:`/tar 包禁用，`github:` 提示迁移，全部不会被在线更新覆盖。
- 安装的固定形态 = `@iasiv5/dsh-skins@X.Y.Z` 精确版本；回滚 = 重装旧精确版本。npm 版本不可变且带 `dist.integrity`，取代了原「解析 40 位 commit SHA」的锚定机制，lockfile 解析随之删除。
- 发布链路细节：pnpm publish（v10）底层 spawn `npm publish`，OIDC 交换发生在 npm CLI 侧（要求 ≥ 11.5.1；Node 22 自带 npm 10.x，workflow 里先 `npm install -g npm@11`）；setup-node 刻意不设 `registry-url`（v7 之前设置它会注入占位 `NODE_AUTH_TOKEN`，遮蔽 OIDC）。
- `verify-release`、CI checkout 锚与 package.json 的 repository/homepage/bugs 统一指向 `iasiv5/dsh-skins`；provenance 要求 repository.url 与实际仓库精确匹配。
- 旧 `dsh-skins`（未 scope）npm 包属第三方，不做 deprecate；README 明示本包的正名是 `@iasiv5/dsh-skins`。
