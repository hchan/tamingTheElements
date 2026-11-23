"""CPU tweaks on keyed roster24 mattes (flat #808080). Run: ~/claudetmp/venv/bin/python -I tools/assets/roster24-art/r24-tweak.py
Inputs: .scratch/matte/abyssor-82145.png and zephra-120803.png (r24-key-grade.py output, 1024 canvas). Outputs go to .scratch/r24-tweak/.
The approved abyssor-82145-rim2.png (4 px teal rim, about #4fb8a8, upper and left edge only) is a later revision of the 9 px rim written
here (REVISE, art-director 2026-11-23); the rim2 parameters were not kept in this script. zephra-120803-s109.png is exactly this script's
output (+9%, 1152 canvas; do not scale further). Approvals: portrait-rig/provenance/abyssor-tweak-approval.json, zephra-tweak-approval.json.
Rig sources then come from key-flat-bg.py + make-rig-source.py (abyssor --pad 24 --margin 12, zephra --pad 8 --margin 12).
abyssor: faint cool rim light on the outer silhouette edge. zephra: +9% scale on a 1152 canvas (no crop)."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
O = '.scratch/r24-tweak/'
a = Image.open('.scratch/matte/abyssor-82145.png').convert('RGB'); A = np.asarray(a).astype(float)
m = np.abs(A - 128).max(2) > 14
m = ndimage.binary_closing(m, iterations=3); m = ndimage.binary_fill_holes(m)
d = ndimage.distance_transform_edt(m)
rim = np.clip(1 - d / 9.0, 0, 1) * m                       # 9 px inner band
rim = np.asarray(Image.fromarray((rim * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))) / 255.
glow = np.array([120, 235, 215], float)                     # pale verdigris-cyan
out = A + (glow - A).clip(0) * (rim[..., None] * 0.35)
out[~m] = 128
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(O + 'abyssor-82145-rim.png')
z = Image.open('.scratch/matte/zephra-120803.png').convert('RGB'); Z = np.asarray(z)
mz = np.abs(Z.astype(int) - 128).max(2) > 14; ys, xs = np.nonzero(mz)
crop = z.crop((xs.min() - 8, ys.min() - 8, xs.max() + 9, ys.max() + 9))
s = 1.09; c = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
cv = Image.new('RGB', (1152, 1152), (128, 128, 128)); cv.paste(c, ((1152 - c.width) // 2, (1152 - c.height) // 2))
cv.save(O + 'zephra-120803-s109.png'); print(c.size)
# sheet on dark and light
sh = Image.new('RGB', (1500, 560), (40, 40, 40))
for i, (p, bg) in enumerate([('abyssor-82145.png', 'matte'), ('abyssor-82145-rim.png', 'r24-tweak'), ('zephra-120803.png', 'matte'), ('zephra-120803-s109.png', 'r24-tweak')]):
    im = Image.open(f'.scratch/{bg}/{p}'); im.thumbnail((370, 540)); sh.paste(im, (i * 375, 10))
sh.save(O + 'tweak-sheet.png')
