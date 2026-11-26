# Provenance copy of the generator for the approved Zephra fx (staticMote, staticMoteLoop, skitter).
# Original name mote.py in the art worktree .scratch/zephra-fx/. Usage: python -I zephra-mote-proc.py <outDir>
# Paths: <outDir>/../skitter-proc2/skitter-proc-1.png (committed as provenance/zephra-fx/skitter-proc-1.png) is the skitter source;
# the sheet step reads bundles/zephra/fx_staticMote_shipped.png (art worktree only, not needed for the sprites).
# Outputs are pinned by tools/assets/integrate-roster24-fx-art.ts.
import random, math
from PIL import Image, ImageDraw, ImageFilter
def mote(size, seed, pulse=1.0, S=4):
    r=random.Random(seed); N=size*S; c=N/2
    im=Image.new("RGBA",(N,N),(0,0,0,0)); d=ImageDraw.Draw(im)
    n=r.randint(5,7)
    for k in range(n):
        a=2*math.pi*k/n+r.uniform(-0.35,0.35); L=N*r.uniform(0.28,0.46)
        pts=[(c,c)]; x,y=c,c; seg=7
        for s in range(1,seg+1):
            t=s/seg; x=c+math.cos(a)*L*t+r.uniform(-1,1)*N*0.035; y=c+math.sin(a)*L*t+r.uniform(-1,1)*N*0.035; pts.append((x,y))
        d.line(pts,fill=(150,150,175,150),width=int(N*0.05)); d.line(pts,fill=(225,225,235,255),width=int(N*0.022))
    for k in range(2):  # side arcs
        sgn=1 if k==0 else -1; w=N*r.uniform(0.18,0.24)
        d.arc([c-w,c-w*1.3+sgn*N*0.02,c+w,c+w*1.3+sgn*N*0.02],start=r.randint(200,230) if sgn>0 else r.randint(20,50),end=r.randint(300,330) if sgn>0 else r.randint(130,160),fill=(200,190,215,200),width=int(N*0.018))
    for k in range(r.randint(5,8)):
        a=r.uniform(0,6.28); rr=N*r.uniform(0.2,0.45); x,y=c+math.cos(a)*rr,c+math.sin(a)*rr; q=N*r.uniform(0.008,0.016)
        d.ellipse([x-q,y-q,x+q,y+q],fill=(255,205,120,255) if r.random()<0.5 else (190,150,235,255))
    cr=N*0.075*pulse; d.ellipse([c-cr*1.6,c-cr*1.6,c+cr*1.6,c+cr*1.6],fill=(170,170,190,120)); d.ellipse([c-cr,c-cr,c+cr,c+cr],fill=(245,245,250,255))
    im=im.filter(ImageFilter.GaussianBlur(S*0.5))
    return im.resize((size,size),Image.LANCZOS)
if __name__=="__main__":
    import sys; out=sys.argv[1]
    mote(80,7).save(f"{out}/staticMote.png")
    loop=Image.new("RGBA",(1280,160),(0,0,0,0))
    for f in range(8): loop.alpha_composite(mote(160,100+f,1.0+0.1*math.sin(f*math.pi/4)),(f*160,0))
    loop.save(f"{out}/staticMoteLoop.png")
    sk=Image.open(f"{out}/../skitter-proc2/skitter-proc-1.png").convert("RGBA"); sk=sk.crop(sk.getbbox()); s=76/max(sk.size)
    sk=sk.resize((round(sk.width*s),round(sk.height*s)),Image.LANCZOS); c=Image.new("RGBA",(80,80),(0,0,0,0)); c.alpha_composite(sk,((80-sk.width)//2,(80-sk.height)//2)); c.save(f"{out}/skitter.png")
    sh=Image.new("RGBA",(1290,330),(90,90,90,255))
    for k,p in enumerate(["staticMote","skitter"]): sh.alpha_composite(Image.open(f"{out}/{p}.png").resize((320,320),Image.NEAREST),(k*330+5,5))
    sh.alpha_composite(Image.open(f"{out}/staticMoteLoop.png").resize((640,80),Image.LANCZOS),(660,5))
    sh.alpha_composite(Image.open("bundles/zephra/fx_staticMote_shipped.png").convert("RGBA").resize((160,160),Image.NEAREST),(660,100))
    sh.save(f"{out}/sheet2.png")
