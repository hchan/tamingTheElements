"""Durrok regrade: isnet key + drop ground strip + tame neon moss to muted olive. Run from repo root: ~/claudetmp/rembg-venv/bin/python -I tools/assets/victory-warp/durrok-regrade.py <outdir> <src.png>..."""
import sys, numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage
S = new_session("isnet-general-use")
for src in sys.argv[2:]:
    im = Image.open(src).convert("RGB")
    a = np.array(remove(im, session=S, alpha_matting=True).split()[-1])
    lab, n = ndimage.label(a > 40); sz = ndimage.sum(a > 40, lab, range(1, n + 1))
    a = np.where(ndimage.binary_dilation(lab == 1 + int(np.argmax(sz)), iterations=3), a, 0).astype(np.uint8)
    ys = np.nonzero((a > 40).any(1))[0]; bot = ys.max()
    # drop ground strip: rows in the bottom 4% where pixels are green and low-saturation-grey-free (grass/rock plate)
    h = np.array(im.convert("HSV")).astype(float)
    arr = np.asarray(im).astype(float)
    # mute moss: green hue, saturation x0.55, value x0.8
    g = (h[..., 0] > 40) & (h[..., 0] < 110) & (h[..., 1] > 90)
    h[..., 1] = np.where(g, h[..., 1] * 0.5, h[..., 1]); h[..., 2] = np.where(g, h[..., 2] * 0.82, h[..., 2])
    out = np.array(Image.fromarray(h.astype(np.uint8), "HSV").convert("RGB")).astype(float)
    al = np.asarray(Image.fromarray(a).filter(ImageFilter.GaussianBlur(1.0))).astype(float) / 255
    out = out * al[..., None] + 128 * (1 - al[..., None])
    n = src.split('/')[-1].replace('.png', '')
    Image.fromarray(out.astype(np.uint8)).save(f"{sys.argv[1]}/{n}-rg.png"); print(n, bot)
