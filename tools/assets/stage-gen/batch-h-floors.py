"""Procedural Classic arena floors, batch H of the art-consistency work (original art, no legacy pixels).
Run: ~/claudetmp/v/bin/python tools/assets/stage-gen/batch-h-floors.py [outdir]   (default public/assets/img/floor; needs numpy + Pillow)
Writes fire, water, earth, air: 1280x720 floors that replace the pale legacy photos in img/background (the manifest `backgrounds`
urls point here; the legacy PNGs stay for risingSun, stars, void and the git tag). Fixed seeds, so the output is byte-identical.
Look: the rig-gen / fx-gen family: banded element ramps (palette.element_ramp), hard-edged value bands, a dark outline-like seam
between cells, bright accents only where they carry the element (lava cracks, caustic light, mortar highlights, cloud tops).
Readability: Backdrop (src/game/views/backdrop.ts) multiplies these by BACKDROP_TINT and adds a vignette, so each floor is a mid-dark,
low-contrast field with the brightest detail kept thin; heroes and ability sprites carry dark outlines (rig-gen) and bright cores,
which read on all four. Fire is charcoal with lava seams (not an orange wash) so Lavax and Sindarosa stand out; Air is a mid blue
sky (not white) so white wind and Cyclonius's pale parts keep contrast.
"""
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "assets", "img", "floor")
W, H = 1280, 720
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def noise(seed, cell, aniso=1.0):
    """Smooth value noise in 0..1; `cell` is the feature size in px, aniso stretches it horizontally (>1) or vertically (<1)."""
    r = np.random.default_rng(seed)
    gw, gh = int(W / (cell * aniso)) + 3, int(H / cell) + 3
    g = Image.fromarray((r.random((gh, gw)) * 255).astype(np.uint8)).resize((int(gw * cell * aniso), int(gh * cell)), Image.BICUBIC)
    return np.asarray(g, np.float32)[:H, :W] / 255.0


def fbm(seed, cell, octs=4, aniso=1.0):
    t, amp, tot = np.zeros((H, W), np.float32), 1.0, 0.0
    for o in range(octs):
        t += amp * noise(seed + o * 101, max(2.0, cell / (2 ** o)), aniso)
        tot += amp
        amp *= 0.5
    t /= tot
    return np.clip((t - 0.5) * 2.0 + 0.5, 0, 1)  # fbm of value noise clusters near 0.5; stretch it so thresholds bite


def voronoi(seed, nx, ny, jitter=0.85):
    """Jittered-grid cells: returns (d1, d2, id) distance to nearest and second nearest seed (px) and the nearest seed index."""
    r = np.random.default_rng(seed)
    cw, ch = W / nx, H / ny
    pts = [((i + 0.5 + (r.random() - 0.5) * jitter) * cw, (j + 0.5 + (r.random() - 0.5) * jitter) * ch) for j in range(ny) for i in range(nx)]
    d1 = np.full((H, W), 1e9, np.float32)
    d2 = d1.copy()
    ids = np.zeros((H, W), np.int32)
    for k, (px, py) in enumerate(pts):
        d = np.sqrt((XX - px) ** 2 + (YY - py) ** 2)
        m1 = d < d1
        d2 = np.where(m1, d1, np.minimum(d2, d))
        ids = np.where(m1, k, ids)
        d1 = np.where(m1, d, d1)
    return d1, d2, ids


def specks(seed, n, rmin, rmax):
    """Mask of n sparse round dots (embers, foam), radius rmin..rmax px."""
    r = np.random.default_rng(seed)
    m = np.zeros((H, W), bool)
    for x, y, s in r.random((n, 3)):
        cx, cy, rad = int(x * W), int(y * H), rmin + s * (rmax - rmin)
        x0, x1, y0, y1 = max(0, int(cx - rad) - 1), min(W, int(cx + rad) + 2), max(0, int(cy - rad) - 1), min(H, int(cy + rad) + 2)
        m[y0:y1, x0:x1] |= (XX[y0:y1, x0:x1] - cx) ** 2 + (YY[y0:y1, x0:x1] - cy) ** 2 <= rad * rad
    return m


