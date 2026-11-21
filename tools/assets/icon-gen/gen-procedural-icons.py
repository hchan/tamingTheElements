"""Procedural 512 px ability icons for the slots that failed text-to-image (Pillow only, deterministic, own work, no third-party art).
Run: python3 -I tools/assets/icon-gen/gen-procedural-icons.py <out-dir>
Writes <slot>.png (512x512) for cinder_spray, static_mote, quake, mist_veil, kelp_whip, gust, bristle_stomp, skitter, plus approval-template.json
(reviewer/date left empty: fill in from the art-director verdict, then run install-ai-ability-icons.py on it).
Every icon is a dark medallion (bronze rim, vignette) on the HUD backdrop with one full subject; elements: fire, air, earth, water.
"""
import json, math, os, random, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

N, S = 512, 4  # output side, supersample factor for drawing
BACK = (22, 20, 19)
SLOTS = ["cinder_spray", "static_mote", "quake", "mist_veil", "kelp_whip", "gust", "bristle_stomp", "skitter"]


def rng(slot):
    return random.Random(sum(map(ord, slot)) * 7919)


def noise(size, seed, scale, contrast=1.0):
    """Smooth value noise in L mode: random grey at a coarse grid, upscaled bicubic."""
    r = random.Random(seed)
    g = max(2, size // scale)
    im = Image.new("L", (g, g))
    im.putdata([r.randrange(256) for _ in range(g * g)])
    im = im.resize((size, size), Image.BICUBIC)
    if contrast != 1.0:
        im = im.point(lambda v: max(0, min(255, round(128 + (v - 128) * contrast))))
    return im


def disc_mask(n, r, feather=0.01):
    m = Image.new("L", (n, n), 0)
    ImageDraw.Draw(m).ellipse((n / 2 - r * n, n / 2 - r * n, n / 2 + r * n, n / 2 + r * n), fill=255)
    return m.filter(ImageFilter.GaussianBlur(max(0.5, feather * n)))


def gradient_fill(n, inner, outer, power=1.6):
    """Radial gradient from the inner colour at the centre to the outer colour at the rim."""
    g = Image.radial_gradient("L").resize((n, n), Image.BICUBIC).point(lambda v: round(255 * (v / 255) ** power))
    return Image.composite(Image.new("RGB", (n, n), outer), Image.new("RGB", (n, n), inner), g)


def medallion(n, inner, outer, rim=(120, 88, 52)):
    """Dark disc with a vignette and a bronze rim on the HUD backdrop; returns (image, inner_mask)."""
    base = Image.new("RGB", (n, n), BACK)
    disc = gradient_fill(n, inner, outer)
    base.paste(disc, (0, 0), disc_mask(n, 0.465, 0.002))
    d = ImageDraw.Draw(base)
    cx = n / 2
    for r, c, w in ((0.468, (30, 22, 14), n // 85), (0.455, rim, n // 75), (0.44, (60, 44, 28), n // 170)):
        d.ellipse((cx - r * n, cx - r * n, cx + r * n, cx + r * n), outline=c, width=w)
    return base, disc_mask(n, 0.43, 0.002)


def finish(base, inner_mask, subject, subject_alpha, glow=None):
    """Composites subject (RGB) through its alpha, clipped to the medallion, with an optional blurred glow layer underneath."""
    a = ImageChops.multiply(subject_alpha, inner_mask)
    if glow is not None:
        gl, ga = glow
        base = Image.composite(gl, base, ImageChops.multiply(ga, inner_mask))
    return Image.composite(subject, base, a)


# ---------- icons ----------
def cinder_spray():
    """Fire: ring of embers bursting outward around a hot core."""
    n = N * S
    r = rng("cinder")
    base, inner = medallion(n, (60, 26, 14), (14, 8, 8))
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    d = ImageDraw.Draw(sub)
    glow = Image.new("RGB", (n, n), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    c = n / 2
    for i in range(46):
        ang = (i / 46) * math.tau + r.uniform(-0.07, 0.07)
        rad = n * r.uniform(0.17, 0.40)
        sz = n * r.uniform(0.008, 0.026) * (1.6 - rad / (n * 0.4) * 0.9)
        x, y = c + math.cos(ang) * rad, c + math.sin(ang) * rad
        tr = rad * r.uniform(0.82, 0.93)
        tx, ty = c + math.cos(ang) * tr, c + math.sin(ang) * tr
        heat = 1 - (rad / (n * 0.4))
        col = (255, round(90 + 130 * heat), round(20 + 70 * heat))
        d.ellipse((x - sz, y - sz, x + sz, y + sz), fill=col)
        gd.ellipse((x - sz * 3, y - sz * 3, x + sz * 3, y + sz * 3), fill=(120, 36, 8))
    for rr, col in ((0.14, (150, 40, 10)), (0.10, (240, 110, 24)), (0.058, (255, 214, 120)), (0.028, (255, 250, 226))):
        d.ellipse((c - rr * n, c - rr * n, c + rr * n, c + rr * n), fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(n * 0.03))
    sub = sub.filter(ImageFilter.GaussianBlur(n * 0.0025))
    sub = ImageChops.lighter(sub, glow)
    alpha = sub.convert("L").point(lambda v: min(255, v * 4))
    return finish(base, inner, sub, alpha).resize((N, N), Image.LANCZOS)


def static_mote():
    """Air: a bright spark mote with forked, crackling arcs and a thin orbit ring (blue-white, desaturated)."""
    n = N * S
    r = rng("static")
    base, inner = medallion(n, (26, 34, 48), (8, 10, 14))
    c = n / 2
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    d = ImageDraw.Draw(sub)
    for rr in (0.40, 0.36):
        d.ellipse((c - rr * n, c - rr * n, c + rr * n, c + rr * n), outline=(60, 90, 130), width=max(2, n // 220))

    def bolt(x, y, ang, length, w, depth):
        pts = [(x, y)]
        for _ in range(7):
            ang += r.uniform(-0.55, 0.55)
            x += math.cos(ang) * length / 7
            y += math.sin(ang) * length / 7
            pts.append((x, y))
        d.line(pts, fill=(150, 200, 255), width=w, joint="curve")
        if depth:
            k = r.randrange(2, 5)
            bolt(*pts[k], ang + r.choice((-1, 1)) * 0.7, length * 0.45, max(2, w - 3), depth - 1)
    for i in range(7):
        bolt(c, c, i * math.tau / 7 + r.uniform(-0.2, 0.2), n * r.uniform(0.26, 0.36), n // 50, 1)
    glow = sub.filter(ImageFilter.GaussianBlur(n * 0.018))
    core = Image.new("RGB", (n, n), (0, 0, 0))
    cd = ImageDraw.Draw(core)
    for rr, col in ((0.085, (70, 120, 200)), (0.058, (170, 215, 255)), (0.032, (245, 252, 255))):
        cd.ellipse((c - rr * n, c - rr * n, c + rr * n, c + rr * n), fill=col)
    core = core.filter(ImageFilter.GaussianBlur(n * 0.004))
    sub = ImageChops.lighter(ImageChops.lighter(sub, glow), ImageChops.lighter(core, core.filter(ImageFilter.GaussianBlur(n * 0.025))))
    alpha = sub.convert("L").point(lambda v: min(255, v * 5))
    return finish(base, inner, sub, alpha).resize((N, N), Image.LANCZOS)


def quake():
    """Earth: a cracked fissure in dark ground with glowing seams and rock chunks lifting off."""
    n = N * S
    r = rng("quake")
    base, inner = medallion(n, (62, 50, 40), (16, 13, 12))
    tex = noise(n, 11, 24, 1.6).filter(ImageFilter.GaussianBlur(n * 0.004))
    ground = Image.merge("RGB", [tex.point(lambda v, k=k: round(44 + v * k)) for k in (0.30, 0.25, 0.21)])
    base = Image.composite(ground, base, ImageChops.multiply(inner, Image.new("L", (n, n), 230)))
    c = n / 2
    crack = Image.new("L", (n, n), 0)
    thin = Image.new("L", (n, n), 0)
    cd, td = ImageDraw.Draw(crack), ImageDraw.Draw(thin)

    def seam(x, y, ang, length, w, depth):
        pts = [(x, y)]
        for _ in range(9):
            ang += r.uniform(-0.45, 0.45)
            x += math.cos(ang) * length / 9
            y += math.sin(ang) * length / 9
            pts.append((x, y))
        cd.line(pts, fill=255, width=w, joint="curve")
        td.line(pts, fill=255, width=max(3, w // 4), joint="curve")
        if depth:
            for k in (3, 6):
                seam(*pts[k], ang + r.choice((-1, 1)) * r.uniform(0.6, 1.0), length * 0.42, max(4, w * 3 // 5), depth - 1)
    seam(c, c, math.pi * 0.62, n * 0.34, n // 17, 2)
    seam(c, c, math.pi * 0.62 + math.pi, n * 0.34, n // 17, 2)
    clip = inner
    edge = crack.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(n * 0.005))
    base = Image.composite(Image.new("RGB", (n, n), (70, 58, 48)), base, ImageChops.multiply(edge, clip))
    chasm = crack.filter(ImageFilter.GaussianBlur(n * 0.004))
    base = Image.composite(Image.new("RGB", (n, n), (6, 4, 4)), base, ImageChops.multiply(chasm, clip))
    halo = thin.filter(ImageFilter.GaussianBlur(n * 0.02)).point(lambda v: v * 2 // 3)
    base = Image.composite(Image.new("RGB", (n, n), (150, 60, 16)), base, ImageChops.multiply(halo, chasm))
    glowl = thin.filter(ImageFilter.GaussianBlur(n * 0.004))
    base = Image.composite(Image.new("RGB", (n, n), (240, 130, 40)), base, ImageChops.multiply(glowl, clip))
    core = thin.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(n * 0.002))
    base = Image.composite(Image.new("RGB", (n, n), (255, 226, 150)), base, ImageChops.multiply(core, clip))
    d = ImageDraw.Draw(base)
    for i in range(10):
        ang = r.uniform(0, math.tau)
        rad = n * r.uniform(0.10, 0.32)
        x, y = c + math.cos(ang) * rad, c + math.sin(ang) * rad - n * 0.04
        s = n * r.uniform(0.018, 0.045)
        pts = [(x + math.cos(a) * s * r.uniform(0.6, 1.2), y + math.sin(a) * s * r.uniform(0.6, 1.2)) for a in [j * math.tau / 6 + r.uniform(-.2, .2) for j in range(6)]]
        d.polygon(pts, fill=(78, 66, 56), outline=(20, 16, 14))
        d.polygon([(px - s * .15, py - s * .2) for px, py in pts[:3]] + [(x, y)], fill=(108, 94, 80))
    return base.resize((N, N), Image.LANCZOS)


def mist_veil():
    """Water/air: layered teal-grey mist (procedural noise regraded teal-grey) under a radial mask on black."""
    n = N * 2
    base, inner = medallion(n, (14, 24, 28), (5, 9, 11))
    r = rng("mist")
    fog = Image.new("L", (n, n), 0)
    fd = ImageDraw.Draw(fog)
    for i in range(5):  # horizontal drifting wisps, each a wavy band
        yc = n * (0.30 + 0.10 * i)
        amp = n * r.uniform(0.012, 0.03)
        ph = r.uniform(0, 6.28)
        half = n * r.uniform(0.030, 0.048)
        x0, x1 = n * r.uniform(0.17, 0.25), n * r.uniform(0.75, 0.83)
        for x in range(round(x0), round(x1), 3):
            t = (x - x0) / (x1 - x0)
            env = max(0.0, math.sin(t * math.pi)) ** 0.8
            y = yc + amp * math.sin(t * 9 + ph)
            h = half * env
            fd.ellipse((x - 9, y - h, x + 9, y + h), fill=round(200 * env))
    tex = noise(n, 77, 10, 1.5)
    fog = fog.filter(ImageFilter.GaussianBlur(n * 0.014))
    fog = ImageChops.multiply(fog, tex.point(lambda v: 110 + v // 2)).point(lambda v: min(255, v * 2))
    fog = fog.filter(ImageFilter.GaussianBlur(n * 0.004))
    ramp = [(0.0, (10, 22, 26)), (0.5, (62, 98, 104)), (1.0, (176, 200, 202))]
    lut = [[], [], []]
    for v in range(256):
        t = v / 255
        for (t0, c0), (t1, c1) in zip(ramp, ramp[1:]):
            if t <= t1:
                f = (t - t0) / (t1 - t0)
                for k in range(3):
                    lut[k].append(round(c0[k] + (c1[k] - c0[k]) * f))
                break
    teal = Image.merge("RGB", [fog.point(lut[k]) for k in range(3)])
    veil_a = ImageChops.multiply(fog.filter(ImageFilter.GaussianBlur(n * 0.03)).point(lambda v: min(255, v)), inner).point(lambda v: v // 2)
    veil = Image.composite(Image.new("RGB", (n, n), (4, 10, 12)), base, veil_a)
    mask = ImageChops.multiply(fog.point(lambda v: min(255, v * 2)), disc_mask(n, 0.36, 0.04))
    out = Image.composite(teal, veil, mask)
    return out.resize((N, N), Image.LANCZOS)


def kelp_whip():
    """Water: a sinuous kelp frond with leaf blades, mid-whip, with spray droplets."""
    n = N * S
    r = rng("kelp")
    base, inner = medallion(n, (14, 40, 46), (5, 12, 16))
    pts = []
    for i in range(161):
        t = i / 160
        pts.append((n * (0.20 + 0.60 * t), n * (0.76 - 0.50 * t + 0.13 * math.sin(t * math.tau * 1.1)), t))
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    al = Image.new("L", (n, n), 0)
    d, ad = ImageDraw.Draw(sub), ImageDraw.Draw(al)
    for i in range(16, 150, 11):
        x, y, t = pts[i]
        side = 1 if (i // 11) % 2 else -1
        ln = n * (0.17 - 0.06 * t) * r.uniform(0.9, 1.1)
        ang = math.atan2(pts[i + 2][1] - pts[i - 2][1], pts[i + 2][0] - pts[i - 2][0]) + side * r.uniform(0.7, 1.0)
        tipx, tipy = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        px, py = -math.sin(ang), math.cos(ang)
        w = ln * 0.24
        mx, my = x + (tipx - x) * 0.5, y + (tipy - y) * 0.5
        poly = [(x, y), (mx + px * w, my + py * w), (tipx, tipy), (mx - px * w, my - py * w)]
        d.polygon(poly, fill=(30, 66, 46), outline=(14, 34, 26))
        d.polygon([(x, y), (mx + px * w * .5, my + py * w * .5), (tipx, tipy)], fill=(52, 98, 62))
        d.line((x, y, tipx, tipy), fill=(18, 42, 30), width=max(2, n // 260))
        ad.polygon(poly, fill=255)
    for i in range(len(pts) - 1):
        x0, y0, t = pts[i]
        x1, y1, _ = pts[i + 1]
        w = round(n * (0.088 - 0.050 * t))
        d.line((x0, y0, x1, y1), fill=(24, 58, 38), width=w)
        d.line((x0 - w * .15, y0 - w * .2, x1 - w * .15, y1 - w * .2), fill=(70, 124, 80), width=max(2, w // 2))
        d.line((x0 - w * .25, y0 - w * .3, x1 - w * .25, y1 - w * .3), fill=(120, 176, 124), width=max(2, w // 6))
        ad.line((x0, y0, x1, y1), fill=255, width=w)
    x, y, _ = pts[-1]
    rimg = al.filter(ImageFilter.GaussianBlur(n * 0.02)).point(lambda v: v * 2 // 3)
    base = Image.composite(Image.new("RGB", (n, n), (30, 110, 118)), base, ImageChops.multiply(rimg, inner))
    drop = ImageChops.offset(al.filter(ImageFilter.GaussianBlur(n * 0.012)), round(n * .012), round(n * .016)).point(lambda v: v * 3 // 5)
    base = Image.composite(Image.new("RGB", (n, n), (2, 6, 8)), base, ImageChops.multiply(drop, inner))
    for i in range(5):
        ang = r.uniform(-1.4, 0.6)
        rad = n * r.uniform(0.04, 0.09)
        px, py = x + math.cos(ang) * rad, y + math.sin(ang) * rad
        s = n * r.uniform(0.012, 0.022)
        d.ellipse((px - s, py - s, px + s, py + s), fill=(150, 214, 220))
        ad.ellipse((px - s, py - s, px + s, py + s), fill=255)
    sub = sub.filter(ImageFilter.GaussianBlur(n * 0.0018))
    al = al.filter(ImageFilter.GaussianBlur(n * 0.0018))
    return finish(base, inner, sub, al).resize((N, N), Image.LANCZOS)


def gust():
    """Air: three streaming wind ribbons with curled ends and drifting motes, pale grey-blue on stormy dark."""
    n = N * S
    r = rng("gust")
    base, inner = medallion(n, (36, 44, 54), (10, 12, 16))
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    al = Image.new("L", (n, n), 0)
    d, ad = ImageDraw.Draw(sub), ImageDraw.Draw(al)

    def ribbon(y0, amp, length, w, col, curl, x0):
        pts = []
        for i in range(81):
            t = i / 80
            pts.append((x0 + length * t, y0 + amp * math.sin(t * math.pi * 1.6) * (1 - 0.3 * t), t))
        ex, ey, _ = pts[-1]
        sg = 1 if curl else -1
        for k in range(1, 40):
            a = k / 39
            ang = -1.2 + a * 5.0 * sg
            rr = n * 0.065 * (1 - a * 0.85)
            pts.append((ex + math.sin(ang) * rr - n * 0.02 * a, ey - math.cos(ang) * rr + n * 0.065 * sg * 0.55, 1.0 + a))
        for i in range(len(pts) - 1):
            x, y, t = pts[i]
            tt = min(1.0, t)
            ww = max(2, round(w * (math.sin(min(1.0, tt * 1.15) * math.pi * 0.5 + 0.2) * (1.0 if t < 1 else 1 - (t - 1) * 0.9))))
            c = tuple(round(v * (0.45 + 0.55 * tt)) for v in col)
            d.line((x, y, pts[i + 1][0], pts[i + 1][1]), fill=c, width=ww)
            ad.line((x, y, pts[i + 1][0], pts[i + 1][1]), fill=255, width=ww)
    ribbon(n * 0.34, n * 0.055, n * 0.50, n * 0.040, (196, 214, 226), True, n * 0.16)
    ribbon(n * 0.52, n * -0.05, n * 0.56, n * 0.046, (216, 228, 236), False, n * 0.12)
    ribbon(n * 0.69, n * 0.045, n * 0.44, n * 0.034, (170, 192, 208), True, n * 0.20)
    for i in range(18):
        x, y = n * r.uniform(0.16, 0.84), n * r.uniform(0.22, 0.80)
        s = n * r.uniform(0.004, 0.010)
        d.ellipse((x - s, y - s, x + s, y + s), fill=(184, 204, 216))
        ad.ellipse((x - s, y - s, x + s, y + s), fill=255)
    sub = sub.filter(ImageFilter.GaussianBlur(n * 0.0022))
    al = al.filter(ImageFilter.GaussianBlur(n * 0.0022))
    glow = (Image.new("RGB", (n, n), (60, 82, 104)), al.filter(ImageFilter.GaussianBlur(n * 0.02)).point(lambda v: v // 2))
    return finish(base, inner, sub, al, glow).resize((N, N), Image.LANCZOS)


def bristle_stomp():
    """Earth: a stomp crater with radiating shock cracks, stiff bristle spikes bursting up and dust."""
    n = N * S
    r = rng("bristle")
    base, inner = medallion(n, (54, 44, 36), (14, 11, 10))
    c = n / 2
    cy = n * 0.66
    tex = noise(n, 31, 20, 1.5).filter(ImageFilter.GaussianBlur(n * 0.004))
    ground = Image.merge("RGB", [tex.point(lambda v, k=k: round(14 + v * k)) for k in (0.16, 0.13, 0.11)])
    base = Image.composite(ground, base, ImageChops.multiply(inner, Image.new("L", (n, n), 140)))
    d = ImageDraw.Draw(base)
    d.ellipse((c - n * .30, cy - n * .09, c + n * .30, cy + n * .11), fill=(96, 80, 64))
    d.ellipse((c - n * .27, cy - n * .07, c + n * .27, cy + n * .09), fill=(18, 14, 12))
    for i in range(9):
        a = math.pi + math.pi * (0.04 + 0.92 * i / 8)
        x, y = c + math.cos(a) * n * .22, cy + math.sin(a) * n * .05
        pts = [(x, y)]
        for _ in range(4):
            x += math.cos(a) * n * 0.04 + r.uniform(-n * .01, n * .01)
            y += math.sin(a) * n * 0.012 + r.uniform(-n * .006, n * .006)
            pts.append((x, y))
        d.line(pts[:4], fill=(8, 6, 6), width=max(3, n // 150))
    spikes = Image.new("L", (n, n), 0)
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    sd, ad = ImageDraw.Draw(sub), ImageDraw.Draw(spikes)
    count = 13
    for i in range(count):
        t = i / (count - 1)
        a = -math.pi / 2 + (t - 0.5) * 2.0 + r.uniform(-0.06, 0.06)
        ln = n * (0.46 - 0.15 * abs(t - 0.5) * 2) * r.uniform(0.9, 1.06)
        x0, y0 = c + (t - 0.5) * n * 0.30, cy
        tipx, tipy = x0 + math.cos(a) * ln, y0 + math.sin(a) * ln
        w = n * 0.026
        nx, ny = -math.sin(a), math.cos(a)
        poly = [(x0 + nx * w, y0 + ny * w), (tipx, tipy), (x0 - nx * w, y0 - ny * w)]
        sd.polygon(poly, fill=(150, 124, 90))
        sd.polygon([(x0, y0), (tipx, tipy), (x0 - nx * w, y0 - ny * w)], fill=(84, 62, 44))
        sd.line((x0 + nx * w * .5, y0 + ny * w * .5, tipx, tipy), fill=(190, 158, 112), width=max(2, n // 260))
        ad.polygon(poly, fill=255)
    sub = sub.filter(ImageFilter.GaussianBlur(n * 0.0015))
    spikes = spikes.filter(ImageFilter.GaussianBlur(n * 0.0015))
    base = finish(base, inner, sub, spikes)
    dust = Image.new("L", (n, n), 0)
    dd = ImageDraw.Draw(dust)
    for i in range(16):
        side = -1 if i % 2 else 1
        x = c + side * n * r.uniform(0.16, 0.34)
        y = cy + n * r.uniform(-0.02, 0.07)
        s = n * r.uniform(0.025, 0.06)
        dd.ellipse((x - s, y - s * .7, x + s, y + s * .7), fill=r.randrange(110, 190))
    dust = dust.filter(ImageFilter.GaussianBlur(n * 0.016))
    base = Image.composite(Image.new("RGB", (n, n), (122, 108, 92)), base, ImageChops.multiply(dust, inner).point(lambda v: v * 3 // 5))
    return base.resize((N, N), Image.LANCZOS)


def skitter():
    """Air: a quick hop backward, a small wisp-body leaping with fading afterimages and take-off dust."""
    n = N * S
    base, inner = medallion(n, (36, 44, 54), (10, 12, 16))
    sub = Image.new("RGB", (n, n), (0, 0, 0))
    al = Image.new("L", (n, n), 0)
    d, ad = ImageDraw.Draw(sub), ImageDraw.Draw(al)
    cy = n * 0.50
    r = rng("skitter")
    grain = noise(n, 55, 40, 1.4)
    cxm = n * 0.5

    def critter(size):
        """Faceless spider-like silhouette facing left: dark chitin body, bone rim light, four jointed tapered leg pairs, tilted to read as charging."""
        im = Image.new("RGB", (n, n), (0, 0, 0))
        am = Image.new("L", (n, n), 0)
        cd, cm = ImageDraw.Draw(im), ImageDraw.Draw(am)
        s_ = size * n
        tx = cxm - s_ * 0.55  # thorax centre
        for k in range(4):
            fwd = (-1.0, -0.45, 0.25, 0.9)[k]  # leg heading along x (left negative)
            for sgn in (-1, 1):
                p0 = (tx + (k - 1.5) * s_ * 0.28, cy + sgn * s_ * 0.18)
                p1 = (p0[0] + fwd * s_ * 0.85, p0[1] + sgn * s_ * 0.95)
                p2 = (p1[0] + fwd * s_ * 0.9 - 0.3 * s_, p1[1] + sgn * s_ * 0.55)
                p3 = (p2[0] + fwd * 0.2 * s_ - 0.3 * s_, p2[1] + sgn * s_ * 0.9)
                for a, b, wd in ((p0, p1, 0.17), (p1, p2, 0.12), (p2, p3, 0.07)):
                    w = max(3, round(s_ * wd))
                    cd.line((*a, *b), fill=(38, 34, 32), width=w)
                    cm.line((*a, *b), fill=255, width=w)
                    cd.ellipse((b[0] - w / 2, b[1] - w / 2, b[0] + w / 2, b[1] + w / 2), fill=(38, 34, 32))
                    cm.ellipse((b[0] - w / 2, b[1] - w / 2, b[0] + w / 2, b[1] + w / 2), fill=255)
                cd.line((*p0, *p1), fill=(176, 150, 112), width=max(2, round(s_ * 0.035)))
                cd.line((*p1, *p2), fill=(176, 150, 112), width=max(2, round(s_ * 0.025)))
        ab = (cxm + s_ * 0.05, cy - s_ * 0.62, cxm + s_ * 1.75, cy + s_ * 0.62)  # abdomen
        th = (tx - s_ * 0.55, cy - s_ * 0.42, tx + s_ * 0.55, cy + s_ * 0.42)  # thorax with pointed front
        cm.ellipse(ab, fill=255)
        cm.polygon([(th[0] - s_ * 0.35, cy), (tx, th[1]), (tx + s_ * 0.5, cy), (tx, th[3])], fill=255)
        cm.ellipse(th, fill=255)
        cd.ellipse(ab, fill=(34, 30, 30), outline=(10, 8, 8), width=max(3, round(s_ * .07)))
        cd.polygon([(th[0] - s_ * 0.35, cy), (tx, th[1]), (tx + s_ * 0.5, cy), (tx, th[3])], fill=(40, 36, 34), outline=(10, 8, 8))
        cd.ellipse(th, fill=(42, 38, 36), outline=(10, 8, 8), width=max(3, round(s_ * .07)))
        for box, a0, a1 in ((ab, 195, 345), (th, 200, 340)):
            m = s_ * 0.07
            cd.arc((box[0] + m, box[1] + m, box[2] - m, box[3] - m), a0, a1, fill=(222, 196, 150), width=max(3, round(s_ * .09)))
        for k in range(1, 5):  # chitin plate lines on the abdomen
            x = ab[0] + (ab[2] - ab[0]) * k / 5
            cd.arc((x - s_ * .35, ab[1] + s_ * .1, x + s_ * .35, ab[3] - s_ * .1), 100, 260, fill=(14, 12, 12), width=max(3, round(s_ * .05)))
        cd.ellipse((tx - s_ * .2, cy - s_ * .12, tx + s_ * .2, cy + s_ * .12), fill=(70, 62, 56))
        gl = grain.point(lambda v: 120 + v // 2).convert("RGB")
        im = ImageChops.multiply(im, gl).point(lambda v: min(255, round(v * 1.45)))
        return im.rotate(16, Image.BICUBIC, center=(cxm, cy)), am.rotate(16, Image.BICUBIC, center=(cxm, cy))

    def smear(im, am, dx, a):
        im2, am2 = ImageChops.offset(im, round(dx * n), 0), ImageChops.offset(am, round(dx * n), 0)
        blur = lambda m: m.resize((n // 40, n), Image.BILINEAR).resize((n, n), Image.BILINEAR)
        return blur(im2.point(lambda v: round(v * a))), blur(am2).point(lambda v: round(v * a))
    im, am = critter(0.105)
    for dx, a in ((0.16, 0.5), (0.32, 0.26)):
        gi, ga = smear(im, am, dx, a)
        sub = ImageChops.lighter(sub, gi)
        al = ImageChops.lighter(al, ga)
    sub = Image.composite(im, sub, am)
    al = ImageChops.lighter(al, am)
    d, ad = ImageDraw.Draw(sub), ImageDraw.Draw(al)
    for y0, x0, x1 in ((-0.14, 0.62, 0.90), (0.0, 0.66, 0.92), (0.14, 0.62, 0.88)):  # three tapered streaks
        for j in range(24):
            t = j / 24
            xa, xb = n * (x0 + (x1 - x0) * t), n * (x0 + (x1 - x0) * (t + 1 / 24))
            d.line((xa, cy + n * y0, xb, cy + n * y0), fill=(176, 160, 130), width=max(2, round(n * 0.012 * (1 - t))))
            ad.line((xa, cy + n * y0, xb, cy + n * y0), fill=round(190 * (1 - t)), width=max(2, round(n * 0.012 * (1 - t))))
    dust = Image.new("L", (n, n), 0)
    dd = ImageDraw.Draw(dust)
    for i in range(34):  # gritty low smear behind the feet
        x = n * (0.52 + 0.30 * r.random() ** 0.8)
        y = cy + n * (0.27 + 0.02 * r.uniform(-1, 1) - 0.05 * (x / n - 0.52))
        sz = n * r.uniform(0.008, 0.026)
        dd.ellipse((x - sz * 2.2, y - sz * 0.8, x + sz * 2.2, y + sz * 0.8), fill=r.randrange(90, 200))
    dust = ImageChops.multiply(dust.filter(ImageFilter.GaussianBlur(n * 0.006)), noise(n, 91, 60, 1.6).point(lambda v: 150 + v // 3)).point(lambda v: min(255, v * 2))
    sub = Image.composite(Image.new("RGB", (n, n), (150, 124, 92)), sub, dust)
    al = ImageChops.lighter(al, dust)
    d = None
    sub = sub.filter(ImageFilter.GaussianBlur(n * 0.002))
    al = al.filter(ImageFilter.GaussianBlur(n * 0.002))
    glow = (Image.new("RGB", (n, n), (70, 100, 136)), al.filter(ImageFilter.GaussianBlur(n * 0.025)).point(lambda v: v // 2))
    return finish(base, inner, sub, al, glow).resize((N, N), Image.LANCZOS)


MAKERS = {"cinder_spray": cinder_spray, "static_mote": static_mote, "quake": quake, "mist_veil": mist_veil,
          "kelp_whip": kelp_whip, "gust": gust, "bristle_stomp": bristle_stomp, "skitter": skitter}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    tpl = {}
    for slot in SLOTS:
        MAKERS[slot]().convert("RGB").save(os.path.join(out, f"{slot}.png"), "PNG")
        tpl[slot] = {"approved": f"{slot}.png", "reviewer": "", "date": "", "beats_shipped": False}
    with open(os.path.join(out, "approval-template.json"), "w") as f:
        json.dump(tpl, f, indent=2)
        f.write("\n")
    print(f"wrote {len(SLOTS)} icons to {out}")


if __name__ == "__main__":
    main()
