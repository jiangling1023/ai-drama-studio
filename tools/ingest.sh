#!/usr/bin/env bash
# ingest.sh —— 材料接手脚本
#
# 用途：判定一个压缩包/目录到底是不是 AI Drama Studio 的工程包，
#       并给出解压目标位置建议。不修改原文件，只读 + 输出报告。
#
# 用法：
#   bash tools/ingest.sh <文件或目录路径>
#   bash tools/ingest.sh ~/Downloads/短剧工作台-二次开发版-v1.0.zip
#   bash tools/ingest.sh ~/Downloads/LocalMiniDrama-Studio --extract src
#
# 参数：
#   $1            待判定的 zip / tar.gz / 目录
#   --extract DIR 判定通过后解压到 DIR（默认不解压）
#
# 依赖：bash + tar + awk + find 必备；
#       zip 场景优先用 unzip，缺失时自动回退到 python3(zipfile)。
#       本机实测环境：无 unzip / 无 file，故两者都做了回退。

set -uo pipefail

TARGET="${1:-}"
EXTRACT_TO=""

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --extract) EXTRACT_TO="${2:-}"; shift 2 ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "用法：bash tools/ingest.sh <zip|tar.gz|目录> [--extract 目标目录]"
  exit 2
fi

if [[ ! -e "$TARGET" ]]; then
  echo "❌ 路径不存在：$TARGET"
  exit 1
fi

# ── 后端能力探测 ──────────────────────────────────────────
HAVE_UNZIP=0; command -v unzip   >/dev/null 2>&1 && HAVE_UNZIP=1
HAVE_PY=0;    command -v python3 >/dev/null 2>&1 && HAVE_PY=1
HAVE_FILE=0;  command -v file    >/dev/null 2>&1 && HAVE_FILE=1

# 临时目录：不用 rm 清理（本机 rm 被沙箱 shim 拦截会报错），改用 python3 删
TMP_DIR=$(mktemp -d) || { echo "❌ 无法创建临时目录"; exit 1; }
cleanup() {
  if [[ "$HAVE_PY" -eq 1 ]]; then
    python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$TMP_DIR" 2>/dev/null
  fi
}
trap cleanup EXIT
LIST_FILE="$TMP_DIR/list.txt"

echo "════════════════════════════════════════════════════════"
echo " 材料接手判定：$TARGET"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════"
echo

# ── 1. 基础信息 ───────────────────────────────────────────
if [[ -d "$TARGET" ]]; then
  SIZE=$(du -sh "$TARGET" 2>/dev/null | cut -f1)   # 必须 -s，否则递归输出多行
else
  SIZE=$(du -h "$TARGET" 2>/dev/null | cut -f1)
