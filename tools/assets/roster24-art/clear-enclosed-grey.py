"""Clears enclosed pockets of the flat backdrop colour that key-flat-bg.py kept (grey seen through a coil or a gap between limbs).
A pocket = a connected run of still-opaque pixels within --tol of the backdrop (128,128,128) and at least --min px big; it is cut out
and its rim eased over --feather px so no grey halo is left. Usage: ~/claudetmp/venv-rig/bin/python -I
tools/assets/roster24-art/clear-enclosed-grey.py IN_KEYED.png OUT.png [--tol 22] [--min 300] [--feather 2]. Needs Pillow + numpy;
deterministic."""
import argparse
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--tol", type=int, default=22); ap.add_argument("--min", type=int, default=300); ap.add_argument("--feather", type=int, default=2)
a = ap.parse_args()
im = np.asarray(Image.open(a.src).convert("RGBA")).copy()
h, w, _ = im.shape
grey = (np.abs(im[:, :, :3].astype(np.int16) - 128).max(axis=2) <= a.tol) & (im[:, :, 3] > 200)
seen = np.zeros((h, w), bool)
kill = np.zeros((h, w), bool)
for sy, sx in zip(*np.nonzero(grey)):
    if seen[sy, sx]:
        continue
    comp = []
    q = deque([(sy, sx)]); seen[sy, sx] = True
    while q:
        y, x = q.popleft(); comp.append((y, x))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and grey[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True; q.append((yy, xx))
    if len(comp) >= a.min:
        for y, x in comp:
            kill[y, x] = True
print("pockets cleared:", int(kill.sum()), "px")
m = Image.fromarray((kill * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * a.feather + 1)).filter(ImageFilter.GaussianBlur(a.feather / 2))
keep = 1.0 - np.asarray(m).astype(np.float32) / 255.0
im[:, :, 3] = np.round(im[:, :, 3] * keep).astype(np.uint8)
Image.fromarray(im).save(a.out)
