#!/usr/bin/env python3
# convert_libdoc.py —— 把资料库文档的结构化原文（<Heading>/<Table>… 标记）转成 Markdown
#
# 用途：
#   资料库 get_doc_reviews.py 输出的正文是带 id 的结构化标记，直接读很费劲。
#   本脚本把它还原成干净 Markdown，便于本地归档、检索、diff。
#
# 用法：
#   python3 tools/convert_libdoc.py <输入> [输出.md]
#   python3 tools/convert_libdoc.py /tmp/libdocs/01.txt docs/交付文档/01-需求说明书.md
#
# 输入若已是 Markdown（首行以 # 开头、无 <Heading 标记），原样复制，不做转换。
#
# 支持的标记：Heading / Paragraph / Table(TableRow/TableCell) / BulletedList /
#             NumberedList / Todo / BlockQuote / Divider / Code / Mark(bold)

import re
import sys

TAG_OPEN = re.compile(r'^<([A-Za-z][A-Za-z0-9]*)([^>]*?)(/?)>$')
TAG_CLOSE = re.compile(r'^</([A-Za-z][A-Za-z0-9]*)>$')
ATTR = re.compile(r'([A-Za-z_][\w-]*)(?:="([^"]*)")?')
# 行内 <Mark bold>…</Mark> / <Mark code>…</Mark>：文档里常与普通文字同行
INLINE_MARK = re.compile(r'<Mark ([^>]*)>(.*?)</Mark>', re.S)


class Node:
    __slots__ = ("tag", "attrs", "children", "text")

    def __init__(self, tag, attrs=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.children = []
        self.text = []

    def inline(self):
        """把节点的全部文本压成一行（用于标题、段落、列表项、单元格）。"""
        parts = list(self.text)
        for c in self.children:
            parts.append(c.inline())
        s = " ".join(p.strip() for p in parts if p and p.strip())
        return re.sub(r'[ \t]+', ' ', s).strip()


def parse_attrs(s):
    out = {}
    for m in ATTR.finditer(s.strip()):
        k, v = m.group(1), m.group(2)
        if k:
            out[k] = v if v is not None else True
    return out


def parse(lines):
    root = Node("root")
    stack = [root]
    for raw in lines:
        line = raw.rstrip("\n")
        stripped = line.strip()

        m = TAG_OPEN.match(stripped)
        if m:
            tag, attrstr, selfclose = m.group(1), m.group(2), m.group(3)
            node = Node(tag, parse_attrs(attrstr))
            stack[-1].children.append(node)
            if not selfclose:
                stack.append(node)
            continue

        m = TAG_CLOSE.match(stripped)
        if m:
            if len(stack) > 1:
                stack.pop()
            continue

        stack[-1].text.append(line)
    return root


def _inline_marks(s):
    """把行内 <Mark bold>x</Mark> 换成 **x**，code 换成 `x`。"""
    def rep(m):
        attrs, inner = m.group(1), m.group(2)
        inner = inner.strip()
        if not inner:
            return ""
        if "bold" in attrs:
            return "**%s**" % inner
        if "code" in attrs:
            return "`%s`" % inner
        if "strike" in attrs or "strikethrough" in attrs:
            return "~~%s~~" % inner
        return inner
    prev = None
    while prev != s:
        prev = s
        s = INLINE_MARK.sub(rep, s)
    return s


def inline_of(node):
    """渲染内联内容，处理 <Mark bold>。"""
    out = []
    for chunk in node.text:
        out.append(_inline_marks(chunk))
    for c in node.children:
        if c.tag == "Mark":
            inner = inline_of(c)
            if c.attrs.get("bold"):
                out.append("**%s**" % inner.strip())
            elif c.attrs.get("code"):
                out.append("`%s`" % inner.strip())
            else:
                out.append(inner)
        else:
            out.append(inline_of(c))
    s = " ".join(x.strip() for x in out if x and x.strip())
    return re.sub(r'[ \t]+', ' ', s).strip()


def render_table(node):
    rows = []
    for tr in node.children:
        if tr.tag != "TableRow":
            continue
        cells = []
        for tc in tr.children:
            if tc.tag != "TableCell":
                continue
            txt = inline_of(tc).replace("|", "\\|")
            cells.append("" if txt == "" else txt)
        if cells:
            rows.append(cells)
    if not rows:
        return []

    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]

    lines = ["| " + " | ".join(rows[0]) + " |",
             "|" + "|".join([" --- "] * width) + "|"]
    for r in rows[1:]:
        lines.append("| " + " | ".join(r) + " |")
    return lines


def render(node, depth=0):
    out = []
    for ch in node.children:
        t = ch.tag

        if t == "Heading":
            lvl = int(ch.attrs.get("level", 1) or 1)
            lvl = max(1, min(6, lvl))
            txt = inline_of(ch)
            if txt:
                out.append("")
                out.append("#" * lvl + " " + txt)
                out.append("")

        elif t == "Paragraph":
            txt = inline_of(ch)
            if txt:
                out.append(txt)

        elif t == "BulletedList":
            txt = inline_of(ch)
            if txt:
                out.append("  " * depth + "- " + txt)

        elif t == "NumberedList":
            txt = inline_of(ch)
            if txt:
                out.append("  " * depth + "1. " + txt)

        elif t == "Todo":
            txt = inline_of(ch)
            done = " "
            if ch.attrs.get("checked") or ch.attrs.get("done"):
                done = "x"
            if txt:
                out.append("  " * depth + "- [%s] %s" % (done, txt))

        elif t == "BlockQuote":
            inner = render(ch, depth)
            if inner:
                out.append("")
                for ln in inner:
                    out.append("> " + ln if ln else ">")
                out.append("")

        elif t == "Divider":
            out.append("")
            out.append("---")
            out.append("")

        elif t == "Code":
            body = list(ch.text)
            body = [b for b in body]
            out.append("")
            out.extend(body)
            out.append("")

        elif t == "Table":
            tbl = render_table(ch)
            if tbl:
                out.append("")
                out.extend(tbl)
                out.append("")

        elif t in ("Mark",):
            txt = inline_of(ch)
            if txt:
                out.append(txt)

    return out


def tidy(lines):
    """压缩连续空行，去掉首尾空行。"""
    out = []
    blank = 0
    for ln in lines:
        if ln.strip() == "":
            blank += 1
            if blank > 1:
                continue
            out.append("")
        else:
            blank = 0
            out.append(ln.rstrip())
    while out and out[0] == "":
        out.pop(0)
    while out and out[-1] == "":
        out.pop()
    return out


def main():
    if len(sys.argv) < 2:
        print("用法：python3 tools/convert_libdoc.py <输入> [输出.md]")
        return 2

    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else None

    with open(src, encoding="utf-8") as f:
        text = f.read()

    # 已是 Markdown：原样输出
    if "<Heading" not in text and "<Paragraph" not in text and "<Table" not in text:
        body = text
        note = "（已是 Markdown，原样复制）"
    else:
        # 去掉 YAML front matter
        m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
        fm = ""
        if m:
            fm = m.group(1)
            text = text[m.end():]
        root = parse(text.split("\n"))
        lines = tidy(render(root))
        body = "\n".join(lines) + "\n"
        note = "（结构化标记已转为 Markdown）"

    if dst:
        with open(dst, "w", encoding="utf-8") as f:
            f.write(body)
        print("已写入 %s  %d 字节 %s" % (dst, len(body.encode("utf-8")), note))
    else:
        sys.stdout.write(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
