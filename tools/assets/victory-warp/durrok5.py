# Durrok victory still r3: only the trunk is re-curled (dd3 rebuild); body, all four legs, hooves and tail are the unmodified base matte (no zone warp).
# Depends on .scratch/victory-warp/waveD/dd3.py, waveC/dr.py, waveA (warp, wave) and ../r24-durrok-regrade/durrok-120651-rg3.png (not yet in tools/).
# Run from .scratch/victory-warp: ~/claudetmp/venv-rembg/bin/python -I <path>/durrok5.py   (needs cv2/scipy; waveB/fix.py cleanup k=9,g=9 is applied inline)
import sys; sys.path.insert(0,'.'); sys.path.insert(0,'waveA'); sys.path.insert(0,'waveC'); sys.path.insert(0,'waveD')
import numpy as np
from PIL import Image, ImageFilter
import dd3, dr, warp as W
b = dr.load(); keep, tr, ntm, bf = dd3.build(b)
nt = bf.copy(); nt[..., 3] = bf[..., 3]*ntm
out = W.over(W.over(keep, tr), nt)
cv, sz = dd3.finish3(out, 1.0); print(sz)
P = '../victory-approved/durrok_win_r3.png'
cv.save(P)
a = np.asarray(cv).astype(int); d = np.abs(a-128).max(2) > 14
m = Image.fromarray((d*255).astype(np.uint8)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MaxFilter(9))
o = a.copy(); o[np.asarray(m) == 0] = 128; Image.fromarray(o.astype(np.uint8)).save(P)
base = Image.open(dr.SRC).convert('RGB'); cb = np.asarray(base).astype(int); mm = np.abs(cb-128).max(2) > 14; ys, xs = np.nonzero(mm)
bc = base.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1)); bg = Image.new('RGB', (1024,1024), (128,128,128))
s = min(.94*1024/bc.width, .94*1024/bc.height, 1.0); bc = bc.resize((round(bc.width*s), round(bc.height*s)), Image.LANCZOS)
bg.paste(bc, ((1024-bc.width)//2, (1024-bc.height)//2))
sh = Image.new('RGB', (2048,1024)); sh.paste(bg,(0,0)); sh.paste(Image.open(P),(1024,0)); sh.save('../victory-approved/durrok_cmp_r3.png')
