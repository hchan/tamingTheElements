import sys, importlib.util, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
sp=importlib.util.spec_from_file_location("k","/Users/henry.chan/tamingTheElements/tools/assets/ko-gen/ko-rigonly.py");k=importlib.util.module_from_spec(sp);sp.loader.exec_module(k)
out=sys.argv[1]
n=Image.open(k.SOURCES/"nykra-94301-cut5.png").convert("RGBA")
arr=np.array(n).astype(float); a=arr[...,3]>40
# fill small holes/notches: closing then fill holes, colour from blurred nearest
cl=ndimage.binary_closing(a,structure=np.ones((3,3)),iterations=5)
f=ndimage.binary_fill_holes(cl)
new=f&~a
idx=ndimage.distance_transform_edt(~a,return_distances=False,return_indices=True)
near=arr[idx[0],idx[1],:3]
bl=np.stack([ndimage.gaussian_filter(near[...,c],2) for c in range(3)],-1)
arr[new,:3]=bl[new]; arr[new,3]=255
# defringe: erode alpha 2px, darken near-white specks
al=Image.fromarray(arr[...,3].astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
arr[...,3]=np.array(al)
lum=arr[...,:3].mean(-1); sp_=(lum>170)&(arr[...,3]>0)
arr[sp_,:3]=arr[sp_,:3]*0.55
c=Image.fromarray(arr.astype(np.uint8),"RGBA"); c.save(out+"/nykra-cut-clean.png")
im=k.ko_flip(c,16,-20,"nykra")  # negative sink lowers... check below
im.save(out+"/nykra_ko_r3.png")
bg=Image.new("RGBA",im.size,(60,60,60,255)); bg.alpha_composite(im); bg.convert("RGB").save(out+"/nykra_r3_view.png")
