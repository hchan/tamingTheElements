"""Durrok stage 2 (rg -> rg2): drop the ground strip. Usage: rembg-venv python -I tools/assets/roster24-art/durrok-stripcut.py <rg.png> <out.png>"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage
A = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); m = np.abs(A - 128).max(2) > 10
bot = np.nonzero(m.any(1))[0].max()
body = ndimage.binary_dilation(m[bot-90:bot-45].any(0), iterations=6)
cut = m.copy(); cut[bot-20:, :] = False; cut[bot-60:bot-20, :] &= body[None, :]
A[~cut] = 128; Image.fromarray(A.astype(np.uint8)).save(sys.argv[2])