def bands(t, cols):
    """Map t in 0..1 to len(cols) flat colour bands (hard edges, like the rig-gen ramps)."""
    n = len(cols)
    idx = np.clip((t * n).astype(np.int32), 0, n - 1)
    return np.asarray(cols, np.float32)[idx]


def over(img, mask, col, a=1.0):
    m = (np.clip(mask, 0, 1) * a)[..., None]
    img[:] = img * (1 - m) + np.asarray(col, np.float32) * m


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    path = os.path.join(OUT, name + ".png")
    im.save(path, optimize=True)
    print(path, os.path.getsize(path))


def fire():
    """Basalt plates split by glowing lava seams, ember specks, a faint heat glow rising from the bottom."""
    F = palette.element_ramp("fire")
    d1, d2, ids = voronoi(11, 9, 5)
    edge = d2 - d1
    rr = np.random.default_rng(5)
    tone = rr.random(ids.max() + 1)[ids]
    grain = fbm(21, 40, 4)
    base = bands(np.clip(0.18 + 0.30 * tone + 0.45 * (grain - 0.5) + 0.06 * (d1 / 160.0), 0, 0.99), [(44, 36, 40), (62, 48, 50), (82, 62, 60), (100, 76, 70)])
    img = base.copy()
    over(img, (edge > 9) & (edge < 15), (118, 92, 84), 0.55)  # plate bevel rim just inside the seam
    flow = fbm(33, 90, 3)
    seam = edge - 12 * (flow - 0.5)
    over(img, seam < 20, F[1], 0.55)  # lava seam: dark-red glow, orange body, pale core, broken by noise so it flows
    over(img, seam < 11, F[2])
    over(img, seam < 6, F[3])
    over(img, seam < 2.2, F[4])
    over(img, (seam >= 20) & (seam < 25), F[0], 0.7)  # dark outline hugging the glow, as the heroes' outlines do
    over(img, specks(77, 70, 1.2, 2.6), F[3], 0.85)  # embers
    over(img, specks(78, 25, 0.8, 1.6), F[4])
    over(img, np.clip((YY - 480) / 240.0, 0, 1) * 0.35, F[1], 0.5)  # heat haze from the lower edge
    save(img, "fire")


def water():
    """Deep water: banded caustic net (two crossed ridge noises), swell bands, ripple rings, foam flecks; cyan light only thin."""
    Wt = palette.element_ramp("water")
    swell = fbm(41, 220, 3, 2.2)
    a = np.abs(fbm(42, 70, 3, 1.4) - 0.5)
    b = np.abs(fbm(43, 55, 3, 1.0) - 0.5)
    caustic = np.minimum(a, b)
    img = bands(np.clip(0.12 + 0.55 * swell, 0, 0.99), [Wt[0], (14, 40, 92), (20, 56, 118), (26, 72, 138)]).astype(np.float32)
    over(img, caustic < 0.035, (30, 88, 160), 0.8)
    over(img, caustic < 0.016, (70, 150, 218), 0.85)
    over(img, caustic < 0.005, Wt[3], 0.9)
    over(img, (caustic >= 0.035) & (caustic < 0.05), Wt[0], 0.4)  # darker rim either side keeps the light line from smearing
    rr = np.random.default_rng(8)
    for _ in range(7):  # ripple rings round a few drops
        cx, cy, r0 = rr.uniform(60, W - 60), rr.uniform(80, H - 80), rr.uniform(30, 60)
        d = np.sqrt((XX - cx) ** 2 + ((YY - cy) * 2.2) ** 2)
        for k in range(3):
            over(img, np.abs(d - (r0 + k * 26)) < 1.6, Wt[3], 0.55 - 0.15 * k)
    over(img, specks(91, 60, 1.0, 2.2), Wt[4], 0.75)
    save(img, "water")


