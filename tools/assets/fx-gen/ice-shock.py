"""Procedural Curomo Ice Shock effect (original art, no legacy pixels). Replaces the thin legacy 80x32 iceShock.png.
Run: python3 tools/assets/fx-gen/ice-shock.py public/assets/img/fx/iceShock.png   (needs Pillow)
Look (docs/ART-REFERENCES.md rec. 4): hard angular ice shards with a pale cyan core (200,245,255), mid cyan, deep blue-violet outline,
white sparkle pixels and a frost trail of fading shard fragments. East-facing: caster at the left, tip at the right.
The sheet is 240x72: the view draws it over the 240x40 melee box widened to 72 tall (mirrored west, turned for north/south).
Coordinates below are in the 240x40 box space; P() maps them to the taller canvas.
Outline and rim keep it readable on every floor (dark outline on the light Earth/Air floors, pale core on the dark Fire/Void floors).
"""
import os, sys
from PIL import Image, ImageDraw

OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "public/assets/img/fx", "iceShock.png")
W, H, SS = 240, 72, 4
YS = 1.8  # drawn 1.8x taller than the 240x40 hit box (the view enlarges the display to match, see projectile-view.ts)
OUTLINE = (12, 14, 66)
DEEP = (44, 86, 190)
MID = (70, 190, 242)
LIGHT = (150, 232, 255)
CORE = (214, 250, 255)
WHITE = (255, 255, 255)

img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def P(pts):
    return [(x * SS, (H / 2 + (y - 20) * YS) * SS) for x, y in pts]

def shard(bx, tx, cy, hw, tip_y=None, shoulder=0.28, alpha=255):
    """Kite shard from base x=bx to tip x=tx on axis cy, half width hw at the shoulder (fraction along the length)."""
    ty = cy if tip_y is None else tip_y
    sx = bx + (tx - bx) * shoulder
    sy = cy + (ty - cy) * shoulder
    top = (sx, sy - hw)
    bot = (sx, sy + hw)
    base, tip = (bx, cy), (tx, ty)
    # outline: draw the polygon fat first, then the facets on top
    d.polygon(P([base, top, tip, bot]), fill=OUTLINE + (alpha,), outline=OUTLINE + (alpha,), width=int(3.4 * SS))
    k = 0.9
    mid_top = (sx, sy - hw * k)
    mid_bot = (sx, sy + hw * k)
    c = lambda col: col + (alpha,)
    # upper facet light, lower facet deep, ridge core down the axis
    d.polygon(P([(bx + 1.2, cy), mid_top, (tx - 2.0, ty)]), fill=c(LIGHT))
    d.polygon(P([(bx + 1.2, cy), mid_bot, (tx - 2.0, ty)]), fill=c(DEEP))
    d.polygon(P([(bx + 1.5, cy), (sx, sy - hw * 0.38), (tx - 2.0, ty)]), fill=c(CORE))
    d.polygon(P([(bx + 1.5, cy), (sx, sy + hw * 0.34), (tx - 2.0, ty)]), fill=c(MID))
    d.line(P([(bx + 3, cy), (tx - 4, ty)]), fill=c(WHITE), width=max(1, int(0.9 * SS)))

def sparkle(x, y, r, alpha=255):
    col = WHITE + (alpha,)
    d.polygon(P([(x, y - r), (x + r * 0.22, y - r * 0.22), (x + r, y), (x + r * 0.22, y + r * 0.22),
                 (x, y + r), (x - r * 0.22, y + r * 0.22), (x - r, y), (x - r * 0.22, y - r * 0.22)]), fill=col)

cy = 20
# frost trail at the caster end: fading shard fragments
for bx, tx, off, hw, a in [(34, 60, -8, 3.6, 230), (22, 46, 9, 3.2, 190), (12, 32, -3, 2.6, 140), (3, 20, 6, 2.0, 90)]:
    shard(bx, tx, cy + off, hw, alpha=a)
for x, y, r, a in [(30, 9, 2.0, 200), (16, 28, 1.8, 160), (6, 15, 1.5, 120), (40, 33, 1.8, 190)]:
    sparkle(x, y, r, a)
# rear side shards, then the big lance, then the front fan
shard(60, 146, cy - 5, 7.0, tip_y=3.0)
shard(64, 154, cy + 5, 7.0, tip_y=37.0)
shard(100, 204, cy - 3, 6.0, tip_y=6)
shard(104, 208, cy + 3, 6.0, tip_y=34)
shard(44, 237, cy, 12.5, shoulder=0.26)
shard(150, 224, cy - 2, 5.0, tip_y=9)
shard(154, 226, cy + 2, 5.0, tip_y=31)
for x, y, r in [(92, 14, 2.4), (130, 25, 2.0), (176, 17, 2.6), (210, 21, 2.2), (118, 8, 1.8), (160, 33, 1.8)]:
    sparkle(x, y, r)

out = img.resize((W, H), Image.LANCZOS)
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
out.save(OUT, optimize=True)
print(OUT, out.size)
