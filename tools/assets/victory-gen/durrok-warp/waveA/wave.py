# Wave A victory warps (source px coords, 400x400 Large sprites). Run from .scratch/victory-warp: ../../../../../../claudetmp/venv/bin/python -I waveA/wave.py [hero...]
import sys, math, numpy as np
sys.path.insert(0, '.')
from PIL import Image, ImageDraw, ImageFilter
import warp as W
PAD = 150
def pmask(size, pts, blur=0):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon([(x+PAD, y+PAD) for x, y in pts], fill=255)
    if blur: m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m, np.float32)/255
def sstep(t): return W.sstep(t)
def loadp(n):
    a = np.asarray(Image.open(f'../../public/assets/img/map/{n}Large.png').convert('RGBA'))
    h, w = a.shape[:2]; b = np.zeros((h+2*PAD, w+2*PAD, 4), np.uint8); b[PAD:PAD+h, PAD:PAD+w] = a; return a, b
def zone_warp(base, zones):
    """zones: (pivot(x,y src), deg CCW, weightfn(x,y src coords)->0..1). Smooth weighted rotation, no cut."""
    f = base.astype(np.float32)/255; pm = np.concatenate([f[..., :3]*f[..., 3:], f[..., 3:]], -1)
    H, Wd = f.shape[:2]; yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32); sx, sy = xx-PAD, yy-PAD
    qx, qy = xx.copy(), yy.copy()
    for _ in range(6):
        ox = np.zeros_like(xx); oy = np.zeros_like(yy)
        for (cx, cy), deg, wf in zones:
            w = wf(qx-PAD, qy-PAD); a = math.radians(deg)*w; ca, sa = np.cos(a), np.sin(a)
            dx, dy = xx-(cx+PAD), yy-(cy+PAD)
            ox += (cx+PAD) + dx*ca - dy*sa - xx; oy += (cy+PAD) + dx*sa + dy*ca - yy
        qx, qy = xx+ox, yy+oy
    out = W.remap(pm, qx, qy); a = out[..., 3:]
    return np.clip(np.concatenate([out[..., :3]/np.maximum(a, 1e-6), a], -1), 0, 1)
def limb_warp(base, parts, clones=()):
    """parts: (layer poly, removal poly, pivot, deg CCW, z). clones: (poly, sx, sy, blur) bark/rock fill before cut."""
    H, Wd = base.shape[:2]; size = (Wd, H); bf = base.astype(np.float32)/255; alpha = bf[..., 3]
    for poly, sx, sy, bl in clones:
        m = (pmask(size, poly, bl)*(alpha > 0.5))[..., None]; sh = W.shift(bf, sx, sy)
        bf = W.over(bf, np.concatenate([sh[..., :3], sh[..., 3:]*m], -1))
    alpha = bf[..., 3]; layers = []; removed = np.zeros((H, Wd), np.float32)
    for lay, rm, piv, deg, z in parts:
        lm = np.clip(pmask(size, lay, 2.0)*1.4, 0, 1)*(alpha > 0.02)
        part = bf.copy(); part[..., 3] = alpha*lm
        M = W.rotm(deg, (piv[0]+PAD, piv[1]+PAD))
        wl = W.warp((part*255+0.5).astype(np.uint8), M).astype(np.float32)/255
        layers.append((z, wl)); removed = np.maximum(removed, pmask(size, rm, 2.0))
    keep = bf.copy(); keep[..., 3] = bf[..., 3]*(1-np.clip(removed, 0, 1)); out = keep
    for z, l in sorted(layers, key=lambda t: -t[0]):
        if z < 0: out = W.over(l, out)
    for z, l in sorted(layers, key=lambda t: t[0]):
        if z >= 0: out = W.over(out, l)
    return np.clip(out, 0, 1)
def finish(name, out):
    a = (out*255+0.5).astype(np.uint8); ys, xs = np.nonzero(a[..., 3] > 8)
    a = a[ys.min():ys.max()+1, xs.min():xs.max()+1]; h, w = a.shape[:2]
    s = min(0.72*1024/h, 0.92*1024/w); im = Image.fromarray(a, 'RGBA'); im = im.resize((round(w*s), round(h*s)), Image.LANCZOS)
    cv = Image.new('RGBA', (1024, 1024), (128, 128, 128, 255)); cv.alpha_composite(im, ((1024-im.width)//2, (1024-im.height)//2))
    cv.convert('RGB').save(f'waveA/{name}_win.png'); im.save(f'waveA/{name}_win_rgba.png'); print(name, 'subject', im.size)
    return cv.convert('RGB')
Z = lambda f: f
HEROES = {}
def sindarosa(b):
    head = lambda x, y: sstep((x-285)/30)*sstep((250-y)/40)
    return zone_warp(b, [((315, 215), 24, head)])
def curomo(b):
    head = lambda x, y: sstep((x-245)/20)*sstep((215-y)/65)
    wing = lambda x, y: sstep((235-x)/90)*sstep((210-y)/50)
    return zone_warp(b, [((295, 85), 26, head), ((230, 150), -14, wing)])
def rokcore(b):
    R = [(262,95),(330,60),(400,70),(400,320),(285,320),(262,200)]; L = [(0,60),(110,75),(125,200),(105,330),(0,330)]
    Lrm = [(0,170),(105,170),(125,200),(105,330),(0,330)]; Rrm = [(285,170),(262,200),(285,320),(400,320),(400,170)]
    Rrm = [(300,160),(280,200),(276,260),(272,300),(280,350),(400,350),(400,160)]
    return limb_warp(b, [(R, Rrm, (295,125), 130, 1)])
def lavax(b):
    R = [(285,120),(340,110),(400,140),(400,320),(290,320),(280,200)]; L = [(0,120),(80,110),(110,150),(100,320),(0,320)]
    Lrm = [(0,170),(95,170),(100,320),(0,320)]; Rrm = [(290,170),(285,200),(290,320),(400,320),(400,170)]
    return limb_warp(b, [(R, Rrm, (305,145), 130, 1)])
def morblass(b):
    L = [(15,75),(105,55),(135,100),(125,190),(115,270),(100,292),(8,292),(0,200),(10,120)]
    R = [(245,70),(300,60),(375,95),(395,200),(395,290),(262,292),(245,200)]
    Lr = [(15,85),(105,70),(125,110),(118,190),(108,262),(95,280),(10,280),(2,200),(10,120)]
    Rr = [(250,85),(300,70),(372,100),(392,200),(392,282),(268,282),(250,200)]
    return limb_warp(b, [(L, Lr, (110,100), -125, -1), (R, Rr, (255,100), 125, 1)])
FN = dict(sindarosa=sindarosa, curomo=curomo, rokcore=rokcore, lavax=lavax, morblass=morblass)
if __name__ == '__main__':
    names = sys.argv[1:] or list(FN)
    for n in names:
        src, b = loadp(n); out = FN[n](b); cv = finish(n, out)
        S = Image.new('RGB', (1800, 1024), (128, 128, 128)); o = Image.fromarray(src, 'RGBA').resize((800, 800), Image.LANCZOS)
        S.paste(o, (0, 112), o); S.paste(cv, (800, 0)); S.save(f'waveA/cmp_{n}.png')
