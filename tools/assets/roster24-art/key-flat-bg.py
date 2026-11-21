"""Keys a flat-colour backdrop (the roster24 matte plates: flat grey 128,128,128) out of a generated hero image into an RGBA cutout.
The backdrop is the part of the image that touches the border and stays within --tol of the backdrop colour; only a thin band along
the creature's edge gets a soft alpha (and the backdrop mixed into it is removed), so enclosed grey in the painting is kept.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/roster24-art/key-flat-bg.py IN.png OUT.png [--tol 14] [--soft 34] [--band 3]
Needs Pillow + numpy; deterministic. Then make-rig-source.py fits the cutout into the rig canvas."""
import argparse
from collections import deque

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--tol", type=int, default=14, help="max channel distance from the backdrop that is surely backdrop")
ap.add_argument("--soft", type=int, default=34, help="distance at which the edge band is fully opaque")
ap.add_argument("--band", type=int, default=3, help="width in px of the soft edge band")
a = ap.parse_args()

rgb = np.asarray(Image.open(a.src).convert("RGB")).astype(np.float32)
h, w, _ = rgb.shape
bgc = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
dist = np.abs(rgb - bgc).max(axis=2)
cand = dist <= a.tol
bg = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
            bg[ny, nx] = True; q.append((ny, nx))
# distance (in px) of each foreground pixel to the backdrop, up to band
near = np.zeros((h, w), bool)
cur = bg.copy()
for _ in range(a.band):
    n = cur.copy()
    n[1:] |= cur[:-1]; n[:-1] |= cur[1:]; n[:, 1:] |= cur[:, :-1]; n[:, :-1] |= cur[:, 1:]
    cur = n
near = cur & ~bg
t = np.clip((dist - a.tol) / max(a.soft - a.tol, 1), 0, 1)
alpha = np.where(bg, 0.0, np.where(near, t * t * (3 - 2 * t), 1.0))
# remove the backdrop colour mixed into the soft edge pixels
al = np.maximum(alpha, 0.05)[..., None]
un = np.where((near & (alpha < 1))[..., None], (rgb - (1 - al) * bgc) / al, rgb)
out = np.dstack([np.clip(un, 0, 255), alpha * 255]).round().astype(np.uint8)
Image.fromarray(out, "RGBA").save(a.out, optimize=True)
print(a.src, "->", a.out, f"backdrop {bgc.round().tolist()}, {int(bg.sum())} px keyed, {int(near.sum())} soft")
