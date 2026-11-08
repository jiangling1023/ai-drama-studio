#!/usr/bin/env python3
# ocr.py —— 图片文字识别（本地离线，无需联网）
#
# 为什么有这个脚本：
#   本会话的模型不能接收图像，视觉工具直接报错；本机也没有 tesseract。
#   已安装 rapidocr-onnxruntime 到独立目录，本脚本封装它，避免每次手写长命令。
#
# 依赖（已装好）：
#   pip install --target ~/.workbuddy/pylibs rapidocr-onnxruntime
#   约 378 MB（主要是 onnxruntime），CPU 运行，支持中英文混排。
#
# 用法：
#   python3 tools/ocr.py <图片路径>              # 按行输出，带坐标
#   python3 tools/ocr.py <图片路径> --plain      # 只输出文字，不带坐标
#   python3 tools/ocr.py <图片路径> --min-score 0.6
#
# 输出：按 y 坐标聚成行，同一行内按 x 排序，用 " | " 连接同行的多段文字。

import argparse
import os
import sys

PYLIBS = os.path.expanduser("~/.workbuddy/pylibs")
if os.path.isdir(PYLIBS):
    sys.path.insert(0, PYLIBS)


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("image")
    ap.add_argument("--plain", action="store_true", help="只输出文字，不带坐标与置信度")
    ap.add_argument("--min-score", type=float, default=0.0, help="过滤低置信度结果（0-1）")
    ap.add_argument("--line-gap", type=int, default=25, help="同一行的 y 容差像素")
    args = ap.parse_args()

    if not os.path.isfile(args.image):
        print("❌ 文件不存在：%s" % args.image)
        return 1

    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as e:
        print("❌ 未能加载 OCR 引擎：%s" % e)
        print("   安装：python3 -m pip install --target ~/.workbuddy/pylibs rapidocr-onnxruntime")
        return 1

    engine = RapidOCR()
    res, _ = engine(args.image)
    if not res:
        print("（未识别到文字）")
        return 0

    items = []
    for box, text, score in res:
        try:
            sc = float(score)
        except (TypeError, ValueError):
            sc = 0.0
        if sc < args.min_score:
            continue
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append((min(ys), min(xs), str(text).strip(), sc))

    if not items:
        print("（没有超过置信度阈值 %s 的结果）" % args.min_score)
        return 0

    items.sort(key=lambda t: (t[0], t[1]))

    # 按 y 聚行：相邻项 y 差小于容差视为同一行
    rows, cur, last = [], [], None
    for it in items:
        if last is None or abs(it[0] - last) < args.line_gap:
            cur.append(it)
        else:
            rows.append(cur)
            cur = [it]
        last = it[0]
    if cur:
        rows.append(cur)

    print("识别到 %d 段文字，聚成 %d 行" % (len(items), len(rows)))
    print("─" * 60)
    for row in rows:
        row.sort(key=lambda t: t[1])
        if args.plain:
            print(" | ".join(t[2] for t in row))
        else:
            y = int(row[0][0])
            print("[y=%4d] %s" % (y, " | ".join(t[2] for t in row)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
