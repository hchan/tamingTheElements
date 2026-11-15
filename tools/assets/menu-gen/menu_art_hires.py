#!/usr/bin/env python3
"""Hi-res grim re-master of the menu art (WP menu-art, 2026-11-14).

usage: python3 tools/assets/menu-gen/menu_art_hires.py <out dir>   (run from the repo root; numpy + Pillow only)

Writes beside the originals (keyart.webp and crest.png stay untouched):
  keyart-hires.webp     4800x2000 key art (2x the old 2400x1000): a dark storm sky, a cold dim moon halo, layered fog ridges, ground fog,
                        sparse embers, and the three heroes Pax, Sindarosa and Curomo.
  keyart-hires-lo.webp  the same art at 2400x1000 for the Phaser loading screen (a WebGL texture; phones cap at 4096).
  crest-hires.png       1024 px element crest: tarnished-iron ring, dim element lights, no rainbow.

Why the heroes are re-sourced: the old key art cut them from the 240 px baked sheet frames (about 200 px of painting each, blown up 3x). This
uses the 400 px painted legacy portraits (public/assets/img/map/<hero>Large.png, the owner's own art, the same source the rigs are cut from),
which carry about twice the detail, and masters them like this (no model is available offline; nothing is downloaded):
  1. alpha-bled Lanczos upscale (no dark fringe at the matte edge), 3.2x to 3.8x;
  2. a median "paint" pass flattens the interpolation mush into brush-sized planes, then unsharp-masked edges (edge-preserving sharpen);
  3. a high-pass of the original pixels is re-added as fine detail, plus stretched brush-stroke noise and canvas weave, modulated by local
     luminance so the lit planes get texture and the shadows stay deep;
  4. grim grade: saturation cut to about 55 percent, cool teal shadows, S-curve, gamma darkening, a cold rim light on the lit edge and an
     ember under-glow, then a contact shadow and fog laid over the feet.
Deterministic (fixed seeds). The generated art is original to this repository; the heroes are the owner's legacy paintings, regraded.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
W, H = 4800, 2000
RNG = np.random.default_rng(20261114)


def noise(w, h, cell, octaves=4, stretch=(1, 1)):
    """Fractal value noise 0..1; stretch=(sx, sy) elongates the features (brush strokes)."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cx, cy = max(2, (cell * stretch[0]) >> o), max(2, (cell * stretch[1]) >> o)
        small = RNG.random((h // cy + 2, w // cx + 2)).astype(np.float32)
        im = Image.fromarray((small * 255).astype(np.uint8)).resize((w + cx * 2, h + cy * 2), Image.BICUBIC)
        out += amp * np.asarray(im, np.float32)[:h, :w] / 255
        tot += amp
        amp *= 0.5
    return out / tot


def blur(a, r):
    """Gaussian blur of a float (h, w) array via a 16-bit-safe PIL round trip."""
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def lerp3(t, stops):
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / (p1 - p0))[..., None]
        out = np.where(m[..., None], np.array(c0, np.float32) * (1 - k) + np.array(c1, np.float32) * k, out)
    return out


def sky():
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
    xs = np.linspace(-1, 1, W, dtype=np.float32)[None, :] * np.ones((H, 1), np.float32)
    clouds = noise(W, H, 700, 5, (2, 1))
    t = np.clip(ys + (clouds - 0.5) * 0.35, 0, 1)
    img = lerp3(t, [(0, (10, 12, 20)), (0.4, (26, 30, 44)), (0.7, (52, 52, 64)), (0.85, (70, 62, 66)), (1, (36, 30, 34))])
    # a cold, dim moon halo behind the middle hero, veiled by cloud
    d = np.sqrt((xs * 1.5) ** 2 + ((ys - 0.34) * 1.7) ** 2)
    halo = np.clip(1 - d / 0.62, 0, 1) ** 2.4 * (0.55 + 0.9 * clouds)
    img += halo[..., None] * np.array([118, 130, 150], np.float32) * 0.8
    core = np.clip(1 - d / 0.11, 0, 1) ** 1.5
    img += core[..., None] * np.array([150, 158, 168], np.float32) * 0.35
    # faint low ember glow on the horizon, left and right
    for cx, col in ((-0.75, (120, 52, 28)), (0.8, (40, 70, 90))):
        e = np.clip(1 - np.sqrt(((xs - cx) * 1.2) ** 2 + ((ys - 0.9) * 2.2) ** 2) / 0.7, 0, 1) ** 2
        img += e[..., None] * np.array(col, np.float32) * 0.8
    return img


def ridges(img):
    xs = np.linspace(0, 1, W, dtype=np.float32)
    yy = np.arange(H, dtype=np.float32)[:, None]
    layers = [(0.62, (40, 44, 58), 0.6), (0.72, (28, 32, 44), 0.45), (0.83, (16, 18, 26), 0.25)]
    for base, col, haze in layers:
        prof = np.zeros(W, np.float32)
        for f, a in ((3, 0.05), (7, 0.028), (17, 0.014), (41, 0.007), (97, 0.003)):
            prof += a * np.sin(xs * f * math.tau + RNG.random() * 6.28)
        edge = (base + prof) * H
        mask = np.clip((yy - edge[None, :]) / 5.0, 0, 1)
        shade = np.array(col, np.float32) * (0.7 + 0.6 * noise(W, H, 180, 4)[..., None])
        mist = np.clip(1 - (yy - edge[None, :]) / 420, 0, 1)[..., None] * haze
        shade = shade * (1 - mist * 0.5) + np.array([88, 92, 104], np.float32) * mist * 0.5
        img = img * (1 - mask[..., None]) + shade * mask[..., None]
    return img


def alpha_bleed_resize(im, size):
    """Lanczos resize of RGBA without dark/white fringes: resize premultiplied colour and alpha separately."""
    a = np.asarray(im, np.float32)
    al = a[..., 3:4] / 255
    pm = Image.fromarray(np.clip(a[..., :3] * al, 0, 255).astype(np.uint8))
    pm = np.asarray(pm.resize(size, Image.LANCZOS), np.float32)
    al2 = np.asarray(im.getchannel('A').resize(size, Image.LANCZOS), np.float32)[..., None] / 255
    rgb = pm / np.maximum(al2, 1e-3)
    return np.clip(rgb, 0, 255), al2[..., 0]


def master(name, height, flip):
    """The painted portrait, mastered large and grim: returns (rgb float (h,w,3) 0..255, alpha float (h,w) 0..1)."""
    src = Image.open(ROOT / 'public/assets/img/map' / f'{name}Large.png').convert('RGBA')
    bb = src.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    src = src.crop(bb)
    if flip:
        src = src.transpose(Image.FLIP_LEFT_RIGHT)
    size = (round(src.width * height / src.height), height)
    rgb, al = alpha_bleed_resize(src, size)
    w, h = size
    base = Image.fromarray(rgb.astype(np.uint8))
    # (2) paint pass: median planes, edge-preserving sharpen
    paint = base.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.UnsharpMask(radius=4, percent=110, threshold=3))
    paint = np.asarray(paint, np.float32)
    # (3) fine detail: high-pass of the (sharply upscaled) painting, brush-stroke noise, canvas weave
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    hp = lum - np.asarray(Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32)
    lum_n = np.clip(lum / 255, 0, 1)
    strokes = noise(w, h, 26, 4, (3, 1)) - 0.5  # horizontal-ish strokes
    strokes2 = noise(w, h, 22, 4, (1, 3)) - 0.5
    weave = (np.sin(np.arange(w, dtype=np.float32) * 0.9)[None, :] * np.sin(np.arange(h, dtype=np.float32) * 0.9)[:, None]) * 0.5
    detail = hp * 0.6 + (strokes + strokes2) * 30 * (0.35 + lum_n) + weave * 5
    out = paint * 0.5 + rgb * 0.5 + detail[..., None]
    # (4) grim grade
    g = out @ np.array([0.299, 0.587, 0.114], np.float32)
    out = g[..., None] + (out - g[..., None]) * 0.58
    k = np.clip(g / 255, 0, 1)[..., None]
    out = out * (0.85 + 0.15 * k) + np.array([-6, 6, 12], np.float32) * (1 - k)  # cool teal in the shadows
    out = np.clip(out / 255, 0, 1)
    out = out * out * (3 - 2 * out) * 0.6 + out * 0.4  # S-curve
    out = out ** 1.28 * 235
    return out, al


