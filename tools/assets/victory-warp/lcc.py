# Keep the largest connected blob of a flat-#808080 still, flatten the rest. Usage (repo root): ~/claudetmp/venv/bin/python -I tools/assets/victory-warp/lcc.py <png>... (writes <png>_c.png)
import sys; import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
for p in sys.argv[1:]:
    a=np.asarray(Image.open(p).convert('RGB')).astype(int); d=np.abs(a-128).max(axis=2)>14
    d=ndimage.binary_closing(d,iterations=3); lab,n=ndimage.label(d); sz=ndimage.sum(d,lab,range(1,n+1))
    k=ndimage.binary_dilation(lab==1+int(np.argmax(sz)),iterations=2)
    al=np.asarray(Image.fromarray((k*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float)[...,None]/255
    o=a*al+128*(1-al); Image.fromarray(o.astype(np.uint8)).save(p.replace('.png','_c.png')); print(p,n)
