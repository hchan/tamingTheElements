#!/usr/bin/env python3
"""Menu key art and crest (WP menu-deadband, 2026-11-13).

usage: python3 tools/assets/menu-gen/menu_art.py <out dir>   (writes keyart.webp, crest.png; run from the repo root)

keyart.webp: a mystic, luminous, painterly 2400x1000 backdrop: a bright dawn sky with god rays, layered misty ridges, a halo,
and the baked Pax, Sindarosa and Curomo (public/assets/img/sheets) as a rim-lit line-up, grain and mottle over everything.
crest.png: the element crest at 512 px (the old 80 px sign upscaled looked blurry): a prismatic ring (red, gold, green, blue)
with a soft halo and four hand-drawn sigils, supersampled 4x. Deterministic (fixed seeds). numpy + Pillow.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
W, H = 2400, 1000
RNG = np.random.default_rng(20261113)


def noise(w, h, cell, octaves=4):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(2, cell >> o)
        small = RNG.random((h // c + 2, w // c + 2)).astype(np.float32)
        im = Image.fromarray((small * 255).astype(np.uint8)).resize((w + c * 2, h + c * 2), Image.BICUBIC)
        out += amp * np.asarray(im, np.float32)[:h, :w] / 255
        tot += amp
        amp *= 0.5
    return out / tot


def lerp3(t, stops):
    """t (h,w) in 0..1 -> rgb array through colour stops [(pos, (r,g,b))]."""
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / (p1 - p0))[..., None]
        out = np.where(m[..., None], np.array(c0) * (1 - k) + np.array(c1) * k, out)
    return out


def sky():
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
    y = np.clip(y + (noise(W, H, 300, 3) - 0.5) * 0.12, 0, 1)
    img = lerp3(y, [(0, (46, 34, 104)), (0.35, (110, 78, 178)), (0.62, (236, 150, 150)), (0.8, (255, 214, 140)), (1, (255, 236, 190))])
    xs = np.linspace(-1, 1, W, dtype=np.float32)[None, :]
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    # halo behind the middle hero
    d = np.sqrt((xs * 1.6) ** 2 + ((ys - 0.52) * 1.5) ** 2)
    halo = np.clip(1 - d / 0.75, 0, 1) ** 2.2
    img += halo[..., None] * np.array([255, 226, 160], np.float32) * 0.75
    # god rays
    ang = np.arctan2(ys - 0.5, xs * 1.6 + 1e-4)
    rays = (np.sin(ang * 14 + noise(W, H, 200, 2) * 5) * 0.5 + 0.5) ** 3
    img += (rays * np.clip(1 - d / 1.4, 0, 1) * 55)[..., None] * np.array([1, 0.9, 0.7], np.float32)
    return np.clip(img, 0, 255)


def ridges(img):
    layers = [(0.58, (96, 82, 150), 0.55), (0.68, (74, 62, 128), 0.7), (0.8, (52, 44, 100), 0.85)]
    xs = np.linspace(0, 1, W, dtype=np.float32)
    for base, col, haze in layers:
        prof = np.zeros(W, np.float32)
        for f, a in ((3, 0.05), (7, 0.025), (17, 0.012), (41, 0.005)):
            prof += a * np.sin(xs * f * math.tau + RNG.random() * 6.28)
        edge = (base + prof) * H
        yy = np.arange(H, dtype=np.float32)[:, None]
        mask = np.clip((yy - edge[None, :]) / 3.0, 0, 1)
        shade = np.array(col, np.float32) * (0.8 + 0.4 * noise(W, H, 90, 3)[..., None])
        shade = shade * (1 - haze * 0.35) + np.array([255, 190, 170], np.float32) * haze * 0.35 * np.clip(1 - (yy - edge[None, :]) / 220, 0, 1)[..., None]
        img = img * (1 - mask[..., None]) + shade * mask[..., None]
    return img


def hero(name, x, height, flip=False):
    s = Image.open(ROOT / 'public/assets/img/sheets' / f'{name}.png').convert('RGBA')
    f = s.crop((1920, 0, 2160, 240))  # idle/S
    bb = f.getbbox()
    f = f.crop(bb)
    f.putalpha(f.getchannel('A').point(lambda v: 0 if v < 60 else min(255, (v - 60) * 255 // 195)))  # drop the baked ground shadow box
    sc = height / f.height
    f = f.resize((round(f.width * sc), height), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.9))
    if flip:
        f = ImageOps_mirror(f)
    return f, x


def ImageOps_mirror(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def paint(base):
    base = base.convert('RGBA')
    comp = base
    for name, cx, hgt, flip in (('pax', 560, 640, False), ('sindarosa', 1200, 760, False), ('curomo', 1830, 700, True)):
        f, _ = hero(name, cx, hgt, flip)
        px, py = cx - f.width // 2, 930 - f.height
        a = f.getchannel('A')
        # warm rim light: brighten the alpha-edge band, a cool fill, then a soft glow behind
        edge = ImageChops.subtract(a, a.filter(ImageFilter.GaussianBlur(4))).point(lambda v: min(150, v * 2))
        rim = Image.new('RGBA', f.size, (255, 236, 200, 0))
        rim.putalpha(edge)
        lit = f.copy()
        lit = Image.blend(lit, Image.new('RGBA', f.size, (150, 120, 210, 255)), 0.12)
        lit.putalpha(a)
        glow = Image.new('RGBA', f.size, (255, 214, 150, 0))
        glow.putalpha(a.filter(ImageFilter.GaussianBlur(26)).point(lambda v: int(v * 0.55)))
        sh = Image.new('RGBA', (f.width, 70), (20, 12, 50, 0))
        ImageDraw.Draw(sh).ellipse((10, 10, f.width - 10, 60), fill=(20, 12, 50, 150))
        sh = sh.filter(ImageFilter.GaussianBlur(14))
        comp.alpha_composite(sh, (px, 905))
        comp.alpha_composite(glow, (px, py))
        comp.alpha_composite(lit, (px, py))
        comp.alpha_composite(rim, (px, py))
    return comp


def motes(comp):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(170):
        x, y, r = RNG.integers(0, W), RNG.integers(80, 900), RNG.choice([2, 3, 4, 6])
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 236, 190, int(RNG.integers(110, 230))))
    layer = Image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(7)), layer.filter(ImageFilter.GaussianBlur(1.2)))
    comp.alpha_composite(layer)
    return comp


def finish(img):
    a = np.asarray(img.convert('RGB'), np.float32)
    mott = noise(W, H, 40, 3)[..., None]
    a = a * (0.9 + 0.2 * mott)  # canvas-like mottle
    a += (RNG.random((H, W, 1)).astype(np.float32) - 0.5) * 16  # grain
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    a = a * (0.55 + 0.45 * np.clip(1.25 - yy * 0.9, 0, 1))  # settle toward the bottom edge so the page blends in
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def crest(out):
    S, K = 512, 4
    n = S * K
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    c = n / 2
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    th = (np.arctan2(yy - c, xx - c) / math.tau + 0.25) % 1.0
    ring = lerp3(th, [(0, (255, 120, 90)), (0.25, (255, 214, 110)), (0.5, (120, 220, 130)), (0.75, (110, 170, 255)), (1.0, (255, 120, 90))])
    inner, outer = n * 0.40, n * 0.47
    m = np.clip(np.minimum(r - inner, outer - r) / (K * 1.5), 0, 1)
    bevel = np.clip(1 - np.abs(r - (inner + outer) / 2) / ((outer - inner) / 2), 0, 1)
    rgb = np.clip(ring * (0.75 + 0.5 * bevel[..., None]), 0, 255)
    disc = np.clip((inner - r) / (K * 2), 0, 1) * 0.55
    a = np.maximum(m, disc)
    rgb = np.where((r < inner)[..., None], np.array([60, 44, 120], np.float32), rgb)
    arr = np.dstack([rgb, a * 255]).astype(np.uint8)
    im = Image.fromarray(arr, 'RGBA')
    d = ImageDraw.Draw(im)

    lights = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lights)
    for i, col in enumerate(((255, 140, 70), (90, 190, 255), (120, 210, 100), (225, 240, 255))):
        ang = i * math.tau / 4 - math.pi / 2
        cx, cy, q = c + math.cos(ang) * n * 0.2, c + math.sin(ang) * n * 0.2, n * 0.085
        ld.ellipse((cx - q, cy - q, cx + q, cy + q), fill=col + (230,))
    lights = lights.filter(ImageFilter.GaussianBlur(n * 0.03))
    im = Image.alpha_composite(im, lights)
    star = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    sd = ImageDraw.Draw(star)
    for k in (0, 1):
        L, w = n * (0.17 if k == 0 else 0.11), n * 0.012
        for sx, sy in ((1, 0), (0, 1)) if k == 0 else ((0.7, 0.7), (0.7, -0.7)):
            sd.polygon([(c - sx * L, c - sy * L), (c + sy * w, c - sx * w), (c + sx * L, c + sy * L), (c - sy * w, c + sx * w)], fill=(255, 248, 225, 235))
    star = Image.alpha_composite(star.filter(ImageFilter.GaussianBlur(n * 0.012)), star)
    im = Image.alpha_composite(im, star)
    glow = im.filter(ImageFilter.GaussianBlur(n * 0.025))
    halo = Image.new('RGBA', (n, n), (255, 220, 150, 0))
    halo.putalpha(im.getchannel('A').filter(ImageFilter.GaussianBlur(n * 0.05)).point(lambda v: int(v * 0.6)))
    outim = Image.alpha_composite(Image.alpha_composite(halo, glow), im).resize((S, S), Image.LANCZOS)
    outim.save(out / 'crest.png', optimize=True)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(ridges(sky()).astype(np.uint8))
    img = motes(paint(img))
    finish(img).save(out / 'keyart.webp', quality=82, method=6)
    crest(out)


if __name__ == '__main__':
    main()
