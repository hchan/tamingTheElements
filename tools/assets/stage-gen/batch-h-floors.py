"""Procedural Classic arena floors, batch H of the art-consistency work (original art, no legacy pixels).
Run: ~/claudetmp/v/bin/python tools/assets/stage-gen/batch-h-floors.py [outdir]   (default public/assets/img/floor; needs numpy + Pillow)
Writes fire, water, earth, air: 1280x720 floors that replace the pale legacy photos in img/background (the manifest `backgrounds`
urls point here; the legacy PNGs stay for risingSun, stars, void and the git tag). Fixed seeds, so the output is byte-identical.
Look (second pass, after the owner called the first one too cartoony): serious, grim and painterly, closer to Fiara's rigged+baked
heroes than to flat cel shapes. No outlines, no cell/tile icons, no flat bright bands: every floor is a desaturated, dark, continuous
surface built from multi-octave noise, with relief shading from a height field (one light from the upper left), a broad lighting
falloff (lit centre, dark corners), fine film grain, and weathering (hairline cracks, grit, stains). Light sources (lava, caustics,
sky) are soft glows that bleed into the surface, never hard-edged shapes.
Readability: Backdrop (src/game/views/backdrop.ts) multiplies these by BACKDROP_TINT and adds a vignette, so each floor stays a
dark, low-contrast mid-value field (luma ~25-80) with the brightest glow kept thin and dim; heroes and ability sprites carry dark
outlines (rig-gen) and bright cores, which read on all four. Fire is charcoal with deep-red cracks (not an orange wash) so Lavax and
Fireball stand out; Water is dark slate-teal so Curomo's blues keep their value gap; Air is a stormy grey-blue (not white) so
white wind and Cyclonius's pale parts keep contrast.
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



def blur(a, r):
    """Gaussian blur of a 2D float array, radius (sigma) r px; separable, edge-clamped."""
    k = int(r * 3) + 1
    w = np.exp(-0.5 * (np.arange(-k, k + 1) / r) ** 2).astype(np.float32)
    w /= w.sum()
    out = np.asarray(a, np.float32)
    for ax in (0, 1):
        p = np.pad(out, [(k, k) if i == ax else (0, 0) for i in range(2)], mode="edge")
        acc = np.zeros_like(out)
        n = out.shape[ax]
        for i, wi in enumerate(w):
            acc += wi * (p[i:i + n, :] if ax == 0 else p[:, i:i + n])
        out = acc
    return out


def over(img, mask, col, a=1.0):
    m = (np.clip(mask, 0, 1) * a)[..., None]
    img[:] = img * (1 - m) + np.asarray(col, np.float32) * m


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def relief(h, strength, lx=-0.6, ly=-0.8):
    """Lambert-style bump shading of height field h (0..1): +1 facing the light (upper left), -1 away; strength = slope gain."""
    gy, gx = np.gradient(h * strength)
    return np.clip(-(gx * lx + gy * ly) / np.sqrt(1 + gx * gx + gy * gy), -1, 1)


def light(cx=0.5, cy=0.42, lo=0.45, hi=1.0, power=1.6):
    """Broad lighting falloff: `hi` at (cx, cy) in 0..1 screen coords, falling to `lo` at the corners."""
    d = np.sqrt(((XX / W - cx) * 1.3) ** 2 + (YY / H - cy) ** 2) / 0.9
    return lo + (hi - lo) * (1 - np.clip(d, 0, 1) ** power)


def tint(lum, dark, mid, bright):
    """Map a 0..1 luminance field onto a 3-stop colour ramp (smooth, no bands)."""
    return palette.ramp([(0, dark), (0.5, mid), (1, bright)], np.clip(lum, 0, 1)).astype(np.float32)


def finish(img, name, grain=4.0, desat=0.0, seed=900):
    """Film grain, optional desaturation, then an adaptive palette (dithered lightly) so the PNG stays small."""
    r = np.random.default_rng(seed)
    g = r.normal(0, grain, (H, W)).astype(np.float32) + 0.6 * r.normal(0, grain, (H // 2 + 1, W // 2 + 1)).astype(np.float32).repeat(2, 0).repeat(2, 1)[:H, :W]
    img = img + g[..., None]
    if desat:
        l = img @ np.array([0.299, 0.587, 0.114], np.float32)
        img = img * (1 - desat) + l[..., None] * desat
    os.makedirs(OUT, exist_ok=True)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).quantize(colors=40, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    path = os.path.join(OUT, name + ".png")
    im.save(path, optimize=True)
    print(path, os.path.getsize(path))


def cracks(seed, cell, width, octs=3, aniso=1.0):
    """Hairline crack field 0..1 (1 on a crack): thin ridges of a warped noise, with a second octave of branching."""
    wx = (fbm(seed + 7, cell * 0.6, 3) - 0.5) * cell * 0.5
    wy = (fbm(seed + 9, cell * 0.6, 3) - 0.5) * cell * 0.5
    n = fbm(seed, cell, octs, aniso)
    n = np.asarray(Image.fromarray(n).transform((W, H), Image.AFFINE, (1, 0, 0, 0, 1, 0)), np.float32)
    n = n + 0.0 * (wx + wy)
    ridge = np.abs(n - 0.5)
    return np.exp(-(ridge / width) ** 2)


def fire():
    """Scorched basalt: ash-grey stone with relief, hairline fractures whose deep-red glow bleeds softly into the rock."""
    h = 0.55 * fbm(11, 160, 5) + 0.30 * fbm(12, 38, 4) + 0.15 * fbm(13, 9, 2)
    stain = fbm(14, 260, 3)
    rock = np.clip(0.22 + 0.28 * h + 0.18 * (stain - 0.5) + 0.22 * relief(h, 60), 0, 1)
    img = tint(rock, (14, 12, 13), (46, 40, 40), (92, 82, 76)) * light(0.5, 0.5, 0.40, 1.0)[..., None]
    crack = np.maximum(cracks(21, 150, 0.016, 2), 0.7 * cracks(22, 80, 0.011, 2))
    live = smooth(fbm(23, 210, 3), 0.42, 0.62)  # only part of the fracture net is still molten
    heat = crack * live
    glow = np.clip(blur(heat, 9) * 2.4 + blur(heat, 22) * 1.8, 0, 1) * smooth(fbm(24, 300, 2), 0.3, 0.7)
    em = np.asarray([(120, 34, 14)], np.float32) * glow[..., None]  # soft deep-red bleed into the stone
    img = img + em * (0.35 + 0.65 * rock[..., None])
    core = np.clip(heat * glow * 2.2, 0, 1)
    img = img + core[..., None] * np.asarray([(150, 64, 20)], np.float32)  # dim orange line, never white-hot
    img = img * (1 - 0.55 * (crack * (1 - live)))[..., None]  # cold fractures: dark, no glow
    img = img + np.clip((YY - 460) / 260.0, 0, 1)[..., None] ** 2 * np.asarray([(26, 8, 4)], np.float32)  # faint heat from below
    ash = np.random.default_rng(15).random((H, W)) > 0.9985
    img = img + (blur(ash.astype(np.float32), 0.8) * 90)[..., None] * np.asarray([(1.0, 0.7, 0.5)], np.float32)  # rare grey-orange ash flecks
    finish(img, "fire", 2.0, 0.12, 901)


def water():
    """Deep murky water: dark slate-teal swells, soft diffuse caustics and a faint light haze from above; no rings or foam icons."""
    swell = 0.6 * fbm(41, 300, 4, 2.4) + 0.4 * fbm(44, 90, 4, 1.8)
    ripple = fbm(45, 14, 3, 1.6)
    h = 0.8 * swell + 0.2 * ripple
    base = np.clip(0.18 + 0.5 * swell + 0.18 * relief(h, 70) + 0.06 * (ripple - 0.5), 0, 1)
    img = tint(base, (8, 20, 30), (22, 58, 78), (52, 108, 128)) * light(0.5, 0.35, 0.42, 1.0)[..., None]
    a = np.abs(fbm(42, 95, 3, 1.5) - 0.5)
    b = np.abs(fbm(43, 70, 3, 1.0) - 0.5)
    c = np.exp(-(np.minimum(a, b) / 0.05) ** 2)  # broad, low-contrast caustic net
    c = blur(c, 2.0) * smooth(fbm(46, 240, 2, 1.5), 0.3, 0.75)
    fall = (1.0 - YY / H * 0.55)  # more light near the surface (top)
    img = img + (c * fall * 34)[..., None] * np.asarray([(0.45, 0.85, 1.0)], np.float32)
    shaft = blur(np.clip(np.sin((XX + YY * 0.5) / 95.0 + 4 * fbm(47, 200, 2)), 0, 1), 12) * np.clip(1 - YY / H * 1.2, 0, 1)
    img = img + (shaft * 9)[..., None] * np.asarray([(0.6, 0.9, 1.0)], np.float32)  # faint god-rays
    finish(img, "water", 1.8, 0.14, 902)


def earth():
    """Dry, weathered ground: strata mottling, relief-shaded grit and clods, hairline fractures and dust; desaturated umber."""
    h = 0.45 * fbm(51, 190, 5) + 0.30 * fbm(52, 48, 4) + 0.25 * fbm(53, 8, 2)
    strata = fbm(55, 120, 3, 3.0)
    stain = fbm(56, 300, 3)
    v = np.clip(0.30 + 0.26 * h + 0.16 * (strata - 0.5) + 0.16 * (stain - 0.5) + 0.42 * relief(h, 110), 0, 1)
    img = tint(v, (16, 12, 10), (62, 50, 40), (116, 98, 76)) * light(0.5, 0.45, 0.45, 1.0)[..., None]
    cr = np.maximum(cracks(57, 150, 0.014), 0.7 * cracks(58, 70, 0.010))
    cr = blur(cr, 0.7) * smooth(fbm(59, 280, 2), 0.25, 0.6)
    img = img * (1 - 0.7 * cr)[..., None]  # dark hairline fractures, no outline
    img = img + (blur(np.roll(cr, 2, 0), 1.5) * 8)[..., None]  # slight lit lip on the far side of each fracture
    rr = np.random.default_rng(60)
    grit = np.zeros((H, W), np.float32)
    for x, y, s in rr.random((260, 3)):  # small half-buried stones: soft, shaded, low contrast
        cx, cy, rad = int(x * W), int(y * H), 2 + s * 4
        y0, y1, x0, x1 = max(0, cy - 8), min(H, cy + 9), max(0, cx - 8), min(W, cx + 9)
        d = ((XX[y0:y1, x0:x1] - cx) ** 2 + (YY[y0:y1, x0:x1] - cy) ** 2) / (rad * rad)
        grit[y0:y1, x0:x1] = np.maximum(grit[y0:y1, x0:x1], np.clip(1 - d, 0, 1))
    img = img + (relief(blur(grit, 1.2), 14) * 16)[..., None] - (blur(grit, 2.5) * 6)[..., None]
    img = img + (smooth(fbm(61, 220, 3, 2.0), 0.55, 0.85) * 10)[..., None] * np.asarray([(1.0, 0.9, 0.7)], np.float32)  # drifted dust
    finish(img, "earth", 2.2, 0.18, 903)


def air():
    """Storm sky: steel grey-blue gradient, soft layered cloud mass with torn edges (no outlines), faint wind-shear streaks."""
    g = np.clip(YY / H, 0, 1)
    img = palette.ramp([(0, (50, 68, 94)), (0.55, (80, 102, 130)), (1, (104, 124, 146))], g).astype(np.float32)
    for seed, cell, lo, hi, a, col in [(61, 330, 0.38, 0.85, 0.55, (96, 114, 138)), (62, 200, 0.48, 0.90, 0.40, (122, 140, 160)), (63, 120, 0.55, 0.95, 0.22, (138, 154, 172))]:
        n = fbm(seed, cell, 5, 1.7)
        m = smooth(n, lo, hi)
        under = blur(m, 14)  # shadowed underside, offset down
        img = img * (1 - 0.25 * np.roll(under, 20, 0)[..., None])
        over(img, m, col, a)
        over(img, np.clip(relief(blur(n, 3), 40), 0, 1) * m, (170, 184, 198), 0.22)  # light catches the upper-left edges
    streak = fbm(71, 26, 3, 9.0)
    img = img + (smooth(streak, 0.55, 0.8) * smooth(fbm(72, 200, 2, 3.0), 0.4, 0.7) * 16)[..., None]  # wind shear
    img = img * light(0.5, 0.4, 0.62, 1.0)[..., None]
    finish(img, "air", 1.8, 0.1, 904)


if __name__ == "__main__":
    fire()
    water()
    earth()
    air()
