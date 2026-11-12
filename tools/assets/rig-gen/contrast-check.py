"""Contrast report: each sprite's lightest/darkest value against each arena floor (reads on-screen value contrast, e.g. the Pax-on-blue-Air-floor problem).
Run: ~/claudetmp/venv-rig/bin/python tools/assets/rig-gen/contrast-check.py [--check N] [--floor fire|water|earth|air] [--all] [png ...]
Default inputs: the effect/hero PNGs in public/assets/img/*.png (not sprite sheets or tile atlases) plus public/assets/img/sheets/*.png.
Floors: rows of public/assets/img/tilefloor.png (8x4 tiles of 32 px, stage order fire, water, earth, air; see tools/assets/tile-gen/tilefloor.py);
a floor's value is the 5th..95th percentile luminance of its plain tiles (cols 0-3) and its mean.
Sprite lightest/darkest = 2nd/98th percentile luminance of pixels with alpha >= 128 (ignores single stray pixels).
Margin per floor = how far the sprite's range reaches past the floor mean on its better side: max(sprite_light - floor_mean, floor_mean - sprite_dark).
Worst margin over the floors is reported as 'min'. --check N exits 1 if any sprite's min margin is below N (default report-only; suggested N=40).
Needs Pillow + numpy.
"""
import argparse, glob, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import palette

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
IMG = os.path.join(ROOT, "public", "assets", "img")
FLOORS = ("fire", "water", "earth", "air")


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def floor_stats():
    atlas = np.asarray(Image.open(os.path.join(IMG, "tilefloor.png")).convert("RGB"), np.float32)
    out = {}
    for i, name in enumerate(FLOORS):
        L = lum(atlas[i * 32:(i + 1) * 32, 0:4 * 32]).ravel()
        out[name] = (float(np.percentile(L, 5)), float(L.mean()), float(np.percentile(L, 95)))
    return out


def sprite_range(path):
    a = np.asarray(Image.open(path).convert("RGBA"), np.float32)
    m = a[..., 3] >= 128
    if not m.any():
        return None
    L = lum(a[..., :3])[m]
    return float(np.percentile(L, 2)), float(np.percentile(L, 98))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--check", type=float, default=None, help="fail if any sprite's min margin over all floors is below this")
    ap.add_argument("--floor", choices=FLOORS, help="only this floor")
    a = ap.parse_args()
    files = a.files or sorted(glob.glob(os.path.join(IMG, "*.png")) + glob.glob(os.path.join(IMG, "sheets", "*.png")))
    files = [f for f in files if os.path.basename(f) != "tilefloor.png" and not os.path.basename(f).endswith(("Circle.png", "Corner.png"))] if not a.files else files
    floors = floor_stats()
    names = [a.floor] if a.floor else list(FLOORS)
    print("floor value (p5 / mean / p95): " + "  ".join(f"{n} {floors[n][0]:.0f}/{floors[n][1]:.0f}/{floors[n][2]:.0f}" for n in names))
    print(f"{'sprite':28} {'dark':>5} {'light':>5} " + " ".join(f"{n:>6}" for n in names) + "   min")
    bad = []
    for f in files:
        r = sprite_range(f)
        if r is None:
            continue
        dk, lt = r
        margins = [max(lt - floors[n][1], floors[n][1] - dk) for n in names]
        worst = min(margins)
        flag = ""
        if a.check is not None and worst < a.check:
            bad.append(os.path.relpath(f, ROOT))
            flag = "  LOW"
        print(f"{os.path.relpath(f, IMG):28} {dk:5.0f} {lt:5.0f} " + " ".join(f"{m:6.0f}" for m in margins) + f" {worst:5.0f}{flag}")
    if bad:
        print(f"\n{len(bad)} sprite(s) below margin {a.check:g}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
