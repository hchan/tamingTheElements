# Provenance copy (2026-11-26) of the art session generator, unchanged below. It wrote the approved file in tools/assets/fx-gen/provenance/hyalia-fx;
# its SHIP path points at the art session checkout of public/assets/img/fx/ (sizing reference only).
"""Hyalia stingingFilament v3: one thick S-curved whip with barbed hook tip and strike flare."""
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

def whip(n, seed):
    r = random.Random(seed); N = n * S
    base = (95, 143, 134); core = (150, 205, 196)
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    flip = r.choice([1, -1]); amp = r.uniform(.12, .2) * flip
    bx, by = N * r.uniform(.17, .22), N * r.uniform(.74, .8)
    tx, ty = N * r.uniform(.68, .74), N * r.uniform(.2, .28)
    ang = math.atan2(ty - by, tx - bx); L = math.hypot(tx - bx, ty - by)
    nx, ny = -math.sin(ang), math.cos(ang)
    def spine(t, a=amp, ph=0.0):
        off = math.sin(t * 2 * math.pi + ph) * a * L * (1 - .25 * t)
        return (bx + (tx - bx) * t + nx * off, by + (ty - by) * t + ny * off)
    T = 40
    pts = [spine(i / T) for i in range(T + 1)]
    (x1, y1), (x0, y0) = pts[-1], pts[-6]; ta = math.atan2(y1 - y0, x1 - x0)
    hs = -flip; hk = []
    for i in range(1, 9):
        t = i / 8; a2 = ta + hs * t * 1.5
        hk.append((x1 + math.cos(a2) * S * 9 * t, y1 + math.sin(a2) * S * 9 * t))
    full = pts + hk
    s2 = [spine(i / 30 * .8, amp * .8, 1.4) for i in range(31)]
    s2 = [(x + nx * S * 5 * flip, y + ny * S * 5 * flip) for x, y in s2]
    lay = Image.new("RGBA", (N, N), (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    taper(ld, s2, 4.2 * S, .8 * S, base + (130,), .9)
    im = Image.alpha_composite(im, lay); d = ImageDraw.Draw(im)
    taper(d, full, 12.5 * S, 2.2 * S, base + (240,), .8)
    d.ellipse([bx - 6.2 * S, by - 6.2 * S, bx + 6.2 * S, by + 6.2 * S], fill=base + (240,))
    taper(d, full, 7 * S, .6 * S, (118, 172, 163, 235), .9)
    taper(d, full[:-3], 2.6 * S, .5 * S, core + (240,), .9)
    L2 = len(full)
    sh = [(x + nx * S * 4 * flip * (1 - i / L2), y + ny * S * 4 * flip * (1 - i / L2)) for i, (x, y) in enumerate(full)]
    taper(d, sh[:int(L2 * .7)], 2.5 * S, .6 * S, (66, 106, 100, 110), 1.0)
    for k, back in enumerate((-12, -7)):
        (xa, ya), (xb, yb) = full[back - 2], full[back]; a = math.atan2(yb - ya, xb - xa)
        for sg in ((1, -1) if k == 0 else (hs,)):
            bl = S * r.uniform(5, 7); ba = a + sg * r.uniform(2.4, 2.8)
            d.line([(xb, yb), (xb + math.cos(ba) * bl, yb + math.sin(ba) * bl)], fill=base + (240,), width=int(S * 2.2))
    fx, fy = full[-1]
    gl = Image.new("RGBA", (N, N), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
    gd.ellipse([fx - 5 * S, fy - 5 * S, fx + 5 * S, fy + 5 * S], fill=(120, 215, 210, 70))
    gl = gl.filter(ImageFilter.GaussianBlur(S * 1.5)); im = Image.alpha_composite(im, gl); d = ImageDraw.Draw(im)
    d.ellipse([fx - 2.6 * S, fy - 2.6 * S, fx + 2.6 * S, fy + 2.6 * S], fill=(176, 232, 228, 235))
    d.ellipse([fx - 1.5 * S, fy - 1.5 * S, fx + 1.5 * S, fy + 1.5 * S], fill=(238, 255, 250, 250))
    for _ in range(r.choice([4, 5, 6])):
        a = r.uniform(0, 6.283); dist = r.uniform(5, 8.5) * S; rr = r.uniform(.8, 1.7) * S
        px, py = fx + math.cos(a) * dist, fy + math.sin(a) * dist
        d.ellipse([px - rr, py - rr * 1.25, px + rr, py + rr * 1.25], fill=(170, 228, 224, 230))
    return finish(im, n, seed, disp=3)

if __name__ == "__main__":
    out = os.path.dirname(os.path.abspath(__file__)); res = {}
    for name, seed in (("a", 301), ("b", 7712), ("c", 90210)):
        im = whip(80, seed); im.save(f"{out}/stingingFilament_{name}.png"); res[name] = im
    cell = 320; ships = Image.open(SHIP + "stingingFilament.png").convert("RGBA")
    ims = [res["a"], res["b"], res["c"], ships]
    sheet = Image.new("RGBA", (cell * 4 + 50, cell + 20), (90, 90, 90, 255))
    for i, im in enumerate(ims):
        big = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
        sheet.alpha_composite(big, (10 + i * (cell + 10), 10))
    sheet.save(f"{out}/sheet.png")
