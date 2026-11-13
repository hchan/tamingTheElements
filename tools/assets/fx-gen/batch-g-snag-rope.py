"""Per-element Snag rope sprites (ability-graphics-audit-defects): entanglingVinesWater, entanglingVinesAir. 80x61 single frames
(the size of the green entanglingVines vine, which Treenoc and the other nature/earth holders keep), original art.
Run: ~/claudetmp/v/bin/python tools/assets/fx-gen/batch-g-snag-rope.py [outdir]   (default public/assets/img/fx; needs Pillow)
Water: a kelp-blue cord, two strands twisted round each other with leafy fronds and pale foam beads. Air: a wind-spun cord,
pale cloud-white strands twisting in a coil with swirl loops at the ends. Same look as batches A-F: dark element-coloured outline,
ramp bands, bright highlights; the dark outline keeps both readable on light and dark floors.
"""
import importlib.util, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("batch_e_map", os.path.join(HERE, "batch-e-map.py"))
E = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(E)
if len(sys.argv) > 1:
    E.OUT = sys.argv[1]
Frame, palette, SS = E.Frame, E.palette, E.SS
WATER, AIR = (palette.element_ramp(n) for n in ("water", "air"))
W, H = 80, 61


def path(n=40):
    """Centre line of the cord: an S curve across the sprite, as (x, y, tangent angle) samples."""
    pts = []
    for i in range(n + 1):
        t = i / n
        x = 8 + 62 * t
        y = 33 + 12 * math.sin(t * 2 * math.pi * 0.95 + 0.4) * (1 - 0.15 * t)
        pts.append((x, y))
    out = []
    for i, (x, y) in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(n, i + 1)]
        out.append((x, y, math.atan2(b[1] - a[1], b[0] - a[0])))
    return out


def line(f, pts, w, col, a=255):
    f.d.line([(x * SS, y * SS) for x, y in pts], fill=tuple(col) + (a,), width=max(1, int(w * SS)), joint="curve")
    for x, y in (pts[0], pts[-1]):
        f.ell(x, y, w / 2, w / 2, col, a)


def strands(f, ramp, amp, turns, widths, phase=0.0):
    """Two strands twisted round the centre line; the front one is drawn over the back one at each crossing."""
    c = path()
    n = len(c) - 1
    for i in range(n):
        for s in (0, 1):
            ph = c[i][0] / 62.0 * turns * 2 * math.pi + phase + s * math.pi
            ph2 = c[i + 1][0] / 62.0 * turns * 2 * math.pi + phase + s * math.pi
            front = math.cos(ph) > 0
            f_order = 1 if front else 0
            f._q = getattr(f, "_q", [])
            f._q.append((f_order, i, s, ph, ph2))
    for order in (0, 1):
        for fo, i, s, ph, ph2 in f._q:
            if fo != order:
                continue
            x0, y0, a0 = c[i]
            x1, y1, a1 = c[i + 1]
            p0 = (x0 - math.sin(a0) * amp * math.sin(ph), y0 + math.cos(a0) * amp * math.sin(ph))
            p1 = (x1 - math.sin(a1) * amp * math.sin(ph2), y1 + math.cos(a1) * amp * math.sin(ph2))
            line(f, [p0, p1], widths[0], ramp[1])
            line(f, [p0, p1], widths[1], ramp[2] if order else ramp[1])
            line(f, [(p0[0], p0[1] - 0.7), (p1[0], p1[1] - 0.7)], widths[2], ramp[3] if order else ramp[2])
    f._q = []
    return c


def water_rope():
    f = Frame()
    c = strands(f, WATER, 5.0, 2.6, (5.2, 3.8, 1.4))
    # Kelp fronds: leaf blades along the cord, alternating sides, in a greener sea tone.
    kelp = [(14, 66, 70), (22, 112, 104), (60, 170, 150)]
    for k, i in enumerate(range(4, 40, 5)):
        x, y, a = c[i]
        side = 1 if k % 2 == 0 else -1
        ang = a + side * (1.05 + 0.15 * (k % 3))
        ln = 8 + (k % 3) * 2
        tip = (x + ln * math.cos(ang), y + ln * math.sin(ang))
        mid = (x + ln * 0.5 * math.cos(ang - side * 0.5), y + ln * 0.5 * math.sin(ang - side * 0.5))
        for wd, col in ((4.6, kelp[0]), (3.2, kelp[1]), (1.2, kelp[2])):
            line(f, [(x, y), mid, tip], wd, col)
    # Foam beads and a bright core ring at each end knot.
    for i in (3, 14, 26, 37):
        x, y, _ = c[i]
        f.ell(x + 1, y - 2, 1.7, 1.7, WATER[4])
    for x, y in (c[0][:2], c[-1][:2]):
        f.ell(x, y, 4.2, 4.2, WATER[1])
        f.ell(x, y, 3.0, 3.0, WATER[3])
        f.ell(x - 0.8, y - 0.9, 1.1, 1.1, WATER[4])
    f.outlined(1.5, WATER[0])
    return f


def air_rope():
    f = Frame()
    c = strands(f, AIR, 5.0, 3.2, (4.8, 3.4, 1.3), phase=0.8)
    # Wind swirls curling off both ends, and small gust ticks along the cord.
    for (x, y, a), sgn in ((c[0], -1), (c[-1], 1)):
        cx, cy = x + sgn * 1, y - 10
        pts = []
        for j in range(18):
            t = j / 17
            ang = a + math.pi * (0.2 + 1.7 * t) * -sgn
            r = 6.0 * (1 - 0.65 * t)
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        line(f, pts, 3.6, AIR[1])
        line(f, pts, 2.3, AIR[3])
        line(f, pts[2:-3], 0.9, AIR[4])
    for i in (8, 20, 32):
        x, y, a = c[i]
        line(f, [(x - 4, y + 8), (x + 1, y + 7.2), (x + 5, y + 8.6)], 1.8, AIR[2], 200)
    f.outlined(1.5, AIR[0])
    return f


def save(f, name):
    img = f.final().crop((0, 0, W, H))
    os.makedirs(E.OUT, exist_ok=True)
    p = os.path.join(E.OUT, name + ".png")
    img.save(p, optimize=True)
    print(p, img.size)


if __name__ == "__main__":
    save(water_rope(), "entanglingVinesWater")
    save(air_rope(), "entanglingVinesAir")
