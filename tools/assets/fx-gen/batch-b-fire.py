"""Procedural fire effect sprites, batch B of ideas/brainstorm/effect-batches-plan.md (original art, no legacy pixels).
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-b-fire.py [outdir]   (default public/assets/img/fx; needs Pillow)
Writes fireBlast 74x26, fireball 80x50, crimsonFire 80x64, chaoticFire 80x80, fireDance 80x80, fireHeal 80x79, fire 80x80, fireCircle 80x80
(the manifest sizes of the legacy sprites; same pixel size, same facing: projectiles face east, caster/head at the right, tail at the left).
Look (docs/ART-REFERENCES.md rec. 8, same family as ice-shock.py): teardrop flames drawn as nested layers, deep red, orange, yellow, pale
yellow and a white-yellow core (hue-shifted: the shadows lean to crimson, the lights to yellow), a dark warm outline (never black) and
shed embers. The outline keeps them readable on the light Earth/Air floors, the pale core on the red Fire floor.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "assets", "img", "fx")
SS = 4

fr = palette.element_ramp("fire")
OUTLINE = palette.hue_shift(fr[0], -6, 1.0, 0.85)                       # dark warm brown-crimson
RED = palette.hue_shift(fr[1], -8, 1.05, 1.1)
ORANGE = fr[2]
YELLOW = fr[3]
PALE = palette.hue_shift(fr[4], 2, 0.9, 1.0)
CORE = (255, 248, 210)
FIRE = [RED, ORANGE, YELLOW, PALE, CORE]
# crimson (Lavax): the same ramp pushed toward magenta-red
CRIMSON_OUT = (46, 6, 24)
CRIMSON = [(128, 14, 44), (198, 28, 52), (244, 74, 62), (255, 150, 120), (255, 222, 196)]
# chaotic fire: the fire ramp with a violet-magenta rim
CHAOS_OUT = (40, 8, 40)
CHAOS = [(120, 20, 86), (210, 50, 70), (250, 120, 40), (255, 214, 100), (255, 250, 214)]

LAYER_SCALE = (1.0, 0.76, 0.54, 0.34, 0.17)
LAYER_TMAX = (1.0, 0.93, 0.80, 0.62, 0.42)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def circle(self, x, y, r, col, a=255):
        if r <= 0:
            return
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=tuple(col) + (a,))

    def poly(self, pts, col, a=255):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=tuple(col) + (a,))

    def diamond(self, x, y, r, col, a=255):
        self.poly([(x, y - r), (x + r * 0.7, y), (x, y + r), (x - r * 0.7, y)], col, a)

    def save(self, name):
        out = self.img.resize((self.w, self.h), Image.LANCZOS)
        os.makedirs(OUTDIR, exist_ok=True)
        path = os.path.join(OUTDIR, name + ".png")
        out.save(path, optimize=True)
        print(path, out.size)


def bez(p0, c, p1, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])


def chain(cv, p0, c, p1, w, col, tmax=1.0, scale=1.0, grow=0.0, power=1.05, n=40, a=255):
    """Circles along a bezier from the round base p0 (full radius w) to the pointed tip p1; grow fattens the whole stroke (outline)."""
    for i in range(n + 1):
        t = tmax * i / n
        x, y = bez(p0, c, p1, t)
        cv.circle(x, y, w * scale * (1 - t) ** power + grow, col, a)


def tongue(cv, p0, c, p1, w, ramp=FIRE, out=OUTLINE, alpha=255, outline=1.5, power=1.05):
    """One teardrop flame: dark outline, then the five nested colour layers shrinking toward the base (the hot end)."""
    chain(cv, p0, c, p1, w, out, grow=outline, a=alpha, power=power)
    for col, s, tm in zip(ramp, LAYER_SCALE, LAYER_TMAX):
        chain(cv, p0, c, p1, w, col, tmax=tm, scale=s, a=alpha, power=power)


def ember(cv, x, y, r, col=YELLOW, a=255, out=OUTLINE):
    cv.diamond(x, y, r + 1.0, out, a)
    cv.diamond(x, y, r + 0.4, col, a)


def orb(cv, x, y, r, ramp=FIRE, out=OUTLINE):
    cv.circle(x, y, r + 1.5, out)
    for col, s in zip(ramp, (1.0, 0.8, 0.6, 0.4, 0.2)):
        cv.circle(x + (1 - s) * r * 0.12, y - (1 - s) * r * 0.12, r * s, col)


def fire_blast():
    """Sindarosa: a long narrow dart, pointed hot head at the right, three streaming flame tongues behind."""
    cv = Canvas(74, 26)
    # tail tongues first (behind), from the head back to the left edge
    tongue(cv, (50, 13), (30, 5), (1, 3), 7.0)
    tongue(cv, (50, 13), (30, 21), (1, 23), 7.0)
    tongue(cv, (54, 13), (30, 13), (0, 13), 8.0)
    # head: an east-pointing dart (round hot base, sharp tip)
    tongue(cv, (47, 13), (62, 13), (73.5, 13), 10.0, power=0.9)
    for x, y, r in [(22, 5, 1.0), (14, 21, 1.0), (34, 24, 0.9), (30, 2, 0.9), (8, 8, 0.8)]:
        ember(cv, x, y, r)
    cv.save("fireBlast")


def fireball():
    """Fiara: a round fireball, head at the right, with a flaming mane (several tongues) streaming to the left."""
    cv = Canvas(80, 50)
    tongue(cv, (50, 25), (30, 6), (2, 8), 13.0)
    tongue(cv, (50, 25), (30, 44), (3, 42), 13.0)
    tongue(cv, (52, 25), (28, 15), (0, 17), 14.0)
    tongue(cv, (52, 25), (28, 35), (1, 33), 14.0)
    tongue(cv, (54, 25), (30, 25), (4, 25), 14.0)
    orb(cv, 57, 25, 19)
    # swirl highlight on the ball: two light crescents
    for i in range(14):
        t = i / 13
        a = math.pi * (0.95 + 0.9 * t)
        cv.circle(57 + 11.5 * math.cos(a), 25 + 11.5 * math.sin(a), 1.8 - 0.8 * t, CORE)
    for x, y, r in [(24, 3, 1.2), (14, 47, 1.2), (36, 47, 1.0), (40, 2, 1.0), (6, 22, 1.0), (62, 3, 1.0)]:
        ember(cv, x, y, r)
    cv.save("fireball")


def crimson_fire():
    """Lavax: a crimson star burst (a hot orb with radial spikes), two long streaks trailing to the left."""
    cv = Canvas(80, 64)
    cx, cy = 54, 32
    streaks = [(-168, 52), (-192, 52), (180, 36), (-150, 20), (-210, 20)]
    for deg, ln in streaks:
        a = math.radians(deg)
        tip = (cx + ln * math.cos(a), cy + ln * math.sin(a))
        mid = (cx + ln * 0.5 * math.cos(a + 0.18), cy + ln * 0.5 * math.sin(a + 0.18))
        tongue(cv, (cx, cy), mid, tip, 6.0 if ln > 30 else 4.5, CRIMSON, CRIMSON_OUT)
    for deg in (-60, -20, 20, 60, 100, -100):
        a = math.radians(deg)
        tip = (cx + 22 * math.cos(a), cy + 22 * math.sin(a))
        mid = (cx + 11 * math.cos(a + 0.2), cy + 11 * math.sin(a + 0.2))
        tongue(cv, (cx, cy), mid, tip, 6.0, CRIMSON, CRIMSON_OUT)
    orb(cv, cx, cy, 11, CRIMSON, CRIMSON_OUT)
    for x, y, r in [(16, 10, 1.1), (10, 52, 1.1), (30, 58, 1.0), (28, 4, 1.0), (74, 8, 1.0), (75, 56, 1.0)]:
        ember(cv, x, y, r, CRIMSON[3], out=CRIMSON_OUT)
    cv.save("crimsonFire")


def chaotic_fire():
    """Cinematic backdrop (Disturbance, Restoring Balance): a vortex of flame arms spiralling round a white-hot core, violet-red rim."""
    cv = Canvas(80, 80)
    c = 40
    arms = 5
    for k in range(arms):
        a0 = 2 * math.pi * k / arms
        pts = []
        for i in range(11):
            t = i / 10
            a = a0 + 2.2 * t
            r = 6 + 30 * t
            pts.append((c + r * math.cos(a), c + r * math.sin(a)))
        # the arm is a flame whose round head is at the outside and tail winds into the core
        base, tip = pts[-1], pts[0]
        ctrl = (c + 22 * math.cos(a0 + 1.7), c + 22 * math.sin(a0 + 1.7))
        tongue(cv, base, ctrl, tip, 8.0, CHAOS, CHAOS_OUT)
    orb(cv, c, c, 11, CHAOS, CHAOS_OUT)
    cv.circle(c, c, 4.5, CORE)
    for ang, rr, r in [(20, 37, 1.1), (110, 36, 1.0), (200, 38, 1.1), (290, 36, 1.0), (60, 33, 0.9), (250, 33, 0.9), (330, 38, 0.9)]:
        a = math.radians(ang)
        ember(cv, c + rr * math.cos(a), c + rr * math.sin(a), r, CHAOS[3], out=CHAOS_OUT)
    cv.save("chaoticFire")


def fire_dance():
    """Lavax speed buff: a row of tall dancing flames (S-curved, varied heights) no background."""
    cv = Canvas(80, 80)
    flames = [(12, 66, 9.0, -9, 26), (68, 66, 9.0, 9, 24), (24, 72, 11.0, 8, 12), (56, 72, 11.0, -8, 10), (40, 74, 14.0, -5, 2)]
    for x, base_y, w, lean, top in flames:
        tongue(cv, (x, base_y), (x - lean * 1.6, (base_y + top) / 2 + 4), (x + lean, top), w)
    for x, y, r in [(20, 14, 1.0), (60, 12, 1.0), (8, 36, 1.0), (74, 40, 1.0), (46, 4, 0.9), (34, 6, 0.9), (22, 36, 0.8)]:
        ember(cv, x, y, r)
    cv.save("fireDance")


def fire_heal():
    """Fiara heal: a flaming plus (heal cross) with a flame rising from its centre; transparent background, no white tile."""
    cv = Canvas(80, 79)
    cx, cy = 40, 41
    # cross: outline, deep red body, orange and yellow insets
    def cross(arm_len, arm_w, col):
        cv.d.rectangle([(cx - arm_w) * SS, (cy - arm_len) * SS, (cx + arm_w) * SS, (cy + arm_len) * SS], fill=tuple(col) + (255,))
        cv.d.rectangle([(cx - arm_len) * SS, (cy - arm_w) * SS, (cx + arm_len) * SS, (cy + arm_w) * SS], fill=tuple(col) + (255,))
    cross(34, 13, OUTLINE)
    cross(32, 11, RED)
    cross(29, 8.5, ORANGE)
    cross(25, 5.5, YELLOW)
    # flame from the centre
    tongue(cv, (cx, cy + 9), (cx - 9, cy - 8), (cx + 3, cy - 36), 11.0)
    tongue(cv, (cx + 11, cy + 9), (cx + 17, cy - 2), (cx + 17, cy - 22), 6.0)
    tongue(cv, (cx - 11, cy + 9), (cx - 18, cy), (cx - 16, cy - 18), 5.5)
    for x, y, r in [(10, 10, 1.1), (70, 12, 1.1), (8, 66, 1.0), (72, 68, 1.0), (40, 4, 1.0)]:
        ember(cv, x, y, r, PALE)
    cv.save("fireHeal")


def fire_big():
    """Plain flame cluster (campfire): five flames, the tallest in the middle, a glowing bed and a few shed embers."""
    cv = Canvas(80, 80)
    base = 74
    tongue(cv, (14, base), (6, 52), (11, 34), 9.0)
    tongue(cv, (66, base), (74, 52), (69, 34), 9.0)
    tongue(cv, (26, base), (18, 46), (26, 20), 12.0)
    tongue(cv, (54, base), (62, 46), (53, 18), 12.0)
    tongue(cv, (40, base), (30, 44), (42, 3), 16.0)
    cv.circle(40, base - 1, 9, YELLOW)
    cv.circle(40, base - 1, 5, PALE)
    for x, y, r in [(18, 20, 1.2), (62, 12, 1.2), (4, 30, 1.0), (76, 24, 1.0), (30, 6, 1.0), (50, 4, 0.9), (8, 14, 0.9)]:
        ember(cv, x, y, r)
    cv.save("fire")


def fire_circle():
    """A ring of fire (also the Fire element badge in the menus, so the ring stays clear and bold at 20 px): flame tongues round a hot band."""
    cv = Canvas(80, 80)
    c, R = 40, 27
    n = 16
    # outer tongues leaning along the ring (a slow spin), alternating lengths
    for k in range(n):
        a = 2 * math.pi * k / n
        ln = 12.0 if k % 2 == 0 else 8.0
        base = (c + (R + 1) * math.cos(a), c + (R + 1) * math.sin(a))
        tip_a = a + 0.18
        tip = (c + (R + ln) * math.cos(tip_a), c + (R + ln) * math.sin(tip_a))
        mid = (c + (R + ln * 0.5) * math.cos(a + 0.02), c + (R + ln * 0.5) * math.sin(a + 0.02))
        tongue(cv, base, mid, tip, 5.2, outline=1.4)
    # band layers go into a separate ring layer (a ring = outer disc minus inner disc)
    ring = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    for r_out, r_in, col in [(R + 5.2, R - 5.2, OUTLINE), (R + 3.6, R - 3.6, RED), (R + 2.8, R - 2.8, ORANGE), (R + 2.0, R - 2.0, YELLOW), (R + 1.0, R - 1.0, PALE)]:
        rd.ellipse([(c - r_out) * SS, (c - r_out) * SS, (c + r_out) * SS, (c + r_out) * SS], fill=tuple(col) + (255,))
        rd.ellipse([(c - r_in) * SS, (c - r_in) * SS, (c + r_in) * SS, (c + r_in) * SS], fill=(0, 0, 0, 0))
    # clear the inside of the ring where tongue bases poke in, then lay the band over the tongues
    inner = Image.new("L", cv.img.size, 255)
    ImageDraw.Draw(inner).ellipse([(c - (R - 5.2)) * SS, (c - (R - 5.2)) * SS, (c + (R - 5.2)) * SS, (c + (R - 5.2)) * SS], fill=0)
    cv.img.putalpha(Image.composite(cv.img.getchannel("A"), Image.new("L", cv.img.size, 0), inner))
    cv.img.alpha_composite(ring)
    cv.d = ImageDraw.Draw(cv.img)
    for ang, rr, r in [(12, 37, 1.0), (100, 38, 1.0), (190, 37, 1.0), (280, 38, 1.0), (50, 39, 0.9), (230, 39, 0.9)]:
        a = math.radians(ang)
        ember(cv, c + rr * math.cos(a), c + rr * math.sin(a), r)
    cv.save("fireCircle")


if __name__ == "__main__":
    fire_blast()
    fireball()
    crimson_fire()
    chaotic_fire()
    fire_dance()
    fire_heal()
    fire_big()
    fire_circle()
