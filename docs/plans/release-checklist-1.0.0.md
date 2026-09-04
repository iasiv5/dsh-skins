# 1.0.0 发版手工清单（npm 首发，打 tag 前的显式前置条件）

> 本清单覆盖 `@iasiv5/dsh-skins` 的 npm 首发（OIDC，ADR-0005）。tag 前需要：bootstrap `0.0.1` 已人工占位、npmjs.com 已挂 trusted publisher。gate 截图是本地验收证据，不是文档资产，不进入 Git。

## 准备

- [ ] `package.json` 为 1.0.0，候选提交已通过远端 CI
- [ ] npm 上 `@iasiv5/dsh-skins` 已由 `0.0.1` 占位包完成 bootstrap（人工 `npm publish --access public`）
- [ ] npmjs.com 包设置已挂 trusted publisher：repo `iasiv5/dsh-skins`、workflow `release.yml`、**显式允许 direct publish**；建议同时开启「Require 2FA and disallow tokens」
- [ ] 在候选机器安装当前 main 构建并重启 DSH Web
- [ ] 清理同版本旧证据：`rm -rf .artifacts/release-gates/v1.0.0`

## 四皮肤半自动 gate（证据仅落本地）

- [ ] `node scripts/capture-previews.mjs --skin tgcf --gate` → `GATE PASSED`
- [ ] `node scripts/capture-previews.mjs --skin meirenzhi --gate` → `GATE PASSED`
- [ ] `node scripts/capture-previews.mjs --skin openbmc --gate` → `GATE PASSED`
- [ ] `node scripts/capture-previews.mjs --skin uefi-harness --gate` → `GATE PASSED`
- [ ] 每次输出含 `personalization evidence frame settled`，且记录 shell ≥600px、panel ≥240px
- [ ] 目录内恰有四张人工可读证据：`{tgcf,meirenzhi,openbmc,uefi-harness}-personalize.webp`
- [ ] 人工查看四张证据：目标皮肤、个性化面板、隐私规程均正确，无会话内容泄露

## 自动化门禁

- [ ] `pnpm run check` 全绿（构建 + 冒烟 + 全部单测 + README 配对 + bundle 守卫）
- [ ] `node scripts/verify-release.mjs` → `@iasiv5/dsh-skins@1.0.0 OK`
- [ ] 重建后 `git diff --exit-code -- lib/client.js lib/index.js` 通过
- [ ] `git status --short` 干净

## 收尾与 Release

- [ ] 远端 main 包含候选提交，远端 CI 全绿
- [ ] 以上全部勾选后创建 `v1.0.0` tag 并推送；workflow 将依次：验证 tag↔版本 → 全量 check → pack 加载测试 → OIDC 发布 npm（自动 provenance）→ 建 GitHub Release 附 tgz；任一步失败自动删 tag
- [ ] npm 页面确认 1.0.0 上架、带 provenance 出处、`latest` dist-tag 指向 1.0.0
- [ ] dogfood：`dsh plugin --profile web add @iasiv5/dsh-skins@1.0.0` 切 npm 安装，重启后验证四皮肤与更新面板显示「已是最新」
- [ ] Release 验证完成后，删除本地证据：`rm -rf .artifacts/release-gates/v1.0.0`
