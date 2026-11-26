import sys
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter
M="/Users/henry.chan/tamingTheElements"; out=sys.argv[1]
P={"curomo":(-85,0.78),"rokcore":(-88,0.8),"ishimi":(-90,0.78)}
for h,(ang,sq) in P.items():
    im=Image.open(f"{M}/public/assets/img/map/{h}Large.png").convert("RGBA"); im=im.crop(im.getbbox())
    pad=Image.new("RGBA",(int(im.width*2),int(im.height*2)),(0,0,0,0)); pad.alpha_composite(im,((pad.width-im.width)//2,(pad.height-im.height)//2))
    r=pad.rotate(ang,resample=Image.BICUBIC,expand=True); r=r.crop(r.getbbox())
    r=r.resize((r.width,int(r.height*sq)),Image.LANCZOS)
    rgb=ImageEnhance.Brightness(ImageEnhance.Color(r.convert("RGB")).enhance(0.55)).enhance(0.68); rgb.putalpha(r.getchannel("A"))
    cw,ch=r.width+160,r.height+120; c=Image.new("RGBA",(cw,ch),(0,0,0,0)); floor=ch-50
    sh=Image.new("RGBA",(cw,ch),(0,0,0,0)); ImageDraw.Draw(sh).ellipse([70,floor-r.height*0.06-8,cw-70,floor+14],fill=(0,0,0,170)); c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
    c.alpha_composite(rgb,((cw-r.width)//2,floor-r.height+14)); c.save(f"{out}/{h}_ko.png")
