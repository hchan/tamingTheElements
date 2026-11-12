"""Procedural batch C (earth/nature) effect sprites, original art. Replaces the legacy photo-ish PNGs, same pixel sizes and facing.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-c-earth.py [outdir=public/assets/img/fx]   (needs Pillow; style of ice-shock.py)
Writes groundShock, rockPellet, hurlRock, rockElementalRed, rockArmour, earth, stranglingBranches, vineTrap, entanglingVines, entanglingVinesLong.
Look: chunky faceted debris with a pale top-left rim light and a dark brown outline; vines in the nature ramp with leaf highlights and a
dark green outline. East-facing sprites: caster at the left, tip at the right. rockPellet gets an extra-light rim + thick outline because it
scored only 56 contrast on the Earth floor (check: rig-gen/contrast-check.py --floor earth).
"""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/assets/img/fx"
SS = 4
EARTH = palette.element_ramp("earth")
NAT = palette.element_ramp("nature")
OUTL_E = (26, 16, 12)
OUTL_N = (10, 30, 18)
# stone ramp: cooler grey-brown than the floor so rocks separate from sand
STONE = [palette.hue_shift(c, -6, 0.55, 1.0) for c in EARTH]
STONE[0] = (30, 22, 20)
STONE[4] = (250, 238, 214)

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
    def P(self, pts):
        return [(x * SS, y * SS) for x, y in pts]
    def poly(self, pts, fill, outline=None, ow=0):
        self.d.polygon(self.P(pts), fill=fill + (255,) if len(fill) == 3 else fill)
    def fat(self, pts, col, ow):
        """outline: polygon drawn with a wide stroke"""
        self.d.polygon(self.P(pts), fill=col + (255,), outline=col + (255,), width=max(1, int(ow * SS)))
    def line(self, pts, col, w):
        self.d.line(self.P(pts), fill=col + (255,), width=max(1, int(w * SS)), joint="curve")
        r = w * SS / 2
        for x, y in (pts[0], pts[-1]):
            self.d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=col + (255,))
    def dot(self, x, y, r, col, a=255):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=col + (a,))
    def save(self, name):
        out = self.im.resize((self.w, self.h), Image.LANCZOS)
        os.makedirs(OUT, exist_ok=True)
        out.save(os.path.join(OUT, name + ".png"), optimize=True)
        print(name, out.size)
        return out

def blob(cx, cy, rx, ry, n, seed, jit=0.22):
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.15, 0.15)
        k = 1 + rnd.uniform(-jit, jit)
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    return pts