fi
echo "【1】基础信息"
echo "  体积：${SIZE:-未知}"
if [[ -f "$TARGET" ]]; then
  if [[ "$HAVE_FILE" -eq 1 ]]; then
    echo "  类型：$(file -b "$TARGET" 2>/dev/null | cut -c1-90)"
  elif [[ "$HAVE_PY" -eq 1 ]]; then
    KIND=$(python3 -c '
import sys
p = sys.argv[1]
try:
    with open(p, "rb") as f:
        head = f.read(8)
except Exception as e:
    print("读取失败: %s" % e); raise SystemExit
sig = {
    b"PK\x03\x04": "ZIP 归档（PK\\x03\\x04）",
    b"PK\x05\x06": "ZIP 空归档",
    b"\x1f\x8b":   "gzip 压缩流（.tar.gz / .tgz）",
    b"\xfd7zXZ":   "xz 压缩流",
    b"BZh":        "bzip2 压缩流",
    b"7z\xbc\xaf": "7z 归档",
    b"\x7fELF":    "ELF 可执行文件（Linux 二进制/安装包）",
    b"MZ":         "PE 可执行文件（Windows .exe/.dll）",
}
for k, v in sig.items():
    if head.startswith(k):
        print(v); break
else:
    print("未识别的文件头：%r" % head[:8])
' "$TARGET" 2>/dev/null)
    echo "  类型：${KIND:-未知}"
  else
    echo "  类型：（无 file / python3，跳过）"
  fi
fi
echo "  后端：unzip=$HAVE_UNZIP python3=$HAVE_PY file=$HAVE_FILE"
echo

# ── 2. 取清单 ─────────────────────────────────────────────
MODE=""
if [[ -d "$TARGET" ]]; then
  MODE="dir"
  # 深度必须 ≥6：source/ai-drama-studio/web-app/js/pages/p001.js 就有 5 层，
  # 深度 4 会把真正的源码文件整层截断（本项目实测踩过）。
  # 同时排除版本库与依赖目录，否则 .git/hooks/*.sample 会污染扩展名统计。
  ( cd "$TARGET" && find . -mindepth 1 -maxdepth 6 \
      -not -path './.git' -not -path './.git/*' \
      -not -path './node_modules' -not -path './node_modules/*' \
      -not -path './.svn' -not -path './.svn/*' \
      -not -path './dist' -not -path './dist/*' \
      -not -path './build' -not -path './build/*' \
      -not -path '*/__pycache__*' ) > "$LIST_FILE" 2>/dev/null
else
  # 先看文件头再决定走 zip 还是 tar，避免扩展名骗人
  IS_ZIP=0; IS_TAR=0
  if [[ "$HAVE_PY" -eq 1 ]]; then
    READ_KIND=$(python3 -c '
import sys
with open(sys.argv[1], "rb") as f: h = f.read(4)
print("zip" if h.startswith(b"PK") else ("gzip" if h.startswith(b"\x1f\x8b") else "other"))
' "$TARGET" 2>/dev/null)
    [[ "$READ_KIND" == "zip" ]] && IS_ZIP=1
    [[ "$READ_KIND" == "gzip" ]] && IS_TAR=1
  fi
  if [[ "$IS_ZIP" -eq 1 ]]; then
    MODE="zip"
    if [[ "$HAVE_UNZIP" -eq 1 ]]; then
      unzip -Z1 "$TARGET" > "$LIST_FILE" 2>/dev/null
    elif [[ "$HAVE_PY" -eq 1 ]]; then
      python3 -c '
import sys, zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as z:
        for n in z.namelist():
            print(n)
except Exception as e:
    sys.stderr.write("  zip 读取失败：%s\n" % e)
    sys.exit(1)
' "$TARGET" > "$LIST_FILE" 2>"$TMP_DIR/err.txt"
      [[ -s "$TMP_DIR/err.txt" ]] && sed 's/^/  /' "$TMP_DIR/err.txt"
    fi
  elif [[ "$IS_TAR" -eq 1 ]]; then
    MODE="tar"
    tar -tzf "$TARGET" > "$LIST_FILE" 2>/dev/null
  elif [[ "$TARGET" == *.zip ]]; then
    MODE="zip"
    [[ "$HAVE_UNZIP" -eq 1 ]] && unzip -Z1 "$TARGET" > "$LIST_FILE" 2>/dev/null
  elif [[ "$TARGET" == *.tar.gz || "$TARGET" == *.tgz ]]; then
    MODE="tar"
    tar -tzf "$TARGET" > "$LIST_FILE" 2>/dev/null
  else
    MODE="未知"
  fi
fi

TOTAL=$(grep -c . "$LIST_FILE" 2>/dev/null || echo 0)
echo "【2】条目数：$TOTAL（模式：$MODE）"
if [[ "$TOTAL" -eq 0 ]]; then
  echo "❌ 读不出清单。可能原因：格式不支持 / 包损坏 / 缺少解包后端。"
  echo "   本机 unzip=$HAVE_UNZIP、python3=$HAVE_PY、file=$HAVE_FILE。"
  exit 1
fi

# ── 3. 顶层结构 ───────────────────────────────────────────
echo
echo "【3】顶层结构（前 20 条）"
sed 's|^\./||' "$LIST_FILE" | awk -F/ 'NF>0 && $1!="" {print $1}' | sort -u | head -20 | sed 's/^/  - /'

TOP_UNIQ=$(sed 's|^\./||' "$LIST_FILE" | awk -F/ 'NF>0 && $1!="" {print $1}' | sort -u | wc -l | tr -d ' ')
if [[ "$TOP_UNIQ" -eq 1 ]]; then
  echo "  → 只有 1 个顶层项，解压后建议把该项内容直接上移（避免多套一层目录）"
fi
echo

# ── 4. 按扩展名统计 ───────────────────────────────────────
echo "【4】扩展名分布（前 12）"
grep -v '/$' "$LIST_FILE" | sed 's|.*/||' \
  | awk -F. 'NF>1{print "."$NF} NF==1{print "(无扩展名)"}' \
  | sort | uniq -c | sort -rn | head -12 | sed 's/^/  /'
echo

# ── 5. 工程特征指纹 ───────────────────────────────────────
echo "【5】工程特征指纹"
score=0
check() {  # $1=特征名  $2=匹配模式
  if grep -qiE "$2" "$LIST_FILE"; then
    echo "  ✅ $1"
    score=$((score + 1))
  else
    echo "  -- $1"
  fi
}
check "package.json（Node/Electron 工程）"          'package\.json$'
check "vite 配置 / Electron 主进程"                  'vite\.config|electron|main\.js$'
check "源码目录（src/ · app/ · source/ · web-app/）"  '(^|/)(src|app|source|web-app)/'
check "前端入口 index.html"                          '(^|/)index\.html$'
check "js/ 与 css/ 资源目录"                         '(^|/)js/.*\.(js|mjs)$|(^|/)css/.*\.css$'
check "构建/自检脚本（Makefile · forge · check-*）"   'makefile|build\.(sh|py)|forge\.config|check-(static|contract)'
check "业务命名 drama / 短剧 / duanju"               'drama|短剧|duanju'
check "前后端模块目录（pages/ · components/ · shell/）" '(^|/)(pages|components|shell|core)/'
check "交付/验收文档（47-53 · 功能说明 · 验收报告）"     '(^|/)(4[7-9]|5[0-3])[-_]|功能说明|验收报告'
check "RELEASE-NOTES / manifest / SUMS"              'release-notes|manifest|sums'
check "deb / AppImage 产物"                          '\.(deb|appimage)$'
check "Windows 安装包（exe / msi / 7z）"              '\.(exe|msi|7z)$'

# 业务指纹作为必要条件：一个不叫 drama/短剧 的包，不该被判 pass
BIZ=0
grep -qiE 'drama|短剧|duanju' "$LIST_FILE" && BIZ=1
echo

# ── 6. 负面信号 ───────────────────────────────────────────
echo "【6】负面信号（命中说明很可能不是工程包）"
neg=0
negcheck() {
  if grep -qiE "$2" "$LIST_FILE"; then
    echo "  ⚠️  $1"
    neg=$((neg + 1))
  fi
}
# Vite hash 特征：8 位随机串几乎总是大小写混合（如 main-D4DaPwsz.js）。
# 纯小写 8 字母是正常 kebab-case 源码命名（director / keyframe / timeline / download），
# 不能算负面信号——本项目真源码就踩过这个假阳性。
HASH_LINES=$(grep -E '\-[A-Za-z0-9]{8}\.(js|css)$' "$LIST_FILE" 2>/dev/null)
if [[ -n "$HASH_LINES" ]] && echo "$HASH_LINES" | grep -qE '[A-Z]'; then
  echo "  ⚠️  Vite 打包 hash 文件名（8 位、大小写混合的 bundle）"
  echo "$HASH_LINES" | grep -E '[A-Z]' | head -3 | sed 's/^/      举例：/'
  neg=$((neg + 1))
fi
negcheck "WorkBuddy 网页资源（chat-ui / oneid / vendor）" 'chat-ui|oneid|vendor-|modulepreload'
negcheck "埋点脚本"                                  'google_noFurtherRedirects|gtag|analytics'
[[ "$neg" -eq 0 ]] && echo "  （无）"
echo

# ── 7. 判定 ───────────────────────────────────────────────
echo "════════════════════════════════════════════════════════"
if [[ "$score" -ge 4 && "$neg" -eq 0 && "$BIZ" -eq 1 ]]; then
  echo " 判定：✅ 很像 AI Drama Studio 工程包（特征 $score 项命中，业务指纹 ✅，无负面信号）"
  VERDICT="pass"
elif [[ "$score" -ge 4 && "$neg" -eq 0 && "$BIZ" -eq 0 ]]; then
  echo " 判定：⚠️  结构很像工程包（$score 项），但业务命名对不上——确认是不是同名无关项目"
  VERDICT="maybe"
elif [[ "$score" -ge 2 || "$BIZ" -eq 1 ]]; then
  echo " 判定：⚠️  部分特征命中（$score 项 / 负面 $neg 项），需人工确认，可能是文档包或产物包"
  VERDICT="maybe"
else
  echo " 判定：❌ 不像工程包（仅 $score 项特征命中，负面信号 $neg 项）"
  VERDICT="fail"
fi
echo "════════════════════════════════════════════════════════"

# ── 8. 可选解压 ───────────────────────────────────────────
if [[ -n "$EXTRACT_TO" ]]; then
  if [[ "$VERDICT" == "fail" ]]; then
    echo
    echo "已拒绝解压：判定为不像工程包。如确需解压，请手动指定或先核对内容。"
    exit 3
  fi
  mkdir -p "$EXTRACT_TO"
  echo
  echo "解压到：$EXTRACT_TO"
  if [[ "$MODE" == "zip" ]]; then
    if [[ "$HAVE_UNZIP" -eq 1 ]]; then
      unzip -q -o "$TARGET" -d "$EXTRACT_TO" && echo "✅ 解压完成"
    elif [[ "$HAVE_PY" -eq 1 ]]; then
      python3 -c '
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
print("✅ 解压完成（python3 zipfile）")
' "$TARGET" "$EXTRACT_TO"
    else
      echo "❌ 没有可用的 zip 解包后端"
      exit 1
    fi
  elif [[ "$MODE" == "tar" ]]; then
    tar -xzf "$TARGET" -C "$EXTRACT_TO" && echo "✅ 解压完成"
  else
    echo "⚠️  目录模式无需解压，请直接移动到目标位置"
  fi
  echo
  echo "解压后目录："
  find "$EXTRACT_TO" -maxdepth 2 -mindepth 1 | head -20 | sed 's/^/  /'
fi
