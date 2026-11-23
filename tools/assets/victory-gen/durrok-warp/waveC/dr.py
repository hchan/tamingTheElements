# Durrok victory (rear up, trunk raised). Run from .scratch/victory-warp: ~/claudetmp/venv/bin/python -I waveC/dr.py [v..]
# Layers cut from the standing matte: trunk, front-leg block (upper + folded lower), torso rotated by a smooth weighted zone.
import sys; sys.path.insert(0,'.'); sys.path.insert(0,'waveA')
import numpy as np
from PIL import Image, ImageFilter
import warp as W, wave as V
V.PAD = PAD = 400
S = V.sstep
SRC = '../r24-durrok-regrade/durrok-120651-rg3.png'
def load():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
    m = (np.abs(a-128).max(axis=2) > 14)
    m = Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    al = np.clip((np.asarray(m.filter(ImageFilter.GaussianBlur(1.0)), np.float32)-60)/120, 0, 1)
    rgba = np.dstack([a, al*255]).astype(np.uint8)
    h, w = rgba.shape[:2]; b = np.zeros((h+2*PAD, w+2*PAD, 4), np.uint8); b[PAD:PAD+h, PAD:PAD+w] = rgba
    return b
TRUNK = [(840,285),(1000,285),(1000,600),(960,680),(900,700),(868,696),(846,676),(842,650),(856,626),(878,570),(880,480),(862,400),(820,330)]
def build(b, rear, trunk, upper, lower, head):
    H, Wd = b.shape[:2]; size = (Wd, H); bf = b.astype(np.float32)/255; alpha = bf[..., 3]
    yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32); sx, sy = xx-PAD, yy-PAD
    mt = np.clip(V.pmask(size, TRUNK, 2.5)*1.3, 0, 1)*S((sy-300)/70)          # soft root, tight outline
    ml = S((sy-450)/40)*S((sx-458)/10)*(1-mt)                                   # front legs, soft top and rear edge
    def part(m):
        p = bf.copy(); p[..., 3] = alpha*m; return (p*255+.5).astype(np.uint8)
    import math
    def layer(m, piv, deg, base=None):
        p = (bf if base is None else base).copy()
        if base is None: p[..., 3] = alpha*m
        return W.warp((p*255+.5).astype(np.uint8), W.rotm(deg, (piv[0]+PAD, piv[1]+PAD))).astype(np.float32)/255
    knee_w = S((sy-610)/40)                                   # soft crossfade at the knee, no straight cut
    sh = (540, 470); a_ = math.radians(upper); kx, ky = 650-sh[0], 640-sh[1]
    kn = (sh[0] + kx*math.cos(a_) + ky*math.sin(a_), sh[1] - kx*math.sin(a_) + ky*math.cos(a_))
    up = layer(ml*(1-knee_w), sh, upper)
    lo = layer(ml*knee_w, sh, upper)
    lo = W.warp((lo*255+.5).astype(np.uint8), W.rotm(lower, (kn[0]+PAD, kn[1]+PAD))).astype(np.float32)/255
    legs = W.over(up, lo)
    tr = layer(mt, (905, 300), trunk)
    keep = bf.copy(); keep[..., 3] = alpha*(1-np.maximum(mt, ml))
    out = np.clip(W.over(W.over(keep, legs), tr), 0, 1)
    o8 = (out*255+.5).astype(np.uint8)
    body = lambda x, y: S((x-300)/260)
    return V.zone_warp(o8, [((380, 560), rear, body), ((760, 220), head, lambda x, y: S((x-640)/80)*S((260-y)/60))])
def finish(out):
    out = out.copy(); out[..., 3] = np.clip((out[..., 3]-0.12)/0.45, 0, 1)   # firm up haze left by the soft crossfades
    a = (out*255+.5).astype(np.uint8); a[a[..., 3] < 8] = 0
    from scipy import ndimage as ndi
    lab, n = ndi.label(a[..., 3] > 8, np.ones((3,3)))
    if n > 1:
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, n+1)); keepl = [i+1 for i, s in enumerate(sizes) if s > 2500]
        a[~np.isin(lab, keepl)] = 0
    op = ndi.binary_opening(a[..., 3] > 40, iterations=2); op = ndi.binary_dilation(op, iterations=3); a[~op] = 0
    ys, xs = np.nonzero(a[..., 3] > 8); a = a[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = a.shape[:2]; s = min(.72*1024/h, .92*1024/w); im = Image.fromarray(a, 'RGBA').resize((round(w*s), round(h*s)), Image.LANCZOS)
    cv = Image.new('RGBA', (1024, 1024), (128,128,128,255)); cv.alpha_composite(im, ((1024-im.width)//2, (1024-im.height)//2))
    return cv.convert('RGB'), im.size
# rear, trunk, upper-leg, lower fold, head
VARS = dict(v5=(12, 100, 45, 0, 5), v6=(10, 95, 62, 0, 4), v1=(14, 105, 40, -45, 6), v2=(20, 120, 55, -60, 8), v3=(10, 95, 30, -35, 4), v4=(18, 135, 70, -70, 6))
if __name__ == '__main__':
    b = load(); res = {}
    for n, p in VARS.items():
        if len(sys.argv) > 1 and n not in sys.argv[1:]: continue
        cv, sz = finish(build(b, *p)); cv.save(f'waveC/dr_{n}.png'); res[n] = cv; print(n, p, sz)
    names = list(res); S_ = Image.new('RGB', (512*len(names), 512), (128,128,128))
    for i, n in enumerate(names): S_.paste(res[n].resize((512, 512)), (512*i, 0))
    S_.save('waveC/_vars.png')
