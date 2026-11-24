"""Defringe a keyed RGBA hero: erode alpha N px, zero alpha < 8, feather the bottom F px.
Usage: python -I large-defringe.py IN.png OUT.png [erode=2] [feather=12]"""
import sys
import numpy as np
from PIL import Image, ImageFilter

def defringe(src, dst, erode=2, feather=12):
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A")
    for _ in range(erode):
        a = a.filter(ImageFilter.MinFilter(3))
    arr = np.array(a).astype(float)
    arr[arr < 8] = 0
    ys = np.nonzero((arr > 0).any(1))[0]
    if feather and len(ys):
        bot = ys.max()
        for k in range(feather):
            arr[bot - k] *= (k + 1) / (feather + 1)
    out = np.array(im)
    out[..., 3] = arr.astype(np.uint8)
    Image.fromarray(out).save(dst)

if __name__ == "__main__":
    defringe(sys.argv[1], sys.argv[2], *(int(x) for x in sys.argv[3:5]))
