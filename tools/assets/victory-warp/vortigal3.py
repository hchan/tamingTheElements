# Vortigal victory init: wings up in a V, head raised. Run from repo root: ~/claudetmp/venv/bin/python -I tools/assets/victory-warp/vortigal3.py
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.makedirs('.scratch/victory-warp/waveB', exist_ok=True)
import numpy as np
from PIL import Image, ImageFilter
import warp as W, wave as V
V.PAD = PAD = 200
S = V.sstep
im = Image.open('.scratch/matte/vortigal.png').convert('RGB'); a = np.asarray(im).astype(int)
d = np.abs(a-128).max(axis=2); m = Image.fromarray(((d>10)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
rgba = np.dstack([a.astype(np.uint8), np.asarray(m)]); h,w = rgba.shape[:2]
b = np.zeros((h+2*PAD,w+2*PAD,4),np.uint8); b[PAD:PAD+h,PAD:PAD+w]=rgba
# right wing (lower right): lift CCW about shoulder; left wing: steepen CW
Rw = lambda x,y: S((x-560)/180)*S((760-y)/160)
Lw = lambda x,y: S((500-x)/160)*S((480-y)/160)
Hd = lambda x,y: S((x-600)/100)*S((330-y)/100)*S((y-150)/60)
out = V.zone_warp(b, [((620,340), 52, Rw), ((480,330), -28, Lw), ((640,290), 32, Hd)])
a8 = (out*255+.5).astype(np.uint8); a8[a8[...,3]<8]=0
ys,xs = np.nonzero(a8[...,3]>8); a8=a8[ys.min():ys.max()+1, xs.min():xs.max()+1]; hh,ww=a8.shape[:2]
s=min(.8*1024/hh,.92*1024/ww); t=Image.fromarray(a8,'RGBA').resize((round(ww*s),round(hh*s)),Image.LANCZOS)
cv=Image.new('RGBA',(1024,1024),(128,128,128,255)); cv.alpha_composite(t,((1024-t.width)//2,(1024-t.height)//2))
cv.convert('RGB').save('.scratch/victory-warp/waveB/vortigal_win3.png'); print(t.size)
