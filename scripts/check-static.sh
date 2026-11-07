#!/usr/bin/env bash
# 提交前静态自检：外链 / 疑似密钥 / 裸 onclick / import 后缀 / JS 语法
# 任一项失败即以退出码 1 结束，禁止带病提交。用法：bash scripts/check-static.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/source/ai-drama-studio/web-app"
FAILED=0
PASSED=0

pass() { PASSED=$((PASSED + 1)); printf 'PASS  %s\n' "$1"; }
fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL  %s\n' "$1"
  if [ -n "${2:-}" ]; then printf '%s\n' "$2" | head -5 | sed 's/^/      /'; fi
}
check() { if [ -n "${2:-}" ]; then fail "$1" "$2"; else pass "$1"; fi; }

printf '== 短剧工作台 · 静态自检 ==\n目标目录：%s\n\n' "$APP"

# 1) 外链扫描：唯一允许 www.w3.org（SVG 命名空间）
hits=$(grep -rn 'https\?://' "$APP" --include='*.js' --include='*.css' --include='*.html' 2>/dev/null \
  | grep -v 'www\.w3\.org' || true)
check "无外链 / 无 CDN（仅允许 www.w3.org）" "$hits"

# 2) 疑似密钥：键名 + 16 位以上字面量值
hits=$(grep -rniE "(api[_-]?key|access[_-]?token|secret)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" \
  "$APP" --include='*.js' --include='*.html' --include='*.css' 2>/dev/null || true)
check "无硬编码密钥 / 令牌" "$hits"

# 3) 裸 onclick：可点击元素必须走 data-btn-id 委托
hits=$(grep -rniE '\bonclick[[:space:]]*=' "$APP" --include='*.js' --include='*.html' 2>/dev/null || true)
check "无裸 onclick" "$hits"

# 4) 相对 import 必须带 .js 后缀（静态 import 与动态 import 两种写法）
hits=$(grep -rnE "(from[[:space:]]+|import\(\s*)['\"]\.{1,2}/" "$APP/js" --include='*.js' 2>/dev/null \
  | grep -vE "['\"]\.{1,2}/[^'\"]*\.js['\"]" || true)
check "相对 import 均带 .js 后缀" "$hits"

# 5) 逐个 node 语法检查（ES module）
COUNT=0
bad=''
while IFS= read -r f; do
  COUNT=$((COUNT + 1))
  if ! node --experimental-default-type=module --check "$f" >/dev/null 2>&1; then
    bad+="${f#"$ROOT"/}"$'\n'
  fi
done < <(find "$APP/js" -name '*.js' -type f | sort)
check "node --check 全部 $COUNT 个 JS 文件" "$bad"

printf '\n== 统计 ==\n通过 %d 项，失败 %d 项，扫描 JS 文件 %d 个\n' "$PASSED" "$FAILED" "$COUNT"
if [ "$FAILED" -gt 0 ]; then
  printf '结果：失败（请修完上述 FAIL 项再提交）\n'
  exit 1
fi
printf '结果：通过\n'
