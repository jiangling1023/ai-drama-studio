#!/usr/bin/env bash
# serve.sh —— 本地预览短剧工作台
#
# 用法：
#   bash tools/serve.sh          # 默认 8080
#   bash tools/serve.sh 9000     # 指定端口
#
# 说明：
#   web-app 是纯前端零构建工程，ES module 必须经 HTTP 访问，
#   不能用 file:// 直接打开（浏览器会拒绝加载模块）。
#   只绑定 127.0.0.1，不对外暴露。

set -uo pipefail

PORT="${1:-8080}"
PROJ_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_APP="$PROJ_ROOT/src/repo/source/ai-drama-studio/web-app"

if [[ ! -d "$WEB_APP" ]]; then
  echo "❌ 找不到 web-app 目录：$WEB_APP"
  echo "   请先确认源码已迁入 src/repo（见 docs/源码接手报告.md）。"
  exit 1
fi

if [[ ! -f "$WEB_APP/index.html" ]]; then
  echo "❌ $WEB_APP 下没有 index.html，工程可能不完整。"
  exit 1
fi

PORT_BUSY=$(python3 - "$PORT" <<'PY' 2>/dev/null
import socket, sys
s = socket.socket()
s.settimeout(0.4)
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
    print("busy")
except Exception:
    print("free")
finally:
    s.close()
PY
)

if [[ "$PORT_BUSY" == "busy" ]]; then
  echo "❌ 端口 $PORT 已被占用。换一个：bash tools/serve.sh 9000"
  exit 1
fi

echo "════════════════════════════════════════════════════════"
echo " 短剧工作台 · 本地预览"
echo " 目录：$WEB_APP"
echo " 地址：http://127.0.0.1:$PORT/"
echo " 停止：Ctrl+C"
echo "════════════════════════════════════════════════════════"

cd "$WEB_APP" || exit 1
exec python3 -m http.server "$PORT" --bind 127.0.0.1
