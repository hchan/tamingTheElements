"""Wispera refinement: cut an img2img refinement of candidate e8 (orb + jagged bolts), put a procedural dark storm cloud behind it,
place the core at (190,225) in a 400x400 transparent canvas (the portrait-rig spec's glow point). numpy/PIL only.
Usage: refine_cut.py SRC.png OUT.png [seed] [cloud_strength]"""
import sys
import numpy as np
from PIL import Image, ImageFilter

C=(190,225); K=2.1  # core position in canvas, source px per canvas px

def fbm(shape, rng, octaves=(8,16,32,64), wts=(1,.6,.35,.2)):
    h,w=shape; acc=np.zeros(shape,np.float32)
    for o,wt in zip(octaves,wts):
        n=rng.random((o,o)).astype(np.float32)
        im=Image.fromarray((n*255).astype(np.uint8)).resize((w,h),Image.BICUBIC)
        acc+=wt*np.asarray(im,np.float32)/255
    acc/=sum(wts); return acc

def build(src,out,seed=1,cloud=1.0):
    im=Image.open(src).convert("RGB"); a=np.asarray(im).astype(np.float32)
    lum=a.max(2)
    # core = centroid of the very bright pixels near the middle
    yy,xx=np.mgrid[0:a.shape[0],0:a.shape[1]]
    m=(lum>238)&(((xx-a.shape[1]/2)**2+(yy-a.shape[0]/2)**2)<(a.shape[0]*.25)**2)
    cx,cy=xx[m].mean(),yy[m].mean()
    # resample to canvas with core at C
    sx,sy=np.arange(400),np.arange(400)
    X=(cx+(sx-C[0])*K); Y=(cy+(sy-C[1])*K)
    pad=np.pad(a,((0,0),(0,0),(0,0)))
    xi=np.clip(X,0,a.shape[1]-1); yi=np.clip(Y,0,a.shape[0]-1)
    canvas=np.asarray(Image.fromarray(a.astype(np.uint8)).transform((400,400),Image.AFFINE,(K,0,cx-C[0]*K,0,K,cy-C[1]*K),Image.BICUBIC,fillcolor=(0,0,0))).astype(np.float32)
    bg=np.array([22,22,30],np.float32)
    dist=np.sqrt(((canvas-bg)**2).sum(2))
    s=np.clip((dist-38)/(110-38),0,1); s=s*s*(3-2*s)
    gy,gx=np.mgrid[0:400,0:400]
    r=np.sqrt((gx-C[0])**2+(gy-C[1])**2)
    fade=np.clip((178-r)/55,0,1)   # taper bolts smoothly: no hard crop, no halo ring
    bolt_a=s*fade
    # thick dark storm cloud behind the burst
    rng=np.random.default_rng(seed)
    n=fbm((400,400),rng)
    ang=np.arctan2(gy-C[1],gx-C[0])
    lobes=fbm((400,400),np.random.default_rng(seed+9),octaves=(3,5,9),wts=(1,.6,.3))
    # tattered tendrils: angular lobes push the cloud out into streamers, high-frequency noise erodes the edge raggedly
    k=np.arange(360); lo=np.interp(np.degrees(ang)%360,k,np.convolve(np.tile(np.random.default_rng(seed+5).random(360),3),np.ones(9)/9,"same")[360:720])
    rad=58+95*lo+40*lobes
    field=(rad-r)+70*(n-0.5)+18*(fbm((400,400),np.random.default_rng(seed+2),octaves=(32,64,128),wts=(1,.7,.5))-0.5)
    dens=np.clip(field/22,0,1)*np.clip((r-26)/12,0,1)
    dens=np.asarray(Image.fromarray((dens*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)),np.float32)/255*cloud
    lit=np.clip(1-r/170,0,1)**1.3         # cloud lit blue-white from the core, dark at the rim
    base=np.array([30,38,56],np.float32); glow=np.array([130,170,215],np.float32)
    shade=np.clip(0.3+1.4*(n-0.45),0,1)[...,None]
    ccol=base+(glow-base)*(lit[...,None]*shade*0.9)
    # composite bolts over cloud
    A=bolt_a+dens*(1-bolt_a)
    col=(canvas*bolt_a[...,None]+ccol*(dens*(1-bolt_a))[...,None])/np.maximum(A,1e-4)[...,None]
    o=np.dstack([np.clip(col,0,255),A*255]).astype(np.uint8)
    Image.fromarray(o,"RGBA").save(out)
    return cx/a.shape[1],cy/a.shape[0]

if __name__=="__main__":
    print(build(sys.argv[1],sys.argv[2],int(sys.argv[3]) if len(sys.argv)>3 else 1,float(sys.argv[4]) if len(sys.argv)>4 else 1.0))
