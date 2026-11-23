"""Clears enclosed flat-backdrop pockets (the grey seen through a tail loop, between legs, behind a neck) that key-flat-bg.py keeps on purpose.
Any connected region of opaque pixels within --tol of the backdrop grey and at least --min px large becomes transparent, with a 1 px soft edge.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/roster24-art/clear-grey-pockets.py MATTE.png CUTOUT.png OUT.png [--tol 16] [--min 400]
MATTE is the original flat-grey plate (to measure the grey), CUTOUT the key-flat-bg.py result. Needs Pillow + numpy + scipy-free (BFS); deterministic."""
import argparse
from collections import deque

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("matte"); ap.add_argument("cut"); ap.add_argument("out")
ap.add_argument("--tol", type=int, default=16); ap.add_argument("--min", type=int, default=400)
a = ap.parse_args()
rgb = np.asarray(Image.open(a.matte).convert("RGB")).astype(np.float32)
cut = np.asarray(Image.open(a.cut).convert("RGBA")).copy()
h, w, _ = rgb.shape
bgc = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
cand = (np.abs(rgb - bgc).max(axis=2) <= a.tol) & (cut[..., 3] > 0)
seen = np.zeros((h, w), bool)
kill = np.zeros((h, w), bool)
n = 0
for y0 in range(h):
    for x0 in range(w):
        if not cand[y0, x0] or seen[y0, x0]:
            continue
        comp = [(y0, x0)]; seen[y0, x0] = True; q = deque(comp)
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and cand[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx)); comp.append((yy, xx))
        if len(comp) >= a.min:
            n += 1
            for y, x in comp:
                kill[y, x] = True
# grow by 2 px so the grey halo against the creature goes too, then feather the edge
grown = kill.copy()
for _ in range(2):
    g = grown.copy()
    g[1:] |= grown[:-1]; g[:-1] |= grown[1:]; g[:, 1:] |= grown[:, :-1]; g[:, :-1] |= grown[:, 1:]
    grown = g
cut[grown, 3] = 0
Image.fromarray(cut).save(a.out, optimize=True)
print(f"{n} pockets cleared, {int(grown.sum())} px")