def shade(pts, c, light, mid, dark, rim, ow=1.4, outl=OUTL_E, cv=None):
    """faceted rock: outline, base fill, lit facets on the upper-left, dark facets lower-right, rim stroke on lit edges."""
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    cv.fat(pts, outl, ow * 2)
    cv.poly(pts, mid)
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        lit = -(mx + my) / (math.hypot(mx, my) + 1e-6)  # +1 facing upper-left
        col = light if lit > 0.35 else dark if lit < -0.25 else mid
        # inset the facet toward the centre so the outline stays
        f = lambda p: (cx + (p[0] - cx) * 0.9, cy + (p[1] - cy) * 0.9)
        cv.poly([(cx, cy), f(a), f(b)], col)
        if lit > 0.55:
            cv.line([f(a), f(b)], rim, 0.8)
    # crack
    cv.line([(cx - (cx - pts[0][0]) * 0.1, cy), (cx + (pts[n // 2][0] - cx) * 0.5, cy + (pts[n // 2][1] - cy) * 0.5)], STONE[0], 0.5)

# ---------------------------------------------------------------- rockPellet 80x19: tapered chain of pebbles, big head at right
def rock_pellet():
    c = Canvas(80, 19)
    LIGHT, MID, DARK, RIM = (214, 190, 150), (150, 118, 84), (84, 58, 42), (255, 246, 214)
    for i, (x, r, a) in enumerate([(8, 2.4, 0), (17, 3.2, 0), (27, 4.2, 0), (39, 5.2, 0)]):
        shade(blob(x, 9.5 + (1 if i % 2 else -1) * 0.8, r + 0.6, r, 7, 10 + i), None, LIGHT, MID, DARK, RIM, ow=1.0, cv=c)
    shade(blob(60, 9.5, 12, 7.2, 9, 3, 0.12), None, LIGHT, MID, DARK, RIM, ow=1.2, cv=c)
    c.line([(52, 6), (62, 3.8), (70, 5)], RIM, 1.0)
    for x, y, r in [(46, 3, 1.1), (50, 15.5, 1.0), (4, 5, 0.9), (13, 14, 1.0), (22, 3.4, 0.9)]:
        c.dot(x, y, r + 0.7, OUTL_E); c.dot(x, y, r, LIGHT)
    return c.save("rockPellet")

# ---------------------------------------------------------------- hurlRock 80x64: boulder at right, dust and debris trail to the left
def hurl_rock():
    c = Canvas(80, 64)
    DUST = [(176, 146, 104), (206, 178, 130), (238, 214, 168)]
    rnd = random.Random(5)
    for x, y, r, k in [(8, 36, 7, 0), (16, 26, 8, 1), (14, 44, 8, 0), (26, 34, 9, 1), (24, 18, 6, 0), (28, 48, 7, 1), (36, 30, 8, 2)]:
        c.dot(x, y, r, DUST[k], 150)
    LIGHT, MID, DARK, RIM = (212, 188, 150), (140, 108, 78), (76, 52, 40), (255, 244, 212)
    for x, y, r in [(32, 12, 3), (22, 54, 3.4), (40, 56, 2.6), (44, 8, 2.4)]:
        shade(blob(x, y, r, r * 0.85, 6, int(x)), None, LIGHT, MID, DARK, RIM, ow=0.9, cv=c)
    shade(blob(56, 32, 22, 21, 11, 9, 0.14), None, LIGHT, MID, DARK, RIM, ow=1.5, cv=c)
    c.line([(44, 20), (52, 13), (62, 11)], RIM, 1.3)
    for a, b in [((52, 30), (60, 40)), ((60, 22), (66, 30)), ((46, 38), (52, 46))]:
        c.line([a, b], STONE[0], 0.9)
    return c.save("hurlRock")

# ---------------------------------------------------------------- groundShock 77x80: ground burst, radial cracks with flying chunks
def ground_shock():
    c = Canvas(77, 80)
    cx, cy = 38.5, 40
    # outer dust ring
    for i in range(14):
        a = 2 * math.pi * i / 14
        c.dot(cx + math.cos(a) * 29, cy + math.sin(a) * 30, 4.6, (226, 198, 150), 170)
    # cracks: jagged dark spikes radiating
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.15
        L = 30 if i % 2 == 0 else 22
        pts = [(cx, cy)]
        rnd = random.Random(i)
        for s in range(1, 5):
            r = L * s / 4
            aa = a + rnd.uniform(-0.12, 0.12)
            pts.append((cx + math.cos(aa) * r, cy + math.sin(aa) * r))
        c.line(pts, OUTL_E, 4.2 if i % 2 == 0 else 3.2)
        c.line(pts, (120, 82, 50), 2.4 if i % 2 == 0 else 1.8)
        c.line(pts[:4], (232, 196, 130), 0.9)
    # flying chunks
    LIGHT, MID, DARK, RIM = (214, 190, 150), (150, 118, 84), (84, 58, 42), (255, 246, 214)
    rnd = random.Random(2)
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.5
        r = 17 + (i % 3) * 5
        shade(blob(cx + math.cos(a) * r, cy + math.sin(a) * r, 2.8 + (i % 2), 2.3 + (i % 2), 6, i), None, LIGHT, MID, DARK, RIM, ow=0.8, cv=c)
    shade(blob(cx, cy, 11, 10, 10, 77, 0.15), None, LIGHT, MID, DARK, RIM, ow=1.4, cv=c)
    return c.save("groundShock")

# ---------------------------------------------------------------- rockElementalRed 80x20: four 20x20 frames, lava-cracked red rock chunks
def rock_elemental_red():
    c = Canvas(80, 20)
    LIGHT, MID, DARK, RIM = (240, 140, 96), (176, 56, 40), (84, 20, 22), (255, 214, 160)
    OL = (30, 8, 10)
    for f in range(4):
        ox = f * 20 + 10
        pts = blob(ox, 10.5, 7.6 + (f % 2) * 0.6, 7 - (f % 2) * 0.4, 9, 40 + f, 0.17)
        shade(pts, None, LIGHT, MID, DARK, RIM, ow=1.0, outl=OL, cv=c)
        # glowing lava seam, shifts per frame
        a = f * 0.8
        c.line([(ox - 4 * math.cos(a), 10.5 - 4 * math.sin(a)), (ox + 1, 11), (ox + 4 * math.cos(a), 10.5 + 4 * math.sin(a))], (255, 206, 90), 1.0)
        c.dot(ox + 3 * math.cos(a + 2), 10 + 3 * math.sin(a + 2), 1.0, (255, 238, 160))
    return c.save("rockElementalRed")

# ---------------------------------------------------------------- rockArmour 65x80: stacked stone chest plates with moss, rim lit
def rock_armour():
    c = Canvas(65, 80)
    LIGHT, MID, DARK, RIM = STONE[3], STONE[2], STONE[1], STONE[4]
    body = [(14, 6), (24, 2), (41, 2), (51, 6), (60, 18), (58, 44), (54, 62), (44, 76), (21, 76), (11, 62), (6, 44), (5, 18)]
    c.fat(body, OUTL_E, 3.2)
    c.poly(body, MID)
    # plates: horizontal bands with seams
    bands = [(6, 22), (22, 38), (38, 54), (54, 76)]
    for i, (y0, y1) in enumerate(bands):
        def xr(y):
            # half width of the body at y
            top = [(6, 14), (18, 5), (44, 5), (62, 4)]
            return None
        pass
    plates = [
        [(15, 8), (25, 3.5), (40, 3.5), (50, 8), (46, 19), (19, 19)],
        [(9, 21), (19, 21), (46, 21), (56, 21), (58, 33), (7, 33)],
        [(7, 35), (58, 35), (56, 47), (9, 47)],
        [(10, 49), (55, 49), (52, 61), (13, 61)],
        [(14, 63), (51, 63), (43, 74.5), (22, 74.5)],
    ]
    for i, p in enumerate(plates):
        c.poly(p, STONE[2] if i % 2 else STONE[3] if False else MID)
        # lit top edge, dark bottom edge
        c.poly([(p[0][0], p[0][1]), (p[1][0], p[1][1]), (p[-2][0], p[-2][1] + 3.5), (p[-1][0], p[-1][1] + 3.5)] if False else p, MID)
        y0 = min(q[1] for q in p); y1 = max(q[1] for q in p)
        xs0 = [q[0] for q in p if q[1] == y0] or [p[0][0]]
        c.d.rectangle([0, 0, 0, 0])
    # shading pass: light strip top, dark strip bottom of each plate, seams
    for i, p in enumerate(plates):
        ys = [q[1] for q in p]; y0, y1 = min(ys), max(ys)
        xl = lambda y: min(q[0] for q in p) if True else 0
        x0, x1 = min(q[0] for q in p), max(q[0] for q in p)
        c.poly([(x0 + 1, y0 + 0.5), (x1 - 1, y0 + 0.5), (x1 - 2, y0 + 3.6), (x0 + 2, y0 + 3.6)], LIGHT)
        c.line([(x0 + 1.5, y0 + 0.8), (x1 - 2.5, y0 + 0.8)], RIM, 0.9)
        c.poly([(x0 + 2, y1 - 3.2), (x1 - 2, y1 - 3.2), (x1 - 1, y1 - 0.4), (x0 + 1, y1 - 0.4)], DARK)
        c.line([(x0, y1), (x1, y1)], OUTL_E, 1.0)
    # left-edge rim light and right-side shade over the whole body
    c.line([(7, 20), (6, 44), (11, 60)], RIM, 1.1)
    c.poly([(54, 14), (58, 18), (56, 44), (53, 60), (50, 60), (52, 44)], DARK)
    # centre ridge and rivets
    c.line([(32.5, 7), (32.5, 72)], DARK, 1.0)
    for x, y in [(15, 28), (50, 28), (15, 42), (50, 42), (17, 56), (48, 56)]:
        c.dot(x, y, 1.9, OUTL_E); c.dot(x - 0.2, y - 0.2, 1.2, RIM)
    # moss on the top plate and cracks
    for x, y, r in [(22, 5, 2.6), (30, 3.6, 2.4), (44, 5, 2.4), (11, 24, 2.2), (54, 24, 1.8)]:
        c.dot(x, y, r + 0.6, OUTL_N); c.dot(x, y, r, NAT[2]); c.dot(x - 0.6, y - 0.6, r * 0.5, NAT[3])
    for pts in [[(20, 36), (24, 40), (22, 45)], [(40, 50), (44, 54), (42, 58)]]:
        c.line(pts, OUTL_E, 0.8)
    return c.save("rockArmour")

# ---------------------------------------------------------------- vine helpers
def bez(p0, p1, p2, p3, n=18):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                    u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
    return out

def vine(c, pts, w, outl=OUTL_N, base=None, hi=None, leaves=0, seed=0, thorns=False):
    base = base or NAT[1]; hi = hi or NAT[3]
    # tapered: draw in segments with decreasing width
    n = len(pts)
    for i in range(n - 1):
        ww = w * (1 - 0.55 * i / n)
        c.line([pts[i], pts[i + 1]], outl, ww + 1.8)
    for i in range(n - 1):
        ww = w * (1 - 0.55 * i / n)
        c.line([pts[i], pts[i + 1]], base, ww)
    for i in range(n - 1):
        ww = w * (1 - 0.55 * i / n)
        c.line([(pts[i][0] - 0.3, pts[i][1] - 0.4), (pts[i + 1][0] - 0.3, pts[i + 1][1] - 0.4)], hi, max(0.5, ww * 0.35))
    rnd = random.Random(seed)
    for k in range(leaves):
        i = int((k + 0.5) * (n - 2) / leaves) + 1
        x, y = pts[i]
        dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        a = math.atan2(dy, dx) + (math.pi / 2.6) * (1 if k % 2 else -1) + rnd.uniform(-0.2, 0.2)
        leaf(c, x, y, a, 4.2 + rnd.uniform(0, 1.8))

def leaf(c, x, y, a, L):
    ca, sa = math.cos(a), math.sin(a)
    w = L * 0.42
    def T(u, v):
        return (x + ca * u - sa * v, y + sa * u + ca * v)
    shape = [T(0, 0), T(L * 0.35, -w), T(L, 0), T(L * 0.35, w)]
    c.fat(shape, OUTL_N, 1.5)
    c.poly(shape, NAT[2])
    c.poly([T(0.3, 0), T(L * 0.35, -w * 0.85), T(L * 0.95, 0)], NAT[3])  # lit half
    c.line([T(0.5, 0), T(L * 0.85, 0)], NAT[4], 0.5)  # vein highlight

# ---------------------------------------------------------------- earth 29x80: upright fern frond (stem at bottom, tip up)
def earth_frond():
    c = Canvas(29, 80)
    stem = bez((15, 78), (12, 56), (17, 32), (14, 5), 24)
    for i in range(1, 12):
        t = i / 12
        x, y = stem[int(t * 23)]
        L = 12.5 * (1 - 0.65 * t) + 3
        for side in (-1, 1):
            a = -math.pi / 2 + side * (1.15 - 0.4 * t)
            ex, ey = x + math.cos(a) * L, y + math.sin(a) * L
            leaf(c, x, y, a, L)
    vine(c, stem, 2.4, base=NAT[1], hi=NAT[3])
    leaf(c, stem[-1][0], stem[-1][1], -math.pi / 2, 8)
    return c.save("earth")

# ---------------------------------------------------------------- stranglingBranches 80x44: gnarled root arm reaching east
def strangling_branches():
    c = Canvas(80, 44)
    BARK = [(34, 24, 18), (70, 50, 34), (112, 84, 52), (168, 132, 84)]
    main = bez((0, 32), (20, 40), (38, 18), (74, 20), 24)
    # thick trunk base
    vine(c, main, 10, outl=OUTL_E, base=BARK[1], hi=BARK[3])
    for pts in [bez((20, 33), (30, 36), (44, 30), (62, 38), 14), bez((30, 25), (40, 12), (54, 8), (70, 4), 14),
                bez((46, 20), (56, 22), (64, 28), (78, 30), 14), bez((56, 17), (62, 12), (72, 14), (78, 12), 10),
                bez((6, 28), (12, 16), (22, 12), (34, 8), 12)]:
        vine(c, pts, 4.4, outl=OUTL_E, base=BARK[2], hi=BARK[3])
        for i in (6, 10):
            if i < len(pts):
                c.dot(pts[i][0] - 0.4, pts[i][1] - 0.4, 0.8, BARK[3])
    # bark ridges and a few green sprouts
    for pts in [[(8, 30), (18, 33)], [(24, 30), (32, 26)], [(40, 22), (50, 21)], [(14, 36), (26, 37)]]:
        c.line(pts, BARK[0], 0.7)
    for x, y, a in [(28, 24, -1.9), (50, 19, -1.4), (66, 18, -0.6), (36, 33, 1.5)]:
        leaf(c, x, y, a, 5)
    return c.save("stranglingBranches")

# ---------------------------------------------------------------- vineTrap 70x80: knot at the bottom with four tendrils reaching up
def vine_trap():
    c = Canvas(70, 80)
    knot = (36, 66)
    tend = [bez((34, 68), (14, 58), (26, 36), (10, 8), 24), bez((36, 66), (24, 48), (46, 34), (30, 4), 24),
            bez((38, 66), (50, 46), (36, 32), (50, 6), 24), bez((40, 68), (64, 56), (56, 34), (62, 10), 24)]
    for i, t in enumerate(tend):
        vine(c, t, 4.6, leaves=4, seed=i)
        for p in t[14::5]:
            c.dot(p[0] + 0.3, p[1] + 0.3, 0.5, OUTL_N)
    # coiled knot
    for r, rot in [(9, 0.2), (6.5, 2.0)]:
        loop = [(knot[0] + math.cos(a) * r * 1.3, knot[1] + math.sin(a) * r * 0.8) for a in [rot + i * 0.3 for i in range(22)]]
        vine(c, loop, 4.2)
    for x, y, a in [(24, 70, 2.8), (50, 72, 0.3), (36, 56, -1.57)]:
        leaf(c, x, y, a, 6)
    return c.save("vineTrap")

# ---------------------------------------------------------------- entanglingVines 80x61: thick tangle at the left spreading east
def entangling_vines():
    c = Canvas(80, 61)
    strands = [bez((4, 34), (20, 4), (40, 52), (76, 14), 26), bez((3, 40), (22, 58), (44, 18), (78, 44), 26),
               bez((6, 26), (30, 22), (50, 36), (70, 30), 22), bez((2, 46), (18, 30), (30, 56), (58, 54), 22),
               bez((8, 32), (16, 14), (34, 6), (52, 6), 18)]
    for i, s in enumerate(strands):
        vine(c, s, 4.6 - 0.4 * i, leaves=5, seed=i + 3)
    for x, y, a in [(8, 24, -2.2), (10, 44, 2.2), (16, 34, 0), (22, 20, -0.8), (24, 46, 0.7)]:
        leaf(c, x, y, a, 6.5)
    return c.save("entanglingVines")

# ---------------------------------------------------------------- entanglingVinesLong 80x18: horizontal braided strip (tiles along the 360 px trap)
def entangling_vines_long():
    c = Canvas(80, 18)
    a = [(x, 9 + math.sin(x / 80 * 2 * math.pi * 2) * 4.2) for x in range(-4, 85, 3)]
    b = [(x, 9 - math.sin(x / 80 * 2 * math.pi * 2) * 4.2) for x in range(-4, 85, 3)]
    vine(c, a, 3.2, base=NAT[1], hi=NAT[3])
    vine(c, b, 3.2, base=NAT[2], hi=NAT[4])
    for x, y, ang in [(10, 4, -1.0), (30, 14, 1.0), (50, 4, -1.0), (70, 14, 1.0), (20, 14, 0.9), (60, 3, -0.9)]:
        leaf(c, x, y, ang, 4.4)
    return c.save("entanglingVinesLong")

for fn in (rock_pellet, hurl_rock, ground_shock, rock_elemental_red, rock_armour, earth_frond, strangling_branches, vine_trap,
           entangling_vines, entangling_vines_long):
    fn()
