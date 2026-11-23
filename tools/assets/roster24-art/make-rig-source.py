"""Writes the rig source image (rig.png) for a roster24 hero: the cleaned cutout fitted (Lanczos) into a canvas of exactly box size x res,
so portrait-rig/prep.py can use it 1:1 (its check: box w/h x res == image px). Canvas per hero (px): 400x400 for most, 250x400 Hyalia
(box 125x200), 340x320 Ouroth (box 170x160) - see SIZES; other ids use 400x400.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/roster24-art/make-rig-source.py HERO CUTOUT OUT.png [--pad 10] [--margin 10]
The creature (alpha bbox) is scaled to fit inside the canvas minus pad (sides, top) and margin (bottom), never stretched, and sits at the
bottom centre. Needs Pillow only; deterministic. Never touches <hero>Large.png (the menu portrait)."""
import argparse
from PIL import Image

RES = 2
SIZES = {"ouroth": (340, 320)}  # Hyalia (96433 wyvern, wide) uses the default 400x400 canvas

ap = argparse.ArgumentParser()
ap.add_argument("hero"); ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--pad", type=int, default=10); ap.add_argument("--margin", type=int, default=10)
a = ap.parse_args()
if a.out.endswith("Large.png"):
    raise SystemExit("refusing to write a Large.png")
cw, ch = SIZES.get(a.hero, (400, 400))
im = Image.open(a.src).convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())
k = min((cw - 2 * a.pad) / im.width, (ch - a.pad - a.margin) / im.height)
im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
canvas.alpha_composite(im, ((cw - im.width) // 2, ch - a.margin - im.height))
canvas.save(a.out, optimize=True)
print(a.hero, a.out, f"{cw}x{ch}", f"box {cw // RES}x{ch // RES} at res {RES}")
