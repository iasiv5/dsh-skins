#!/usr/bin/env bash
# 热部署：把构建产物 lib/（以及 assets/）覆盖进 DSH web profile（未发版态预览，know-how 024 姿势）。
# 严格 fail-fast：build → 全量测试（裸退出码，验证命令禁入吞码管道）→ 备份
# profile（lib/ 与 assets/）→ 覆盖 → sha 校验，任一步失败即停、不碰 profile。
# client-only 变更浏览器刷新即生效；禁在 agent 会话内重启服务（know-how 037）。
# 须在无沙箱写限制的会话执行（esbuild 子进程 + profile 写）。
# 环境变量：DSH_SKINS_PROFILE（profile 根目录，默认 web profile）、DSH_SKINS_HOTFIX_BACKUP_DIR。
# 备份布局（2026-11-02 起）：<备份目录>/lib/ 与 <备份目录>/assets/；profile 原本无 assets 时
# 写入 <备份目录>/ASSETS_ABSENT 标记，回滚即删除 assets。更早的备份为旧布局（文件直接位于备份目录下）。
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE_ROOT="${DSH_SKINS_PROFILE:-$HOME/.dsh/profiles/web/node_modules/@iasiv5/dsh-skins}"
PROFILE_LIB="$PROFILE_ROOT/lib"
PROFILE_ASSETS="$PROFILE_ROOT/assets"
BACKUP_DIR="${DSH_SKINS_HOTFIX_BACKUP_DIR:-$HOME/.dsh-skins-hotfix-backups}/$(date +%Y%m%d-%H%M%S)"

test -f package.json && test -f lib/client.js
# 守卫：profile 根必须是真实的插件包根（它是后面 rm -rf assets 前的安全闸）。
test -f "$PROFILE_ROOT/package.json" || { echo "profile root is not a plugin package: $PROFILE_ROOT" >&2; exit 1; }
test -d "$PROFILE_LIB" || { echo "profile lib not found: $PROFILE_LIB" >&2; exit 1; }
PROFILE_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('$PROFILE_ROOT/package.json','utf8')).version")
REPO_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")

echo "== build =="
pnpm run build

echo "== tests（裸退出码）=="
node smoke-test.cjs
node --test tests/*.test.mjs

echo "== 备份当前 profile（lib/ 与 assets/）-> $BACKUP_DIR =="
mkdir -p "$BACKUP_DIR"
cp -a "$PROFILE_LIB" "$BACKUP_DIR/lib"
if [ -d "$PROFILE_ASSETS" ]; then
  cp -a "$PROFILE_ASSETS" "$BACKUP_DIR/assets"
else
  : > "$BACKUP_DIR/ASSETS_ABSENT"
fi

if [ "$PROFILE_VERSION" != "$REPO_VERSION" ]; then
  echo "!! 提示：profile 版本 $PROFILE_VERSION ≠ 仓库版本 $REPO_VERSION（热部署跨版本属正常，但发版前记得 bump）"
fi

echo "== 覆盖部署 =="
cp lib/client.js lib/index.js "$PROFILE_LIB/"

# ADR-0023 资产出仓后，宿主路由启动期急切读 <pkg>/assets/manifest.json——热部署
# 若只带 lib/ 不带 assets/，b_ 路由 fail-open 静默 404（2026-11-02 活体实录：
# 首次验证全 404，补拷 assets + 二次重启才愈）。assets 存在即整目录同步。
if [ -d assets ]; then
  rm -rf -- "$PROFILE_ASSETS"
  cp -a assets "$PROFILE_ASSETS"
  cmp assets/manifest.json "$PROFILE_ASSETS/manifest.json"
  echo "assets/ 已同步（$(find assets -type f | wc -l) 个文件）"
fi

echo "== sha 校验 =="
cmp lib/client.js "$PROFILE_LIB/client.js"
cmp lib/index.js "$PROFILE_LIB/index.js"
sha256sum lib/client.js "$PROFILE_LIB/client.js"

echo "✓ 已部署（profile=$PROFILE_VERSION repo=$REPO_VERSION）。浏览器刷新生效；禁重启服务。"
echo "  回滚（lib）:    cp -a \"$BACKUP_DIR/lib/.\" \"$PROFILE_LIB/\""
if [ -d "$BACKUP_DIR/assets" ]; then
  echo "  回滚（assets）: rm -rf -- \"$PROFILE_ASSETS\" && cp -a \"$BACKUP_DIR/assets\" \"$PROFILE_ASSETS\""
else
  echo "  回滚（assets）: rm -rf -- \"$PROFILE_ASSETS\"   # 部署前 profile 无 assets（见 ASSETS_ABSENT）"
fi
