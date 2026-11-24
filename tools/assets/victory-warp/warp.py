# Victory stills, round 2: cut-out limb layers + feathered bark clones (Treenoc), smooth weighted neck warp (Kindrel).
# View coordinates are 2x source (halved on load). Run from repo root: ~/claudetmp/venv/bin/python -I tools/assets/victory-warp/warp.py (writes .scratch/victory-warp/)
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC = 'public/assets/img/map/%sLarge.png'
OUT = '.scratch/victory-warp/'; os.makedirs(OUT, exist_ok=True)
import os
DEBUG = os.environ.get('DBG') == '1'
FADE_X0 = 360; FADE_W = 26
MARGIN = 36
CLONES = [([(170,285),(250,285),(275,340),(250,365),(190,350)], 0, 40, 5),
          ([(330,430),(352,430),(356,560),(334,560)], 22, 0, 3)]
HOLLOW_SRC = (-65, 145)  # source = target + this, in source px

def poly_mask(size, pts, blur=0, off=(0, 0)):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x*0.5+off[0], y*0.5+off[1]) for x, y in pts], fill=255)
    if blur: m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m, np.float32)/255

def rotm(deg, c):  # visual CCW rotation about c as forward 3x3 (y down)
    a = math.radians(deg); ca, sa = math.cos(a), math.sin(a)
    R = np.array([[ca, sa, 0], [-sa, ca, 0], [0, 0, 1]], float)
    T1 = np.array([[1, 0, -c[0]], [0, 1, -c[1]], [0, 0, 1]], float)
    T2 = np.array([[1, 0, c[0]], [0, 1, c[1]], [0, 0, 1]], float)
    return T2 @ R @ T1
def trans(dx, dy): return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], float)

def warp(rgba, M):
    im = Image.fromarray(rgba, 'RGBA').convert('RGBa')
    Mi = np.linalg.inv(M)
    out = im.transform(im.size, Image.AFFINE, tuple(Mi[:2].ravel()), Image.BICUBIC)
    return np.asarray(out.convert('RGBA'))

def over(dst, src):
    sa, da = src[..., 3:], dst[..., 3:]
    oa = sa + da*(1-sa)
    rgb = (src[..., :3]*sa + dst[..., :3]*da*(1-sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa], -1)

def shift(a, dx, dy):  # out[y,x] = a[y+dy, x+dx] (integer), edge-clamped
    H, W = a.shape[:2]
    ys = np.clip(np.arange(H)+dy, 0, H-1); xs = np.clip(np.arange(W)+dx, 0, W-1)
    return a[ys][:, xs]

def load(name, pad):
    src = np.asarray(Image.open(SRC % name).convert('RGBA'))
    h, w = src.shape[:2]
    base = np.zeros((h+pad[1]+pad[3], w+pad[0]+pad[2], 4), np.uint8)
    base[pad[1]:pad[1]+h, pad[0]:pad[0]+w] = src
    return src, base

def build_treenoc():
    pad = (170, 130, 170, 20); off = (pad[0], pad[1])
    src, base = load('treenoc', pad)
    H, W = base.shape[:2]; size = (W, H)
    alpha = base[..., 3].astype(np.float32)/255
    bf = base.astype(np.float32)/255
    # pre-pass: replace the dark hollow behind the right arm with bark cloned from the intact trunk (feathered, opaque pixels only)
    hollow = [(436,250),(470,232),(545,262),(552,335),(525,425),(488,448),(440,448)]
    m = (poly_mask(size, hollow, 4, off) * (alpha > 0.5))[..., None]
    sh = shift(bf, HOLLOW_SRC[0], HOLLOW_SRC[1])
    bf = over(bf, np.concatenate([sh[..., :3], sh[..., 3:]*m], -1))
    # left-shoulder dark hollow + torso dark seam: clone adjacent bark (view coords, shift in source px)
    for poly, sx, sy, bl in CLONES:
        m = (poly_mask(size, poly, bl, off) * (alpha > 0.5))[..., None]
        sh = shift(bf, sx, sy)
        bf = over(bf, np.concatenate([sh[..., :3], sh[..., 3:]*m], -1))
    base = (bf*255+0.5).astype(np.uint8); alpha = bf[..., 3]
    P = lambda pts, b=1.2: poly_mask(size, pts, b, off)
    pv = lambda x, y: (x*0.5+off[0], y*0.5+off[1])
    # --- parts: (layer poly, removal poly, matrix, z)
    left_layer = [(40,245),(105,232),(150,262),(150,340),(122,350),(118,455),(180,468),(240,462),(252,480),(250,522),(212,540),
                  (165,548),(140,585),(152,612),(188,648),(203,674),(186,678),(150,648),(112,646),(80,640),(40,600),(20,520),(8,420),(10,330),(34,290)]
    left_rm = [(x if x < 110 or y > 340 else 110, y) for x, y in left_layer]
    ML = rotm(-142, pv(112, 300))
    right_poly = [(448,218),(600,235),(640,205),(785,205),(830,300),(830,600),(700,620),(540,600),(470,560),(445,440),(440,260)]
    MR = rotm(34, pv(500, 330))
    parts = [(left_layer, left_rm, ML, -1), (right_poly, right_poly, MR, 5)]
    layers = []; removed = np.zeros((H, W), np.float32)
    for lay, rm, M, z in parts:
        lm = np.clip(P(lay, 3.0)*1.6, 0, 1) * (alpha > 0.02)  # whole arm mass incl. branch tips; soft 6-10px edge
        part = base.copy(); part[..., 3] = (alpha*lm*255).astype(np.uint8)
        wl = warp(part, M).astype(np.float32)/255
        if DEBUG: wl[..., :3] = wl[..., :3]*0.4 + np.array([0.6, 0, 0.6] if z < 0 else [0, 0.6, 0.6])
        if z > 0:  # soften boxy shoulder: smooth contour + feathered blend into trunk (6-10px)
            a = Image.fromarray((wl[..., 3]*255).astype(np.uint8)); xs_ = np.arange(W)[None, :]
            sm = np.asarray(a.filter(ImageFilter.GaussianBlur(5)), np.float32)/255
            sm = sstep((sm-0.35)/0.3)
            region = sstep((520-xs_)/90.0) * np.ones((H, 1), np.float32)  # 1 near the shoulder, 0 at the hand
            wl[..., 3] = wl[..., 3]*(1-region) + np.maximum(sm, 0)*region*(wl[..., 3] > 0.02).astype(np.float32).clip(0, 1)*0 + sm*region
            wl[..., 3] *= sstep((xs_-FADE_X0)/FADE_W)
        layers.append((z, wl))
        removed = np.maximum(removed, P(rm, 2.5))
    keep = bf.copy(); keep[..., 3] = bf[..., 3]*(1-np.clip(removed*1.0, 0, 1))
    out = keep
    for z, l in sorted(layers, key=lambda t: -t[0]):
        if z < 0: out = over(l, out)
    for z, l in sorted(layers, key=lambda t: t[0]):
        if z >= 0: out = over(out, l)
    out = np.clip(out, 0, 1)
    out[365:400, 505:590, 3] = 0  # floating lower finger-branch tip left by the rotation
    out = deorphan(out, 450)
    return src, out

