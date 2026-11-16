"""Compose a roster24 cutout into a per-hero-size <id>Large.png (not forced square, not normalised to one size).
Usage: make-large.py HERO CUTOUT OUT [--max N] [--margin 10] [--pad 10]
The longest side of the creature is fitted (Lanczos) to the per-hero value in LONG_SIDE (big beasts ~400, small ones ~260-300),
so heroes differ in canvas height AND width AND relative scale. --max overrides the table. The canvas is the fitted size plus
--pad on the sides and top and --margin at the bottom; the creature sits at the bottom centre like the 400x400 originals.
Consumers: menu showcase (per-hero aspect) and tour-select void only."""
import argparse
from PIL import Image

# longest side in px, tuned by creature size (owner 2026-11-16: not all the same size)
LONG_SIDE = {
    "durrok": 400,    # elephant: biggest
    "quarrak": 392,   # giant turtle, wide
    "abyssor": 390,   # octopus, sprawling
    "brazgor": 380,   # bull
    "ouroth": 350,    # coiled serpent
    "nykra": 340,     # horse, tall
    "zephra": 320,
    "glimmaw": 300,   # anglerfish
    "umbrel": 340,    # mushroom: tall and narrow
    "vortigal": 380,  # eagle: wide, low canvas
    "kindrel": 280,   # fox: small
    "hyalia": 270,    # jellyfish: small
}

ap = argparse.ArgumentParser()
ap.add_argument("hero"); ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--max", type=int, default=0); ap.add_argument("--margin", type=int, default=10)
ap.add_argument("--pad", type=int, default=10)
a = ap.parse_args()
long_side = a.max or LONG_SIDE[a.hero]
im = Image.open(a.src).convert("RGBA")
im = im.crop(im.getchannel("A").getbbox())
s = long_side / max(im.size)
im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
canvas = Image.new("RGBA", (im.width + 2 * a.pad, im.height + a.pad + a.margin), (0, 0, 0, 0))
canvas.alpha_composite(im, (a.pad, a.pad))
canvas.save(a.out, optimize=True)
print(a.hero, a.out, canvas.width, canvas.height)
