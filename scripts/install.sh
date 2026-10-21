#!/usr/bin/env bash
#
# 一键安装 / 重新安装（Raycast 升级之后也跑这个）。
#
#   ./scripts/install.sh                 安装并重启 Raycast
#   ./scripts/install.sh --no-restart    只安装，不重启
#   ./scripts/install.sh --app /path/Raycast.app
#
# 设计要点：
#   1. 幂等——先摘掉旧注入再插新的，重复执行不会叠加；
#   2. 定位靠 main-window.html 这个锚点，不写死内部 bundle 名；
#   3. 只改 HTML 里的一行注入 + 新增一个脚本文件，卸载即完全还原。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${HOME}/.raycast-zh"
STATE_FILE="${STATE_DIR}/state.env"
BEGIN_MARK="<!-- raycast-zh:begin -->"
END_MARK="<!-- raycast-zh:end -->"
SCRIPT_NAME="raycast-zh.js"

APP="${RAYCAST_APP:-/Applications/Raycast.app}"
RESTART=1
VERBOSE=0

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'
if [ ! -t 1 ]; then c_reset=""; c_dim=""; c_green=""; c_yellow=""; c_red=""; fi

say()  { printf '%s\n' "$*"; }
step() { printf '%s▸%s %s\n' "$c_dim" "$c_reset" "$*"; }
good() { printf '%s✓%s %s\n' "$c_green" "$c_reset" "$*"; }
warn() { printf '%s!%s %s\n' "$c_yellow" "$c_reset" "$*"; }
die()  { printf '%s✗%s %s\n' "$c_red" "$c_reset" "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-restart) RESTART=0; shift ;;
    --app) APP="${2:-}"; [ -n "$APP" ] || die "--app 需要一个路径"; shift 2 ;;
    --verbose|-v) VERBOSE=1; shift ;;
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "未知参数：$1（用 --help 查看用法）" ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || die "这个脚本只能在 macOS 上运行。"

# ── 1. 定位 Raycast ────────────────────────────────────────────────
[ -d "$APP" ] || die "找不到 Raycast：$APP
  用 --app 指定，或先设置 RAYCAST_APP 环境变量。"

APP="$(cd "$APP" && pwd)"
VERSION="$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist" 2>/dev/null || echo "未知")"

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
[ -n "$FRONTEND" ] || die "在 $APP 里找不到前端目录（main-window.html）。
  Raycast 可能改了内部结构，请提 issue 并附上版本号：$VERSION"

HTML="$FRONTEND/main-window.html"
PROD="$ROOT/dist/$SCRIPT_NAME"

step "Raycast $VERSION"
say "  ${c_dim}app      $APP${c_reset}"
say "  ${c_dim}frontend $FRONTEND${c_reset}"

# ── 2. 准备产物 ────────────────────────────────────────────────────
if [ ! -f "$PROD" ]; then
  if command -v node >/dev/null 2>&1; then
    step "dist 不存在，先构建"
    node "$ROOT/scripts/build.js"
  else
    die "缺少 dist/${SCRIPT_NAME}，且未安装 Node.js 无法构建。
  请从仓库的 dist/ 目录获取该文件，或安装 Node.js 后执行：npm run build"
  fi
fi

# ── 3. 写入权限 ────────────────────────────────────────────────────
SUDO=""
if [ ! -w "$HTML" ] || [ ! -w "$FRONTEND" ]; then
  if [ -t 0 ]; then
    warn "需要管理员权限写入 ${APP}（可能会提示输入密码）"
    SUDO="sudo"
  else
    die "没有写入权限，请在终端里手动运行：sudo $0"
  fi
fi

# ── 4. 注入（幂等）──────────────────────────────────────────────────
TMP_BLOCK="$(mktemp)"
TMP_HTML="$(mktemp)"
trap 'rm -f "$TMP_BLOCK" "$TMP_HTML"' EXIT

cat > "$TMP_BLOCK" <<HTMLBLOCK
$BEGIN_MARK
<script src="./$SCRIPT_NAME"></script>
$END_MARK
HTMLBLOCK

# 第一个文件提供注入块；第二个文件里先剔除旧注入，再在 </body> 前插入。
# 除了本脚本带标记的块，也清掉早期版本留下的裸 <script> 标签——否则重复
# 引入会让脚本执行两次，hook 被叠加。
awk '
  FNR == NR { block = block $0 ORS; next }
  $0 == "<!-- raycast-zh:begin -->" { skip = 1; next }
  $0 == "<!-- raycast-zh:end -->"   { skip = 0; next }
  skip { next }
  index($0, "<script src=\"./raycast-zh.js\"></script>") > 0 { next }
  /<\/body>/ && !done { printf "%s", block; done = 1 }
  { print }
' "$TMP_BLOCK" "$HTML" > "$TMP_HTML"

grep -q "raycast-zh:begin" "$TMP_HTML" || die "注入失败：$HTML 里找不到 </body>，无法插入脚本标签。

如果 Raycast 刚升级过，可能是页面结构变了，请提 issue 并附上版本号：$VERSION"

if cmp -s "$TMP_HTML" "$HTML"; then
  good "注入已是最新，无需改动 HTML"
else
  $SUDO cp "$TMP_HTML" "$HTML"
  good "已注入启动脚本到 main-window.html"
fi

# ── 5. 部署脚本本体 ────────────────────────────────────────────────
$SUDO cp "$PROD" "$FRONTEND/$SCRIPT_NAME"
$SUDO chmod 644 "$FRONTEND/$SCRIPT_NAME"
MD5="$(md5 -q "$FRONTEND/$SCRIPT_NAME")"
good "已部署 ${SCRIPT_NAME}（${MD5:0:8}…，$(wc -c < "$PROD" | tr -d ' ') 字节）"

# ── 6. 记录状态 ────────────────────────────────────────────────────
mkdir -p "$STATE_DIR"
cat > "$STATE_FILE" <<STATE
VERSION=$VERSION
APP=$APP
FRONTEND=$FRONTEND
SCRIPT_MD5=$MD5
INSTALLED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE
good "状态已记录到 $STATE_FILE"

# ── 7. 重启 ────────────────────────────────────────────────────────
if [ "$RESTART" -eq 1 ]; then
  if pgrep -x Raycast >/dev/null 2>&1; then
    step "重启 Raycast"
    osascript -e 'tell application "Raycast" to quit' >/dev/null 2>&1 || pkill -x Raycast || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x Raycast >/dev/null 2>&1 || break; sleep 0.3; done
    open -a "$APP"
    sleep 1
    if pgrep -x Raycast >/dev/null 2>&1; then good "Raycast 已重启"; else warn "Raycast 未能自动启动，请手动打开"; fi
  else
    step "Raycast 未在运行，跳过重启"
  fi
else
  warn "已跳过重启；改动要生效需要手动退出并重开 Raycast"
fi

say ""
good "汉化完成。按你的快捷键唤起 Raycast 试试：设置 / 剪贴 / 专注 / 截图"
say "  ${c_dim}排查：npm run status    卸载：npm run undeploy${c_reset}"
