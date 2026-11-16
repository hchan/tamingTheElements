"""Tidy a roster24 cutout: fill small transparent holes inside the body (colour inpainted) and/or drop the bottom strip.
Run: ~/claudetmp/venv-cut/bin/python tools/assets/roster24-art/tidy-cutout.py IN.png OUT.png [--fill 4000] [--cutbottom 0.08] [--cutx0 0 --cutx1 1]
--cutbottom removes that fraction of the height (ground strip/signature); --cutx0/--cutx1 limit the cut to a horizontal range
(fractions) so legs elsewhere are kept. Needs opencv-python-headless, numpy, Pillow."""
import argparse, cv2, numpy as np
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--fill", type=int, default=0); ap.add_argument("--cutbottom", type=float, default=0)
ap.add_argument("--cutx0", type=float, default=0); ap.add_argument("--cutx1", type=float, default=1)
a = ap.parse_args()
im = np.array(Image.open(a.src).convert("RGBA")); h, w = im.shape[:2]; al = im[..., 3]
if a.fill:
    n, lb, st, _ = cv2.connectedComponentsWithStats((al < 128).astype(np.uint8))
    holes = np.zeros((h, w), np.uint8)
    for k in range(1, n):
        x, y, bw, bh, ar = st[k]
        if ar < a.fill and x > 0 and y > 0 and x + bw < w and y + bh < h: holes[lb == k] = 255
    holes = cv2.dilate(holes, np.ones((5, 5), np.uint8))
    rgb = cv2.inpaint(cv2.cvtColor(im, cv2.COLOR_RGBA2BGR), holes, 5, cv2.INPAINT_TELEA)
    im[..., :3] = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB); im[..., 3] = np.maximum(al, holes)
if a.cutbottom:
    im[int(h * (1 - a.cutbottom)):, int(w * a.cutx0):int(w * a.cutx1), 3] = 0
ys, xs = np.where(im[..., 3] > 127)
Image.fromarray(im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(a.out)
