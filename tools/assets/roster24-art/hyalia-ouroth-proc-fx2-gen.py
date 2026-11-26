# Provenance copy (2026-11-26) of the art session generator, unchanged below. It wrote the approved files in tools/assets/fx-gen/provenance/hyalia-fx and ouroth-fx;
# its SHIP path points at the art session checkout of public/assets/img/fx/ (sizing reference only).
"""Seeded painterly-procedural FX: Hyalia stingingFilament, bellPulse(+Loop), Ouroth scorchBreath.
Usage: ~/claudetmp/venv/bin/python -I gen.py [outdir]"""
import sys, math, random, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
S = 4
SHIP = "/Users/henry.chan/tamingTheElements/public/assets/img/fx/"

def vnoise(w, h, cell, rng):
    g = np.array([[rng.random() for _ in range(w // cell + 3)] for _ in range(h // cell + 3)], np.float32)
    im = Image.fromarray(g, "F").resize(((w // cell + 3) * cell, (h // cell + 3) * cell), Image.BICUBIC)
    return np.asarray(im)[:h, :w]

def periodic(rng, nh=4):
    ph = [(rng.uniform(0, 6.283), rng.uniform(.4, 1) / (k + 1)) for k in range(nh)]
    n = sum(a for _, a in ph)
    return lambda th, shift=0.0: sum(a * np.sin((k + 1) * th + p + (k + 1) * shift) for k, (p, a) in enumerate(ph)) / n

def taper(d, pts, w0, w1, col, ease=1.0):
    n = len(pts); L = []; R = []
    for i, (x, y) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy) or 1
        nx, ny = -dy / m, dx / m; t = i / (n - 1); w = (w0 + (w1 - w0) * t ** ease) / 2
        L.append((x + nx * w, y + ny * w)); R.append((x - nx * w, y - ny * w))
    d.polygon(L + R[::-1], fill=col)

def finish(im, n, seed, outline=(12, 22, 24), oa=.5, grain=.17, disp=4):
    rng = random.Random(seed); W, H = im.size
    a = np.asarray(im, np.float32).copy()
    # 1px (4 subpx) noise displacement
    dx = (vnoise(W, H, 20, rng) - .5) * 2 * disp; dy = (vnoise(W, H, 20, rng) - .5) * 2 * disp
    yy, xx = np.mgrid[0:H, 0:W]
    sx = np.clip((xx + dx).round().astype(int), 0, W - 1); sy = np.clip((yy + dy).round().astype(int), 0, H - 1)
    a = a[sy, sx]
    im = Image.fromarray(a.astype(np.uint8), "RGBA")
    # faint dark outline under shape
    al = im.getchannel("A"); dil = al.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    ol = Image.new("RGBA", im.size, outline + (0,)); ol.putalpha(dil.point(lambda v: int(v * oa)))
    im = Image.alpha_composite(ol, im)
    a = np.asarray(im, np.float32).copy()
    # grain: value noise multiplied on RGB + slight alpha speckle
    g = vnoise(W, H, 3, rng) * .6 + vnoise(W, H, 9, rng) * .4
    a[..., :3] *= (1 + (g - .5) * 2 * grain)[..., None]
    a[..., 3] *= (1 + (vnoise(W, H, 4, rng) - .5) * 2 * grain * .7)
    a = np.clip(a, 0, 255)
    # premultiplied blur then LANCZOS down
    pm = a.copy(); pm[..., :3] *= pm[..., 3:] / 255
    sg = S * .45; k = np.exp(-(np.arange(-8, 9) ** 2) / (2 * sg * sg)); k /= k.sum()
    def blur(c):
        p = np.pad(c, 8, mode="edge")
        p = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, p)
        return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, p)
    ch = [Image.fromarray(np.ascontiguousarray(blur(pm[..., i]).astype(np.float32)), "F").resize((int(W / S), int(H / S)), Image.LANCZOS) for i in range(4)]
    o = np.stack([np.asarray(c) for c in ch], -1)
    al = np.clip(o[..., 3], 0, 255); rgb = o[..., :3] / np.maximum(al[..., None], 1) * 255
    out = np.concatenate([np.clip(rgb, 0, 255), al[..., None]], -1)
    out[:2, :, 3] = 0; out[-2:, :, 3] = 0; out[:, :2, 3] = 0; out[:, -2:, 3] = 0   # 2px margin
    return Image.fromarray(out.round().astype(np.uint8), "RGBA")

# ---------------- stinging filament ----------------
def filament(n, seed):
    r = random.Random(seed); N = n * S; c = N / 2
    base = (95, 143, 134); core = tuple(min(255, int(v * 1.3)) for v in base)
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cnt = r.choice([6, 7]); a0 = r.uniform(0, 6.283)
    for k in range(cnt):
        a = a0 + 6.283 * k / cnt + r.uniform(-.45, .45)
        L = N * r.uniform(.27, .43) * (1 if k % 3 else .7); pts = []
        curl = r.uniform(-1, 1) * .5; f = r.uniform(1, 2.5); ph = r.uniform(0, 6)
        for s in range(17):
            t = s / 16; ang = a + curl * t + math.sin(t * f * 3 + ph) * .12
            x = c + math.cos(a) * L * t; y = c + math.sin(a) * L * t
            wob = math.sin(t * f * 3 + ph) * N * .03 * t
            pts.append((x - math.sin(a) * wob + math.cos(a) * curl * N * .02 * t * t * 4, y + math.cos(a) * wob + math.sin(a) * curl * N * .02 * t * t * 4))
        taper(d, pts, 3 * S, 1 * S, base + (225,), .9)
        taper(d, pts, 1.1 * S, .5 * S, core + (235,), .9)
        # barb at tip: tiny hook + elongated pale-cyan hot spot
        (x0, y0), (x1, y1) = pts[-2], pts[-1]; ta = math.atan2(y1 - y0, x1 - x0)
        for sgn in (1, -1) if r.random() < .6 else (1,):
            bl = S * r.uniform(2, 3); ba = ta + sgn * r.uniform(2.3, 2.7)
            d.line([(x1, y1), (x1 + math.cos(ba) * bl, y1 + math.sin(ba) * bl)], fill=base + (235,), width=int(S * .9))
        hx, hy = x1 - math.cos(ta) * S * .8, y1 - math.sin(ta) * S * .8
        d.line([(hx, hy), (x1 + math.cos(ta) * S * 1.2, y1 + math.sin(ta) * S * 1.2)], fill=(168, 226, 226, 235), width=int(S * 1.1))
    # small dim nucleus: irregular, not a glowing disc
    nuc = Image.new("RGBA", (N, N), (0, 0, 0, 0)); nd = ImageDraw.Draw(nuc)
    pts = [(c + math.cos(t) * S * r.uniform(2.6, 4.2), c + math.sin(t) * S * r.uniform(2.2, 3.6)) for t in np.linspace(0, 6.283, 11)[:-1]]
    nd.polygon(pts, fill=(62, 104, 100, 200)); nd.polygon([(c + (x - c) * .5, c + (y - c) * .5) for x, y in pts], fill=(88, 135, 128, 190))
    im = Image.alpha_composite(im, nuc)
    return finish(im, n, seed)

# ---------------- bell pulse ----------------
def ring_arr(N, rad, thick, alpha, nr, nt, shift):
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32); c = N / 2
    dx, dy = xx - c, yy - c; dist = np.hypot(dx, dy); th = np.arctan2(dy, dx)
    r = rad * (1 + .09 * nr(th, shift)); t = thick * (1 + .35 * nt(th, shift))
    sd = dist - r  # <0 inside
    inner = np.clip(1 + sd / (t * 2.2), 0, 1) ** 1.6 * (sd <= 0)         # soft inner gradient
    outer = np.clip(1 - sd / (t * .55), 0, 1) ** 1.2 * (sd > 0)          # tight dark outer edge
    return inner, outer, alpha

def bell_img(n, rings, seed, loopshift=None, core_amp=1.0):
    rng = random.Random(seed); N = n * S
    nr = periodic(rng); nt = periodic(rng); nc = periodic(rng)
    rgb = np.zeros((N, N, 3), np.float32); al = np.zeros((N, N), np.float32)
    inl = np.array((176, 222, 210), np.float32); outc = np.array((38, 74, 78), np.float32)
    # core: dim translucent noisy glow
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32); c = N / 2
    dist = np.hypot(xx - c, yy - c); th = np.arctan2(yy - c, xx - c)
    cs = 0 if loopshift is None else loopshift
    cr = N * .16 * (1 + .18 * nc(th, cs * 2))
    ca = np.clip(1 - dist / cr, 0, 1) ** 1.5 * (.30 + .08 * math.sin(cs * 3 + 1)) * core_amp
    for rad, thick, alpha in rings:
        sh = 0 if loopshift is None else loopshift
        inner, outer, _ = ring_arr(N, rad * N, thick * N, alpha, nr, nt, sh)
        a_i = inner * min(1, alpha * 1.15); a_o = outer * alpha
        for a_k, col in ((a_i, inl), (a_o, outc)):
            na = al + a_k * (1 - al)
            rgb = (rgb * al[..., None] * (1 - a_k[..., None]) + col * a_k[..., None]) / np.maximum(na[..., None], 1e-4)
            al = na
    # core composite under rings
    na = al + ca * (1 - al); rgb = (rgb * al[..., None] + np.array((84, 134, 128)) * (ca * (1 - al))[..., None]) / np.maximum(na[..., None], 1e-4); al = na
    out = np.concatenate([rgb, (al * 255)[..., None]], -1)
    return finish(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA"), n, seed, grain=.17, disp=3)

def env(p):
    if p < .25: return .9 * p / .25
    if p < .75: return .9 - .2 * (p - .25) / .5
    return .7 * (1 - (p - .75) / .25)

def bell(n, seed, p0):
    rings = []
    for k in range(2):
        p = (p0 + k * .5) % 1
        rings.append((.14 + .28 * p, .06 - .025 * p, max(.55, env(p) + .15)))
    return bell_img(n, rings, seed)

def bell_loop(seed=7, n=160):
    fr = []
    for f in range(8):
        rings = []
        for k in range(2):
            p = (f / 8 + k * .5) % 1
            rings.append((.12 + .32 * p, .055 - .02 * p, env(p)))
        fr.append(bell_img(n, rings, seed, loopshift=6.283 * f / 8))
    strip = Image.new("RGBA", (n * 8, n), (0, 0, 0, 0))
    for f, im in enumerate(fr): strip.alpha_composite(im, (f * n, 0))
    return strip

# ---------------- scorch breath ----------------
def scorch(seed, W=80, H=60):
    r = random.Random(seed); w, h = W * S, H * S; cy = h / 2; x0 = 2 * S + 4; x1 = w - 2 * S - 4
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    def tongue(L, wid, ang, col, wob):
        pts = []
        for s in range(19):
            t = s / 18; x = x0 + (x1 - x0) * L * t
            y = cy + math.tan(ang) * (x - x0) * .9 + math.sin(t * 5 + wob) * h * .035 * t
            pts.append((x, y))
        d = ImageDraw.Draw(im); n = len(pts); Lp = []; Rp = []
        for i, (x, y) in enumerate(pts):
            t = i / (n - 1); ww = wid * math.sin(math.pi * min(1, t * .85 + .12) ) ** .8 * (1 - t * .55) * (.2 + t * .8 + .0)
            ww = wid * (math.sin(math.pi * t ** .75)) * (.35 + .65 * t) + 1.5
            Lp.append((x, y - ww / 2)); Rp.append((x, y + ww / 2))
        d.polygon(Lp + Rp[::-1], fill=col)
    # layers: dark red outer, orange mid, pale yellow core
    for _ in range(9): tongue(r.uniform(.8, 1), h * r.uniform(.28, .4), r.uniform(-.42, .42), (112, 28, 22, 215), r.uniform(0, 6))
    for _ in range(9): tongue(r.uniform(.6, .95), h * r.uniform(.2, .3), r.uniform(-.3, .3), (205, 84, 26, 225), r.uniform(0, 6))
    for _ in range(6): tongue(r.uniform(.4, .75), h * r.uniform(.1, .16), r.uniform(-.14, .14), (240, 190, 84, 235), r.uniform(0, 6))
    for _ in range(3): tongue(r.uniform(.2, .4), h * .08, r.uniform(-.06, .06), (250, 232, 150, 240), r.uniform(0, 6))
    d = ImageDraw.Draw(im)
    for _ in range(26):  # embers and sparks
        t = r.uniform(.45, 1); x = x0 + (x1 - x0) * t; y = cy + r.uniform(-1, 1) * h * (.1 + .38 * t)
        col = r.choice([(230, 110, 30, 235), (250, 190, 70, 235), (170, 50, 25, 220)])
        if r.random() < .4:
            a = r.uniform(-.7, .7); l = S * r.uniform(2, 3.5); d.line([(x, y), (x + math.cos(a) * l, y + math.sin(a) * l)], fill=col, width=int(S * .8))
        else:
            q = S * r.uniform(.5, 1.0); d.ellipse([x - q, y - q, x + q, y + q], fill=col)
    # clip inside margins, then finish with smouldering dark edge
    return finish(im, W, seed, outline=(46, 14, 10), oa=.8, grain=.18, disp=4) if W == H else finish_rect(im, seed)

def finish_rect(im, seed):
    global finish
    W, H = im.size
    sq = Image.new("RGBA", (W, W), (0, 0, 0, 0)); sq.paste(im, (0, (W - H) // 2))
    o = finish(sq, W // S, seed, outline=(46, 14, 10), oa=.8, grain=.18, disp=4)
    hh = H // S; top = (W // S - hh) // 2
    o = o.crop((0, top, W // S, top + hh)); a = np.asarray(o).copy()
    a[:2, :, 3] = 0; a[-2:, :, 3] = 0; a[:, :2, 3] = 0; a[:, -2:, 3] = 0
    return Image.fromarray(a, "RGBA")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)); os.makedirs(out, exist_ok=True)
    rows = []
    fa, fb = filament(80, 11), filament(80, 23)
    ba, bb = bell(80, 5, .30), bell(80, 9, .62)
    sa, sb = scorch(31), scorch(47)
    loop = bell_loop()
    names = {"stingingFilament": (fa, fb), "bellPulse": (ba, bb), "scorchBreath": (sa, sb)}
    for nm, (a, b) in names.items():
        a.save(f"{out}/{nm}_a.png"); b.save(f"{out}/{nm}_b.png")
        rows.append((nm, a, b))
    loop.save(f"{out}/bellPulseLoop.png")
    sh = Image.new("RGBA", (3 * 340 + 20, 3 * 340 + 100), (90, 90, 90, 255))
    for ri, (nm, a, b) in enumerate(rows):
        for ci, im in enumerate([a, b, Image.open(SHIP + nm + ".png").convert("RGBA")]):
            sh.alpha_composite(im.resize((im.width * 4, im.height * 4), Image.NEAREST), (10 + ci * 340, 10 + ri * 340))
    sh.alpha_composite(loop.resize((640, 80), Image.LANCZOS), (10, 3 * 340 + 10))
    sh.save(f"{out}/sheet.png")
    # verify
    for f in os.listdir(out):
        if f.endswith(".png") and f != "sheet.png":
            i = Image.open(f"{out}/{f}"); al = np.asarray(i)[..., 3]
            fw = i.width // (8 if "Loop" in f else 1)
            m = al[:2].max() | al[-2:].max() | al[:, :2].max() | al[:, -2:].max()
            print(f, i.size, i.mode, "alpha max", al.max(), "edge-margin max", m)
