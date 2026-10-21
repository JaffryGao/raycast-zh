#!/usr/bin/env bash
#
# 体检：Raycast 是否已汉化、是否需要重新安装。
# Raycast 升级后先跑这个，再决定要不要 `npm run deploy`。
#
#   ./scripts/status.sh
#   ./scripts/status.sh --app /path/Raycast.app

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${HOME}/.raycast-zh/state.env"
SCRIPT_NAME="raycast-zh.js"

APP="${RAYCAST_APP:-/Applications/Raycast.app}"

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_bold=$'\033[1m'
if [ ! -t 1 ]; then c_reset=""; c_dim=""; c_green=""; c_yellow=""; c_red=""; c_bold=""; fi

ok()   { printf '%s✓%s %s\n' "$c_green" "$c_reset" "$*"; }
bad()  { printf '%s✗%s %s\n' "$c_red" "$c_reset" "$*"; }
note() { printf '%s!%s %s\n' "$c_yellow" "$c_reset" "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf '未知参数：%s\n' "$1"; exit 2 ;;
  esac
done

printf '%sRaycast 汉化状态%s\n\n' "$c_bold" "$c_reset"

if [ ! -d "$APP" ]; then
  bad "找不到 Raycast：${APP}"
  exit 1
fi
APP="$(cd "$APP" && pwd)"
VERSION="$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist" 2>/dev/null || echo "未知")"
printf '  Raycast    %s\n' "$VERSION"
printf '  路径       %s\n' "$APP"

RES="$APP/Contents/Resources"
FRONTEND=""
for bundle in "$RES"/*.bundle; do
  [ -d "$bundle" ] || continue
  cand="$bundle/Contents/Resources/frontend"
  if [ -f "$cand/main-window.html" ]; then FRONTEND="$cand"; break; fi
done
if [ -z "$FRONTEND" ] && [ -f "$RES/frontend/main-window.html" ]; then FRONTEND="$RES/frontend"; fi

if [ -z "$FRONTEND" ]; then
  bad "定位不到前端目录，Raycast 结构可能变了"
  exit 1
fi
HTML="$FRONTEND/main-window.html"

printf '\n'

# ── 注入状态 ───────────────────────────────────────────────────────
INJECTED=0
INJECT_LINE=""
if grep -q "raycast-zh" "$HTML"; then
  INJECTED=1
  INJECT_LINE="$(grep -o 'src="[^"]*raycast-zh[^"]*"' "$HTML" | head -1)"
  ok "HTML 已注入         ${c_dim}${INJECT_LINE}${c_reset}"
else
  bad "HTML 未注入"
fi

# ── 脚本文件 ───────────────────────────────────────────────────────
INSTALLED_MD5=""
if [ -f "$FRONTEND/$SCRIPT_NAME" ]; then
  SIZE=$(wc -c < "$FRONTEND/$SCRIPT_NAME" | tr -d ' ')
  ok "脚本已就位         ${c_dim}${SIZE} 字节${c_reset}"
  INSTALLED_MD5="$(md5 -q "$FRONTEND/$SCRIPT_NAME")"
else
  bad "脚本文件缺失：$SCRIPT_NAME"
fi

# ── 与当前源码是否同步 ─────────────────────────────────────────────
DIST="$ROOT/dist/$SCRIPT_NAME"
if [ -f "$DIST" ]; then
  DIST_MD5="$(md5 -q "$DIST")"
  printf '  源码版本           %s\n' "${DIST_MD5:0:12}…"
  if [ -n "$INSTALLED_MD5" ]; then
    printf '  已装版本           %s\n' "${INSTALLED_MD5:0:12}…"
    if [ "$DIST_MD5" = "$INSTALLED_MD5" ]; then
      ok "与源码一致"
    else
      note "与源码不一致（源码更新过？执行 npm run deploy）"
    fi
  fi
else
  note "未找到 dist/${SCRIPT_NAME}（执行 npm run build）"
fi

# ── 升级痕迹 ───────────────────────────────────────────────────────
printf '\n'
if [ -f "$STATE_FILE" ]; then
  # 按字段提取，不 source：记录里有 VERSION/APP 这些同名变量，
  # source 会把刚探测到的真实版本覆盖掉，升级提示就永远不触发了。
  field() { grep "^$1=" "$STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }
  RECORDED="$(field VERSION)"
  LAST_INSTALL="$(field INSTALLED_AT)"
  printf '  上次安装     %s（记录版本 %s）\n' "${LAST_INSTALL:-未知}" "${RECORDED:-未知}"
  if [ -n "$RECORDED" ] && [ "$RECORDED" != "$VERSION" ]; then
    note "Raycast 已从 $RECORDED 升级到 ${VERSION}，脚本很可能已被覆盖 → npm run deploy"
  fi
else
  note "没有安装记录（从未安装，或已卸载）"
fi

# ── 结论 ───────────────────────────────────────────────────────────
printf '\n'
if [ "$INJECTED" -eq 1 ] && [ -n "$INSTALLED_MD5" ] && [ -f "$DIST" ] && [ "$INSTALLED_MD5" = "$(md5 -q "$DIST")" ]; then
  printf '%s✓ 当前状态：已汉化且与源码同步%s\n' "$c_green" "$c_reset"
  exit 0
elif [ "$INJECTED" -eq 1 ]; then
  printf '%s! 当前状态：已汉化，但版本可能落后（npm run deploy 更新）%s\n' "$c_yellow" "$c_reset"
  exit 0
else
  printf '%s✗ 当前状态：未汉化（npm run deploy 安装）%s\n' "$c_red" "$c_reset"
  exit 1
fi
