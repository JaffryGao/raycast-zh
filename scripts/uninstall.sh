#!/usr/bin/env bash
#
# 完全卸载：摘掉 HTML 里的注入、删除脚本文件，让 Raycast 回到原样。
#
#   ./scripts/uninstall.sh               卸载并重启 Raycast
#   ./scripts/uninstall.sh --no-restart  只卸载，不重启
#   ./scripts/uninstall.sh --app /path/Raycast.app
#
# 只删除自己写入的东西，不碰 Raycast 的其它文件。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${HOME}/.raycast-zh"
STATE_FILE="${STATE_DIR}/state.env"
SCRIPT_NAME="raycast-zh.js"

APP="${RAYCAST_APP:-/Applications/Raycast.app}"
RESTART=1

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
if [ ! -t 1 ]; then c_reset=""; c_dim=""; c_green=""; c_yellow=""; c_red=""; fi

step() { printf '%s▸%s %s\n' "$c_dim" "$c_reset" "$*"; }
good() { printf '%s✓%s %s\n' "$c_green" "$c_reset" "$*"; }
warn() { printf '%s!%s %s\n' "$c_yellow" "$c_reset" "$*"; }
die()  { printf '%s✗%s %s\n' "$c_red" "$c_reset" "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-restart) RESTART=0; shift ;;
    --app) APP="${2:-}"; [ -n "$APP" ] || die "--app 需要一个路径"; shift 2 ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || die "这个脚本只能在 macOS 上运行。"
[ -d "$APP" ] || die "找不到 Raycast：$APP"

APP="$(cd "$APP" && pwd)"
RES="$APP/Contents/Resources"

FRONTEND=""
for bundle in "$RES"/*.bundle; do
  [ -d "$bundle" ] || continue
  cand="$bundle/Contents/Resources/frontend"
  if [ -f "$cand/main-window.html" ]; then FRONTEND="$cand"; break; fi
done
if [ -z "$FRONTEND" ] && [ -f "$RES/frontend/main-window.html" ]; then
  FRONTEND="$RES/frontend"
fi
[ -n "$FRONTEND" ] || die "在 $APP 里找不到前端目录，可能已经卸载过或 Raycast 结构有变。"

HTML="$FRONTEND/main-window.html"

SUDO=""
if [ ! -w "$HTML" ] || [ ! -w "$FRONTEND" ]; then
  if [ -t 0 ]; then
    warn "需要管理员权限写入 ${APP}（可能会提示输入密码）"
    SUDO="sudo"
  else
    die "没有写入权限，请在终端里手动运行：sudo $0"
  fi
fi

# ── 1. 摘掉注入 ────────────────────────────────────────────────────
if grep -q "raycast-zh" "$HTML"; then
  TMP_HTML="$(mktemp)"
  trap 'rm -f "$TMP_HTML"' EXIT
  awk '
    $0 == "<!-- raycast-zh:begin -->" { skip = 1; next }
    $0 == "<!-- raycast-zh:end -->"   { skip = 0; next }
    skip { next }
    index($0, "<script src=\"./raycast-zh.js\"></script>") > 0 { next }
    { print }
  ' "$HTML" > "$TMP_HTML"
  $SUDO cp "$TMP_HTML" "$HTML"
  good "已从 main-window.html 移除注入"
else
  warn "main-window.html 里没有注入记录（可能已被 Raycast 升级覆盖）"
fi

# ── 2. 删除脚本本体 ────────────────────────────────────────────────
if [ -f "$FRONTEND/$SCRIPT_NAME" ]; then
  $SUDO rm -f "$FRONTEND/$SCRIPT_NAME"
  good "已删除 $SCRIPT_NAME"
else
  warn "$SCRIPT_NAME 不存在（可能已被 Raycast 升级覆盖）"
fi

# ── 3. 清掉状态记录 ────────────────────────────────────────────────
if [ -f "$STATE_FILE" ]; then
  rm -f "$STATE_FILE"
  rmdir "$STATE_DIR" 2>/dev/null || true
  good "已清除安装记录"
fi

# ── 4. 重启 ────────────────────────────────────────────────────────
if [ "$RESTART" -eq 1 ]; then
  if pgrep -x Raycast >/dev/null 2>&1; then
    step "重启 Raycast"
    osascript -e 'tell application "Raycast" to quit' >/dev/null 2>&1 || pkill -x Raycast || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x Raycast >/dev/null 2>&1 || break; sleep 0.3; done
    open -a "$APP"
    sleep 1
    pgrep -x Raycast >/dev/null 2>&1 && good "Raycast 已重启" || warn "Raycast 未能自动启动，请手动打开"
  fi
else
  warn "已跳过重启；改动要生效需要手动退出并重开 Raycast"
fi

printf '\n%s✓%s Raycast 已恢复原样\n' "$c_green" "$c_reset"
