"""Makes low-saturation light-grey pixels transparent inside one box (leaked backdrop in a body loop that clear-enclosed-grey.py could not
reach because it touches the body edge), then feathers the box edge 1 px. Used for ouroth (art-director REVISE, 2026-11-20).
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/roster24-art/key-grey-box.py IN OUT X0 Y0 X1 Y1 [--lum 105] [--sat 0.2]"""
import sys

import numpy as np
from PIL import Image, ImageFilter

a = sys.argv[1:]
src, dst, x0, y0, x1, y1 = a[0], a[1], *map(int, a[2:6])
lum = int(a[a.index("--lum") + 1]) if "--lum" in a else 105
sat = float(a[a.index("--sat") + 1]) if "--sat" in a else 0.2
im = np.array(Image.open(src).convert("RGBA")).astype(int)
rgb = im[..., :3]
mx, mn = rgb.max(2), rgb.min(2)
s = (mx - mn) / np.maximum(mx, 1)
m = np.zeros(mx.shape, bool)
full = (mx > lum) & (s < sat) & (im[..., 3] > 0)
m[y0:y1, x0:x1] = full[y0:y1, x0:x1]
mm = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
k = np.array(mm).astype(float) / 255
# only strongly selected pixels vanish; the halo fades alpha
im[..., 3] = (im[..., 3] * (1 - np.clip(k * 1.5, 0, 1))).astype(int)
Image.fromarray(im.astype(np.uint8), "RGBA").save(dst)
print("keyed", int(m.sum()), "px ->", dst)
