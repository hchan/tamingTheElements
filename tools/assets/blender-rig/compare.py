"""Contact sheet + metrics: Blender bake vs the shipped portrait-rig bake of the same hero.

  python3 -I tools/assets/blender-rig/compare.py --hero pax --blender .scratch/blender-pax --out .scratch/blender-pax-compare [--dir E]

Rows: one per animation, Blender frames on the left, portrait-rig frames on the right (240 px frames shown at 120). A 1x strip
(80 px) puts both bakes beside Fiara and Treenoc (sheet row idle/E frame 0, walk/E frame 0). Writes sheet.png, strip1x.png, metrics.json.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

argv = sys.argv[1:]


def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d


HERO = arg('--hero', 'pax')
BL = arg('--blender')
OUT = arg('--out')
DIR = arg('--dir', 'E')
REF = f'imgWorkArea/sheets/{HERO}'
os.makedirs(OUT, exist_ok=True)
anim = json.load(open(f'tools/assets/portrait-rig/spec/{HERO}.anim.json'))
BG = (58, 62, 70, 255)


def load(p):
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None


def on_bg(im, s):
    bg = Image.new('RGBA', im.size, BG)
    bg.alpha_composite(im)
    return bg.resize((s, s), Image.LANCZOS)


def stats(im):
    a = np.array(im)[..., 3] > 20
    if not a.any():
        return None
    ys, xs = np.nonzero(a)
    return dict(x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min()), y1=int(ys.max()), area=int(a.sum()))


def halo(im):  # fraction of edge pixels (0 < alpha < 255) that are near-black or near-white, a crude fringe check
    a = np.array(im).astype(float)
    e = (a[..., 3] > 10) & (a[..., 3] < 245)
    if not e.any():
        return 0.0
    lum = a[..., :3].mean(-1)[e]
    return float(((lum < 25) | (lum > 235)).mean())


S = 120
acts = [k for k in anim if os.path.isdir(f'{BL}/frames/{k}/{DIR}')]
W = 2 * 6 * S + 120
sheet = Image.new('RGBA', (W, S * len(acts)), BG)
d = ImageDraw.Draw(sheet)
metrics = {}
for r, a in enumerate(acts):
    n = anim[a]['frames']
    bs, rs = [], []
    for f in range(n):
        b = load(f'{BL}/frames/{a}/{DIR}/{f:02d}.png')
        e = load(f'{REF}/{a}/{DIR}/{f:02d}.png')
        if b is not None:
            sheet.alpha_composite(on_bg(b, S), (f * S, r * S))
            bs.append(b)
        if e is not None:
            sheet.alpha_composite(on_bg(e, S), (6 * S + 120 + f * S, r * S))
            rs.append(e)
    d.text((6 * S + 4, r * S + 4), a, fill=(255, 255, 255, 255))
    m = {}
    for tag, L in (('blender', bs), ('portrait', rs)):
        st = [stats(x) for x in L]
        st = [s for s in st if s]
        if st:
            m[tag] = dict(frames=len(L), footY_std=round(float(np.std([s['y1'] for s in st])), 2),
                          areaMean=round(float(np.mean([s['area'] for s in st]))), halo=round(float(np.mean([halo(x) for x in L])), 3))
    metrics[a] = m
sheet.save(f'{OUT}/sheet.png')

# 1x strip: Blender, portrait-rig, Fiara, Treenoc, all at 80 px
strip = Image.new('RGBA', (80 * 8, 80 * 2), BG)
sp = json.load(open('src/game/assets/sheets.generated.json'))['sheets']


def sheet_frame(name, key, i):
    s = next(x for x in sp if x['sprite'] == name)
    im = Image.open(f'public/assets/{s["url"]}').convert('RGBA')
    x, y = next(r for r in s['rows'] if r['key'] == key)['frames'][i]
    fs = 80 if im.size[0] <= 2048 and name in ('fiara', 'treenoc') else 240
    return im.crop((x, y, x + fs, y + fs)).resize((80, 80), Image.LANCZOS)


for row, act in enumerate(('idle', 'walk')):
    tiles = []
    for f in (0, 1):
        b = load(f'{BL}/frames/{act}/{DIR}/{f:02d}.png')
        tiles.append(b.resize((80, 80), Image.LANCZOS) if b else None)
    for f in (0, 1):
        e = load(f'{REF}/{act}/{DIR}/{f:02d}.png')
        tiles.append(e.resize((80, 80), Image.LANCZOS) if e else None)
    for nm in ('fiara', 'treenoc'):
        for f in (0, 1):
            try:
                tiles.append(sheet_frame(nm, f'{act}/E', f))
            except Exception:
                tiles.append(None)
    for i, t in enumerate(tiles[:8]):
        if t:
            bg = Image.new('RGBA', (80, 80), BG)
            bg.alpha_composite(t)
            strip.alpha_composite(bg, (i * 80, row * 80))
strip.save(f'{OUT}/strip1x.png')
strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).save(f'{OUT}/strip1x_x3.png')
json.dump(metrics, open(f'{OUT}/metrics.json', 'w'), indent=1)
print(json.dumps(metrics))
