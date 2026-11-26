# Composite the 12 original heroes over approved cut-in backdrops (CPU, PIL).
# RECORD COPY: reads the art session's cutin-final/ backdrops, so it is not rerunnable from the repo; paths below are the art session's.
# Run from .scratch:  ~/claudetmp/venv/bin/python -I originals-cutin/comp_originals.py [hero ...]
# Subject = public/assets/img/map/<hero>Large.png (400x400 RGBA, fills the canvas, so its top/left/right
# edges are fade-masked to avoid hard crop lines). Output comp_<hero>.png (+ _B) and sheet_1/2.png.
import json, sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw
ORDER='fiara treenoc cyclonius lavax sindarosa curomo ishimi pax rokcore morblass echo wispera'.split()
CFG=json.load(open('originals-cutin/cfg_originals.json')); D=CFG['defaults']
def edge_fade(a,f,fb):
    H,W=a.shape; fw=max(1,int(W*f)); fh=max(1,int(H*f))
    def ramp(n,k): r=np.clip(np.arange(n)/k,0,1); return r*r*(3-2*r)
    mx=np.minimum(ramp(W,fw),ramp(W,fw)[::-1])[None,:]
    my=ramp(H,fh)[:,None]
    if fb: my=my*ramp(H,max(1,int(H*fb)))[::-1][:,None]
    return a*mx*my
