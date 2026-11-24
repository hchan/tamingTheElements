# Durrok victory still r2: dd3 trunk re-curl + forequarter/head zone warp (hind legs unwarped). Depends on .scratch/victory-warp/waveD/dd3.py and waveC/dr.py (not yet in tools/).
# Run from .scratch/victory-warp: ~/claudetmp/venv-rembg/bin/python -I waveD/dd4.py --fore 15 --head 10; then waveB/fix.py-style clean (k=9,g=9) on the output.
import sys; sys.path.insert(0,'.'); sys.path.insert(0,'waveA'); sys.path.insert(0,'waveC'); sys.path.insert(0,'waveD')
import numpy as np, math
from PIL import Image
import dd3, dr, warp as W, wave as V
arg = lambda k, d: float(sys.argv[sys.argv.index(k)+1]) if k in sys.argv else d
FORE, HEAD = arg('--fore', 12), arg('--head', 9)
PAD = dd3.PAD; S = W.sstep
b = dr.load(); keep, tr, ntm, bf = dd3.build(b)
nt = bf.copy(); nt[..., 3] = bf[..., 3]*ntm
out = W.over(W.over(keep, tr), nt)
V.PAD = PAD
fore = lambda x, y: S((x-480)/90)*(0.45+0.55*S((y-360)/150))
head = lambda x, y: S((x-650)/60)*S((400-y)/60)
o2 = V.zone_warp((np.clip(out,0,1)*255+.5).astype(np.uint8), [((520, 440), FORE, fore), ((770, 250), HEAD, head)])
cv, sz = dd3.finish3(o2, 1.0); print(sz)
cv.save('../victory-approved/durrok_win_r2.png')