def earth():
    """Flagstone yard: jittered slabs with dark mortar seams, lit bevel, mottled tone, pebbles and small grass tufts."""
    E = palette.element_ramp("earth")
    d1, d2, ids = voronoi(51, 10, 6, 0.7)
    edge = d2 - d1
    rr = np.random.default_rng(6)
    tone = rr.random(ids.max() + 1)[ids]
    mott = fbm(52, 30, 4)
    grain = fbm(53, 5, 2)
    img = bands(np.clip(0.2 + 0.28 * tone + 0.5 * (mott - 0.5) + 0.12 * (grain - 0.5), 0, 0.99), [(96, 70, 46), (118, 88, 58), (140, 106, 70), (160, 124, 84)]).astype(np.float32)
    over(img, (edge > 6) & (edge < 10), (176, 140, 96), 0.5)  # slab top bevel
    over(img, edge < 6, E[0], 0.95)  # mortar seam
    over(img, edge < 3, (22, 14, 10), 0.9)
    over(img, (np.abs(fbm(54, 45, 3) - 0.5) < 0.02) & (edge > 12), E[0], 0.7)  # cracks inside slabs
    for x, y, s in rr.random((90, 3)):  # pebbles
        cx, cy = x * W, y * H
        m = ((XX - cx) / (3 + 3 * s)) ** 2 + ((YY - cy) / (2 + 2 * s)) ** 2 < 1
        over(img, m, E[1], 0.9)
        over(img, np.roll(np.roll(m, -1, 0), -1, 1) & ~m, E[3], 0.8)
    G = palette.element_ramp("nature")
    for x, y, s in rr.random((55, 3)):  # grass tufts
        cx, cy = int(x * (W - 20)) + 10, int(y * (H - 20)) + 10
        img[cy - 1:cy + 1, cx - 6:cx + 6] = G[0]
        for dx in (-5, -2, 0, 2, 5):
            h = 6 + int(s * 6) - abs(dx)
            img[cy - h:cy, cx + dx - 1:cx + dx + 1] = G[2] if dx else G[3]
    save(img, "earth")


def air():
    """Sky arena: mid-blue gradient, layered cloud banks (flat bands with a lit crown and dark rim), long wind streaks."""
    A = palette.element_ramp("air")
    img = palette.ramp([(0, (58, 92, 150)), (0.55, (96, 138, 190)), (1, (132, 172, 212))], np.clip(YY / H, 0, 1)).astype(np.float32)
    for seed, cell, thr, col_hi, col_lo in [(61, 260, 0.70, (150, 186, 222), (96, 130, 182)), (62, 190, 0.74, (184, 210, 236), (120, 154, 200))]:
        n = fbm(seed, cell, 4, 1.5)
        m = n > thr
        over(img, ~m & (np.roll(m, 4, 0) | np.roll(m, -4, 0) | np.roll(m, 4, 1) | np.roll(m, -4, 1)), A[1], 0.6)  # dark rim just outside
        over(img, m, col_lo)
        over(img, m & ~np.roll(m, 12, 0), col_hi)  # lit crown
        over(img, m & (n > thr + 0.12), col_hi, 0.85)
    rr = np.random.default_rng(72)
    for x, y, ln in rr.random((16, 3)):  # a few long thin wind streaks (tapered ellipses)
        cx, cy, rx = x * W, y * H, 50 + ln * 110
        m = ((XX - cx) / rx) ** 2 + ((YY - cy) / 2.2) ** 2 < 1
        over(img, m, A[3], 0.5)
        over(img, ((XX - cx) / (rx * 0.6)) ** 2 + ((YY - cy) / 1.1) ** 2 < 1, A[4], 0.85)
    save(img, "air")


if __name__ == "__main__":
    fire()
    water()
    earth()
    air()