def contact(bg,s,pos,col):
    W,H=bg.size; w=int(s.width*0.7); h=int(s.height*0.07)
    m=Image.new('L',(W,H),0); cx=pos[0]+s.width//2; cy=pos[1]+s.height-int(h*0.3)
    ImageDraw.Draw(m).ellipse((cx-w//2,cy-h//2,cx+w//2,cy+h//2),fill=150)
    m=m.filter(ImageFilter.GaussianBlur(h*0.5))
    l=Image.new('RGBA',(W,H),tuple(col)+(255,)); l.putalpha(m); bg.alpha_composite(l)
def comp(h,which):
    c={**D,**CFG['heroes'][h]}
    bg=Image.open(c[which]).convert('RGBA'); W,H=bg.size
    s=Image.open(f'../public/assets/img/map/{h}Large.png').convert('RGBA')
    if c['flip']: s=s.transpose(Image.FLIP_LEFT_RIGHT)
    sc=c['h']*H/s.height; s=s.resize((round(s.width*sc),round(s.height*sc)),Image.LANCZOS)
    r,p,t=c['unsharp']; s=s.filter(ImageFilter.UnsharpMask(r,p,t))
    a=np.asarray(s).astype(np.float32)
    g=np.asarray(Image.fromarray(np.clip(np.random.default_rng(7).normal(128,40,a.shape[:2]),0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32)-128
    a[...,:3]=np.clip(a[...,:3]+g[...,None]*c['grain']/20,0,255)
    a[...,3]=edge_fade(a[...,3],c['fade'],c['fade_bottom'])
    s=Image.fromarray(a.astype(np.uint8),'RGBA')
    pos=(round(c['cx']*W-s.width/2),round(c['bot']*H-s.height))
    contact(bg,s,pos,c['shadow']); bg.alpha_composite(s,pos); return bg.convert('RGB')
def sheet(heroes,out,cw=480):
    cells=[]
    for h in heroes:
        ims=[Image.open(f'originals-cutin/comp_{h}.png')]
        if 'B' in CFG['heroes'][h]: ims.append(Image.open(f'originals-cutin/comp_{h}_B.png'))
        cells.append((h,ims))
    ch=round(cw*768/1344); rows=(len(cells)+1)//2
    S=Image.new('RGB',(cw*4,ch*rows),(0,0,0)); d=ImageDraw.Draw(S)
    for i,(h,ims) in enumerate(cells):
        x,y=(i%2)*cw*2,(i//2)*ch
        for j,im in enumerate(ims):
            S.paste(im.resize((cw,ch),Image.LANCZOS),(x+j*cw,y)); d.text((x+j*cw+6,y+4),h+(' B' if j else ' A' if len(ims)>1 else ''),fill=(255,255,255))
    S.save(out)
if __name__=='__main__' and '--v2' not in sys.argv:
    only=sys.argv[1:] or ORDER
    for h in only:
        comp(h,'A').save(f'originals-cutin/comp_{h}.png')
        if 'B' in CFG['heroes'][h]: comp(h,'B').save(f'originals-cutin/comp_{h}_B.png')
        print('done',h)
    sheet(ORDER[:6],'originals-cutin/sheet_1.png'); sheet(ORDER[6:],'originals-cutin/sheet_2.png')

# ---- v2 (director REVISE fixes): per-hero cfg["heroes"][h]["v2"] keys, see cfg v2_defaults ----
V2_ORDER=['fiara','treenoc','echo','wispera']
def _blur(m,r): return m.filter(ImageFilter.GaussianBlur(r))
def _layer(size,col,alpha):  # alpha: float32 HxW 0..1
    l=Image.new('RGBA',size,tuple(col)+(255,)); l.putalpha(Image.fromarray((np.clip(alpha,0,1)*255).astype(np.uint8))); return l
def comp_v2(h,key='v2'):
    c={**D,**CFG['heroes'][h]}; v={**CFG['v2_defaults'],**c['v2'],**(c.get(key,{}) if key!='v2' else {})}; c['fade']=v.get('fade',c['fade'])
    bg=Image.open(c[v['pick']]).convert('RGBA'); W,H=bg.size
    s=Image.open(f'../public/assets/img/map/{h}Large.png').convert('RGBA')
    if c['flip']: s=s.transpose(Image.FLIP_LEFT_RIGHT)
    a=np.asarray(s).astype(np.float32); a[...,3]=edge_fade(a[...,3],c['fade'],c['fade_bottom'])
    s=Image.fromarray(a.astype(np.uint8),'RGBA')
    bb=s.getchannel('A').point(lambda x:255 if x>16 else 0).getbbox(); s=s.crop(bb)  # visible figure only
    vis=c['h']*H*(bb[3]-bb[1])/400*v['scale']; vis=min(vis,v['max_vis']*H)           # never taller than max_vis (no crop)
    sc=vis/s.height; s=s.resize((round(s.width*sc),round(s.height*sc)),Image.LANCZOS)
    r,p,t=c['unsharp']; s=s.filter(ImageFilter.UnsharpMask(r,p,t))
    al=s.getchannel('A')
    if v.get('fade_bbox'):  # feather top fraction of the CROPPED bbox (kills flat cut at funnel top)
        k=max(1,int(s.height*v['fade_bbox'])); ry=np.clip(np.arange(s.height)/k,0,1); ry=(ry*ry*(3-2*ry))[:,None]
        al=Image.fromarray((np.asarray(al).astype(np.float32)*ry).astype(np.uint8)); s.putalpha(al)
    if v['erode']:
        al=al.filter(ImageFilter.MinFilter(2*v['erode']+1)).filter(ImageFilter.GaussianBlur(0.6)); s.putalpha(al)
    if v['soften']:
        bl=s.filter(ImageFilter.GaussianBlur(1.4)); s=Image.blend(s,bl,v['soften']); s.putalpha(al)
    a=np.asarray(s).astype(np.float32); rng=np.random.default_rng(7)
    gs=v['canvas_grain'] or c['grain']*1.0
    g=np.asarray(Image.fromarray(np.clip(rng.normal(128,40,a.shape[:2]),0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32)-128
    a[...,:3]=np.clip(a[...,:3]+g[...,None]*gs/20,0,255)
    if v.get('eyes'):  # shrink/dim saturated blue eye blobs: blend toward surrounding colour
        e=v['eyes']; rgb=a[...,:3]; m=np.clip((rgb[...,2]-rgb[...,0]-e['thr'])/40,0,1)*(rgb[...,2]>200)
        mi=Image.fromarray((m*255).astype(np.uint8)); wide=np.asarray(_blur(mi.filter(ImageFilter.MaxFilter(e['grow']|1)),2)).astype(np.float32)/255
        core=np.asarray(_blur(mi,e['core_blur'])).astype(np.float32)/255
        keep=1-(1-core)*0+0; w=1-(1-wide)  # w: region to repaint
        ok=(1-wide)[...,None]*(al_f:=np.asarray(al).astype(np.float32)[...,None]/255)
        sur=np.stack([np.asarray(_blur(Image.fromarray(np.clip(rgb[...,i]*ok[...,0],0,255).astype(np.uint8)),14)).astype(np.float32) for i in range(3)],-1)
        nrm=np.asarray(_blur(Image.fromarray((ok[...,0]*255).astype(np.uint8)),14)).astype(np.float32)[...,None]/255+1e-3
        sur=np.clip(sur/nrm,0,255)
        mix=np.clip(wide*(1-e['keep']*np.clip(core*2,0,1)),0,1)[...,None]
        a[...,:3]=rgb*(1-mix)+sur*mix
    pos=(round(c.get('v2',{}).get('cx',c['cx'])*W-s.width/2),round(c['bot']*H-s.height))
    if v['darken']:  # darken backdrop behind the figure (soft ellipse)
        yy,xx=np.mgrid[0:H,0:W].astype(np.float32); cx=pos[0]+s.width/2; cy=pos[1]+s.height*0.5
        d=((xx-cx)/(s.width*v['darken_r']))**2+((yy-cy)/(s.height*v['darken_r']))**2
        m=np.exp(-d*1.6)*v['darken']; b=np.asarray(bg).astype(np.float32); b[...,:3]*=(1-m)[...,None]; bg=Image.fromarray(b.astype(np.uint8),'RGBA')
    full=Image.new('L',(W,H),0); full.paste(al,pos); fa=np.asarray(full).astype(np.float32)/255
    if v['glow']:
        gl=v['glow']; ga=np.asarray(_blur(full.filter(ImageFilter.MaxFilter(9)),gl['radius'])).astype(np.float32)/255
        bg.alpha_composite(_layer((W,H),gl['color'],np.clip(ga*gl['strength']*1.6,0,1)*(1-fa*0.0)))
    contact(bg,s,pos,c['shadow'])
    if v['drop']:
        sh=Image.new('L',(W,H),0); sh.paste(al,(pos[0],pos[1]+v['drop']//2)); sh=_blur(sh,v['drop'])
        bg.alpha_composite(_layer((W,H),(0,0,0),np.asarray(sh).astype(np.float32)/255*0.85))
    if v['rim']:  # warm rim on the upper-left edge band
        rm=v['rim']; sh=Image.new('L',s.size,0); sh.paste(al,(rm['width'],rm['width']))
        band=np.clip((np.asarray(al).astype(np.float32)-np.asarray(sh).astype(np.float32))/255,0,1)
        band=np.asarray(_blur(Image.fromarray((band*255).astype(np.uint8)),1.2)).astype(np.float32)/255*rm['strength']
        col=np.array(rm['color'],np.float32); a[...,:3]=a[...,:3]*(1-band[...,None])+col*band[...,None]
    s=Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGBA'); s.putalpha(al)
    bg.alpha_composite(s,pos); return bg.convert('RGB')
def sheet_v2(out,cw=480):
    ch=round(cw*768/1344); S=Image.new('RGB',(cw*4,ch*2),(0,0,0)); d=ImageDraw.Draw(S)
    for i,h in enumerate(V2_ORDER):
        x,y=(i%2)*cw*2,(i//2)*ch; v1=CFG['heroes'][h]['v2']['pick']
        for j,(f,l) in enumerate([(f'comp_{h}'+('_B' if v1=='B' else '')+'.png','v1'),(f'comp_{h}_v2.png','v2')]):
            S.paste(Image.open('originals-cutin/'+f).resize((cw,ch),Image.LANCZOS),(x+j*cw,y)); d.text((x+j*cw+6,y+4),f'{h} {l}',fill=(255,255,255))
    S.save(out)
if __name__=='__main__' and '--v2' in sys.argv:
    if 'v3' in sys.argv:
        comp_v2('echo','v3').save('originals-cutin/comp_echo_v3.png'); print('v3 echo'); sys.exit()
    for h in V2_ORDER: comp_v2(h).save(f'originals-cutin/comp_{h}_v2.png'); print('v2',h)
    sheet_v2('originals-cutin/sheet_v2.png')
