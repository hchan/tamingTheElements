# Round 2 (CPU): cleaner keys for brazgor nykra ouroth umbrel zephra durrok. Run from .scratch:
#   ~/claudetmp/venv/bin/python -I r24-cutin-comp/comp_r2.py
import numpy as np, json, importlib.util
from collections import deque
from PIL import Image, ImageFilter, ImageDraw
spec=importlib.util.spec_from_file_location('c1','r24-cutin-comp/comp.py'); c1=importlib.util.module_from_spec(spec); spec.loader.exec_module(c1)
CFG=json.load(open('r24-cutin-comp/cfg.json'))
def label_sizes(m):
    H,W=m.shape; lab=np.zeros((H,W),np.int32); sizes=[0]; n=0; touch=[False]
    for y0 in range(H):
        for x0 in range(W):
            if m[y0,x0] and not lab[y0,x0]:
                n+=1; lab[y0,x0]=n; q=deque([(y0,x0)]); s=0; t=False
                while q:
                    y,x=q.popleft(); s+=1
                    if y==0 or x==0 or y==H-1 or x==W-1: t=True
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        yy,xx=y+dy,x+dx
                        if 0<=yy<H and 0<=xx<W and m[yy,xx] and not lab[yy,xx]: lab[yy,xx]=n; q.append((yy,xx))
                sizes.append(s); touch.append(t)
    return lab,np.array(sizes),np.array(touch)
def drop_islands(m,mn):
    lab,sz,_=label_sizes(m); keep=sz>=mn; keep[0]=False
    # always keep the largest
    keep[np.argmax(sz[1:])+1]=True
    return keep[lab]
def fill_holes(m,mx):
    lab,sz,t=label_sizes(~m); fill=(sz<mx)&(~t); fill[0]=False
    return m|fill[lab]
def mf(m,f,n):
    im=Image.fromarray((m*255).astype(np.uint8))
    for _ in range(n): im=im.filter(f)
    return np.asarray(im)>127
def decon(rgb,inner,iters=40):
    # propagate colour from `inner` (trusted) outward over everything else
    a=rgb.astype(np.float32); known=inner.copy(); out=a.copy()
    for _ in range(iters):
        if known.all(): break
        w=known.astype(np.float32); acc=np.zeros_like(a); cnt=np.zeros(w.shape,np.float32)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if dy==0 and dx==0: continue
                acc+=np.roll(np.roll(out*w[...,None],dy,0),dx,1); cnt+=np.roll(np.roll(w,dy,0),dx,1)
        new=(~known)&(cnt>0); out[new]=acc[new]/cnt[new][...,None]; known=known|new
    return out
def key2(path,thr=12,soft=None,islands=400,holes=3000,erode=0,blur=1.2,fringe=0,desat=0,mane_soft=0,cut_below=None,band_drop=0,chroma=40):
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    dist=np.abs(rgb-128).max(axis=2)
    d=dist>thr
    if desat: d&=~(((rgb.max(2)-rgb.min(2))<desat)&(dist<50))
    d=mf(d,ImageFilter.MinFilter(5),1); d=mf(d,ImageFilter.MaxFilter(5),1)
    d=drop_islands(d,islands); d=fill_holes(d,holes)
    if band_drop:
        band=d&~mf(d,ImageFilter.MinFilter(2*band_drop+1),1)
        lum=(rgb*np.array([.299,.587,.114])).sum(-1)/255
        d=d&~(band&((rgb.max(2)-rgb.min(2))<chroma)&(lum>0.55))
        d=drop_islands(d,islands); d=fill_holes(d,holes)
    if cut_below is not None: d[int(cut_below*d.shape[0]):]=False
    core=d
    if erode: core=mf(d,ImageFilter.MinFilter(2*erode+1),1)
    alpha=Image.fromarray((core*255).astype(np.uint8))
    if soft:
        a=np.clip((dist-soft[0])/(soft[1]-soft[0]),0,1)
        sa=Image.fromarray((a*255).astype(np.uint8))
        # soft alpha only inside a slightly grown hole-filled mask
        grown=Image.fromarray((fill_holes(drop_islands(dist>soft[0]+2,islands),holes)*255).astype(np.uint8))
        alpha=np.minimum(np.asarray(grown),np.maximum(np.asarray(sa),np.asarray(alpha)))
        alpha=Image.fromarray(alpha.astype(np.uint8))
    if blur: alpha=alpha.filter(ImageFilter.GaussianBlur(blur))
    if fringe:
        inner=mf(d,ImageFilter.MinFilter(2*fringe+1),1)
        rgb=decon(rgb,inner).clip(0,255).astype(np.uint8)
    else: rgb=rgb.astype(np.uint8)
    im=Image.fromarray(rgb).convert('RGBA'); im.putalpha(alpha)
    return im.crop(im.getbbox())
