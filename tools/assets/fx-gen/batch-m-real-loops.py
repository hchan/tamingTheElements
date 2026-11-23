"""Real looping bodies for four roster24 projectile abilities, cut from approved AI stills (CPU only, no generation).

Writes the 8-frame strips public/assets/img/fx/loop/{boulderRoll,sporeBurst,cinderSpray,stingingFilament}Loop.png
(frame 160x160, strip 1280x160: the size the manifest rows and projectile-view.ts already expect) from the stills in
tools/assets/fx-gen/provenance/real-loop-sources/, by deterministic transforms (no randomness):
  boulderRoll      the rock cut out with a hand polygon, rolled 45 degrees per frame about its centre
  sporeBurst       the pod cluster cut with a feathered disc, pulsing in scale and brightness
  cinderSpray      the ember ring, black keyed to alpha, two copies swelling outwards and fading (seamless phase loop)
  stingingFilament a strip of the filament texture, slid along its length (ping-pong) with a brightness shimmer
Black backgrounds are keyed by luminance with the colour un-premultiplied (no dark halo); resizing runs in premultiplied space.
Writes tools/assets/fx-gen/provenance/real-loops.json (source and output sha256), which tests/repo/real-loops.test.ts pins.
Art is AI-generated in this project and approved earlier by the art-director; no third-party licence.

Run: ~/claudetmp/venv/bin/python -I tools/assets/fx-gen/batch-m-real-loops.py
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'tools/assets/fx-gen/provenance/real-loop-sources'
OUT = ROOT / 'public/assets/img/fx/loop'
PROV = ROOT / 'tools/assets/fx-gen/provenance/real-loops.json'
F = 160  # frame size; frames are built at SS x and downsized
SS = 2
N = 8
STILLS = {
    'boulderRoll': 'boulder-r631.png',
    'sporeBurst': 'spore-r731.png',
    'cinderSpray': 'cinder-r692.png',
    'stingingFilament': 'r24-filament-41307.png',
}
ROCK = [(322, 110), (372, 128), (404, 145), (402, 185), (385, 235), (350, 285), (318, 318), (290, 345), (250, 372), (200, 395),
        (160, 402), (135, 385), (110, 330), (105, 290), (130, 255), (160, 215), (190, 185), (250, 150), (300, 125)]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def key_black(rgb, floor=4.0, gain=1.0):
    """Luminance key: alpha from the brightest channel, colour divided back out so edges carry no black."""
    a = np.asarray(rgb.convert('RGB'), dtype=np.float32)
    m = np.clip((a.max(axis=2) - floor) / (255.0 - floor) * gain, 0.0, 1.0)
    col = np.clip(a / np.maximum(m[..., None], 1e-3), 0, 255)
    col = np.where(m[..., None] > 0.004, col, 0)
    return np.dstack([col, m * 255.0])


def to_img(arr):
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def down(img):
    """Downsize a supersampled RGBA frame to F x F in premultiplied space (no halo)."""
    return img.convert('RGBa').resize((F, F), Image.LANCZOS).convert('RGBA')


def feather_disc(size, r, soft):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=255)
    return m.filter(ImageFilter.GaussianBlur(soft))


def boulder():
    im = Image.open(SRC / STILLS['boulderRoll']).convert('RGB')
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).polygon(ROCK, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.6))
    cx = sum(p[0] for p in ROCK) / len(ROCK)
    cy = sum(p[1] for p in ROCK) / len(ROCK)
    rad = max(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 for x, y in ROCK)
    side = int(rad * 2 + 8)
    x0, y0 = int(cx - side / 2), int(cy - side / 2)
    rgba = im.copy()
    rgba.putalpha(mask)
    tile = rgba.crop((x0, y0, x0 + side, y0 + side))
    frames = []
    for i in range(N):
        r = tile.convert('RGBa').rotate(-45 * i, Image.BICUBIC).convert('RGBA')
        big = r.resize((F * SS - 8, F * SS - 8), Image.LANCZOS)
        canvas = Image.new('RGBA', (F * SS, F * SS), (0, 0, 0, 0))
        canvas.alpha_composite(big, (4, 4))
        frames.append(down(canvas))
    return frames


def spore():
    im = Image.open(SRC / STILLS['sporeBurst']).convert('RGB')
    cx, cy, r = 262, 168, 120
    tile = im.crop((cx - r - 16, cy - r - 16, cx + r + 16, cy + r + 16))
    tile.putalpha(feather_disc(tile.size[0], r - 6, 9))
    scale = [90, 94, 98, 102, 106, 102, 98, 94]
    bright = [94, 98, 102, 106, 110, 106, 102, 98]
    frames = []
    for i in range(N):
        d = int(F * SS * 0.88 * scale[i] / 100)
        t = tile.resize((d, d), Image.LANCZOS)
        a = np.asarray(t.convert('RGBA'), dtype=np.float32).copy()
        a[..., :3] = np.clip(a[..., :3] * bright[i] / 100.0, 0, 255)
        canvas = Image.new('RGBA', (F * SS, F * SS), (0, 0, 0, 0))
        canvas.alpha_composite(to_img(a), ((F * SS - d) // 2, (F * SS - d) // 2))
        frames.append(down(canvas))
    return frames


def cinder():
    im = Image.open(SRC / STILLS['cinderSpray']).convert('RGB')
    ring = to_img(key_black(im, floor=5.0, gain=1.25))
    frames = []
    for i in range(N):
        canvas = np.zeros((F * SS, F * SS, 4), dtype=np.float32)
        for k in range(2):
            q = ((i / N) + k / 2.0) % 1.0
            s = 0.38 + 0.62 * q
            alpha = min(1.0, q * 5.0) * (1.0 - q) ** 0.8 * 1.15
            d = max(2, int(F * SS * 0.98 * s))
            a = np.asarray(ring.resize((d, d), Image.LANCZOS), dtype=np.float32)
            o = (F * SS - d) // 2
            sl = canvas[o:o + d, o:o + d]
            ca = a[..., 3] / 255.0 * min(1.0, alpha)
            # keep the brighter copy's colour, union the alpha
            sl[..., :3] = np.where(ca[..., None] > sl[..., 3:4] / 255.0, a[..., :3], sl[..., :3])
            sl[..., 3] = 255.0 * (1 - (1 - sl[..., 3] / 255.0) * (1 - ca))
        frames.append(down(to_img(canvas)))
    return frames


def filament():
    im = Image.open(SRC / STILLS['stingingFilament']).convert('RGB')
    cw, ch, y0 = 640, 240, 300
    shift = [0, 70, 140, 210, 280, 210, 140, 70]  # ping-pong along the length: a seamless loop
    shimmer = [96, 102, 108, 112, 108, 102, 96, 92]
    W = F * SS
    tx = np.minimum(1.0, np.minimum(np.arange(W), np.arange(W)[::-1]) / (W * 0.14))
    frames = []
    for i in range(N):
        h = W * ch // cw
        crop = im.crop((shift[i], y0, shift[i] + cw, y0 + ch)).resize((W, h), Image.LANCZOS)
        a = np.asarray(crop, dtype=np.float32)
        lum = np.clip(a.max(axis=2) / 255.0, 0.0, 1.0)
        lum = np.clip(lum / max(float(np.percentile(lum, 97)), 1e-3), 0.0, 1.0)  # texture detail modulates a continuous band
        prof = np.cos(np.linspace(-1.0, 1.0, h) * 1.5707963) ** 3.0
        k = np.zeros((h, W, 4), dtype=np.float32)
        k[..., 3] = 255.0 * np.clip(prof[:, None] * (0.35 + 0.65 * lum) * 1.5, 0.0, 1.0) * tx[None, :]
        base = np.array([150.0, 185.0, 255.0]) * (0.6 + 0.4 * lum[..., None])
        k[..., :3] = np.clip(base * shimmer[i] / 100.0, 0, 255)
        canvas = np.zeros((W, W, 4), dtype=np.float32)
        o = (W - h) // 2
        canvas[o:o + h] = k
        frames.append(down(to_img(canvas)))
    return frames


MAKERS = {'boulderRoll': boulder, 'sporeBurst': spore, 'cinderSpray': cinder, 'stingingFilament': filament}


def main():
    prov = {'note': 'AI-generated in-project stills, approved by the art-director; no third-party licence. CPU cut by batch-m-real-loops.py.', 'loops': {}}
    for name, make in MAKERS.items():
        frames = make()
        strip = Image.new('RGBA', (F * N, F), (0, 0, 0, 0))
        for i, fr in enumerate(frames):
            strip.paste(fr, (i * F, 0))
        out = OUT / f'{name}Loop.png'
        strip.save(out, optimize=True)
        prov['loops'][name] = {'source': f'tools/assets/fx-gen/provenance/real-loop-sources/{STILLS[name]}', 'sourceSha256': sha(SRC / STILLS[name]),
                               'output': f'public/assets/img/fx/loop/{name}Loop.png', 'outputSha256': sha(out), 'frames': N, 'frame': F,
                               'frameSha256': [hashlib.sha256(fr.tobytes()).hexdigest() for fr in frames]}
        print(out.relative_to(ROOT), strip.size)
    PROV.write_text(json.dumps(prov, indent=2) + '\n')


if __name__ == '__main__':
    main()
