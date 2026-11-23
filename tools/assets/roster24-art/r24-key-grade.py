"""Key + grade two approved roster24 hidden-hero candidates onto flat #808080 (1024 canvas kept).
Usage (run from the worktree root; needs rembg + scipy + Pillow, e.g. ~/claudetmp/rembg-venv):
  ~/claudetmp/rembg-venv/bin/python -I tools/assets/roster24-art/r24-key-grade.py ABYSSOR_RAW.png ZEPHRA_RAW.png OUT_DIR
Writes OUT_DIR/abyssor-82145.png and OUT_DIR/zephra-120803.png (art-director APPROVE 4/5 each, 2026-11-23; provenance:
tools/assets/portrait-rig/provenance/abyssor-zephra-keyed-approval.json). Raw inputs: GPU outputs r24-abyssor-t2i5_82145 and approved-120803.
abyssor: isnet matte, drop lower-left black shard, regrade rust/brown hues to teal/verdigris.
zephra: isnet matte, drop the yellow ground streak (yellow pixels in the bottom band)."""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage

RAW_A, RAW_Z, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
S = new_session("isnet-general-use")

def matte(im):
    a = np.array(remove(im, session=S, alpha_matting=True).split()[-1])
    return a

def biggest(a):
    lab, n = ndimage.label(a > 40)
    sizes = ndimage.sum(a > 40, lab, range(1, n + 1))
    keep = ndimage.binary_dilation(lab == 1 + int(np.argmax(sizes)), iterations=4)
    return np.where(keep, a, 0).astype(np.uint8)

def comp(im, a):
    al = Image.fromarray(a).filter(ImageFilter.GaussianBlur(1.0))
    return Image.composite(im, Image.new("RGB", im.size, (128, 128, 128)), al)

def hsv(arr):
    return np.array(Image.fromarray(arr).convert("HSV")).astype(float)

# --- abyssor
im = Image.open(RAW_A).convert("RGB")
a = biggest(matte(im))
a[915:960, :245] = 0                      # stray shard, lower left
a = biggest(a)
h = hsv(np.array(im))
hue = h[..., 0] * 360 / 255
warm = (hue < 60) | (hue > 330)           # rust / brown / copper
cool = (hue >= 180) & (hue <= 260)        # existing blue-greys
h[..., 0] = np.where(warm, 172 * 255 / 360, np.where(cool, 178 * 255 / 360, h[..., 0]))
h[..., 1] = np.where(warm | cool, np.clip(h[..., 1] * 1.25 + 30, 0, 255), h[..., 1])
# dark neutral armour: tint slightly toward teal
neutral = (h[..., 1] < 60) & ~warm
h[..., 0] = np.where(neutral, 172 * 255 / 360, h[..., 0])
h[..., 1] = np.where(neutral, h[..., 1] + 45, h[..., 1])
g = np.array(Image.fromarray(h.astype(np.uint8), "HSV").convert("RGB"))
comp(Image.fromarray(g), a).save(os.path.join(OUT, "abyssor-82145.png"))

# --- zephra
im = Image.open(RAW_Z).convert("RGB")
a = biggest(matte(im))
h = hsv(np.array(im)); hue = h[..., 0] * 360 / 255
yellow = (hue > 35) & (hue < 65) & (h[..., 1] > 90)
yy = np.zeros_like(yellow); yy[935:, :] = True
streak = ndimage.binary_dilation(yellow & yy, iterations=3)
a[streak] = 0
a[950:, :] = np.where(ndimage.binary_opening(a[950:, :] > 40, iterations=3), a[950:, :], 0)
a = biggest(a)
comp(im, a).save(os.path.join(OUT, "zephra-120803.png"))
