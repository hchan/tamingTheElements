"""Make polygons of a cutout transparent (floor gaps between legs). Usage:
erase-polys.py IN OUT "x,y x,y x,y;x,y x,y x,y" [--ycut 0.97]
Coordinates are pixels of IN. Afterwards only the largest alpha blob is kept and the image is cropped to its bbox."""
import argparse
import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out"); ap.add_argument("polys")
ap.add_argument("--ycut", type=float, default=1.0)
a = ap.parse_args()
im = np.array(Image.open(a.src).convert("RGBA"))
h = im.shape[0]
al = im[:, :, 3].copy()
for poly in a.polys.split(";"):
    pts = np.array([[int(v) for v in p.split(",")] for p in poly.split()], np.int32)
    cv2.fillPoly(al, [pts], 0)
al[int(h * a.ycut):] = 0
n, lab, st, _ = cv2.connectedComponentsWithStats((al > 0).astype(np.uint8), connectivity=8)
al[lab != 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))] = 0
im[:, :, 3] = al
ys, xs = np.where(al > 0)
Image.fromarray(im).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).save(a.out)
print(a.out, xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