def tint_grain(s,tint=(150,100,60),amt=0.5,grain=9,seed=1):
    a=np.asarray(s).astype(np.float32); rgb=a[...,:3]
    t=np.array(tint,np.float32)/255
    lum=(rgb*np.array([.3,.59,.11],np.float32)).sum(-1,keepdims=True)
    rgb=rgb*0.7+lum*0.3                      # pull green saturation down
    rgb=rgb*(1-amt)+rgb*t*1.9*amt            # warm brown multiply
    rng=np.random.default_rng(seed); g=rng.normal(0,grain,a.shape[:2]).astype(np.float32)
    g=np.asarray(Image.fromarray(np.clip(g*8+128,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)-128
    rgb=rgb+g[...,None]/8
    a[...,:3]=rgb.clip(0,255); return Image.fromarray(a.astype(np.uint8),'RGBA')
def shadow(bg,s,pos,col,strength=0.55,hscale=0.07):
    W,H=bg.size; w=int(s.width*0.8); h=max(8,int(s.height*hscale*2))
    sh=Image.new('L',(W,H),0); cx=pos[0]+s.width//2; cy=pos[1]+s.height-int(h*0.2)
    ImageDraw.Draw(sh).ellipse((cx-w//2,cy-h//2,cx+w//2,cy+h//2),fill=int(255*strength))
    sh=sh.filter(ImageFilter.GaussianBlur(h*0.45))
    layer=Image.new('RGBA',(W,H),col+(255,)); layer.putalpha(sh); bg.alpha_composite(layer)
R2={ # per-hero key2 args and extras
 'brazgor':dict(k=dict(erode=2,fringe=5,holes=3000,islands=300)),
 'nykra':dict(k=dict(erode=2,fringe=10,band_drop=10,holes=0,islands=300,blur=2.0)),
 'ouroth':dict(k=dict(erode=2,fringe=6,holes=1500,islands=300)),
 'umbrel':dict(k=dict(erode=2,fringe=5,desat=30,cut_below=0.975,islands=800,holes=150,blur=2.0),shadow=(30,16,40)),
 'zephra':dict(k=dict(thr=5,soft=(3,22),islands=600,holes=6000,blur=0.8,fringe=3)),
 'durrok':dict(k=dict(erode=1,fringe=4,islands=900,blur=1.5),tint=True,shadow=(28,18,10)),
}
def comp2(h):
    c=CFG.get(h,{}); r=R2[h]
    bg=Image.open(c1.BD[h]).convert('RGBA'); W,H=bg.size
    s=key2(c1.SUB[h],**r['k'])
    if r.get('tint'): s=tint_grain(s)
    if c.get('flip'): s=s.transpose(Image.FLIP_LEFT_RIGHT)
    th=c.get('h',0.78)*H; sc=min(th/s.height,(c.get('wmax',0.6)*W)/s.width)
    s=s.resize((int(s.width*sc),int(s.height*sc)),Image.LANCZOS)
    pos=(int(c.get('cx',0.5)*W-s.width/2),int(c.get('bot',0.93)*H-s.height))
    if 'shadow' in r: shadow(bg,s,pos,r['shadow'])
    bg.alpha_composite(s,pos); return bg.convert('RGB')
if __name__=='__main__':
    import sys
    only=sys.argv[1:] or list(R2)
    for h in only: comp2(h).save(f'r24-cutin-comp/cutin_comp_{h}_r2.png'); print('done',h)
    hs=sorted(c1.BD); tw,th=448,256; sh=Image.new('RGB',(tw*4,th*3))
    for i,h in enumerate(hs):
        p=f'r24-cutin-comp/cutin_comp_{h}_r2.png' if h in R2 else f'r24-cutin-comp/cutin_comp_{h}.png'
        sh.paste(Image.open(p).convert('RGB').resize((tw,th),Image.LANCZOS),((i%4)*tw,(i//4)*th)); ImageDraw.Draw(sh).text(((i%4)*tw+6,(i//4)*th+4),h+(' r2' if h in R2 else ''),fill=(255,255,255))
    sh.save('r24-cutin-comp/contact_sheet_r2.png')
