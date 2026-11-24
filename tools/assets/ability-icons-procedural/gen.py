"""Procedural painterly ability icons (512x512 RGB on pure black): ember_bite, kelp_lash, talon_rake, tentacle_lash, spore_burst (RGBA), bristle_stomp (512 medallion, RGB, plus bristle_stomp_32px_check.png).

Run: ~/claudetmp/venv/bin/python -I tools/assets/ability-icons-procedural/gen.py [--out DIR] [--seed N]
PIL + numpy only. Deterministic for a given --seed. Writes <name>.png plus sheet.png
(all icons at 512 and a 64px row) into DIR (default .scratch/proc-icons).
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 512
SS = 2  # supersample for masks


def poly_mask(pts):
    im = Image.new("L", (S * SS, S * SS), 0)
    ImageDraw.Draw(im).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    return np.asarray(im.resize((S, S), Image.LANCZOS), dtype=np.float32) / 255.0


def circle_mask(cx, cy, r):
    return poly_mask([(cx + r * np.cos(a), cy + r * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 40)])


def blur(a, r):
    if r <= 0:
        return a
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255.0


def fnoise(rng, scales=(4, 12, 40), weights=(0.5, 0.3, 0.2)):
    out = np.zeros((S, S), np.float32)
    for sc, w in zip(scales, weights):
        n = rng.random((S // sc + 2, S // sc + 2)).astype(np.float32)
        im = Image.fromarray((n * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
        out += w * np.asarray(im, dtype=np.float32) / 255.0
    return out


def over(img, mask, color):
    c = np.asarray(color, np.float32)
    if c.ndim == 1:
        c = c[None, None, :]
    return img * (1 - mask[..., None]) + c * mask[..., None]


def add(img, mask, color, k=1.0):
    return img + mask[..., None] * np.asarray(color, np.float32)[None, None, :] * k


def yy():
    return np.linspace(0, 1, S, dtype=np.float32)[:, None] * np.ones((1, S), np.float32)


def xx():
    return np.linspace(0, 1, S, dtype=np.float32)[None, :] * np.ones((S, 1), np.float32)


def bezier(pts, n=80):
    t = np.linspace(0, 1, n)[:, None]
    # de Casteljau
    q = [np.broadcast_to(np.asarray(pt, np.float64), (n, 2)) for pt in pts]
    while len(q) > 1:
        q = [(1 - t) * q[i] + t * q[i + 1] for i in range(len(q) - 1)]
    return q[0]


def ribbon(center, width_fn, offset=0.0):
    """Polygon around a centreline with per-sample half-width width_fn(t); offset shifts along normal (in units of width)."""
    n = len(center)
    d = np.gradient(center, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    t = np.linspace(0, 1, n)
    w = np.array([width_fn(x) for x in t])[:, None]
    c = center + nrm * w * offset
    return np.vstack([c + nrm * w, (c - nrm * w)[::-1]]), c, nrm


def finish(img, rng, grain=0.05):
    g = (rng.standard_normal((S, S)).astype(np.float32)) * grain
    lum = img.mean(2, keepdims=True) / 255.0
    img = img * (1 + g[..., None] * np.clip(lum * 3, 0, 1))
    return np.clip(img, 0, 255)


def recentre(img, thresh=14):
    m = img.max(2) > thresh
    ys, xs = np.where(m)
    dy = S // 2 - (ys.min() + ys.max()) // 2
    dx = S // 2 - (xs.min() + xs.max()) // 2
    return np.roll(np.roll(img, dy, 0), dx, 1)


# ---------------------------------------------------------------- ember_bite
def ember_bite(rng):
    img = np.zeros((S, S, 3), np.float32)
    hx, hy = 92.0, 256.0
    half = np.radians(17.5)  # 35 degree opening

    def T(pts, up):
        """local (x along jaw, y toward the gap = +) -> world; upper jaw tilts up, lower down."""
        s = -1.0 if up else 1.0
        ca, sa = np.cos(s * half), np.sin(s * half)
        out = []
        for x, y in pts:
            y = y if up else -y
            out.append((hx + x * ca - y * sa, hy + x * sa + y * ca))
        return out

    # local jaw: outer edge arcs up/back and the tip hooks toward the gap; inner edge is the tooth line
    outer = bezier([(0, -22), (120, -78), (300, -66), (376, 22)], 60)
    inner = bezier([(376, 22), (290, -8), (120, -6), (0, 12)], 60)
    body_l = [tuple(p) for p in np.vstack([outer, inner])]
    ix, iy = inner[::-1, 0], inner[::-1, 1]  # x increasing

    def fang(x, w, ln, lean):
        yb = float(np.interp(x, ix, iy))
        pts = []
        for t in np.linspace(0, 1, 10):  # left edge, base -> tip
            a = np.array([x - w, yb - 8]); c = np.array([x - w * 0.7 + lean * 0.15, yb + ln * 0.62]); b = np.array([x + lean, yb + ln])
            pts.append(tuple((1 - t) ** 2 * a + 2 * t * (1 - t) * c + t * t * b))
        for t in np.linspace(0, 1, 10):  # right edge, tip -> base
            b = np.array([x + lean, yb + ln]); c = np.array([x + w * 0.35 + lean * 0.55, yb + ln * 0.55]); a = np.array([x + w, yb - 8])
            pts.append(tuple((1 - t) ** 2 * b + 2 * t * (1 - t) * c + t * t * a))
        return pts

    up_specs = [(66, 11, 30, 10), (112, 13, 44, 14), (158, 12, 34, 11), (204, 14, 50, 15), (252, 13, 40, 13), (310, 16, 74, 22)]
    lo_specs = [(84, 12, 32, 10), (136, 13, 42, 14), (188, 13, 36, 12), (240, 14, 48, 15), (296, 16, 66, 20)]
    jaws = [(T(body_l, True), [T(fang(*s), True) for s in up_specs]),
            (T(body_l, False), [T(fang(*s), False) for s in lo_specs])]

    # dark gap with a narrow glow deep in the throat only
    gpoly = T([tuple(p) for p in inner[::-1]], True) + T([tuple(p) for p in inner], False)
    gap = poly_mask(gpoly)
    fade = np.clip(1.15 - (xx() * S - hx) / 260.0, 0, 1) ** 1.6
    throat = blur(gap, 7) * fade
    n = fnoise(rng, (3, 9, 30))
    mol = np.stack([255 * np.ones((S, S), np.float32), 90 + 70 * n, 12 + 30 * n], 2)
    img = over(img, np.clip(throat * 0.9, 0, 1), mol)
    img = add(img, blur(gap, 14) * fade, (190, 60, 6), 0.35)

    # jaw masses: charred cracked basalt with glowing fissures
    nb = fnoise(rng, (2, 6, 24), (0.25, 0.35, 0.4))
    nc = fnoise(rng, (14, 40), (0.6, 0.4))
    for body, _ in jaws:
        m = blur(poly_mask(body), 1.3)
        base = np.stack([20 + 16 * nb, 18 + 13 * nb, 20 + 13 * nb], 2)
        img = over(img, m, base)
        img = add(img, np.clip(m - blur(m, 10), 0, 1), (60, 42, 38), 0.8)  # cool rim light
        hot = np.clip(blur(gap, 30) * 2.2, 0, 1)
        fiss = np.clip(1 - np.abs(nc - 0.5) / 0.02, 0, 1) * m
        img = add(img, blur(fiss, 2.2), (255, 95, 10), 0.8 + 0.0)
        img = add(img, fiss * (0.35 + 0.65 * hot), (255, 170, 50), 0.8)
        img = add(img, m * hot * hot, (190, 70, 10), 0.3)  # heat toward the gap
    # outer heat glow
    both = np.maximum(*[poly_mask(b) for b, _ in jaws])
    img = add(img, blur(both, 16) * (1 - both), (200, 70, 8), 0.28)

    # fangs: bone ivory, ember-lit edges
    ni = fnoise(rng, (3, 10), (0.5, 0.5))
    for _, fl in jaws:
        for tp in fl:
            tm = blur(poly_mask(tp), 0.8)
            shade = 0.62 + 0.38 * np.clip((yy() * 0 + 1) * ni, 0, 1)
            col = np.stack([236 * shade, 222 * shade, 190 * shade], 2) * 0.92
            img = over(img, tm, col)
            edge = np.clip(tm - blur(tm, 3.2), 0, 1)
            img = add(img, edge, (255, 140, 40), 1.1)
            img = add(img, blur(tm, 6) * (1 - tm), (255, 110, 20), 0.2)

    # sparks (4)
    spk = np.zeros((S, S), np.float32)
    for i in range(4):
        cx = rng.uniform(250, 440); cy = rng.uniform(118, 215) if i % 2 == 0 else rng.uniform(300, 395)
        spk = np.maximum(spk, circle_mask(cx, cy, rng.uniform(2.2, 4.2)))
    img = add(img, blur(spk, 6), (255, 120, 20), 1.2)
    img = over(img, spk * 0.95, (255, 215, 130))
    return img


# ----------------------------------------------------------------- kelp_lash
def kelp_lash(rng):
    img = np.zeros((S, S, 3), np.float32)
    c = bezier([(105, 400), (130, 110), (330, 440), (415, 110)], 160)
    wf = lambda t: 4 + 32 * (1 - t) ** 1.2 * (0.45 + 0.55 * np.sin(min(t * 6, 1.5)))
    poly, cen, nrm = ribbon(c, wf)
    poly = np.vstack([poly, [[cen[0][0] + wf(0) * np.cos(a), cen[0][1] + wf(0) * np.sin(a)] for a in np.linspace(0, 2 * np.pi, 24)]]) if False else poly
    nn = fnoise(rng, (3, 10, 36))

    # soft underwater halo
    body = poly_mask(poly)
    img = add(img, blur(body, 26), (10, 70, 70), 0.5)

    # leaf / bladder fringe behind and in front of the stem
    def leaf(i, side, ln, wd, col, bladder=False):
        p, d = cen[i], np.gradient(cen, axis=0)[i]
        d /= np.linalg.norm(d) + 1e-9
        nv = np.array([-d[1], d[0]]) * side
        base = p + nv * wf(i / (len(cen) - 1)) * 0.8
        ang = nv * 0.85 + d * 0.5
        ang /= np.linalg.norm(ang)
        pn = np.array([-ang[1], ang[0]])
        if bladder:
            m = circle_mask(*(base + ang * ln * 0.5), wd * 0.55)
        else:
            ts = np.linspace(0, 1, 14)
            left = [base + ang * ln * t + pn * wd * np.sin(np.pi * t) ** 0.8 for t in ts]
            right = [base + ang * ln * t - pn * wd * np.sin(np.pi * t) ** 0.8 for t in ts[::-1]]
            m = poly_mask(left + right)
        return m, col

    for pass_i, lights in enumerate((0.7, 1.1)):
        for k, i in enumerate(range(14, 150, 13)):
            side = 1 if k % 2 == 0 else -1
            t = i / 159
            ln = 62 * (1 - t) ** 0.7 + 14
            wd = 14 * (1 - t) ** 0.6 + 4
            if (pass_i == 0) == (k % 3 != 0):
                continue
            bl = k % 4 == 1
            m, col = leaf(i, side if pass_i == 0 else -side, ln * (1 if pass_i else 0.85), wd, None, bl)
            tone = np.stack([22 + 40 * nn, 56 + 50 * nn, 44 + 30 * nn], 2) * lights
            if bl:
                tone = tone * 1.15 + np.array([14, 10, 0])
            img = over(img, m, tone)
            img = add(img, np.clip(m - blur(m, 4), 0, 1), (90, 150, 110), 0.7)

    # the whip itself: layered gradient (dark rim -> lit core)
    base_col = np.stack([16 + 24 * nn, 42 + 36 * nn, 36 + 28 * nn], 2)
    img = over(img, body, base_col)
    for off, w, col, bl in ((0.18, 0.72, (30, 82, 66), 1.5), (0.28, 0.45, (52, 120, 94), 1.5), (0.4, 0.2, (96, 178, 150), 1.2)):
        pl, _, _ = ribbon(c, lambda t, w=w: wf(t) * w, off)
        img = over(img, blur(poly_mask(pl), bl) * 0.85, col)
    # glossy highlight stripe with specular glints
    pl, hc, _ = ribbon(c, lambda t: wf(t) * 0.1, 0.45)
    img = add(img, blur(poly_mask(pl), 1.2), (200, 245, 225), 0.9)
    for i in (28, 62, 98, 128):
        img = add(img, blur(circle_mask(*hc[i], 3.2 - i / 70), 1.5), (255, 255, 245), 1.0)
    # dark underside edge
    pl, _, _ = ribbon(c, lambda t: wf(t) * 0.35, -0.72)
    img = over(img, blur(poly_mask(pl), 2) * 0.55, (6, 20, 20))
    # whip tip flick
    img = add(img, blur(circle_mask(*cen[-1], 5), 5), (120, 220, 200), 0.4)

    # droplets
    for cx, cy, r in ((330, 330, 9), (372, 280, 6), (290, 372, 5), (205, 150, 7), (250, 105, 4.5), (150, 300, 5)):
        m = circle_mask(cx, cy, r)
        img = add(img, blur(m, 6), (40, 130, 130), 0.35)
        img = over(img, m, (40, 110, 118))
        img = add(img, np.clip(m - blur(m, r * 0.5), 0, 1), (150, 230, 225), 1.0)
        img = add(img, blur(circle_mask(cx - r * 0.35, cy - r * 0.4, r * 0.28), 1), (255, 255, 255), 1.0)
    return img


# ---------------------------------------------------------------- talon_rake
def talon_rake(rng):
    img = np.zeros((S, S, 3), np.float32)
    nn = fnoise(rng, (3, 10, 40))
    streaks = np.zeros((S, S), np.float32)
    arcs = []
    for k in range(3):
        dx, dy = k * 82, -k * 42
        arcs.append(bezier([(256 + (px + dx - 256) * 0.78, 256 + (py + dy - 256) * 0.78) for px, py in ((70, 110), (150, 360), (360, 420))], 120))
    wprof = lambda t: 19 * (np.sin(np.pi * min(max(t, 0), 1)) ** 0.7) * (1.0 - 0.25 * t) + 0.5
    # soft wind streaks trailing behind each arc (against the swipe direction)
    for k, c in enumerate(arcs):
        for j in range(5):
            o = (j - 2) * 14 + rng.uniform(-4, 4)
            s0 = rng.uniform(0.05, 0.35)
            s1 = rng.uniform(0.6, 0.95)
            i0, i1 = int(s0 * 119), int(s1 * 119)
            seg = c[i0:i1]
            pl, _, _ = ribbon(seg, lambda t: 1.6 * np.sin(np.pi * t) + 0.3, 0)
            # offset perpendicular-ish
            pl = pl + np.array([-o * 0.4, -o * 0.9]) - np.array([22, -18])
            streaks = np.maximum(streaks, poly_mask(pl) * rng.uniform(0.25, 0.6))
    img = add(img, blur(streaks, 1.5), (150, 175, 205), 0.9)
    img = add(img, blur(streaks, 8), (80, 120, 180), 0.5)

    for c in arcs:
        poly, cen, nrm = ribbon(c, wprof)
        m = poly_mask(poly)
        img = add(img, blur(m, 14), (70, 120, 200), 0.55)   # wind glow
        grey = np.stack([176 + 46 * nn, 184 + 44 * nn, 198 + 40 * nn], 2)
        img = over(img, m, grey * 0.97)
        # light-blue core, inner mask
        pl, _, _ = ribbon(c, lambda t: wprof(t) * 0.5, 0.15)
        core = blur(poly_mask(pl), 2.5)
        img = over(img, core * 0.92, (128, 196, 246))
        pl, _, _ = ribbon(c, lambda t: wprof(t) * 0.16, 0.25)
        img = add(img, blur(poly_mask(pl), 1.5), (225, 245, 255), 0.7)
        # darker lower edge for volume
        pl, _, _ = ribbon(c, lambda t: wprof(t) * 0.3, -0.75)
        img = over(img, blur(poly_mask(pl), 2.5) * 0.45, (96, 108, 130))
        # crisp-ish soft rim
        img = add(img, np.clip(m - blur(m, 3), 0, 1), (225, 232, 244), 0.5)
    return img


def catmull(pts, n=24):
    P = [np.asarray(q, np.float64) for q in pts]
    P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out)


# ------------------------------------------------------------ tentacle_lash
def tentacle_lash(rng):
    img = np.zeros((S, S, 3), np.float32)
    c = catmull([(110, 470), (90, 380), (170, 300), (330, 280), (420, 210), (380, 120), (300, 100), (270, 150), (310, 180), (336, 150)], 20)
    wf = lambda t: 3.5 + 33 * (1 - t) ** 1.25
    nn = fnoise(rng, (3, 9, 30))
    poly, cen, nrm = ribbon(c, wf)
    body = poly_mask(poly)
    img = add(img, blur(body, 22), (8, 40, 34), 0.55)
    # skin: muted dark teal-green, mottled
    skin = np.stack([22 + 26 * nn, 56 + 34 * nn, 50 + 26 * nn], 2)
    img = over(img, body, skin)
    # volume: lit band toward the back (offset +), dark toward the underside (offset -)
    for off, w, col, bl in ((0.30, 0.62, (40, 88, 76), 2.0), (0.42, 0.32, (62, 116, 100), 1.8)):
        pl, _, _ = ribbon(c, lambda t, w=w: wf(t) * w, off)
        img = over(img, blur(poly_mask(pl), bl) * 0.8, col)
    pl, _, _ = ribbon(c, lambda t: wf(t) * 0.4, -0.78)
    img = over(img, blur(poly_mask(pl), 2.5) * 0.6, (8, 22, 22))
    # suckers: two rows along the underside, shrinking toward the tip
    n = len(cen)
    ts = np.linspace(0, 1, n)
    for row, off in enumerate((-0.30, -0.64)):
        i = 6 + 5 * row
        while i < n - 6:
            t = ts[i]
            w = wf(t)
            r = max(w * 0.2, 1.6)
            if w < 6:
                break
            px, py = cen[i] + nrm[i] * w * off
            rr = r * (1 + rng.uniform(-0.1, 0.1))
            m = circle_mask(px, py, rr)
            img = over(img, m, (170, 160, 128))                       # cream rim
            img = over(img, circle_mask(px, py, rr * 0.62), (26, 40, 36))  # darker centre
            img = add(img, blur(circle_mask(px - rr * 0.3, py - rr * 0.3, rr * 0.18), 0.8), (200, 200, 170), 0.5)
            i += max(int(2.1 * rr / (np.linalg.norm(cen[1] - cen[0]) + 1e-6) + 1), 4)
    # wet specular highlight along the back edge with glints
    pl, hc, _ = ribbon(c, lambda t: wf(t) * 0.07, 0.52)
    img = add(img, blur(poly_mask(pl), 1.3) * 0.8, (150, 200, 185), 0.8)
    for i in (30, 70, 120, 170):
        if i < n:
            img = add(img, blur(circle_mask(*hc[i], 3.4 - i / 90), 1.4), (225, 240, 230), 0.9)
    # grime speckle in the skin
    sp = (rng.random((S, S)) > 0.985).astype(np.float32)
    img = over(img, blur(sp, 0.8) * body * 0.5, (12, 26, 24))
    return img


# -------------------------------------------------------------- spore_burst
def spore_burst(rng):
    img = np.zeros((S, S, 3), np.float32)
    cx, cy = 256.0, 256.0
    ang = np.arctan2(yy() * S - cy, xx() * S - cx)
    dist = np.hypot(xx() * S - cx, yy() * S - cy)
    nn = fnoise(rng, (3, 10, 36))
    # irregular puffball outline: 9 lobes at jittered angles, varied radius, no symmetry
    nl = int(rng.integers(8, 11))
    base = np.sort(rng.uniform(0, 2 * np.pi, nl))
    phi = base + rng.normal(0, 0.12, nl)
    amp = rng.uniform(-0.02, 0.42, nl)
    kap = rng.uniform(10, 28, nl)
    mod = np.zeros_like(ang)
    for p_, a_, k_ in zip(phi, amp, kap):
        mod += a_ * np.exp(k_ * (np.cos(ang - p_) - 1))
    mod -= 0.05
    R = 138 * (1 + mod) * (0.92 + 0.16 * nn)
    puff = np.clip((R - dist) / 30.0, 0, 1) ** 1.2
    rim = np.clip(1 - np.abs(R - 8 - dist) / 14.0, 0, 1) * (0.7 + 0.6 * nn)
    img = add(img, blur(puff, 24), (46, 48, 20), 0.3)
    # bruised, desaturated green body with dusty ochre/olive rim
    core = np.clip((0.50 * R - dist) / 36.0, 0, 1)
    body_col = np.stack([54 + 26 * nn, 68 + 30 * nn, 44 + 18 * nn], 2)
    img = over(img, puff * 0.92, body_col)
    img = add(img, rim * puff, (150, 128, 66), 0.55)
    core_col = np.stack([20 + 12 * nn, 30 + 16 * nn, 24 + 10 * nn], 2)
    img = over(img, core * 0.95, core_col)
    # a few short radial filaments from the rim
    streaks = np.zeros((S, S), np.float32)
    for _ in range(int(rng.integers(6, 9))):
        a = rng.uniform(0, 2 * np.pi)
        r0 = 120 + rng.uniform(0, 30)
        r1 = r0 + rng.uniform(30, 70)
        pts = [(cx + r * np.cos(a + rng.normal(0, 0.012)), cy + r * np.sin(a + rng.normal(0, 0.012))) for r in np.linspace(r0, min(r1, 235), 6)]
        w = rng.uniform(1.4, 2.6)
        pl, _, _ = ribbon(np.array(pts), lambda t, w=w: w * (1 - t) + 0.4)
        streaks = np.maximum(streaks, poly_mask(pl) * rng.uniform(0.35, 0.7))
    img = add(img, blur(streaks, 1.0), (140, 120, 60), 0.8)
    # spore dots: 30-60, larger, ochre / olive, denser near the core
    cnt = int(rng.integers(30, 61))
    for _ in range(cnt):
        a = rng.uniform(0, 2 * np.pi)
        r = 225 * rng.beta(1.6, 2.2)
        px, py = cx + r * np.cos(a), cy + r * np.sin(a)
        rad = rng.uniform(5, 9) if rng.random() > 0.2 else rng.uniform(11, 17)
        col = np.array((168, 134, 62) if rng.random() < 0.55 else (108, 120, 54), np.float32) * rng.uniform(0.7, 1.05)
        m = circle_mask(px, py, rad)
        img = add(img, blur(m, rad * 0.9 + 2), col, 0.25)
        img = over(img, m * 0.9, col)
        img = add(img, np.clip(m - blur(m, rad * 0.5), 0, 1), (220, 195, 120), 0.3)
    # fine dust specks (<=100) and grain over the body
    nd = int(rng.integers(60, 96))
    dust = np.zeros((S, S), np.float32)
    for _ in range(nd):
        a = rng.uniform(0, 2 * np.pi)
        r = 235 * np.sqrt(rng.random())
        dust[int(np.clip(cy + r * np.sin(a), 0, S - 1)), int(np.clip(cx + r * np.cos(a), 0, S - 1))] = 1
    img = add(img, blur(dust, 0.9) * 3, (190, 160, 80), 0.8)
    grain = (rng.random((S, S)).astype(np.float32) - 0.5) * 2
    img = img + (grain * 14 * np.clip(puff * 1.2, 0, 1))[..., None]
    return img


# ------------------------------------------------------------ bristle_stomp
def bristle_stomp(rng):
    """Durrok medallion: cloven boar hoof stamped into a cracked slate disc, stone shards and bristles flung out.
    Height-map shaded (key light top-left); pure black outside the circle; no creature body or face."""
    Y, X = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = cy = S / 2.0
    dx, dy = X - cx, Y - cy
    r = np.hypot(dx, dy)
    inside = np.clip(244 - r, 0, 1)
    H = np.zeros((S, S), np.float32)
    nf = fnoise(rng, (2, 6, 20, 60), (0.15, 0.25, 0.35, 0.25))
    ng = fnoise(rng, (3, 10), (0.5, 0.5))

    # ring: carved bronze/stone band with 8 rivets, recessed disc inside
    t = np.clip((r - 206) / 36.0, 0, 1)
    ring = (r > 206) & (r < 242)
    H += ring * (46 + 14 * np.sin(t * np.pi) + 8 * (nf - 0.5))
    for k in range(8):
        a = np.pi / 8 + k * np.pi / 4
        d = np.hypot(X - (cx + 224 * np.cos(a)), Y - (cy + 224 * np.sin(a)))
        H += 14 * np.sqrt(np.clip(1 - (d / 8.0) ** 2, 0, 1))
    H += (nf - 0.5) * 12 * (r < 206)

    # hoof: two blunt superellipse lobes (toes up), V split, flat heel block, tilted 14 deg
    tilt = np.radians(14)
    ct, st = np.cos(tilt), np.sin(tilt)
    ux = (dx * ct + dy * st) / 1.15
    uy = (-dx * st + dy * ct) / 1.15
    hoof = np.zeros((S, S), np.float32)
    for k in (-1, 1):
        # D-shaped lobe: flat inner edge, bulging outer edge, blunt toe at the top; splayed 9 deg outward
        sp = np.radians(7) * k
        cs, sn = np.cos(sp), np.sin(sp)
        px = ux - k * 17
        py = uy + 4 + (7 if k == 1 else 0)
        lx = (px * cs + py * sn) * k  # lx > 0 toward the outside of this lobe
        ly = -px * sn + py * cs
        tt = np.clip((ly + 88) / 170.0, 0, 1)  # 0 at toe, 1 at heel
        wd = 94 * np.clip(tt, 0, 1) ** 0.5 * (1 - 0.2 * tt)
        toe = np.clip(1 - ((ly + 96) < 0) * 1.0, 0, 1)
        inl = (lx > 0) & (lx < wd) & (ly > -88) & (ly < 80)
        # round the toe corners and the heel corners
        rc = np.hypot(np.clip(18 - lx, 0, None), np.clip(-72 - ly, 0, None)) < 24
        rcw = np.hypot(np.clip(lx - (wd - 20), 0, None), np.clip(-70 - ly, 0, None)) < 26
        m = inl
        hoof = np.maximum(hoof, m.astype(np.float32))
    heel = (np.abs(ux / 80.0) ** 2.4 + np.abs((uy - 46) / 38.0) ** 2.4) < 1
    hoof = np.maximum(hoof, heel.astype(np.float32))
    hoof = blur(blur(hoof, 5.0), 1.2)
    hm = (hoof > 0.5).astype(np.float32)
    bev = np.minimum(blur(hm, 7), 1) ** 1.0
    dome = blur(hm, 22)
    H += hm * 30 + bev * 34 + dome * 38 + hm * (ng - 0.5) * 12
    # hoof wall striations (horn ridges running toe to heel)
    H += hm * 1.5 * np.sin(uy * 0.3 + 4 * nf)

    # cracks: jagged tapering fissures from the hoof edge to the inner ring
    crack = np.zeros((S, S), np.float32)
    cim = Image.new("L", (S, S), 0)
    cd = ImageDraw.Draw(cim)
    n_c = 7
    off = rng.uniform(0, 2 * np.pi)
    for k in range(n_c):
        a = off + k * 2 * np.pi / n_c + rng.normal(0, 0.1)
        rr = 56.0
        pts = []
        while rr < 200:
            a += rng.normal(0, 0.09)
            rr += rng.uniform(10, 18)
            pts.append((cx + rr * np.cos(a), cy + rr * np.sin(a), rr))
        for (x0, y0, r0), (x1, y1, r1) in zip(pts[:-1], pts[1:]):
            w = max(2.0, 11.0 * (1 - (r0 - 56) / 150.0) + 1)
            cd.line([x0, y0, x1, y1], fill=255, width=int(round(w)))
            cd.ellipse([x0 - w / 2, y0 - w / 2, x0 + w / 2, y0 + w / 2], fill=255)
        # one short side branch
        bi = int(rng.integers(1, max(2, len(pts) - 2)))
        bx, by, br = pts[bi]
        ba = a + rng.choice([-1, 1]) * rng.uniform(0.5, 0.9)
        cd.line([bx, by, bx + 34 * np.cos(ba), by + 34 * np.sin(ba)], fill=255, width=3)
    crack = np.asarray(cim, np.float32) / 255.0
    crack = blur(crack, 0.8) * (1 - hm) * (r < 206)
    H -= crack * 40

    # flung stone shards (raised wedges, offset shadow handled by shading)
    shard = np.zeros((S, S), np.float32)
    shard_tone = np.zeros((S, S), np.float32)
    for i in range(10):
        a = off + (i + rng.uniform(-0.2, 0.2)) * 2 * np.pi / 10 + np.pi / n_c
        rr = rng.uniform(128, 182)
        px, py = cx + rr * np.cos(a), cy + rr * np.sin(a)
        sz = rng.uniform(11, 22)
        base = a + rng.normal(0, 0.5)
        pts = [(px + sz * np.cos(base + q) * m, py + sz * np.sin(base + q) * m)
               for q, m in ((0, 1.5), (2.2, 0.9), (3.6, 0.7), (5.0, 1.0))]
        sm = poly_mask(pts)
        shard = np.maximum(shard, sm)
        shard_tone = np.maximum(shard_tone, sm * rng.uniform(0.7, 1.1))
    shard *= (1 - hm)
    H += blur(shard, 1.0) * 30 + blur(shard, 4) * 14

    # bristles: short curved strokes fanned from the hoof top / flung outward
    bim = Image.new("L", (S, S), 0)
    bd = ImageDraw.Draw(bim)
    for i in range(26):
        a = -np.pi / 2 + tilt * 0 + rng.uniform(-1.5, 1.5) + (np.pi if i % 5 == 0 else 0) * 0
        r0 = rng.uniform(70, 150)
        x0, y0 = cx + r0 * np.cos(a), cy + r0 * np.sin(a)
        ln = rng.uniform(18, 40)
        bend = rng.normal(0, 0.35)
        pts = [(x0 + j * ln / 5 * np.cos(a + bend * j / 5), y0 + j * ln / 5 * np.sin(a + bend * j / 5)) for j in range(6)]
        bd.line(pts, fill=255, width=2)
    bris = blur(np.asarray(bim, np.float32) / 255.0, 0.7) * (1 - hm) * (r < 204)
    H += bris * 16

    # shading from the height map
    Hs = blur(np.clip(H / 120.0, 0, 1), 0.8) * 120.0
    gx = np.gradient(Hs, axis=1)
    gy = np.gradient(Hs, axis=0)
    nz = 1.0 / np.sqrt(1 + (gx * 1.6) ** 2 + (gy * 1.6) ** 2)
    nx, ny = -gx * 1.6 * nz, -gy * 1.6 * nz
    L = np.array([-0.55, -0.6, 0.58], np.float32); L /= np.linalg.norm(L)
    lam = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    ao = np.clip(1 - 0.9 * (blur(np.clip(H, 0, 120) / 120.0, 6) - np.clip(H, 0, 120) / 120.0), 0.35, 1.1)

    # albedo
    slate = np.stack([40 + 22 * ng, 34 + 18 * ng, 28 + 14 * ng], 2)
    bronze = np.stack([112 + 40 * nf, 82 + 30 * nf, 42 + 18 * nf], 2)
    horn = np.stack([135 + 30 * ng, 110 + 25 * ng, 76 + 18 * ng], 2)
    stone = np.stack([128 + 30 * nf, 112 + 26 * nf, 90 + 22 * nf], 2)
    alb = slate
    ringm = ((r > 204) & (r < 244)).astype(np.float32)
    alb = over(alb, blur(ringm, 1.0), bronze)
    alb = over(alb, blur(shard, 0.8), stone * shard_tone[..., None])
    alb = over(alb, hm, horn)
    alb = over(alb, np.clip(bris * 2.2, 0, 1), (128, 92, 50))
    amb = 0.34
    img = alb * (amb + (1 - amb) * lam[..., None] * 1.25) * ao[..., None]
    # crack interiors: near-black umber with a faint ochre lower lip
    cr = np.clip(crack * 1.6, 0, 1)
    img = over(img, cr * 0.9, (8, 5, 3))
    lip = np.clip(shift_down(crack, 3) - crack, 0, 1)
    img = add(img, blur(lip, 1.0), (112, 92, 56), 0.5)
    # cleft fill (near-black) and contact shadow with crushed chips under the hoof
    cleft = np.clip((blur(hm, 16) - 0.4) * 6, 0, 1) * (1 - hm)
    img = over(img, blur(cleft, 1.0), (6, 4, 3))
    sh = blur(np.roll(np.roll(hm, 10, 0), 8, 1), 8) * (1 - hm) * (r < 204)
    img = img * (1 - 0.6 * sh)[..., None]
    # dust haze kicked around the hoof (low, desaturated ochre)
    haze = blur(hm, 26) * (1 - hm) * (r < 204)
    img = add(img, haze * (0.5 + nf), (60, 46, 26), 0.5)
    # key-light rim on hoof wall
    img = add(img, np.clip(hm - blur(hm, 4), 0, 1) * np.clip(lam - 0.4, 0, 1), (225, 175, 105), 1.0)
    # inner-ring contact shadow and ring trim line
    img = img * (1 - 0.45 * np.clip(1 - np.abs(r - 205) / 7.0, 0, 1))[..., None]
    img = add(img, np.clip(1 - np.abs(r - 243) / 1.6, 0, 1), (190, 140, 60), 0.35)
    # vignette inside the disc, then hard black outside the circle
    img = img * np.clip(1.08 - (r / 210.0) ** 3 * 0.45, 0.5, 1)[..., None] * 1.0
    img = img * inside[..., None]
    return img


def shift_down(a, n):
    return np.roll(a, n, 0)


ICONS = {"ember_bite": ember_bite, "kelp_lash": kelp_lash, "talon_rake": talon_rake,
         "tentacle_lash": tentacle_lash, "spore_burst": spore_burst, "bristle_stomp": bristle_stomp}
RGBA_ICONS = {"tentacle_lash", "spore_burst"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".scratch/proc-icons")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ims = []
    for i, (name, fn) in enumerate(ICONS.items()):
        rng = np.random.default_rng(a.seed * 1000 + i)
        img = recentre(fn(rng))
        img = finish(np.clip(img, 0, 255), rng)
        im = Image.fromarray(img.astype(np.uint8), "RGB")
        if name in RGBA_ICONS:  # straight alpha from brightness: black void is transparent
            al = (np.clip(img.max(2) / 40.0, 0, 1) * 255).astype(np.uint8)
            Image.fromarray(np.dstack([img.astype(np.uint8), al]), "RGBA").save(os.path.join(a.out, f"{name}.png"))
        else:
            im.save(os.path.join(a.out, f"{name}.png"))
        if name == "bristle_stomp":  # 32 px legibility check, nearest-upscaled to 256
            im.resize((32, 32), Image.LANCZOS).resize((256, 256), Image.NEAREST).save(os.path.join(a.out, f"{name}_32px_check.png"))
        ims.append(im)
    n = len(ims)
    sheet = Image.new("RGB", (S * n + 10 * (n + 1), S + 64 + 30), (0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, (10 + i * (S + 10), 10))
        sheet.paste(im.resize((64, 64), Image.LANCZOS), (10 + i * (S + 10) + 224, S + 20))
    sheet.save(os.path.join(a.out, "sheet.png"))


if __name__ == "__main__":
    main()
