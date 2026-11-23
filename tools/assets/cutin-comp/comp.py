# CPU/PIL preview composites of roster24 super cut-ins. Usage: python -I comp.py (from .scratch)
import numpy as np, sys, json
from PIL import Image, ImageFilter, ImageDraw
S='.scratch/' if False else ''
BD={'kindrel':'fetch-8e3c/out/cutin_r24_kindrel_53003_1344x768.png','zephra':'fetch-8e3c/out/cutin_r24_zephra_53020_1344x768.png',
'hyalia':'fetch-8e3c/out/cutin_r24_hyalia_53030_1344x768.png','brazgor':'fetch-8e3c/out/cutin_r24_brazgor_53010_1344x768.png',
'durrok':'fetch-8e3c/out/cutin_r24_durrok_53041_1344x768.png','quarrak':'fetch-de9c/out/cutin_r24_quarrak_53052_1344x768.png',
'abyssor':'fetch-de9c/out/cutin_r24_abyssor_53062_1344x768.png','nykra':'fetch-de9c/out/cutin_r24_nykra_53072_1344x768.png',
'glimmaw':'fetch-de9c/out/cutin_r24_glimmaw_53083_1344x768.png','umbrel':'fetch-de9c/out/cutin_r24_umbrel_53091_1344x768.png',
'ouroth':'fetch-5d25/out/cutin_r24_ouroth_53111_1344x768.png','vortigal':'fetch-9647/out/cutin_r24_vortigal_r2_53122_1344x768.png'}
SUB={'abyssor':'matte/abyssor-96322.png','brazgor':'matte/brazgor-96003.png','durrok':'r24-durrok-regrade/durrok-120651-rg3.png',
'glimmaw':'matte/glimmaw-96303.png','hyalia':'matte/hyalia-96433.png','kindrel':'matte/kindrel2.png','nykra':'matte/nykra-94301.png',
'ouroth':'matte/ouroth-95402.png','quarrak':'matte/quarrak-96214.png','umbrel':'matte/umbrel-96104.png','vortigal':'matte/vortigal.png','zephra':'matte/zephra-120803.png'}
# side the hero sits on, flip = mirror the subject; filled in after viewing
CFG=json.load(open('r24-cutin-comp/cfg.json')) if len(sys.argv)>1 else {}
def key(path,thr=12,k=9,g=5,desat=0):
    a=np.asarray(Image.open(path).convert('RGB')).astype(int)
    d=np.abs(a-128).max(axis=2)>thr
    if desat:
        d&=~(((a.max(axis=2)-a.min(axis=2))<desat)&(np.abs(a-128).max(axis=2)<50))
    m=Image.fromarray((d*255).astype(np.uint8))
    m=m.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    # keep largest-ish: drop tiny specks done by open; fill holes by close
    m=m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    m=m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    im=Image.open(path).convert('RGBA'); im.putalpha(m)
    return im.crop(im.getbbox())
def comp(h):
    c=CFG.get(h,{})
    bg=Image.open(BD[h]).convert('RGBA'); W,H=bg.size
    s=key(SUB[h],desat=c.get('desat',0))
    if c.get('flip'): s=s.transpose(Image.FLIP_LEFT_RIGHT)
    th=c.get('h',0.78)*H; sc=min(th/s.height,(c.get('wmax',0.6)*W)/s.width)
    s=s.resize((int(s.width*sc),int(s.height*sc)),Image.LANCZOS)
    cx=c.get('cx',0.5)*W; bot=c.get('bot',0.93)*H
    bg.alpha_composite(s,(int(cx-s.width/2),int(bot-s.height)))
    return bg.convert('RGB')
if __name__=='__main__':
    ims={}
    for h in BD:
        ims[h]=comp(h); ims[h].save(f'r24-cutin-comp/cutin_comp_{h}.png')
    hs=sorted(BD); tw,th=448,256
    sh=Image.new('RGB',(tw*4,th*3))
    for i,h in enumerate(hs):
        sh.paste(ims[h].resize((tw,th),Image.LANCZOS),((i%4)*tw,(i//4)*th)); ImageDraw.Draw(sh).text(((i%4)*tw+6,(i//4)*th+4),h,fill=(255,255,255))
    sh.save('r24-cutin-comp/contact_sheet_4x3.png')
