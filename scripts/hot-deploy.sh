#!/usr/bin/env bash
# 热部署：把构建产物 lib/ 覆盖进 DSH web profile（未发版态预览，know-how 024 姿势）。
# 严格 fail-fast：build → 全量测试（裸退出码，验证命令禁入吞码管道）→ 备份
# profile lib → 覆盖 → sha 校验，任一步失败即停、不碰 profile。
# client-only 变更浏览器刷新即生效；禁在 agent 会话内重启服务（know-how 037）。
# 须在无沙箱写限制的会话执行（esbuild 子进程 + profile 写）。
# 环境变量：DSH_SKINS_PROFILE（默认 web profile）、DSH_SKINS_HOTFIX_BACKUP_DIR。
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE_LIB="${DSH_SKINS_PROFILE:-$HOME/.dsh/profiles/web/node_modules/@iasiv5/dsh-skins}/lib"
BACKUP_DIR="${DSH_SKINS_HOTFIX_BACKUP_DIR:-$HOME/.dsh-skins-hotfix-backups}/$(date +%Y%m%d-%H%M%S)"

test -f package.json && test -f lib/client.js
test -d "$(dirname "$PROFILE_LIB")" || { echo "profile not found: $PROFILE_LIB" >&2; exit 1; }
PROFILE_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('$(dirname "$PROFILE_LIB")/package.json','utf8')).version")
REPO_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")

echo "== build =="
pnpm run build

echo "== tests（裸退出码）=="
node smoke-test.cjs
node --test tests/*.test.mjs

echo "== 备份当前 profile lib -> $BACKUP_DIR =="
mkdir -p "$(dirname "$BACKUP_DIR")"
cp -a "$PROFILE_LIB" "$BACKUP_DIR"

if [ "$PROFILE_VERSION" != "$REPO_VERSION" ]; then
  echo "!! 提示：profile 版本 $PROFILE_VERSION ≠ 仓库版本 $REPO_VERSION（热部署跨版本属正常，但发版前记得 bump）"
fi

echo "== 覆盖部署 =="
cp lib/client.js lib/index.js "$PROFILE_LIB/"

echo "== sha 校验 =="
cmp lib/client.js "$PROFILE_LIB/client.js"
cmp lib/index.js "$PROFILE_LIB/index.js"
sha256sum lib/client.js "$PROFILE_LIB/client.js"

echo "✓ 已部署（profile=$PROFILE_VERSION repo=$REPO_VERSION）。浏览器刷新生效；禁重启服务。"
echo "  回滚: cp -a \"$BACKUP_DIR/.\" \"$PROFILE_LIB/\""
