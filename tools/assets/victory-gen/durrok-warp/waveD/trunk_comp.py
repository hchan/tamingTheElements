import numpy as np
from PIL import Image, ImageFilter
im=Image.open('.scratch/r24-durrok-regrade/durrok-120651-rg3.png').convert('RGB'); a=np.asarray(im).astype(int)
H,W=a.shape[:2]; yy,xx=np.mgrid[0:H,0:W]
subj=np.abs(a-128).max(2)>12
tusk=(a.min(2)>170)&subj
# trunk = subject right of a slanted line, below eye level, not tusk
tr=subj&(xx>870)&(yy>300)&~ndim if False else subj&(xx>872)&(yy>300)
tr&=~(tusk)
m=Image.fromarray((tr*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
tr=np.asarray(m)>0
base=a.copy(); base[tr&~tusk]=128
# trunk layer rotated about base pivot
layer=np.full_like(a,128); layer[tr]=a[tr]
al=Image.fromarray((tr*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
L=Image.fromarray(layer.astype(np.uint8)).rotate(70,center=(885,300),resample=Image.BICUBIC,fillcolor=(128,128,128))
A=al.rotate(70,center=(885,300),resample=Image.BICUBIC)
out=Image.fromarray(base.astype(np.uint8)); out.paste(L,(0,0),A)
out.save('.scratch/victory-warp/waveD/durrok_comp.png')