def place(canvas, name, cx, base_y, height, flip, glow_col):
    rgb, al = master(name, height, flip)
    h, w = al.shape
    x0, y0 = cx - w // 2, base_y - h
    # light from the upper left: a cold rim on the left-up edge, an ember under-glow from below
    am = Image.fromarray((al * 255).astype(np.uint8))
    inner = np.asarray(am.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    rim = np.clip(al - inner, 0, 1)
    shifted = np.roll(np.roll(inner, 14, axis=1), 14, axis=0)
    lit = np.clip(al - shifted, 0, 1) * rim
    rgb = rgb + lit[..., None] * np.array([120, 150, 175], np.float32) * 0.7
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    rgb = rgb + (ys ** 3) * np.array(glow_col, np.float32) * 0.35 * al[..., None]
    # a dark vignette across the lower body so the feet sink into the fog
    rgb = rgb * (1 - 0.35 * ys ** 4)
    # contact shadow
    sh = Image.new('L', (w + 200, 260), 0)
    ImageDraw.Draw(sh).ellipse((60, 70, w + 140, 200), fill=190)
    sh = np.asarray(sh.filter(ImageFilter.GaussianBlur(40)), np.float32) / 255
    sx0, sy0 = x0 - 100, base_y - 150
    reg = canvas[sy0:sy0 + 260, sx0:sx0 + w + 200]
    reg *= (1 - sh[..., None] * 0.85)
    # soft backlight halo (cold) behind the silhouette
    pad = 200
    big = Image.new('L', (w + 2 * pad, h + 2 * pad), 0)
    big.paste(am, (pad, pad))
    halo = np.asarray(big.filter(ImageFilter.GaussianBlur(60)), np.float32) / 255
    hx0, hy0 = max(x0 - pad, 0), max(y0 - pad, 0)
    hx1, hy1 = min(x0 + w + pad, W), min(y0 + h + pad, H)
    sub = halo[hy0 - (y0 - pad):hy1 - (y0 - pad), hx0 - (x0 - pad):hx1 - (x0 - pad)]
    canvas[hy0:hy1, hx0:hx1] += sub[..., None] * np.array([34, 42, 56], np.float32) * 0.9
    r1 = canvas[y0:y0 + h, x0:x0 + w]
    r1[:] = r1 * (1 - al[..., None]) + rgb * al[..., None]


def fog_and_embers(canvas):
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    f = noise(W, H, 520, 5, (3, 1))
    band = np.clip(1 - np.abs(ys - 0.86) / 0.2, 0, 1) ** 1.6
    canvas += (band * f * 70)[..., None] * np.array([0.78, 0.86, 1.0], np.float32)
    f2 = noise(W, H, 300, 4, (4, 1))
    band2 = np.clip(1 - np.abs(ys - 0.5) / 0.22, 0, 1) ** 2
    canvas += (band2 * np.clip(f2 - 0.45, 0, 1) * 90)[..., None] * np.array([0.7, 0.78, 0.9], np.float32)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(150):
        x, y, r = int(RNG.integers(0, W)), int(RNG.integers(300, 1850)), int(RNG.choice([2, 3, 4, 5]))
        warm = RNG.random() < 0.7
        col = (255, 150, 70) if warm else (170, 200, 230)
        d.ellipse((x - r, y - r, x + r, y + r), fill=col + (int(RNG.integers(90, 200)),))
    layer = Image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(9)), layer.filter(ImageFilter.GaussianBlur(1.4)))
    la = np.asarray(layer, np.float32)
    canvas[:] = canvas * (1 - la[..., 3:4] / 255 * 0.8) + la[..., :3] * la[..., 3:4] / 255 * 0.8