def deorphan(out, minpx=150):
    from collections import deque
    m = out[..., 3] > 0.1; H, W = m.shape; seen = np.zeros_like(m); out = out.copy()
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]: continue
        comp = [(y0, x0)]; seen[y0, x0] = True; q = deque(comp)
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y+dy, x+dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True; comp.append((yy, xx)); q.append((yy, xx))
        if len(comp) < minpx:
            for y, x in comp: out[y, x, 3] = 0
    return out

def remap(arr, qx, qy):  # bilinear sample premultiplied
    H, W = arr.shape[:2]
    x0 = np.floor(qx).astype(int); y0 = np.floor(qy).astype(int); fx = (qx-x0)[..., None]; fy = (qy-y0)[..., None]
    def g(yy, xx):
        ok = ((yy >= 0) & (yy < H) & (xx >= 0) & (xx < W))[..., None]
        return np.where(ok, arr[np.clip(yy, 0, H-1), np.clip(xx, 0, W-1)], 0)
    return (g(y0, x0)*(1-fx)*(1-fy) + g(y0, x0+1)*fx*(1-fy) + g(y0+1, x0)*(1-fx)*fy + g(y0+1, x0+1)*fx*fy)

def sstep(t): t = np.clip(t, 0, 1); return t*t*(3-2*t)

def build_kindrel():
    pad = (60, 60, 60, 10)
    src, base = load('kindrel', pad)
    H, W = base.shape[:2]
    f = base.astype(np.float32)/255
    pm = np.concatenate([f[..., :3]*f[..., 3:], f[..., 3:]], -1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = lambda x, y: (x*0.5+pad[0], y*0.5+pad[1])
    qx, qy = xx.copy(), yy.copy()
    # head/neck: weighted CCW rotation about neck pivot, weight ramps down the neck (smooth, no cut)
    cx, cy = v(350, 235); th = math.radians(24)
    for _ in range(6):
        w = sstep((v(0, 340)[1]-qy)/(v(0, 340)[1]-v(0, 190)[1]))
        a = th*w; ca, sa = np.cos(a), np.sin(a)
        dx, dy = xx-cx, yy-cy
        # inverse of CCW visual rotation by a: source = R(-a) applied to p-c  (y down)
        qx = cx + dx*ca - dy*sa; qy = cy + dx*sa + dy*ca
    out = remap(pm, qx, qy)
    a = out[..., 3:]; rgb = out[..., :3]/np.maximum(a, 1e-6)
    return src, np.clip(np.concatenate([rgb, a], -1), 0, 1)

def finish(name, out):
    a = (out*255+0.5).astype(np.uint8)
    ys, xs = np.nonzero(a[..., 3] > 8); m = MARGIN
    y0, y1, x0, x1 = max(ys.min()-m, 0), min(ys.max()+m, a.shape[0]), max(xs.min()-m, 0), min(xs.max()+m, a.shape[1])
    a = a[y0:y1, x0:x1]; print('crop off', x0, y0)
    im = Image.fromarray(a, 'RGBA'); im.save(f'{OUT}{name}_win.png')
    bg = Image.new('RGBA', im.size, (128, 128, 128, 255)); bg.alpha_composite(im); bg.convert('RGB').save(f'{OUT}{name}_win_808080.png')
    print(name, im.size, 'top margin', ys.min()-y0 if ys.min()-y0 < m else m)
    return im

if __name__ == '__main__':
    sheet = []
    for name, fn in (('treenoc', build_treenoc), ('kindrel', build_kindrel)):
        src, out = fn()
        sheet.append((Image.fromarray(src, 'RGBA'), finish(name, out)))
    r2 = Image.open(OUT + 'treenoc_win_r2.png').convert('RGBA')
    sheet[0] = (sheet[0][0], r2, sheet[0][1])
    sheet = [t if len(t) == 3 else t for t in sheet]
    H = max(max(im.height for im in t) for t in sheet)
    Wd = sum(sum(im.width+15 for im in t) for t in sheet)
    S = Image.new('RGBA', (Wd, H), (128, 128, 128, 255)); x = 0
    for t in sheet:
        for im in t:
            S.alpha_composite(im, (x, (H-im.height)//2)); x += im.width + 15
    S.convert('RGB').save(OUT + 'sheet.png')
