import importlib.util, math, random, numpy as np
from PIL import Image, ImageDraw, ImageFilter
sp=importlib.util.spec_from_file_location('vw','.scratch/vic-warp/vw.py'); vw=importlib.util.module_from_spec(sp); sp.loader.exec_module(vw)
globals().update({k:getattr(vw,k) for k in 'N S B load place sample sm over XX YY straight fit'.split()})
OUT='.scratch/vic-warp2/'
def bolt(L,G,x,y,ang,length,rng,w0,br,depth=0):
    step=rng.uniform(14,22); n=max(3,int(length/step)); pts=[(x,y)]
    for i in range(n):
        ang+=rng.uniform(-.6,.6); x+=math.cos(ang)*step; y+=math.sin(ang)*step
        t=(i+1)/n; w=max(1,round(w0*(1-t)**.8+0.5)); v=int(255*min(1,br*(1-.45*t)*rng.uniform(.75,1.05)))
        L.line([pts[-1],(x,y)],fill=v,width=w); G.line([pts[-1],(x,y)],fill=int(v*.6),width=w*3+2); pts.append((x,y))
        if i>1 and w0>1.5 and rng.random()<.30: bolt(L,G,x,y,ang+rng.choice([-1,1])*rng.uniform(.4,1.0),length*(1-t)*rng.uniform(.3,.55),rng,max(1,w0*.55),br*.8,depth+1)
def run(tag,zoom,nb,seed,dark,arcs):
    base=place(load('wispera')); cx,cy=B(205,225)
    r=np.hypot(XX-cx,YY-cy); s=1+(zoom-1)*(1-sm(95*S,210*S,r)); k=np.where(r>1e-3,(r/s)/np.maximum(r,1e-3),1)
    out=sample(base,cx+(XX-cx)*k,cy+(YY-cy)*k)
    rng=random.Random(seed); rim=68*S*zoom
    # dark storm cloud underlay (original cloud kept, extended with noise)
    nz=np.asarray(Image.fromarray((np.random.RandomState(seed).rand(90,90)*255).astype(np.uint8)).resize((N,N),Image.BICUBIC).filter(ImageFilter.GaussianBlur(25)),np.float32)/255
    cl=np.exp(-(r/(105*S*zoom))**2.6)*np.clip(.55+(nz-.5)*2.2,0,1)*dark*sm(60*S*zoom,95*S*zoom,r)
    ca=cl[...,None]; cloud=np.concatenate([np.array([.06,.11,.19])*ca,ca],-1)
    out=over(cloud,out)
    # original arcs rotated into upper half
    st,al=straight(base); lum=st.mean(-1); arc=np.clip((lum-.55)/.3,0,1)*al[...,0]*sm(72*S,90*S,np.hypot(XX-B(205,225)[0],YY-B(205,225)[1]))
    arcL=np.concatenate([st*arc[...,None],arc[...,None]],-1)
    for deg,sc in arcs:
        th=math.radians(deg); c,sn=math.cos(th),math.sin(th); x=(XX-cx)/sc; y=(YY-cy)/sc
        rl=sample(arcL,cx+x*c+y*sn,cy-x*sn+y*c); up=sm(cy+20,cy-150*S,YY)[...,None]
        out=over(out,rl*up*.9)
    # tapered bolts
    L=Image.new('L',(N,N),0); G=Image.new('L',(N,N),0); dl=ImageDraw.Draw(L); dg=ImageDraw.Draw(G)
    for i in range(nb):
        ang=math.radians(-165+150*(i+rng.uniform(-.3,.3))/max(nb-1,1))
        bolt(dl,dg,cx+math.cos(ang)*rim*.97,cy+math.sin(ang)*rim*.97,ang,rng.uniform(240,480),rng,rng.uniform(4,6),rng.uniform(.8,1))
    Lf=np.asarray(L.filter(ImageFilter.GaussianBlur(.8)),np.float32)/255; Gf=np.asarray(G.filter(ImageFilter.GaussianBlur(6)),np.float32)/255
    ga=np.clip(Gf*.8,0,1)[...,None]; out=over(out,np.concatenate([np.array([.25,.6,1])*ga,ga],-1))
    la=Lf[...,None]; out=over(out,np.concatenate([(np.array([.8,.95,1])*la+.0),la],-1))
    core=np.exp(-(r/(45*S*zoom))**2); bloom=np.exp(-(r/(110*S*zoom))**2)*.25
    add=core[...,None]*np.array([.85,1,1])+bloom[...,None]*np.array([.3,.7,1])
    out[...,:3]=out[...,:3]+add*np.clip(out[...,3:]+0.9*(r[...,None]<rim*1.1),0,1)
    fit(out,OUT+f'wispera_{tag}.png',m=60)
run('a',1.3,8,5,1.5,[(70,1.25),(-60,1.15)])
run('b',1.3,10,11,1.5,[(120,1.3),(-110,1.2),(15,1.2)])
sh=Image.new('RGB',(1200,300),(40,40,40))
for c,p in enumerate(['.scratch/vic-orig2/in/wispera-grey.png','.scratch/vic-warp/wispera_a.png',OUT+'wispera_a.png',OUT+'wispera_b.png']): sh.paste(Image.open(p).convert('RGB').resize((300,300),Image.LANCZOS),(c*300,0))
sh.save(OUT+'sheet.png')
