# Wave C Zephra victory still (CPU warp, no repaint). Run from repo root: ~/claudetmp/venv/bin/python -I tools/assets/victory-warp/zephra.py
# Reads .scratch/matte/zephra-120803.png (11-23 keyed silver source), writes .scratch/victory-warp/waveC/zephra_win.png (1024x1024 on flat #808080)
# and _t_zephra.png (before/after), then applies the fix.py hairline cleanup.
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = '.scratch/victory-warp/waveC/'; os.makedirs(OUT, exist_ok=True)
import numpy as np
from PIL import Image
import wave as V, fix
V.PAD = PAD = 200
S = V.sstep
def load():
    rgb = np.asarray(Image.open('.scratch/matte/zephra-120803.png').convert('RGB')).astype(np.int32)
    al = np.clip((np.abs(rgb-128).max(2)-2)/10, 0, 1)  # soft alpha vs flat grey; compositing back on 128 is lossless
    a = np.dstack([rgb, (al*255).astype(np.int32)]).astype(np.uint8); h, w = a.shape[:2]
    b = np.zeros((h+2*PAD, w+2*PAD, 4), np.uint8); b[PAD:PAD+h, PAD:PAD+w] = a; return a, b
def zephra(b):  # left-facing: front half rears (clockwise = -), tail swings up (CCW = +)
    F = [(0,0),(1024,0),(1024,430),(640,525),(615,690),(520,700),(520,1024),(0,1024)]
    T = [(690,540),(790,545),(960,780),(1000,880),(900,880),(800,760),(700,650)]
    return V.limb_warp(b, [(F, F, (600, 640), -28, 1), (T, T, (710, 590), 35, 1)])
def finish(out):
    a = (out*255+.5).astype(np.uint8); a[a[..., 3] < 8] = 0; ys, xs = np.nonzero(a[..., 3] > 8); a = a[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = a.shape[:2]; s = min(.72*1024/h, .92*1024/w); im = Image.fromarray(a, 'RGBA').resize((round(w*s), round(h*s)), Image.LANCZOS)
    cv = Image.new('RGBA', (1024, 1024), (128,128,128,255)); cv.alpha_composite(im, ((1024-im.width)//2, (1024-im.height)//2))
    cv = cv.convert('RGB'); cv.save(OUT+'zephra_win.png'); return cv, im.size
if __name__ == '__main__':
    src, b = load(); cv, sz = finish(zephra(b))
    print('zephra', sz, 'hairline px reset:', fix.clean(OUT+'zephra_win.png', 3, 3, 8))
    cv = Image.open(OUT+'zephra_win.png')
    o = Image.fromarray(src, 'RGBA'); o.thumbnail((700, 700)); bg = Image.new('RGB', o.size, (128,128,128)); bg.paste(o, (0,0), o)
    S_ = Image.new('RGB', (1724, 1024), (128,128,128)); S_.paste(bg, (0, 150)); S_.paste(cv, (700, 0)); S_.save(OUT+'_t_zephra.png')
