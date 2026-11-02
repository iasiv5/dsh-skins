#!/usr/bin/env bash
# verify-hot-deploy-roundtrip.sh — hot-deploy 备份/回滚守卫（评审 R2-S2，2026-11-02 收编）。
# 在仓库外的临时 profile 上跑两个场景（原有 assets / 原本无 assets）：
#   部署 → 抽取脚本打印的回滚指令并执行 → 与部署前快照逐字节比对。
# 重（每个场景内部各跑一次 build + 全量测试）：改动 scripts/hot-deploy.sh 后必跑，
# 发版前建议跑（`pnpm run verify:hot-deploy`）；不进默认 check。
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
W=$(mktemp -d "${TMPDIR:-/tmp}/dsh-hot-deploy-roundtrip-XXXXXX")
trap 'rm -rf "$W"' EXIT
echo "workdir=$W"
fail=0

mkprofile() { # $1 = 场景名, $2 = with|without（assets）
  local root="$W/$1/dsh-skins"
  mkdir -p "$root/lib"
  printf '{"name":"@iasiv5/dsh-skins","version":"1.5.24"}\n' > "$root/package.json"
  printf 'old-client\n' > "$root/lib/client.js"
  printf 'old-index\n' > "$root/lib/index.js"
  if [ "$2" = with ]; then
    mkdir -p "$root/assets/sub"
    printf 'OLD-SENTINEL\n' > "$root/assets/sentinel.txt"
    printf 'nested-old\n' > "$root/assets/sub/old.txt"
  fi
  cp -a "$root" "$W/$1-before"
}

roundtrip() { # $1 = 场景名, $2 = with|without
  local root="$W/$1/dsh-skins" log="$W/$1-deploy.txt"
  (cd "$REPO" && DSH_SKINS_PROFILE="$root" DSH_SKINS_HOTFIX_BACKUP_DIR="$W/bk-$1" bash scripts/hot-deploy.sh > "$log" 2>&1)
  local rc=$?
  echo "[$1] deploy exit=$rc"; [ $rc -eq 0 ] || { fail=1; tail -5 "$log"; return; }
  # hot-deploy 会在 DSH_SKINS_HOTFIX_BACKUP_DIR 下追加时间戳子目录——部署后再定位它，勿假设层级。
  local bkr
  bkr=$(ls -d "$W/bk-$1"/*/ 2>/dev/null | head -1)
  [ -n "$bkr" ] || { echo "[$1] backup dir not found under $W/bk-$1 ✗"; fail=1; return; }
  if [ "$2" = with ]; then
    [ -f "$bkr/assets/sentinel.txt" ] && echo "[$1] backup holds previous assets ✓" || { echo "[$1] backup missing assets ✗"; fail=1; }
    [ -f "$bkr/assets/sub/old.txt" ] && echo "[$1] backup keeps nested assets ✓" || { echo "[$1] backup lost nested assets ✗"; fail=1; }
    [ ! -e "$root/assets/sentinel.txt" ] && echo "[$1] deploy replaced assets ✓" || { echo "[$1] sentinel survived deploy ✗"; fail=1; }
  else
    [ -f "$bkr/ASSETS_ABSENT" ] && echo "[$1] backup records ASSETS_ABSENT ✓" || { echo "[$1] missing ASSETS_ABSENT marker ✗"; fail=1; }
    [ -f "$root/assets/manifest.json" ] && echo "[$1] deploy created assets ✓" || { echo "[$1] deploy did not create assets ✗"; fail=1; }
  fi
  cmp -s "$REPO/lib/client.js" "$root/lib/client.js" && echo "[$1] deployed client == repo lib ✓" || { echo "[$1] client mismatch ✗"; fail=1; }
  cmp -s "$REPO/lib/index.js" "$root/lib/index.js" && echo "[$1] deployed host == repo lib ✓" || { echo "[$1] host mismatch ✗"; fail=1; }
  python3 - "$log" "$W/$1-rollback.sh" <<'PY'
import re, sys
out = []
for line in open(sys.argv[1], encoding="utf-8"):
    if line.lstrip().startswith("回滚（"):
        out.append(re.sub(r"\s+# .*$", "", re.sub(r"^\s*回滚（[^）]+）:\s*", "", line.rstrip("\n"))))
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"rollback lines extracted: {len(out)}")
PY
  bash "$W/$1-rollback.sh" && echo "[$1] rollback executed ✓" || { echo "[$1] rollback failed ✗"; fail=1; }
  if diff -r "$W/$1-before" "$root" >/dev/null; then echo "[$1] ROUNDTRIP BYTE-IDENTICAL ✓"; else echo "[$1] roundtrip differs ✗"; diff -r "$W/$1-before" "$root" | head -10; fail=1; fi
}

status_before=$(git -C "$REPO" status --porcelain)
mkprofile A with;    roundtrip A with
mkprofile B without; roundtrip B without

status_after=$(git -C "$REPO" status --porcelain)
if [ "$status_after" = "$status_before" ]; then echo "[repo] unchanged by roundtrip ✓"; else echo "[repo] roundtrip dirtied the repo ✗"; diff <(echo "$status_before") <(echo "$status_after") | head -5; fail=1; fi
echo "ROUNDTRIP_FAIL=$fail"
exit $fail
