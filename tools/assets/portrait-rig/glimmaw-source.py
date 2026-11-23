"""Builds imgWorkArea/portrait-src/glimmaw.png (400x400 RGBA) from the art-director-approved matte glimmaw-96303 (998x1008, flat #808080
background, rig source glimmaw_rig_source). Keys out the grey by chroma distance (also the enclosed pockets between the legs), removes
the grey fringe from the soft edge, fits the turtle into the 400 canvas facing east with the feet line at y=388 and x centred.
Usage: python -I tools/assets/portrait-rig/glimmaw-source.py <matte.png> [out.png]   (prints the scale and offset the landmarks use)"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
LO, HI = 10.0, 34.0  # grey distance: fully clear below LO, fully kept above HI
CANVAS, FEET_Y, H_MAX, W_MAX = 400, 388, 372, 372

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "imgWorkArea", "portrait-src", "glimmaw.png")
rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
d = np.sqrt(((rgb - 128.0) ** 2).sum(axis=2))
a = np.clip((d - LO) / (HI - LO), 0, 1)
a = a * a * (3 - 2 * a)
# de-fringe: c = (p - 128 (1 - a)) / a for partial alpha
al = np.maximum(a, 1e-3)[..., None]
col = np.clip((rgb - 128.0 * (1 - a[..., None])) / al, 0, 255)
col[a < 0.02] = 0
im = Image.fromarray(np.dstack([col, a * 255]).astype(np.uint8), "RGBA")
# drop faint specks (alpha < 0.5 islands are rare, a hard cut keeps the matte clean)
bb = im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
im = im.crop(bb)
s = min(H_MAX / im.height, W_MAX / im.width)
im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
cv = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
ox, oy = (CANVAS - im.width) // 2, FEET_Y - im.height
cv.alpha_composite(im, (ox, oy))
os.makedirs(os.path.dirname(out), exist_ok=True)
cv.save(out)
print(f"bbox {bb} scale {s:.5f} offset {ox},{oy}: canvas = (src - bbox0) * scale + offset")
