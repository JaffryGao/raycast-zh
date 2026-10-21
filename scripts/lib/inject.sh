#!/usr/bin/env bash
#
# 注入 / 摘除注入的公共实现，由 install.sh、uninstall.sh、status.sh 共用。
# 这个文件只被 source，不单独执行。
#
# 为什么需要它：Raycast 的每个窗口是**独立**的 HTML + 独立 JS 入口。
#   frontend/main-window.html      启动器
#   frontend/settings-window.html  设置（2.9 起从 main-window 拆出来）
#   frontend/ai-chat-window.html   AI 对话
#   ...
# 只注入 main-window 会出现「启动器汉化了、设置窗口全英文」的半吊子状态。
# 所以这里遍历 frontend 下所有真正的页面，逐个注入。

RC_SCRIPT_NAME="raycast-zh.js"
RC_BEGIN_MARK="<!-- raycast-zh:begin -->"
RC_END_MARK="<!-- raycast-zh:end -->"

# 列出 frontend 下所有需要注入的窗口 HTML。
# 判据是文件里存在 </body>：那是脚本唯一能安全插入的位置，
# 顺便排掉 sourcemap、图标之类的非页面文件。
rc_window_htmls() {
  local dir="$1" f
  [ -d "$dir" ] || return 1
  for f in "$dir"/*.html; do
    [ -f "$f" ] || continue
    grep -q '</body>' "$f" 2>/dev/null || continue
    printf '%s\n' "$f"
  done
}

# 该页面是否已经有我们的痕迹（带标记的新版，或早期版本的裸 script 标签）。
rc_is_injected() {
  grep -q "raycast-zh" "$1" 2>/dev/null
}

# 幂等注入。
#   $1 = 目标 html
#   $2 = 注入块文件（含 begin/end 标记的两行内容）
#   $3 = 输出用的临时文件（调用方负责清理）
#
# 返回码：0 = 内容有改动，需要写回
#         1 = 已经是最新，无需改动
#         2 = 页面里没有 </body>，无法注入
#
# 除了带标记的块，也清掉早期版本留下的裸 <script> 标签——否则重复引入
# 会让脚本执行两次，hook 被层层叠加。
rc_inject_html() {
  local html="$1" block="$2" out="$3"
  [ -f "$html" ] || return 2

  awk '
    FNR == NR { block = block $0 ORS; next }
    $0 == "<!-- raycast-zh:begin -->" { skip = 1; next }
    $0 == "<!-- raycast-zh:end -->"   { skip = 0; next }
    skip { next }
    index($0, "<script src=\"./raycast-zh.js\"></script>") > 0 { next }
    /<\/body>/ && !done { printf "%s", block; done = 1 }
    { print }
  ' "$block" "$html" > "$out" || return 2

  grep -q "raycast-zh:begin" "$out" || return 2
  cmp -s "$out" "$html" && return 1
  return 0
}

# 摘除注入。返回 0 = 改过，1 = 本来就没有。
rc_strip_html() {
  local html="$1" out="$2"
  rc_is_injected "$html" || return 1

  awk '
    $0 == "<!-- raycast-zh:begin -->" { skip = 1; next }
    $0 == "<!-- raycast-zh:end -->"   { skip = 0; next }
    skip { next }
    index($0, "<script src=\"./raycast-zh.js\"></script>") > 0 { next }
    { print }
  ' "$html" > "$out" || return 1

  cmp -s "$out" "$html" && return 1
  return 0
}

# 构造注入块。参数是临时文件路径。
rc_write_block() {
  cat > "$1" <<HTMLBLOCK
$RC_BEGIN_MARK
<script src="./$RC_SCRIPT_NAME"></script>
$RC_END_MARK
HTMLBLOCK
}
