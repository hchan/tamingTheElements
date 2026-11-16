"""Compose a roster24 cutout into a per-hero-aspect <id>Large.png (not forced square).
Usage: make-large.py CUTOUT OUT [--max 380] [--margin 10] [--pad 10]
Longest side of the creature is fitted to --max (Lanczos); the canvas is the fitted size plus --pad on the sides and top and
--margin at the bottom, so the creature sits at the bottom centre like the existing 400x400 portraits (aspect varies per hero)."""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--max", type=int, default=380); ap.add_argument("--margin", type=int, default=10)
ap.add_argument("--pad", type=int, default=10)
a = ap.parse_args()
im = Image.open(a.src).convert("RGBA")
bb = im.getchannel("A").getbbox()
im = im.crop(bb)
s = a.max / max(im.size)
im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
canvas = Image.new("RGBA", (im.width + 2 * a.pad, im.height + a.pad + a.margin), (0, 0, 0, 0))
canvas.alpha_composite(im, (a.pad, a.pad))
canvas.save(a.out, optimize=True)
print(a.out, canvas.width, canvas.height)
