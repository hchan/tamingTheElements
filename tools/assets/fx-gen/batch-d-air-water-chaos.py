"""Procedural effect sprites, batch D (air / water / chaos). Original art, no legacy pixels. Style: docs/ART-REFERENCES.md, ice-shock.py.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-d-air-water-chaos.py [outdir=public/assets/img/fx]   (Pillow)
Writes windCone, air, hurricane, sonarBlast, water, waterCircle, waterCorner, chaosBolt, chaosOrb, slimeBlast, stealHealth, voidCircle
at the same pixel sizes as the legacy sheets. East-facing sprites (caster left, head right), as before.
Every sprite is built from tapered strokes / blobs on a transparent layer, then given a dark element-coloured outline (alpha dilation)
so it reads on the light Air/Earth floors; pale cores keep it readable on the dark Fire/Void floors. Colours from rig-gen/palette.py.
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grim_fx
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/assets/img/fx"
SS = 6
AIR, WATER, CHAOS, VOID, NATURE = (palette.element_ramp(n) for n in ("air", "water", "chaos", "void", "nature"))
WHITE = (255, 255, 255)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def stroke(self, pts, r0, r1, col, a=255):
        """Tapered round-brush stroke along pts (list of (x,y) in px), radius r0 -> r1."""
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            r = (r0 + (r1 - r0) * i / max(1, n - 1)) * SS
            self.d.ellipse([x * SS - r, y * SS - r, x * SS + r, y * SS + r], fill=col + (a,))
            if i:  # fill gaps between circles
                px, py = pts[i - 1]
                self.d.line([px * SS, py * SS, x * SS, y * SS], fill=col + (a,), width=max(1, int(2 * r)))

    def poly(self, pts, col, a=255):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=col + (a,))

    def ell(self, cx, cy, rx, ry, col, a=255):
        self.d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=col + (a,))

    def ring(self, cx, cy, rx, ry, w, col, a=255, a0=0, a1=360):
        pts = arc(cx, cy, rx, ry, a0, a1)
        self.stroke(pts, w / 2, w / 2, col, a)

    def outline(self, col, px=1.0):
        """Dark outline: dilate the alpha by px pixels and put the colour under the art."""
        k = int(px * SS) * 2 + 1
        alpha = self.img.getchannel("A").filter(ImageFilter.MaxFilter(k))
        under = Image.new("RGBA", self.img.size, col + (0,))
        under.putalpha(alpha)
        under.alpha_composite(self.img)
        self.img = under

    def save(self, key):
        out = grim_fx.grade(self.img.resize((self.w, self.h), Image.LANCZOS), key)
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, key + ".png")
        out.save(path, optimize=True)
        print(path, out.size)


def arc(cx, cy, rx, ry, a0, a1, n=None, rot=0.0):
    n = n or max(12, int(abs(a1 - a0) / 6))
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    for i in range(n + 1):
        t = math.radians(a0 + (a1 - a0) * i / n)
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def spiral(cx, cy, r0, r1, a0, turns, n=60, sq=1.0):
    pts = []
    for i in range(n + 1):
        f = i / n
        t = math.radians(a0 + 360 * turns * f)
        r = r0 + (r1 - r0) * f
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t) * sq))
    return pts


def sparkle(c, x, y, r, col=WHITE, a=255):
    c.poly([(x, y - r), (x + r * .22, y - r * .22), (x + r, y), (x + r * .22, y + r * .22), (x, y + r),
            (x - r * .22, y + r * .22), (x - r, y), (x - r * .22, y - r * .22)], col, a)


# ---------------------------------------------------------------- air
def wind_cone():
    c = Canvas(27, 14)
    c.poly([(1, 6.2), (25, 1.2), (25, 12.8), (1, 7.8)], AIR[2])
    c.poly([(1, 6.6), (25, 3.2), (25, 7), (1, 7.2)], AIR[3])
    for y0, y1 in [(5.0, 3.0), (7, 7), (9, 11)]:
        c.stroke([(3, 7 + (y0 - 7) * .1), (14, 7 + (y0 - 7) * .6 if y0 != 7 else 7), (24, y1)], .5, .6, AIR[4])
    c.outline(AIR[0], 0.9)
    c.save("windCone")


def air_tornado():
    c = Canvas(80, 80)
    # funnel of thin swirl bands: wide at the top, narrow at the bottom
    bands = 9
    for i in range(bands):
        f = i / (bands - 1)
        y = 12 + f * 56
        rx = 33 - 28 * f ** 0.85
        ry = 4.2 - 1.8 * f
        sh = math.sin(f * 5) * 3 * (1 - f)
        col = AIR[3] if i % 2 == 0 else AIR[2]
        c.stroke(arc(40 + sh, y, rx, ry, 8, 172), 1.3, 1.3, col)           # front arc (lower half of the ellipse)
        c.stroke(arc(40 + sh, y, rx, ry, 190, 262), .5, 1.0, AIR[4], 220)  # faint back wisp
    c.stroke([(40 + 6 * math.sin(t / 5), 12 + t) for t in range(0, 57, 2)], .8, .8, AIR[4])  # spine
    for x, y in [(8, 9), (70, 14), (62, 6), (16, 20)]:
        c.stroke(arc(x, y, 6, 2, 0, 200), .6, .3, AIR[4])
    c.stroke([(36, 72), (42, 76), (50, 74)], .6, .3, AIR[3])
    c.outline(AIR[0], 1.1)
    c.save("air")


def hurricane():
    c = Canvas(80, 80)
    for k in range(3):
        a0 = k * 120
        pts = spiral(40, 40, 7, 37, a0, 0.85, n=48)
        c.stroke(pts, 1.0, 4.0, AIR[2])
        c.stroke([(x, y) for x, y in spiral(40, 40, 8, 35, a0 + 5, 0.8, n=48)], .5, 1.6, AIR[4])
    c.stroke(spiral(40, 40, 3, 18, 40, 1.4, n=40), 1.0, 1.8, AIR[3])
    c.ell(40, 40, 3.5, 3.5, AIR[0], 120)
    c.outline(AIR[0], 1.1)
    c.save("hurricane")


# ---------------------------------------------------------------- water
def water_drop():
    c = Canvas(80, 80)
    cx, r = 40, 22
    by = 54
    tip_y = 6
    d = by - tip_y
    ang = math.asin(r / d)  # tangent half angle at the tip
    # belly arc from right tangent point, over the bottom, to the left tangent point
    pts = [(cx, tip_y)]
    t0 = -ang  # right tangent point (y down)
    t1 = math.pi + ang                            # left tangent point
    for i in range(61):
        t = t0 + (t1 - t0) * i / 60
        # sweep the long way round the bottom (y down: through +pi/2)
        pts.append((cx + r * math.cos(t), by + r * math.sin(t)))
    pts.append((cx, tip_y))
    c.poly(pts, WATER[2])
    # shade the lower right, light the upper left
    c.d.pieslice([(cx - r + 3) * SS, (by - r + 3) * SS, (cx + r - 2) * SS, (by + r - 1) * SS], 20, 160, fill=WATER[1] + (255,))
    c.ell(cx - 2, by + 6, r - 9, r - 12, WATER[2])
    c.ell(cx - 5, by - 1, r - 13, r - 13, WATER[3])
    c.stroke([(cx - 11, by - 4), (cx - 12, by + 4), (cx - 8, by + 11)], 1.6, 1.0, WATER[4])
    c.stroke([(cx - 3, tip_y + 15), (cx - 8, by - 12)], 1.0, 1.6, WATER[4])
    sparkle(c, cx + 9, by + 10, 3.0, WATER[4])
    c.ell(cx - 11, by - 8, 1.6, 1.6, WHITE)
    for x, y, rr in [(12, 22, 3), (68, 30, 2.5), (66, 16, 1.6), (15, 38, 1.6)]:
        c.ell(x, y, rr, rr * 1.2, WATER[3])
        c.ell(x - rr * .3, y - rr * .4, rr * .35, rr * .35, WATER[4])
    c.outline(WATER[0], 1.2)
    c.save("water")


def water_circle():
    rnd = random.Random(7)
    c = Canvas(80, 80)
    # thick swirling ring: width swells and thins around the circle, two crests of foam
    n = 90
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n * 2 * math.pi
        w = 5.2 + 2.6 * math.sin(2 * t + .6) + 1.0 * math.sin(5 * t)
        r = 30
        outer.append((40 + (r + w / 2) * math.cos(t), 40 + (r + w / 2) * math.sin(t)))
        inner.append((40 + (r - w / 2) * math.cos(t), 40 + (r - w / 2) * math.sin(t)))
    c.poly(outer + inner[::-1], WATER[2])
    c.ring(40, 40, 29.5, 29.5, 1.6, WATER[1], 255, 20, 200)
    c.ring(40, 40, 31.5, 31.5, 1.6, WATER[3], 255, 190, 330)
    c.stroke(arc(40, 40, 31, 31, 200, 300), 1.8, .4, WATER[4])
    c.stroke(arc(40, 40, 30.5, 30.5, 20, 100), .5, 1.6, WATER[4])
    c.stroke(arc(40, 40, 29, 29, 110, 160), 1.5, .4, WATER[3])
    # droplets flung off
    for ang in range(0, 360, 36):
        a = math.radians(ang + rnd.uniform(-8, 8))
        rr = 37.5 + rnd.uniform(-1, 1.5)
        rad = rnd.uniform(1.0, 1.9)
        c.ell(40 + rr * math.cos(a), 40 + rr * math.sin(a), rad, rad, WATER[3])
        c.ell(40 + rr * math.cos(a) - .3, 40 + rr * math.sin(a) - .4, rad * .35, rad * .35, WATER[4])
    c.outline(WATER[0], 1.0)
    c.save("waterCircle")


def water_corner():
    W, H = 1024, 79
    c = Canvas(W, H)
    P = 256  # period, so the strip tiles
    def surf(x):
        t = 2 * math.pi * x / P
        return 30 + 5 * math.sin(t) + 2.5 * math.sin(3 * t + 1)
    xs = [i * 2 for i in range(W // 2 + 1)]
    body = [(x, surf(x)) for x in xs]
    c.poly(body + [(W, H), (0, H)], WATER[2])
    # deeper body bands
    for k, (off, col) in enumerate([(9, WATER[1]), (22, WATER[0])]):
        c.poly([(x, y + off + 3 * math.sin(x / 31 + k)) for x, y in body] + [(W, H), (0, H)], col)
    # lighter near-surface band
    c.stroke([(x, y + 4) for x, y in body], 3.2, 3.2, WATER[3])
    # curling crest at each period: little hook
    for p0 in range(0, W, P):
        cx = p0 + P * .25
        y0 = surf(cx)
        c.stroke([(cx + 11 + 11 * math.cos(math.radians(t)), y0 - 3 + 8 * math.sin(math.radians(t))) for t in range(180, 345, 8)], 3.2, 1.2, WATER[3])
        c.stroke([(cx + 11 + 9 * math.cos(math.radians(t)), y0 - 3 + 6 * math.sin(math.radians(t))) for t in range(190, 330, 8)], 1.3, .6, WATER[4])
        for i in range(5):
            c.ell(cx + 18 + i * 6, y0 - 12 + (i * 7 % 5), 1.1, 1.1, WATER[4])
    c.stroke([(x, y - 1) for x, y in body], 1.1, 1.1, WATER[4])
    rnd = random.Random(3)
    for _ in range(90):
        x = rnd.uniform(0, W)
        y = rnd.uniform(40, 76)
        c.stroke([(x, y), (x + rnd.uniform(6, 16), y + rnd.uniform(-1, 1))], .8, .8, WATER[3], 200)
    for _ in range(40):
        x = rnd.uniform(0, W)
        c.ell(x, surf(x) - rnd.uniform(3, 9), .9, .9, WATER[4])
    c.outline(WATER[0], 1.0)
    c.save("waterCorner")


def sonar_blast():
    c = Canvas(80, 38)
    cy = 19
    # trailing ripple lines
    for dy, x0, x1 in [(-9, 2, 26), (9, 4, 28), (-4, 0, 18), (4, 1, 20)]:
        c.stroke([(x0, cy + dy), (x1, cy + dy * .8)], .3, 1.0, WATER[3], 200)
    # three expanding crescents (sound pulses), opening to the caster on the left
    for i, (cx, rx, ry, w) in enumerate([(30, 9, 11, 2.4), (44, 12, 15, 2.8), (58, 15, 17.5, 3.2)]):
        c.stroke(arc(cx, cy, rx, ry, -62, 62), w * .4, w * .4, WATER[3 - (i == 0)])
        c.stroke(arc(cx, cy, rx, ry, -62, 62, n=30), .5, w * .5, WATER[4] if i == 2 else WATER[3])
    c.ell(68, cy, 8.5, 8.5, WATER[2])
    c.ell(69, cy, 6, 6, WATER[3])
    c.ell(70, cy, 3.4, 3.4, WATER[4])
    c.ring(70, cy, 6, 6, 1.0, WATER[4], 255, 200, 330)
    c.outline(WATER[0], 1.0)
    c.save("sonarBlast")


# ---------------------------------------------------------------- chaos / void
def chaos_orb():
    c = Canvas(80, 80)
    c.ell(40, 40, 28, 28, CHAOS[1])
    c.ell(40, 40, 24, 24, VOID[1])
    for k in range(4):
        a0 = k * 90
        c.stroke(spiral(40, 40, 3, 26, a0, .55, n=40), 4.2, .8, CHAOS[2])
        c.stroke(spiral(40, 40, 4, 23, a0 + 8, .5, n=40), 2.0, .4, CHAOS[3])
    # lashing tendrils
    for k in range(6):
        a = math.radians(k * 60 + 15)
        pts = [(40 + (26 + t * 2.2) * math.cos(a + .4 * t / 4 + .1 * math.sin(t * 2)), 40 + (26 + t * 2.2) * math.sin(a + .4 * t / 4 + .1 * math.sin(t * 2))) for t in range(0, 6)]
        c.stroke(pts, 2.0, .3, CHAOS[2])
    c.ell(40, 40, 7.5, 7.5, CHAOS[3])
    c.ell(40, 40, 4.5, 4.5, CHAOS[4])
    c.ell(40, 40, 2.2, 2.2, WHITE)
    for x, y in [(20, 22), (60, 56), (58, 20), (22, 60)]:
        sparkle(c, x, y, 2.4, CHAOS[4])
    c.outline(VOID[0], 1.4)
    c.save("chaosOrb")


def chaos_bolt():
    c = Canvas(80, 41)
    cy = 20.5
    # ragged swirl trail from the left
    for dy, x0, a in [(-10, 2, 160), (9, 6, 160), (-4, 0, 220), (4, 10, 220)]:
        pts = [(x0 + t * 3.0, cy + dy * (1 - t / 17) + 2.2 * math.sin(t * .9 + dy)) for t in range(0, 18)]
        c.stroke(pts, .3, 2.0, CHAOS[1], a)
    for dy, x0 in [(-3, 14), (5, 12)]:
        pts = [(x0 + t * 2.6, cy + dy + 2 * math.sin(t * 1.1 + dy)) for t in range(0, 17)]
        c.stroke(pts, .3, 1.6, CHAOS[2])
    c.ell(60, cy, 16, 15, VOID[1])
    c.ell(60, cy, 14, 13, CHAOS[1])
    for k in range(3):
        c.stroke(spiral(61, cy, 2, 13, k * 120 + 20, .7, n=30), 3.2, .8, CHAOS[2])
    c.stroke(spiral(61, cy, 1, 10, 50, 1.1, n=30), 1.5, .4, CHAOS[3])
    c.ell(62, cy, 4.5, 4.5, CHAOS[3])
    c.ell(63, cy, 2.8, 2.8, CHAOS[4])
    c.ell(63, cy, 1.3, 1.3, WHITE)
    sparkle(c, 46, 8, 2.2, CHAOS[4])
    sparkle(c, 30, 33, 2.0, CHAOS[3])
    c.outline(VOID[0], 1.2)
    c.save("chaosBolt")


def void_circle():
    c = Canvas(80, 80)
    n = 120
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n * 2 * math.pi
        w = 6.0 + 1.6 * math.sin(3 * t)
        outer.append((40 + (34 + w / 2 - 3) * math.cos(t), 40 + (34 + w / 2 - 3) * math.sin(t)))
        inner.append((40 + (34 - w / 2 - 3) * math.cos(t), 40 + (34 - w / 2 - 3) * math.sin(t)))
    c.poly(outer + inner[::-1], VOID[1])
    c.ring(40, 40, 31, 31, 3.0, VOID[0], 255)
    # violet swirl wisps running round the ring
    for k in range(5):
        a0 = k * 72
        c.stroke(arc(40, 40, 31, 31, a0, a0 + 46), .5, 2.0, VOID[2])
        c.stroke(arc(40, 40, 31.5, 31.5, a0 + 10, a0 + 40), .3, 1.0, VOID[3])
    c.ring(40, 40, 36, 36, 1.0, CHAOS[2], 255, 0, 360)   # pale-violet rim for the dark floors
    c.ring(40, 40, 25.5, 25.5, .8, VOID[3], 255, 0, 360)
    for k in range(8):
        a = math.radians(k * 45 + 10)
        c.ell(40 + 39 * math.cos(a), 40 + 39 * math.sin(a), 1.0, 1.0, VOID[3])
    c.outline((4, 2, 12), 1.0)
    c.save("voidCircle")


def slime_blast():
    rnd = random.Random(11)
    c = Canvas(80, 45)
    cy = 22.5
    body_pts = []
    # lumpy blob head
    for i in range(48):
        t = i / 48 * 2 * math.pi
        r = 15 + 2.2 * math.sin(3 * t + 1) + 1.2 * math.sin(5 * t)
        body_pts.append((58 + r * 1.05 * math.cos(t), cy + r * .95 * math.sin(t)))
    # drips trailing left
    for dy, x0, ln, w in [(-8, 20, 18, 3.2), (6, 14, 24, 4.0), (-1, 8, 20, 2.6), (11, 26, 12, 2.2)]:
        c.stroke([(x0 + ln, cy + dy * .5), (x0 + ln * .5, cy + dy * .8), (x0, cy + dy)], w, .4, NATURE[2])
    c.poly(body_pts, NATURE[2])
    c.ell(58, cy + 4, 11, 9, NATURE[1])
    c.ell(56, cy - 1, 11, 9.5, NATURE[2])
    c.ell(54, cy - 3, 7.5, 6, NATURE[3])
    c.stroke([(48, cy - 8), (53, cy - 11), (60, cy - 11)], 1.7, .8, NATURE[4])
    for _ in range(4):
        x, y = 56 + rnd.uniform(-8, 8), cy + rnd.uniform(-4, 9)
        c.ell(x, y, 1.6, 1.6, NATURE[3])
        c.ell(x - .4, y - .4, .6, .6, NATURE[4])
    for x, y, r in [(6, 10, 2.0), (4, 32, 2.4), (13, 38, 1.6), (2, 21, 1.4), (22, 5, 1.6)]:
        c.ell(x, y, r, r, NATURE[2])
        c.ell(x - r * .3, y - r * .3, r * .35, r * .35, NATURE[4])
    c.outline(NATURE[0], 1.2)
    c.save("slimeBlast")


def steal_health():
    c = Canvas(80, 59)
    # ghostly clutching claw reaching right: wrist at left, palm, three hooked fingers and a thumb
    def finger(pts, w0, w1):
        c.stroke(pts, w0, w1, CHAOS[2])
        c.stroke([(x, y - w0 * .35) for x, y in pts], w0 * .45, w1 * .3, CHAOS[3])
    c.poly([(2, 34), (6, 26), (28, 20), (38, 30), (36, 46), (4, 48)], CHAOS[2])        # forearm + palm
    c.ell(34, 33, 11, 12, CHAOS[2])
    finger([(40, 24), (52, 14), (64, 10), (73, 16)], 5.0, 2.0)                           # upper finger
    finger([(42, 31), (56, 26), (68, 26), (75, 33)], 5.2, 2.0)                           # middle finger
    finger([(40, 40), (52, 42), (62, 46), (68, 54)], 4.6, 1.8)                           # lower finger
    finger([(30, 40), (34, 50), (44, 54)], 4.2, 2.2)                                      # thumb
    c.poly([(2, 34), (6, 26), (28, 20), (30, 26), (10, 32), (4, 40)], CHAOS[1])
    c.stroke([(6, 42), (20, 44), (34, 42)], 1.6, 2.4, CHAOS[1])
    for tip in [(73, 16), (75, 33), (68, 54)]:                                           # claw tips
        c.ell(tip[0], tip[1], 1.8, 1.8, CHAOS[4])
    # wisps of drained life drifting off the wrist
    for y, a in [(24, 200), (36, 160), (46, 120)]:
        c.stroke([(14 - t * 1.5, y + 2 * math.sin(t)) for t in range(0, 9)], 1.6, .2, CHAOS[3], a)
    c.stroke([(30, 24), (40, 22)], 1.0, .6, CHAOS[4])
    sparkle(c, 56, 20, 2.4, WHITE)
    sparkle(c, 22, 30, 2.0, CHAOS[4])
    c.outline(VOID[0], 1.3)
    c.save("stealHealth")


for fn in (wind_cone, air_tornado, hurricane, water_drop, water_circle, water_corner, sonar_blast,
           chaos_orb, chaos_bolt, void_circle, slime_blast, steal_health):
    fn()
