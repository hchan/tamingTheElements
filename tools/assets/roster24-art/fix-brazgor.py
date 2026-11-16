"""Remove the grey rubble patches from the OLD round-d Brazgor cutout (kept for the recipe record; the round-h lava bull
needs no fix). Run: ~/claudetmp/venv-cut/bin/python tools/assets/roster24-art/fix-brazgor.py IN.png OUT.png
Regions are in source pixels of the 1004x806-ish round-d cutout."""
import sys
import numpy as np, cv2
from PIL import Image
if len(sys.argv) != 3: sys.exit(__doc__)
src, dst = sys.argv[1:3]
im = np.array(Image.open(src).convert('RGBA')); a = im[..., 3].copy()
hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)
grey = (hsv[..., 1] < 120) & (hsv[..., 2] > 80)
reg = np.zeros(a.shape, bool); reg[770:822, 590:690] = 1; reg[570:745, 712:742] = 1
a[grey & reg] = 0
k = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lb, st, _ = cv2.connectedComponentsWithStats((k > 127).astype(np.uint8))
big = st[1:, 4].max(); keep = np.isin(lb, [i for i in range(1, n) if st[i, 4] > 0.05 * big])
im[..., 3] = np.where(keep, a, 0)
Image.fromarray(im).save(dst)