def finish(canvas):
    a = canvas
    # canvas mottle and brush grain, a heavy corner vignette, settle toward the page colour at the foot
    a *= 0.88 + 0.24 * noise(W, H, 60, 4)[..., None]
    a += (RNG.random((H, W, 1)).astype(np.float32) - 0.5) * 20
    yy = np.linspace(-1, 1, H, dtype=np.float32)[:, None]
    xx = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    vig = 1 - 0.55 * np.clip((xx ** 2 * 0.7 + yy ** 2 * 0.6) - 0.25, 0, 1)
    a *= vig[..., None]
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    a *= 0.5 + 0.5 * np.clip(1.3 - t * 0.9, 0, 1)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def crest(out):
    """1024 px crest: tarnished iron ring with a bevel and rivet marks, four dim element lights, a pale four-point star."""
    S, K = 1024, 3
    n = S * K
    c = n / 2
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    ang = np.arctan2(yy - c, xx - c)
    inner, outer = n * 0.38, n * 0.475
    mid = (inner + outer) / 2
    bevel = np.clip(1 - np.abs(r - mid) / ((outer - inner) / 2), 0, 1)
    pit = noise(n, n, 90, 5)
    light = 0.5 + 0.5 * np.cos(ang + 2.4)  # lit from the upper left
    metal = 34 + 78 * bevel ** 0.8 * (0.55 + 0.6 * light) + 46 * (pit - 0.5)
    ring = np.stack([metal * 0.9, metal * 0.95, metal * 1.08], -1)
    ring += (np.abs(np.sin(ang * 12)) ** 40 * bevel)[..., None] * np.array([50, 56, 66], np.float32)  # 12 shallow flutes
    m = np.clip(np.minimum(r - inner, outer - r) / (K * 1.5), 0, 1)
    disc = np.clip((inner - r) / (K * 2), 0, 1) * 0.72
    rgb = np.where((r < inner)[..., None], np.array([16, 18, 26], np.float32) + (pit[..., None] - 0.5) * 14, ring)
    a = np.maximum(m, disc)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
    lights = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lights)
    for i, col in enumerate(((190, 86, 44), (58, 118, 160), (84, 132, 70), (178, 190, 204))):
        t = i * math.tau / 4 - math.pi / 2
        cx, cy, q = c + math.cos(t) * n * 0.2, c + math.sin(t) * n * 0.2, n * 0.07
        ld.ellipse((cx - q, cy - q, cx + q, cy + q), fill=col + (235,))
    lights = Image.alpha_composite(lights.filter(ImageFilter.GaussianBlur(n * 0.035)), lights.filter(ImageFilter.GaussianBlur(n * 0.006)))
    im = Image.alpha_composite(im, lights)
    star = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    sd = ImageDraw.Draw(star)
    L, w = n * 0.16, n * 0.01
    for sx, sy in ((1, 0), (0, 1)):
        sd.polygon([(c - sx * L, c - sy * L), (c + sy * w, c - sx * w), (c + sx * L, c + sy * L), (c - sy * w, c + sx * w)], fill=(214, 220, 228, 235))
    im = Image.alpha_composite(im, Image.alpha_composite(star.filter(ImageFilter.GaussianBlur(n * 0.01)), star))
    halo = Image.new('RGBA', (n, n), (150, 165, 190, 0))
    halo.putalpha(im.getchannel('A').filter(ImageFilter.GaussianBlur(n * 0.04)).point(lambda v: int(v * 0.35)))
    Image.alpha_composite(halo, im).resize((S, S), Image.LANCZOS).save(out / 'crest-hires.png', optimize=True)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    canvas = ridges(sky()).astype(np.float32)
    canvas = np.pad(canvas, ((0, 0), (0, 0), (0, 0)))
    for name, cx, hgt, flip, glow in (
        ('pax', 1120, 1280, False, (200, 110, 50)),
        ('curomo', 3660, 1420, True, (60, 110, 150)),
        ('sindarosa', 2400, 1560, False, (200, 70, 40)),
    ):
        place(canvas, name, cx, 1860, hgt, flip, glow)
    fog_and_embers(canvas)
    img = finish(canvas)
    img.save(out / 'keyart-hires.webp', quality=84, method=6)
    img.resize((2400, 1000), Image.LANCZOS).save(out / 'keyart-hires-lo.webp', quality=84, method=6)
    crest(out)


if __name__ == '__main__':
    main()
