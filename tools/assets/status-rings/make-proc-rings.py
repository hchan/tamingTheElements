"""Procedural top-down status ring decals (slow, freeze, daze, speed, tide): 1024x1024 RGBA like the approved burn/haste/heal/snag
keyed plates. Noise + soft glow, desaturated, transparent background, no text. Deterministic (seeded numpy).
Run: ~/claudetmp/venv/bin/python -I tools/assets/status-rings/make-proc-rings.py [outdir] [sheet.png]
Default output: .scratch/status-rings/out/ and .scratch/status-rings/sheet.png (never public/)."""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 1024
C = N / 2
TAU = math.tau
YY, XX = np.mgrid[0:N, 0:N].astype(np.float32)
DX, DY = XX - C, YY - C
R = np.hypot(DX, DY)
TH = np.arctan2(DY, DX)


def noise(seed, cells, octaves=4):
    """Smooth value noise in 0..1 (bicubic-upsampled random grids)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((N, N), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = (rng.random((c, c)) * 255).astype(np.uint8)
        im = Image.fromarray(g).resize((N, N), Image.BICUBIC)
        out += amp * np.asarray(im, np.float32) / 255
        tot += amp
        amp *= 0.5
    return out / tot


def mask(draw_fn, blur=0):
    im = Image.new('L', (N, N), 0)
    draw_fn(ImageDraw.Draw(im))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32) / 255


def hexrgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32)


def polar(r, a):
    return (C + r * math.cos(a), C + r * math.sin(a))


def arc_pts(r, a0, a1, steps=40, wob=None):
    pts = []
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        rr = r + (wob(a) if wob else 0)
        pts.append(polar(rr, a))
    return pts


def compose(layers, glow_c, glow_a=0.35, glow_blur=18):
    """layers: list of (mask 0..1, base rgb, glint rgb). Painted by luminance mix, plus soft glow under everything."""
    rgb = np.zeros((N, N, 3), np.float32)
    a = np.zeros((N, N), np.float32)
    total = np.zeros((N, N), np.float32)
    for m, _, _ in layers:
        total = np.maximum(total, m)
    glow = np.asarray(Image.fromarray((np.clip(total, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(glow_blur)), np.float32) / 255
    rgb += glow[..., None] * glow_c
    a = np.clip(glow * glow_a, 0, 1)
    for m, base, glint in layers:
        t = np.clip(m, 0, 1)
        col = base + (glint - base) * np.clip((t - 0.55) * 2.2, 0, 1)[..., None]
        rgb = rgb * (1 - t[..., None]) + col * t[..., None]
        a = a + t * (1 - a)
    # vignette so nothing touches the border
    a *= np.clip((C - 8 - R) / 40, 0, 1)
    rgb = np.where(a[..., None] > 0, rgb, 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def grain(m, seed, strength=0.55, cells=24):
    n = noise(seed, cells, 5)
    return np.clip(m * (1 - strength + strength * 2 * n), 0, 1)


def ring_band(r0, w, wob_seed=0, wob=10):
    n = noise(wob_seed, 6, 3)
    rr = r0 + (n - 0.5) * wob * 2
    return np.clip(1 - np.abs(R - rr) / w, 0, 1)


# ---- per-status rings ----
def slow():
    """Closed heavy dark brown-grey drag ring: thick wobbling band, bright worn edge, drag ticks."""
    base, glint = hexrgb(0x6a5a4c), hexrgb(0xb8aa96)
    dark = hexrgb(0x2e2824)
    band = ring_band(330, 40, 3, 12)
    band = np.clip(band * 1.6, 0, 1) ** 0.8
    band = grain(band, 101, 0.5, 14)
    edge = grain(ring_band(330 + 34, 7, 4, 10) + ring_band(330 - 34, 7, 5, 10), 102, 0.4)
    def d(dr):
        rng = np.random.default_rng(11)
        for k in range(9):  # tapered drag strokes trailing outward
            a0 = k * TAU / 9 + rng.normal() * 0.1
            for s in range(40):
                f = s / 40
                w = 3 + 9 * (1 - f)
                p = polar(372 + 6 * rng.normal(), a0 - 0.5 * f)
                dr.ellipse([p[0] - w, p[1] - w, p[0] + w, p[1] + w], fill=int(230 * (1 - f)))
    ticks = grain(mask(d, 2), 103, 0.5)
    return compose([(band, dark, base), (edge, base, glint), (ticks, base, glint)], dark, 0.55, 20)


def freeze():
    """Pale cyan-white ice shards radiating around a thin frost ring."""
    base, glint = hexrgb(0x93a9ac), hexrgb(0xe8f0ee)
    def d(dr):
        rng = np.random.default_rng(22)
        n = 22
        for i in range(n):
            a = TAU * i / n + rng.normal() * 0.05
            r0 = 318 + rng.normal() * 6
            ln = 55 + rng.random() * 70
            wd = 14 + rng.random() * 12
            tip = polar(r0 + ln, a + rng.normal() * 0.03)
            b1 = polar(r0, a - wd / r0)
            b2 = polar(r0, a + wd / r0)
            dr.polygon([b1, tip, b2], fill=255)
            if rng.random() < 0.5:  # small inward shard
                t2 = polar(r0 - 30 - rng.random() * 25, a + 0.02)
                dr.polygon([polar(r0, a - 0.012), t2, polar(r0, a + 0.012)], fill=220)
    shards = mask(d, 1.2)
    # facets: darker half per shard via noise-free angular shading
    facet = 0.65 + 0.35 * np.sin(TH * 22 * 3.0 + 1.0) ** 2
    shards = grain(shards * facet, 201, 0.45, 40)
    frost = grain(ring_band(318, 7, 5, 8) * 0.9, 202, 0.5)
    return compose([(frost, hexrgb(0x6f8588), base), (shards, base, glint)], hexrgb(0x7fa3a8), 0.3, 14)


def star_poly(cx, cy, ro, ri, rot, pts=5):
    out = []
    for i in range(pts * 2):
        r = ro if i % 2 == 0 else ri
        a = rot + math.pi * i / pts
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def shaded_star(cx, cy, ro, rot):
    """Painterly 5-point star: lit/shadow facets per point, soft core glow, rim."""
    lit, mid, shade = hexrgb(0xf4e8b0), hexrgb(0xc9a94c), hexrgb(0x7a6428)
    m = np.zeros((N, N), np.float32)
    col = np.zeros((N, N, 3), np.float32)
    ri = ro * 0.45
    outline = star_poly(cx, cy, ro, ri, rot)
    im = Image.new('L', (N, N), 0)
    ImageDraw.Draw(im).polygon(outline, fill=255)
    m = np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    # facets: each point split into lit and shadow halves (light from upper-left)
    sh = Image.new('L', (N, N), 0)
    dsh = ImageDraw.Draw(sh)
    for i in range(5):
        a = rot + TAU * i / 5
        tip = (cx + ro * math.cos(a), cy + ro * math.sin(a))
        r1 = (cx + ri * math.cos(a + math.pi / 5), cy + ri * math.sin(a + math.pi / 5))
        dsh.polygon([(cx, cy), tip, r1], fill=255)
    shade_m = np.asarray(sh.filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255
    d = np.hypot(XX - cx, YY - cy) / ro
    ang = 1 - np.clip((XX - cx + YY - cy) / (2 * ro) * 0.5 + 0.5, 0, 1)  # bright upper-left
    t = np.clip(0.75 * ang + 0.35 * (1 - d) - 0.3 * shade_m, 0, 1)[..., None]
    col = shade + (mid - shade) * np.clip(t * 2, 0, 1) + (lit - mid) * np.clip(t * 2 - 1, 0, 1)
    return m, col


def daze():
    """Five large painterly shaded stars orbiting on an arc with a faint orbit trail."""
    rng = np.random.default_rng(33)
    gm = np.zeros((N, N), np.float32)
    rgb = np.zeros((N, N, 3), np.float32)
    a_ = np.zeros((N, N), np.float32)
    trail = grain(ring_band(335, 4, 9, 8) * 0.35, 302, 0.6)
    for i, (ang, ro) in enumerate([(-2.3, 52), (-1.4, 66), (-0.4, 80), (0.6, 66), (1.5, 52)]):
        cx, cy = polar(335, ang)
        m, col = shaded_star(cx, cy, ro, rng.random())
        n = noise(310 + i, 30, 4)
        m = m * (0.85 + 0.3 * n)
        m = np.clip(m, 0, 1)
        col = col * (0.85 + 0.3 * n[..., None])
        rgb = rgb * (1 - m[..., None]) + col * m[..., None]
        a_ = a_ + m * (1 - a_)
        gm = np.maximum(gm, m)
    glow = np.asarray(Image.fromarray((gm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)), np.float32) / 255
    base = compose([(trail, hexrgb(0x7a6428), hexrgb(0xb09a52))], hexrgb(0x9a8a5a), 0.0)
    out = np.asarray(base, np.float32)
    ga = glow * 0.5
    oc = out[..., :3] * (out[..., 3:] / 255)
    oa = out[..., 3] / 255
    rc = hexrgb(0x9a8a5a) * ga[..., None]
    ra = ga + oa * (1 - ga)
    pre = rc * (1 - oa[..., None]) + oc
    pre = pre * (1 - a_[..., None]) + rgb * a_[..., None]
    ra = ra + a_ * (1 - ra)
    ra *= np.clip((C - 8 - R) / 40, 0, 1)
    col = np.where(ra[..., None] > 0, pre / np.maximum(ra[..., None], 1e-4), 0)
    return Image.fromarray(np.dstack([np.clip(col, 0, 255), ra * 255]).astype(np.uint8), 'RGBA')


def speed():
    """Three thin air streak arcs, each tapering to alpha 0 at both ends (no dots), half stroke and half opacity."""
    base, glint = hexrgb(0xb4c6bc), hexrgb(0xfafcf6)
    acc = np.zeros((N, N), np.float32)
    rng = np.random.default_rng(44)
    for k in range(3):
        r = 310 + k * 34
        a0 = rng.random() * TAU
        span = 1.4 + rng.random() * 1.2
        im = Image.new('L', (N, N), 0)
        dr = ImageDraw.Draw(im)
        steps = 600  # dense dabs so there is no stipple
        for s in range(steps):
            f = s / steps
            env = math.sin(math.pi * f) ** 1.3  # 0 at both ends
            w = 0.5 + 9 * env
            p = polar(r, a0 + span * f)
            dr.ellipse([p[0] - w, p[1] - w, p[0] + w, p[1] + w], fill=int(255 * env * (0.5 + 0.5 * f)))
        acc = np.maximum(acc, np.asarray(im.filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255)
    m = np.clip(grain(acc, 401, 0.3, 30), 0, 1) * 0.5
    return compose([(m, base, glint)], hexrgb(0x8a9d96), 0.15, 14)


def tide():
    """Teal wave crest ring: scalloped crest line with foam flecks and a lower ripple ring."""
    base, glint = hexrgb(0x3f8f86), hexrgb(0xcfe8e0)
    def d(dr):
        n = 18
        def crest(a):
            return 12 * math.sin(a * n)
        # crest as curling scallops: arch segments
        dr.line(arc_pts(325, 0, TAU, 360, lambda a: -abs(math.sin(a * n / 2)) * 26), fill=255, width=12, joint='curve')
        rng = np.random.default_rng(55)
        for _ in range(70):  # foam flecks near crests
            a = rng.random() * TAU
            p = polar(325 - abs(math.sin(a * n / 2)) * 26 - 12 - rng.random() * 8, a)
            r = 2 + rng.random() * 4
            dr.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=230)
    m = grain(mask(d, 1.6), 501, 0.5, 30)
    ripple = grain(ring_band(262, 5, 7, 8) * 0.55 + ring_band(380, 4, 8, 8) * 0.4, 502, 0.6)
    body = grain(ring_band(318, 24, 9, 6) * 0.35, 503, 0.7, 14)
    return compose([(body, hexrgb(0x2c6a64), base), (ripple, hexrgb(0x2c6a64), base), (m, base, glint)], hexrgb(0x2c6a64), 0.35, 20)


RINGS = [('slow', slow), ('freeze', freeze), ('daze', daze), ('speed', speed), ('tide', tide)]


def sheet(imgs, path):
    t = 360
    pad = 10
    out = Image.new('RGB', (len(imgs) * (t + pad) + pad, 2 * (t + pad) + pad), (40, 40, 40))
    for i, (name, im) in enumerate(imgs):
        sm = im.resize((t, t), Image.LANCZOS)
        for j, bg in enumerate([(14, 14, 16), (120, 120, 120)]):
            tile = Image.new('RGB', (t, t), bg)
            tile.paste(sm, (0, 0), sm)
            out.paste(tile, (pad + i * (t + pad), pad + j * (t + pad)))
    out.save(path)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else '.scratch/status-rings/out'
    sheetp = sys.argv[2] if len(sys.argv) > 2 else '.scratch/status-rings/sheet.png'
    os.makedirs(outdir, exist_ok=True)
    imgs = []
    for name, fn in RINGS:
        im = fn()
        im.save(os.path.join(outdir, f'fx_status_{name}_proc.png'))
        imgs.append((name, im))
    sheet(imgs, sheetp)
    print('wrote', len(imgs), 'rings to', outdir, 'and', sheetp)


if __name__ == '__main__':
    main()
