import os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
D=os.path.expanduser("~/claudetmp/wispera-redo")
def cut(src, lo, hi, vign=0.47):
    im=Image.open(src).convert("RGB").crop((0,0,1024,960))  # drop signature strip
    a=np.asarray(im).astype(np.float32)
    h,w,_=a.shape
    # background colour: heavily blurred copy of the border-darkest estimate
    bl=np.asarray(im.filter(ImageFilter.GaussianBlur(60))).astype(np.float32)
    bg=np.minimum(bl, np.percentile(a.reshape(-1,3),30,axis=0))
    dist=np.sqrt(((a-bg)**2).sum(2))
    lum=a.max(2)
    s=np.clip((dist-lo)/(hi-lo),0,1)
    s=s*s*(3-2*s)
    yy,xx=np.mgrid[0:h,0:w]
    r=np.sqrt(((xx-w/2)/(w/2))**2+((yy-h/2)/(h/2))**2)
    v=np.clip((1-r)/(1-vign)*1.0,0,1)  # fade edges to kill frame/vignette leftovers
    al=s*np.clip((1.0-r)/0.18,0,1)
    # unmultiply glow on dark: keep colour as is
    out=np.dstack([a,al*255]).astype(np.uint8)
    o=Image.fromarray(out,"RGBA")
    bb=o.getchannel("A").point(lambda x:255 if x>25 else 0).getbbox()
    o=o.crop(bb)
    m=max(o.size); sq=Image.new("RGBA",(m,m),(0,0,0,0))
    sq.paste(o,((m-o.width)//2,(m-o.height)//2))
    return sq.resize((400,400),Image.LANCZOS)
if __name__=="__main__":
    os.makedirs(f"{D}/cut",exist_ok=True)
    for name,src,lo,hi in [("e8","cand2/e_8.png",28,90),("d1","cand2/d_1.png",30,95),("b4","cand/b_4.png",28,90),
                            ("e6","cand2/e_6.png",28,90),("b1","cand/b_1.png",28,90),("e2","cand2/e_2.png",28,90),("d6","cand2/d_6.png",30,95)]:
        cut(f"{D}/{src}",lo,hi).save(f"{D}/cut/{name}.png")
    names=["e8","d1","b4","e6","b1","e2","d6"]
    T=400
    sh=Image.new("RGB",(T*len(names),T*2),(0,0,0))
    for k,n in enumerate(names):
        c=Image.open(f"{D}/cut/{n}.png")
        for row,bgc in enumerate([(205,225,245),(60,28,20)]):
            bg=Image.new("RGBA",(T,T),bgc+(255,)); bg.alpha_composite(c)
            sh.paste(bg.convert("RGB"),(k*T,row*T))
        ImageDraw.Draw(sh).text((k*T+4,4),n,fill=(255,0,0))
    sh.save(f"{D}/cut_preview.png")
