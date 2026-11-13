"""Action bar icons (unified-action-bar): the boxes that had no art of their own. One 4x3 sheet of 64x64 tiles, original art, no
third-party sources: trap, tag, charge, weather, dash, guard, super, fire, water, earth, air, element (the generic one).
Run: python3 tools/assets/hud-gen/actions.py [outfile]   (default public/assets/img/hud/actions.png; needs Pillow only)
Look (owner: art reads too cartoony, wants grim, desaturated, textured): a dark smoky plate with a soft vignette, a muted glyph
shaded top-lit with a soft gradient (no bold outline, no chevron clip-art), a faint additive glow behind it, deterministic film
grain over the lot. Every glyph is drawn at 4x on a mask and downsampled, so the edges stay soft. Tile order is TILES below
(cell = index, 4 per row); src/game/hud/action-bar.ts (ACTION_ICON) reads the sheet by that order.
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

TILE = 64
SS = 4
COLS = 4
BIG = TILE * SS

# Muted glyph colours (light end, dark end): dull brass, bone, rust, slate, steel, ember, ash blues and so on.
TILES = [
    ("trap", (178, 160, 112), (86, 74, 50)),
    ("tag", (188, 180, 160), (88, 84, 74)),
    ("charge", (176, 120, 96), (82, 52, 44)),
    ("weather", (150, 164, 178), (66, 76, 88)),
    ("dash", (170, 174, 168), (74, 78, 76)),
    ("guard", (166, 172, 176), (70, 76, 82)),
    ("super", (206, 168, 104), (104, 64, 40)),
    ("fire", (210, 128, 82), (98, 44, 30)),
    ("water", (118, 156, 184), (44, 70, 96)),
    ("earth", (170, 146, 108), (78, 64, 46)),
    ("air", (196, 208, 214), (96, 108, 116)),
    ("element", (176, 168, 150), (80, 76, 66)),
]


def P(x, y):
    """A point given in 0..64 tile units, as 4x pixels."""
    return (x * SS, y * SS)


def poly(d, pts):
    d.polygon([P(x, y) for x, y in pts], fill=255)


def ellipse(d, cx, cy, rx, ry):
    d.ellipse([P(cx - rx, cy - ry), P(cx + rx, cy + ry)], fill=255)


def line(d, a, b, w):
    d.line([P(*a), P(*b)], fill=255, width=max(1, int(w * SS)))


def draw_trap(d):
    # A bear trap, sprung half open: two toothed jaws facing each other round a trigger plate.
    for cy, sgn in ((30, -1), (44, 1)):
        pts = []
        for i in range(17):
            a = math.pi * i / 16.0
            pts.append((32 - math.cos(a) * 23, cy + sgn * math.sin(a) * 19))
        for i in range(16, -1, -1):
            a = math.pi * i / 16.0
            r = 17 if i % 2 == 0 else 11
            pts.append((32 - math.cos(a) * r, cy + sgn * math.sin(a) * r * 0.82))
        poly(d, pts)
    ellipse(d, 32, 37, 5, 3)
    line(d, (32, 54), (32, 60), 2)


def draw_tag(d):
    # Two heads and shoulders, one behind the other: swapping places.
    ellipse(d, 24, 22, 8, 9)
    poly(d, [(8, 52), (10, 40), (17, 33), (31, 33), (38, 40), (40, 52)])
    ellipse(d, 42, 19, 7, 8)
    poly(d, [(28, 48), (30, 37), (36, 31), (48, 31), (55, 37), (57, 48)])


def draw_charge(d):
    # A spear point driving right, with tapering streaks trailing behind it.
    poly(d, [(58, 32), (36, 22), (30, 32), (36, 42)])
    for i, (y, x0, w) in enumerate([(32, 8, 3), (24, 14, 2), (40, 14, 2), (17, 20, 1.5), (47, 20, 1.5)]):
        poly(d, [(x0, y), (30 - i * 1.5, y - w), (30 - i * 1.5, y + w)])


def draw_weather(d):
    # A heavy cloud over slanted rain.
    for cx, cy, r in [(22, 28, 10), (34, 22, 13), (46, 29, 9), (31, 31, 12)]:
        ellipse(d, cx, cy, r, r)
    poly(d, [(12, 31), (55, 31), (55, 38), (12, 38)])
    for x in (18, 28, 38, 48):
        line(d, (x, 43), (x - 4, 55), 2)


def draw_dash(d):
    # A blurred lunge: a lean body shape with long smears behind.
    ellipse(d, 44, 24, 6, 6)
    poly(d, [(52, 30), (36, 30), (26, 46), (34, 46), (42, 38), (50, 46), (58, 46)])
    for y, x0, w in [(26, 6, 3), (34, 4, 2.5), (42, 10, 2), (50, 14, 1.5)]:
        poly(d, [(x0, y), (34, y - w), (34, y + w)])


def draw_guard(d):
    # A heater shield with a raised boss.
    poly(d, [(14, 10), (50, 10), (50, 34), (44, 46), (32, 57), (20, 46), (14, 34)])


def draw_guard_cut(d):
    ellipse(d, 32, 31, 7, 7)
    line(d, (32, 14), (32, 52), 2.2)


def draw_super(d):
    # A burst: irregular rays of uneven length round a hot core (not a regular star).
    rng = random.Random(7)
    pts = []
    n = 14
    for i in range(n * 2):
        a = math.pi * 2 * i / (n * 2)
        r = (27 - rng.random() * 6) if i % 2 == 0 else 9
        pts.append((32 + math.cos(a) * r, 32 + math.sin(a) * r))
    poly(d, pts)


def draw_fire(d):
    poly(d, [(32, 8), (40, 22), (48, 34), (46, 46), (38, 55), (26, 55), (18, 46), (16, 34), (22, 24), (26, 30), (28, 18)])


def draw_fire_cut(d):
    poly(d, [(32, 36), (38, 44), (36, 52), (28, 52), (26, 44)])


def draw_water(d):
    # A drop: a round belly under a tapering tip.
    ellipse(d, 32, 40, 15, 15)
    poly(d, [(32, 7), (45, 34), (19, 34)])


def draw_earth(d):
    poly(d, [(8, 52), (14, 30), (24, 22), (31, 30), (38, 14), (48, 28), (56, 52)])
    poly(d, [(20, 52), (24, 40), (34, 36), (42, 44), (46, 52)])


def draw_earth_cut(d):
    line(d, (32, 30), (36, 52), 1.6)


def draw_air(d):
    # Three wind curls, the lines breaking as they spiral in.
    for cy, r, a0 in [(20, 9, 0.2), (34, 12, 0.0), (48, 8, 0.4)]:
        pts = []
        for i in range(0, 20):
            a = a0 + math.pi * 1.5 * i / 19.0
            pts.append((20 + i * 1.3 + math.cos(a) * r * 0.5, cy - math.sin(a) * r * 0.45 + i * 0.1))
        for i in range(len(pts) - 1):
            line(d, pts[i], pts[i + 1], 4.2 - 2.2 * i / 19.0)


def draw_element(d):
    # The generic element mark: a ring round a point, with a gap (an unlit sigil).
    d.arc([P(14, 14), P(50, 50)], 30, 330, fill=255, width=SS * 4)
    ellipse(d, 32, 32, 4, 4)


DRAW = {
    "trap": (draw_trap, None),
    "tag": (draw_tag, None),
    "charge": (draw_charge, None),
    "weather": (draw_weather, None),
    "dash": (draw_dash, None),
    "guard": (draw_guard, draw_guard_cut),
    "super": (draw_super, None),
    "fire": (draw_fire, draw_fire_cut),
    "water": (draw_water, None),
    "earth": (draw_earth, draw_earth_cut),
    "air": (draw_air, None),
    "element": (draw_element, None),
}


def plate():
    """Smoky dark plate: a vertical gradient with a soft vignette (RGB, big)."""
    img = Image.new("RGB", (BIG, BIG))
    px = img.load()
    for y in range(BIG):
        for x in range(0, BIG):
            dx, dy = (x - BIG / 2) / (BIG / 2), (y - BIG * 0.46) / (BIG / 2)
            v = max(0.0, 1.0 - (dx * dx + dy * dy) * 0.55)
            base = 18 + 20 * v
            px[x, y] = (int(base * 1.02), int(base), int(base * 0.94))
    return img


def tile(name, light, dark, seed):
    draw, cut = DRAW[name]
    mask = Image.new("L", (BIG, BIG), 0)
    draw(ImageDraw.Draw(mask))
    if cut is not None:
        hole = Image.new("L", (BIG, BIG), 0)
        cut(ImageDraw.Draw(hole))
        mask = ImageChops.subtract(mask, hole.filter(ImageFilter.GaussianBlur(SS * 0.3)))
    soft = mask.filter(ImageFilter.GaussianBlur(SS * 0.5))
    img = plate()
    # Glow behind the glyph, muted.
    glow = soft.filter(ImageFilter.GaussianBlur(SS * 5)).point(lambda v: int(v * 0.42))
    img = Image.composite(Image.new("RGB", (BIG, BIG), tuple(int(c * 0.55) for c in dark)), img, glow)
    # Glyph: top-lit vertical gradient, light at the top, dark at the bottom.
    grad = Image.new("RGB", (BIG, BIG))
    gp = grad.load()
    for y in range(BIG):
        t = min(1.0, max(0.0, (y / BIG - 0.1) / 0.8))
        c = tuple(int(light[i] * (1 - t) + dark[i] * t) for i in range(3))
        for x in range(BIG):
            gp[x, y] = c
    img = Image.composite(grad, img, soft)
    # Inner shade: an offset copy of the mask darkens the lower-right edge for volume.
    shade = ImageChops.offset(soft, SS, SS)
    edge = ImageChops.subtract(soft, shade).filter(ImageFilter.GaussianBlur(SS * 0.6))
    img = Image.composite(Image.new("RGB", (BIG, BIG), (14, 13, 12)), img, edge.point(lambda v: int(v * 0.9)))
    # Frame hairline, dim.
    ImageDraw.Draw(img).rectangle([0, 0, BIG - 1, BIG - 1], outline=(40, 38, 34), width=SS)
    out = img.resize((TILE, TILE), Image.LANCZOS)
    rng = random.Random(seed)
    op = out.load()
    for y in range(TILE):
        for x in range(TILE):
            n = int((rng.random() - 0.5) * 14)
            r, g, b = op[x, y]
            op[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join("public", "assets", "img", "hud", "actions.png")
    rows = (len(TILES) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * TILE, rows * TILE), (0, 0, 0, 0))
    for i, (name, light, dark) in enumerate(TILES):
        sheet.paste(tile(name, light, dark, 100 + i).convert("RGBA"), ((i % COLS) * TILE, (i // COLS) * TILE))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    sheet.save(out, optimize=True)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
