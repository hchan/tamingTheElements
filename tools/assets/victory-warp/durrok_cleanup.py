"""Alpha-only cleanup for the Durrok victory still (director condition): drop stray specks, smooth the mask edge.
Usage: ~/claudetmp/rembg-venv/bin/python -I tools/assets/victory-warp/durrok_cleanup.py IN.png OUT.png
Subject pixels stay untouched; everything outside the cleaned mask is reset to flat #808080."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.uint8)
m = np.abs(a.astype(int) - 128).max(2) > 14
m = ndimage.binary_closing(m, iterations=3)
lab, n = ndimage.label(m)
sz = ndimage.sum(m, lab, range(1, n + 1))
keep = lab == 1 + int(np.argmax(sz))
keep = ndimage.binary_fill_holes(keep)
sm = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
keep = np.asarray(sm) > 127
out = a.copy()
out[~keep] = 128
Image.fromarray(out).save(sys.argv[2])
print('removed pixels:', int((np.abs(a.astype(int) - 128).max(2) > 0).sum() - (keep & (np.abs(a.astype(int) - 128).max(2) > 0)).sum()))
