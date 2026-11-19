#!/usr/bin/env python3
"""Cheap CPU pre-filter for generated art, run BEFORE the art-director sees a batch.

Keeps only plausible candidates so review sheets stay small.
Modes:
  fx   : isolated subject on pure black (corners/border near black, subject not touching the edge, sane fill)
  hero : full-body subject on a flat background (subject not touching the edge, sane fill)
Usage: python3 -I prefilter.py <mode> <dir> [--keep N] [--json out.json]
Needs Pillow (the repo art venv). Prints PASS/FAIL per file with the reason; never edits images.
"""
import json, sys, os
from PIL import Image

def stats(path, mode):
    im = Image.open(path).convert("RGB")
    im.thumbnail((256, 256))
    w, h = im.size
    px = im.load()
    lum = lambda p: (p[0] * 299 + p[1] * 587 + p[2] * 114) // 1000
    border = [lum(px[x, y]) for x in range(w) for y in (0, 1, h - 2, h - 1)] + \
             [lum(px[x, y]) for y in range(h) for x in (0, 1, w - 2, w - 1)]
    bg = sorted(border)[len(border) // 2]
    thr = 40 if mode == "fx" else 28
    fg = [(x, y) for y in range(h) for x in range(w)
          if (lum(px[x, y]) > 40 if mode == "fx" else
              max(abs(px[x, y][i] - px[0, 0][i]) for i in range(3)) > thr)]
    if not fg:
        return dict(bg=bg, fill=0.0, edge=0.0, empty=True)
    xs = [p[0] for p in fg]; ys = [p[1] for p in fg]
    bb = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1) / (w * h)
    m = 3
    edge = sum(1 for x, y in fg if x < m or y < m or x >= w - m or y >= h - m) / len(fg)
    return dict(bg=bg, fill=len(fg) / (w * h), bbox=bb, edge=edge, empty=False)

def judge(s, mode):
    if s["empty"]: return "empty"
    if mode == "fx" and s["bg"] > 30: return f"background not black ({s['bg']})"
    if s["edge"] > 0.02: return f"subject touches edge ({s['edge']:.2f})"
    if s["fill"] < 0.015: return f"too small ({s['fill']:.3f})"
    if s["fill"] > (0.6 if mode == "fx" else 0.8): return f"fills frame ({s['fill']:.2f})"
    return None

def main(argv):
    if len(argv) < 3 or argv[1] not in ("fx", "hero"):
        print(__doc__); return 2
    mode, d = argv[1], argv[2]
    keep = int(argv[argv.index("--keep") + 1]) if "--keep" in argv else 0
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".png"))
    res = []
    for f in files:
        s = stats(os.path.join(d, f), mode); why = judge(s, mode)
        res.append(dict(file=f, ok=why is None, why=why, **s))
    passed = [r for r in res if r["ok"]]
    if keep: passed = sorted(passed, key=lambda r: abs(r["fill"] - 0.2))[:keep]
    for r in res:
        print(("PASS " if r in passed else "FAIL ") + r["file"] + ("" if r["ok"] else "  " + r["why"]))
    print(f"{len(passed)}/{len(res)} pass")
    if "--json" in argv:
        json.dump(dict(pass_=[r["file"] for r in passed], all=res), open(argv[argv.index("--json") + 1], "w"), indent=1)
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
