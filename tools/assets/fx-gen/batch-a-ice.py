"""Procedural batch A ice effects (original art): iceBlast, iceBreath, shardsOfIce, icicles, iceSheet. Same look as ice-shock.py.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-a-ice.py [outdir]   (default public/assets/img/fx; needs Pillow)
Ramp = palette.ELEMENT_RAMPS['ice'] (hue-shifted toward violet in the shadow), dark blue outline, faceted angular shards, white sparkles.
Sizes and facing follow the manifest: iceBlast 80x49 (orb right, trail left; drawn stretched to its 60x60 box, so the orb is a wide ellipse),
iceBreath 80x53 (frost cone, origin left, spreading right), shardsOfIce 80x11 and icicles 80x42 (east-facing, tip right), iceSheet 80x48
(upright spikes bursting from a frosted ground sheet, not directional).
"""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/assets/img/fx"
SS = 6
OL, DEEP, MID, LIGHT, CORE = palette.element_ramp("ice")
SHADOW = palette.hue_shift(DEEP, 22, 0.9, 0.85)  # violet-leaning shadow facet
WHITE = (255, 255, 255)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def S(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def poly(self, pts, col, a=255):
        self.d.polygon(self.S(pts), fill=col + (a,))

    def shard(self, base, tip, hw, shoulder=0.3, a=255, ol=1.1):
        """Faceted kite from base to tip with half width hw at `shoulder`; lit side up-left, shadow facet low-right."""
        bx, by = base; tx, ty = tip
        L = math.hypot(tx - bx, ty - by) or 1
        ux, uy = (tx - bx) / L, (ty - by) / L
        nx, ny = -uy, ux
        sx, sy = bx + (tx - bx) * shoulder, by + (ty - by) * shoulder
        top = (sx + nx * hw, sy + ny * hw); bot = (sx - nx * hw, sy - ny * hw)
        # outline: fat polygon first
        k = (hw + ol) / hw if hw else 1
        ot = (sx + nx * (hw + ol), sy + ny * (hw + ol)); ob = (sx - nx * (hw + ol), sy - ny * (hw + ol))
        self.poly([(bx - ux * ol, by - uy * ol), ot, (tx + ux * ol * 1.6, ty + uy * ol * 1.6), ob], OL, a)
        self.poly([base, top, tip, bot], MID, a)
        self.poly([base, top, tip, (sx, sy)], LIGHT, a)          # lit upper facet
        self.poly([base, bot, tip, (sx, sy)], DEEP, a)           # shadow lower facet
        self.poly([base, (sx + nx * hw * .35, sy + ny * hw * .35), tip, (sx, sy)], CORE, a)  # ridge highlight
        self.poly([base, bot, (sx - nx * hw * .45 + ux * 0, sy - ny * hw * .45), (sx, sy)], SHADOW, a)

    def sparkle(self, x, y, r, a=255):
        q = r * 0.22
        self.poly([(x, y - r), (x + q, y - q), (x + r, y), (x + q, y + q), (x, y + r), (x - q, y + q), (x - r, y), (x - q, y - q)], WHITE, a)

    def glow(self, x, y, rx, ry, col, a):
        g = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([(x - rx) * SS, (y - ry) * SS, (x + rx) * SS, (y + ry) * SS], fill=col + (a,))
        g = g.filter(ImageFilter.GaussianBlur(rx * SS * 0.45))
        self.img.alpha_composite(g)
        self.d = ImageDraw.Draw(self.img)

    def save(self, key):
        out = self.img.resize((self.w, self.h), Image.LANCZOS)
        os.makedirs(OUT, exist_ok=True)
        p = os.path.join(OUT, key + ".png")
        out.save(p, optimize=True)
        print(p, out.size)


def ice_blast():
    c = Canvas(80, 49); cy = 24.5
    # frost trail: fading shard fragments streaming left
    for bx, tx, off, hw, a in [(30, 54, -11, 3.0, 230), (22, 44, 11, 2.8, 200), (10, 32, -4, 2.4, 160), (2, 20, 6, 1.8, 110), (14, 30, 15, 1.6, 90)]:
        c.shard((bx, cy + off), (tx, cy + off * 0.7), hw, a=a)
    # orb: ring of spikes around a faceted crystal body (wide ellipse; the view squeezes x by 0.75 and stretches y by 1.22)
    cx, rx, ry = 55, 21, 13.5
    n = 12
    for i in range(n):
        ang = i * 2 * math.pi / n + 0.2
        r_in = 0.75; r_out = 1.32 if i % 2 == 0 else 1.12
        bx, by = cx + math.cos(ang) * rx * r_in, cy + math.sin(ang) * ry * r_in
        tx, ty = cx + math.cos(ang) * rx * r_out, cy + math.sin(ang) * ry * r_out
        c.shard((bx, by), (tx, ty), 2.6 if i % 2 == 0 else 2.0, shoulder=0.25)
    # body: octagon crystal facets
    ring = [(cx + math.cos(a) * rx, cy + math.sin(a) * ry) for a in [k * math.pi / 4 + math.pi / 8 for k in range(8)]]
    c.poly([(x + (x - cx) * 0.09, y + (y - cy) * 0.09) for x, y in ring], OL)
    c.poly(ring, MID)
    mid = (cx - 2, cy - 1.5)
    for i in range(8):
        a, b = ring[i], ring[(i + 1) % 8]
        shade = [LIGHT, LIGHT, MID, DEEP, DEEP, SHADOW, MID, LIGHT][i]
        c.poly([a, b, mid], shade)
    c.poly([(cx - 9, cy - 3), (cx - 2, cy - 8), (cx + 5, cy - 1), (cx - 3, cy + 5)], CORE)
    c.poly([(cx - 6, cy - 2), (cx - 2, cy - 5), (cx + 1, cy - 1), (cx - 3, cy + 2)], WHITE)
    for x, y, r in [(70, 7, 2.4), (74, 40, 2.0), (40, 6, 2.0), (20, 38, 1.8), (6, 18, 1.5)]:
        c.sparkle(x, y, r)
    c.save("iceBlast")


def ice_breath():
    c = Canvas(80, 53); cy = 26.5
    # cone of frost: narrow at the caster (left), spreading right. Layered jagged crystals, outline on the outer layer.
    layers = [(DEEP, 1.0, 255), (MID, 0.78, 255), (LIGHT, 0.52, 255), (CORE, 0.26, 255)]
    rnd = random.Random(7)
    def cone(spread, col, a, outline=False):
        pts_t, pts_b = [], []
        n = 9
        for i in range(n + 1):
            t = i / n
            x = 2 + t * 76
            jag = (3.0 if i % 2 else -1.0) * t * rnd.uniform(0.6, 1.2)
            hw = spread * (1.5 + 24 * t ** 0.9) + jag
            pts_t.append((x, cy - hw)); pts_b.append((x, cy + hw * 0.95 + (2 if i % 2 else 0) * t))
        poly = pts_t + [(79, cy)] + pts_b[::-1]
        if outline:
            c.d.polygon(c.S(poly), fill=OL + (255,), outline=OL + (255,), width=int(2.2 * SS))
        c.poly(poly, col, a)
    cone(1.0, DEEP, 255, outline=True)
    for col, s, a in layers[1:]:
        cone(s, col, a)
    # crystals thrown along the cone and big shards on its edges
    for bx, by, tx, ty, hw in [(18, 24, 50, 9, 3.5), (22, 29, 58, 44, 3.5), (36, 25, 74, 17, 3.2), (40, 28, 76, 37, 3.2), (14, 26, 70, 26.5, 4.0)]:
        c.shard((bx, by), (tx, ty), hw, shoulder=0.35)
    for x, y, r in [(26, 22, 2.0), (46, 30, 2.2), (60, 20, 2.4), (68, 33, 1.9), (36, 35, 1.6), (54, 12, 1.8), (8, 26.5, 1.8)]:
        c.sparkle(x, y, r)
    c.save("iceBreath")


def shards_of_ice():
    c = Canvas(80, 11); cy = 5.5
    # frost trail left, single lance, tip right. Outline stays thin (11 px tall).
    for bx, tx, off, hw, a in [(0, 14, -2.5, 1.4, 120), (6, 22, 2.5, 1.5, 170), (14, 34, -1.5, 1.6, 220)]:
        c.shard((bx, cy + off), (tx, cy + off), hw, shoulder=0.4, a=a, ol=0.7)
    c.shard((20, cy), (79, cy), 4.1, shoulder=0.3, ol=1.0)
    c.d.line(c.S([(30, cy - 0.5), (70, cy - 0.3)]), fill=WHITE + (255,), width=int(0.9 * SS))
    c.sparkle(72, cy, 2.4); c.sparkle(10, 2, 1.3, 190)
    c.save("shardsOfIce")


def icicles():
    c = Canvas(80, 42); cy = 21
    # a cluster: five lances, tips right, longest in the middle, with a frost trail
    for bx, tx, off, hw, a in [(2, 22, -12, 2.2, 120), (0, 18, 12, 2.2, 120), (8, 34, -6, 2.6, 190), (6, 30, 8, 2.6, 190)]:
        c.shard((bx, cy + off), (tx, cy + off), hw, shoulder=0.4, a=a, ol=0.9)
    c.shard((18, cy - 11), (66, cy - 17), 5.0, shoulder=0.32)
    c.shard((20, cy + 11), (68, cy + 17), 5.0, shoulder=0.32)
    c.shard((14, cy - 5), (74, cy - 8), 5.5, shoulder=0.3)
    c.shard((16, cy + 5), (76, cy + 8), 5.5, shoulder=0.3)
    c.shard((6, cy), (79, cy), 7.2, shoulder=0.28)
    c.d.line(c.S([(18, cy - 0.5), (70, cy - 0.5)]), fill=WHITE + (255,), width=int(1.0 * SS))
    for x, y, r in [(56, cy - 11, 2.0), (50, cy + 11, 1.9), (30, 4, 1.7), (36, 38, 1.7), (74, cy, 2.4), (12, 21, 1.6)]:
        c.sparkle(x, y, r)
    c.save("icicles")


def ice_sheet():
    c = Canvas(80, 48)
    gy = 38
    # frosted ground sheet: flattened shard fan
    sheet = [(1, gy + 1), (10, gy - 5), (30, gy - 7), (50, gy - 7), (70, gy - 5), (79, gy + 1), (66, gy + 8), (40, gy + 10), (14, gy + 8)]
    c.d.polygon(c.S(sheet), fill=OL + (255,), outline=OL + (255,), width=int(2.0 * SS))
    c.poly(sheet, DEEP)
    c.poly([(6, gy), (14, gy - 4), (40, gy - 5), (66, gy - 4), (74, gy), (60, gy + 5), (40, gy + 6), (18, gy + 5)], MID)
    c.poly([(14, gy - 1), (24, gy - 4), (40, gy - 4), (56, gy - 4), (66, gy - 1), (50, gy + 1), (30, gy + 2)], LIGHT)
    c.poly([(26, gy - 1), (40, gy - 3), (54, gy - 1), (40, gy + 0.5)], CORE)
    # spikes rising from the sheet, tallest in the middle, tilted outward
    spikes = [(8, 22, 3.2), (17, 13, 4.0), (27, 6, 4.4), (36, 2, 4.8), (44, 3, 4.8), (53, 7, 4.4), (63, 13, 4.0), (72, 22, 3.2)]
    order = sorted(spikes, key=lambda s: -abs(s[0] - 40))  # outer first, centre in front
    for x, ty, hw in order:
        c.shard((x + (x - 40) * 0.05, gy), (x + (x - 40) * 0.28, ty + 2), hw, shoulder=0.18)
    for x, ty, hw in [(22, 20, 2.4), (32, 14, 2.6), (48, 15, 2.6), (58, 21, 2.4)]:
        c.shard((x, gy + 2), (x + (x - 40) * 0.15, ty + 6), hw, shoulder=0.2)
    # flying chips + sparkles
    rnd = random.Random(3)
    for x, y in [(4, 14), (76, 15), (12, 6), (68, 5), (24, 3), (57, 2)]:
        c.shard((x, y), (x + rnd.choice([-3, 3]), y - 3.5), 1.1, ol=0.6)
    for x, y, r in [(40, 12, 2.4), (22, 25, 1.9), (58, 26, 1.9), (31, 2, 1.6), (50, 5, 1.6), (40, gy - 2, 1.5)]:
        c.sparkle(x, y, r)
    c.save("iceSheet")


for f in (ice_blast, ice_breath, shards_of_ice, icicles, ice_sheet):
    f()
