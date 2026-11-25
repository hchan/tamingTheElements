#!/usr/bin/env python3
"""Key the status-ring plates (freeze, daze, tide alt) and write a review contact sheet.

Raw plates sit on a grey ground, so prefilter.py (fx mode) always fails them. The keyed RGBA is
composited on black first (prefilter does convert("RGB") and ignores alpha), then stats/judge run.
Usage: ~/claudetmp/venv/bin/python -I tools/assets/status-ring/key-rings.py [out_dir]
Default out_dir: .scratch/status-fx/keyed-rings (PNGs) ; sheet: .scratch/status-ring/sheet-keyed.png
Run from the repo root. Never edits sources.
"""
import importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.getcwd()
ART = os.path.join(ROOT, "tools/assets/roster24-art")


def mod(name, fn):
    s = importlib.util.spec_from_file_location(name, os.path.join(ART, fn))
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


key, pf = mod("key", "key.py"), mod("prefilter", "prefilter.py")
SF = os.path.join(ROOT, ".scratch/status-fx")
# (slot, plate file, method, key kwargs)
JOBS = [
    ("freeze", "fx_status_freeze_r4_45801.png", "freeze", {}),
    ("freeze", "fx_status_freeze_r4_45803.png", "freeze", dict(rmin=0.25, rmax=0.47, feather=0.035)),
    ("freeze", "fx_status_freeze_r4_45800.png", "freeze", {}),
    ("daze", "fx_status_daze_r5_45902.png", "daze", {}),
    ("daze", "fx_status_daze_r5_45901.png", "daze", {}),
    ("tide", "fx_status_tide_r5_46202.png", "tide", {}),
    ("tide", "fx_status_tide_r5_46203.png", "tide", {}),
]
FLOORS = {"fire": (92, 52, 38), "water": (40, 64, 84), "air": (112, 120, 128), "earth": (78, 62, 44)}
DARK = (0x26, 0x26, 0x3C)


def find(name):
    for d, _, fs in os.walk(SF):
        if name in fs and "/keyed" not in d:
            return os.path.join(d, name)
    raise FileNotFoundError(name)


def over(im, bg, size):
    im = im.resize((size, size), Image.LANCZOS)
    base = Image.new("RGBA", im.size, bg + (255,))
    return Image.alpha_composite(base, im).convert("RGB")


# Art-director regrade conditions (2026-11-24): freeze toward grey-teal 0x7f9aa6, daze to brass 0xc8b45a.
REGRADE = {"fx_status_freeze_r4_45801.png": ((0x7f, 0x9a, 0xa6), 0.8), "fx_status_daze_r5_45901.png": ((0xc8, 0xb4, 0x5a), 0.85)}


def regrade(im, target, amt):
    """Remap colour to the target hue by luminance, keep alpha; amt = blend toward the target."""
    a = np.array(im).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3:]
    lum = (rgb * [0.299, 0.587, 0.114]).sum(2, keepdims=True)
    t = np.array(target, np.float32) / 255.0
    tl = float((t * [0.299, 0.587, 0.114]).sum())
    graded = np.clip(t * (lum / max(tl, 1e-3)) * 0.9, 0, 1)
    out = np.concatenate([rgb * (1 - amt) + graded * amt, al], 2)
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def main(argv):
    out = argv[1] if len(argv) > 1 else os.path.join(SF, "keyed-rings")
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(ROOT, ".scratch/status-ring"), exist_ok=True)
    tmp = os.path.join(out, "_onblack"); os.makedirs(tmp, exist_ok=True)
    T = 128; cols = 2 + 1 + len(FLOORS) * 2
    rows, npass = [], 0
    for slot, fn, method, kw in JOBS:
        src = find(fn); rgb = key.load(src)
        im = key.key_array(method, rgb, **kw)
        im.save(os.path.join(out, fn))
        if fn in REGRADE:
            os.makedirs(os.path.join(out, "regrade"), exist_ok=True)
            regrade(im, *REGRADE[fn]).save(os.path.join(out, "regrade", fn))
        onblack = os.path.join(tmp, fn); over(im, (0, 0, 0), im.size[0]).save(onblack)
        why = pf.judge(pf.stats(onblack, "fx"), "fx"); npass += why is None
        print(("PASS " if why is None else "FAIL ") + fn + ("" if why is None else "  " + why))
        raw = Image.fromarray((rgb * 255).astype(np.uint8)).resize((T, T))
        cells = [(raw, fn[10:-4][-12:]), (over(im, DARK, T), "dark " + ("PASS" if not why else "FAIL"))]
        for el, c in FLOORS.items():
            cells.append((over(im, c, T), el))
            cells.append((over(im, c, 2 * T).resize((2 * T, 2 * T)), el + " 2x"))
        rows.append(cells)
    print(f"{npass}/{len(JOBS)} pass (prefilter fx on black composite)")
    W = T + 4 + T + 4 + sum(T + 4 + 2 * T + 4 for _ in FLOORS)
    sheet = Image.new("RGB", (W, len(rows) * (2 * T + 16)), (60, 60, 60)); d = ImageDraw.Draw(sheet)
    for y, cells in enumerate(rows):
        x = 0
        for im, lab in cells:
            sheet.paste(im, (x, y * (2 * T + 16) + 12)); d.text((x + 2, y * (2 * T + 16)), lab, fill=(255, 255, 0)); x += im.size[0] + 4
    p = os.path.join(ROOT, ".scratch/status-ring/sheet-keyed.png"); sheet.save(p); print("sheet", p)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
