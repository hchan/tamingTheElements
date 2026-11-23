"""Durrok final pass (rg2 -> rg3): round the toes (6 px opening on the bottom 110 rows), feather, soften moss, darken leg bases.
Usage: ~/claudetmp/rembg-venv/bin/python -I tools/assets/roster24-art/durrok-finish.py <rg2.png> <out.png>
Stage 1 is tools/assets/roster24-art/durrok-regrade.py (isnet key + moss mute, writes *-rg.png); *-rg2.png is the same with the ground strip cut."""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
A = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
m = ndimage.binary_fill_holes(np.abs(A - 128).max(2) > 10)
bot = np.nonzero(m.any(1))[0].max(); top = bot - 110
yy, xx = np.ogrid[-6:7, -6:7]; st = (xx**2 + yy**2) <= 36
op = ndimage.binary_opening(m, structure=st)
m2 = m.copy(); m2[top:] = op[top:]
al = np.clip(ndimage.distance_transform_edt(m2) / 2.0, 0, 1)
al = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.
H = np.array(Image.fromarray(A.astype(np.uint8)).convert('HSV')).astype(float)
g = (H[..., 0] > 40) & (H[..., 0] < 110) & (H[..., 1] > 50)
H[..., 1] = np.where(g, H[..., 1] * 0.87, H[..., 1]); H[..., 2] = np.where(g, H[..., 2] * 0.92, H[..., 2])
rows = np.clip((np.arange(A.shape[0]) - (bot - 120)) / 120, 0, 1)[:, None, None]
rgb = np.array(Image.fromarray(H.astype(np.uint8), 'HSV').convert('RGB')).astype(float) * (1 - 0.25 * rows)
out = rgb * al[..., None] + 128 * (1 - al[..., None])
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(sys.argv[2])
