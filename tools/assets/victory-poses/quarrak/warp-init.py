import numpy as np
from PIL import Image
from scipy import ndimage as ndi
im=Image.open(".scratch/matte/quarrak-96214.png").convert("RGB")
a=np.array(im).astype(np.float32); H,W,_=a.shape
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
# output->source map: rotate -11deg around rear feet (x=.10W,y=.93H), plus head lift for x>.6W
th=np.deg2rad(11); px,py=.10*W,.93*H
dx,dy=xx-px,yy-py
sx=px+dx*np.cos(th)-dy*np.sin(th)   # inverse rotation
sy=py+dx*np.sin(th)+dy*np.cos(th)
lift=np.clip((xx/W-.62)/.2,0,1)*0.09*H*np.clip(1-(yy/H-.25)/.35,0,1)
sy=sy+lift
out=np.stack([ndi.map_coordinates(a[...,c],[sy,sx],order=1,mode="nearest",cval=128) for c in range(3)],-1)
# restore flat grey outside rotated mask
m=ndi.map_coordinates((np.abs(a-128).sum(2)>25).astype(np.float32),[sy,sx],order=1,mode="constant")
m=ndi.gaussian_filter(m,1.5)[...,None]
out=out*m+128*(1-m)
Image.fromarray(out.clip(0,255).astype(np.uint8)).save(".scratch/init/quarrak-vic1003.png")
Image.fromarray(out.clip(0,255).astype(np.uint8)).resize((512,512)).save(".scratch/q-warp-prev.png")
