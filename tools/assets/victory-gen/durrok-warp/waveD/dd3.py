# Durrok victory v3: full-length thick trunk (incl. the arm lying over the far leg) unwrapped and re-curled up/back at the same width;
# both tusks; near foreleg cut and lifted, vacated area filled with body pixels; hard edges.
# Run from .scratch/victory-warp: ~/claudetmp/venv-rembg/bin/python -I waveD/dd3.py [--final]
import sys; sys.path.insert(0,'.'); sys.path.insert(0,'waveA'); sys.path.insert(0,'waveC')
import numpy as np, cv2, math
from PIL import Image, ImageDraw
from scipy.interpolate import splprep, splev
from scipy.spatial import cKDTree
from scipy import ndimage as ndi
import warp as W, wave as V, dr
V.PAD = PAD = 400
S = W.sstep
OLD = [(923,300),(924,380),(922,460),(922,540),(920,600),(905,640),(880,664),(850,672),(825,655),(808,625),(800,590),(795,550),(790,510),(787,470)]
NEW = [(923,300),(924,380),(932,425),(965,448),(1000,430),(1022,385),(1030,310),(1024,225),(1002,150),(964,95),(918,62),(876,68),(850,100),(852,140),(878,165),(906,160)]
def curve(pts, step=1.0):
    t, _ = splprep(np.array(pts, float).T, s=0, k=3)
    u = np.linspace(0, 1, 6000); x, y = splev(u, t)
    d = np.r_[0, np.cumsum(np.hypot(np.diff(x), np.diff(y)))]
    s = np.arange(0, d[-1], step); return np.interp(s, d, x), np.interp(s, d, y), d[-1]
def normals(x, y):
    dx = np.gradient(x); dy = np.gradient(y); n = np.hypot(dx, dy); return -dy/n, dx/n
K = [0,100,250,330,420,520,640]; HWK = [46,44,34,25,23,19,12]
def hwp(s): return np.interp(s, K, HWK)
def build(b):
    H, Wd = b.shape[:2]; bf = b.astype(np.float32)/255
    a0 = bf[..., 3] > .5; lab0, n0 = ndi.label(~a0); sz0 = ndi.sum(np.ones_like(lab0), lab0, range(1, n0+1))
    small = np.isin(lab0, [k+1 for k, z in enumerate(sz0) if z < 700]); bf[..., 3] = np.where(small, 1.0, bf[..., 3]); al = bf[..., 3]
    ox, oy, Lo = curve(OLD); nS = len(ox); nx, ny = normals(ox, oy); ox += PAD; oy += PAD
    yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32); pts = np.c_[xx.ravel(), yy.ravel()]
    tree = cKDTree(np.c_[ox, oy]); d, i = tree.query(pts, workers=-1); d = d.reshape(H, Wd); i = i.reshape(H, Wd)
    s_old = i.astype(np.float32)
    rgb = bf[..., :3]; mx = rgb.max(-1); mn = rgb.min(-1)
    cream = ((mx > .55) & (mx-mn < .42) & (rgb[...,0] >= rgb[...,1]-.04) & (rgb[...,0] > rgb[...,2])).astype(np.float32)
    def box(x0,y0,x1,y1):
        m = np.zeros((H, Wd), np.float32); m[PAD+y0:PAD+y1, PAD+x0:PAD+x1] = 1; return m
    ntm = cv2.morphologyEx((cream*box(828,300,935,470)).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5,5), np.uint8))
    nl, lab_, st_, _ = cv2.connectedComponentsWithStats(ntm); ntm = (lab_ == 1+np.argmax(st_[1:, 4])).astype(np.uint8)       # near tusk, largest blob
    ntm_big = cv2.dilate(ntm, np.ones((9,9), np.uint8)).astype(np.float32); ntm = cv2.dilate(ntm, np.ones((5,5), np.uint8)).astype(np.float32)
    ftm = cream*box(950,330,995,380); ftm = cv2.dilate(ftm, np.ones((7,7)))                                                           # source far-tusk tip (removed, replaced by a full far tusk)
    S0 = 85; ramp = S((s_old-S0)/45)
    hw_old = hwp(s_old)+6
    inband = (d < hw_old).astype(np.float32)
    # strip unwrap (premultiplied), tusk removed
    T = np.arange(-60, 61); mapx = (ox[:, None]+nx[:, None]*T[None]).astype(np.float32); mapy = (oy[:, None]+ny[:, None]*T[None]).astype(np.float32)
    cl8 = cv2.inpaint((bf[..., :3]*255+.5).astype(np.uint8), (ntm_big*255).astype(np.uint8), 6, cv2.INPAINT_TELEA).astype(np.float32)/255
    pm = np.concatenate([cl8*al[..., None], al[..., None]], -1)
    sg = np.arange(nS)[:, None].astype(np.float32); Tg = np.abs(T)[None].astype(np.float32)
    hwm = hwp(sg)
    cap = np.sqrt(np.clip((nS-4-sg)/hwm, 0, 1))              # round end
    strip = cv2.remap(pm, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    # beyond s~300 the trunk lies over the leg/body (alpha is full everywhere), so the gate is geometric
    gate = np.clip((hwm*cap-Tg)/1.2, 0, 1)
    strip = np.clip(strip, 0, 1)*gate[..., None].astype(np.float32)
    strip[..., :3] = np.minimum(strip[..., :3], strip[..., 3:])
    cx, cy, Ln = curve(NEW); print('lengths old %.0f new %.0f nS %d' % (Lo, Ln, nS))
    if len(cx) < nS: print('WARNING new curve shorter than the strip; tip is cut')
    cx = cx[:nS]; cy = cy[:nS]; n_ = len(cx)
    ncx, ncy = normals(cx, cy); cx = cx+PAD; cy = cy+PAD
    tree2 = cKDTree(np.c_[cx, cy]); d2, j = tree2.query(pts, workers=-1); j = j.reshape(H, Wd); d2 = d2.reshape(H, Wd)
    t_new = (xx-cx[j])*ncx[j] + (yy-cy[j])*ncy[j]
    ok = (np.abs(t_new) <= 60)
    sm = cv2.remap(strip, (t_new+60).astype(np.float32), j.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    ramp_n = S((j.astype(np.float32)-S0)/45)
    sm = np.clip(sm, 0, 1)*(ok*ramp_n)[..., None]; sm[..., :3] = np.minimum(sm[..., :3], sm[..., 3:])
    a = sm[..., 3:]; tr = np.concatenate([sm[..., :3]/np.maximum(a, 1e-6), a], -1)
    tr[..., 3] = np.where(tr[..., 3] > .5, np.clip((tr[..., 3]-.35)/.3, 0, 1), 0)
    # keep layer: remove old trunk (+ far tusk tip), keep near tusk
    rem = np.clip(inband*ramp*(1-ntm), 0, 1); rem = np.maximum(rem, ftm)
    keep = bf.copy(); keep[..., 3] = al*(1-rem)
    # reconstruct the far leg where the trunk arm lay over it: inpaint inside the leg's right edge
    leg_edge = [(772,455),(780,470),(792,540),(806,600),(816,650),(822,700),(822,760),(700,760),(700,455)]
    P = Image.new('L', (Wd, H), 0); ImageDraw.Draw(P).polygon([(x+PAD, y+PAD) for x, y in leg_edge], fill=255); P = np.asarray(P) > 128
    hole = (P & (rem > .3)).astype(np.uint8)
    hole = cv2.dilate(hole, np.ones((5,5), np.uint8))*P.astype(np.uint8)
    mapx = xx.copy(); has = hole.any(1)
    for r_ in np.nonzero(has)[0]:
        c_ = np.nonzero(hole[r_])[0]; mapx[r_, c_] = 2*c_.min()-1-xx[r_, c_]
    refl = cv2.remap(keep, mapx, yy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    refl[..., :3] = cv2.GaussianBlur(refl[..., :3], (0,0), .8)
    keep[..., :3] = np.where(hole[..., None] > 0, refl[..., :3], keep[..., :3]); keep[..., 3] = np.maximum(keep[..., 3], hole.astype(np.float32))
    # anything outside the leg polygon that was trunk-removed stays empty
    lab1, n1 = ndi.label(keep[..., 3] > .5, np.ones((3,3))); sz1 = ndi.sum(np.ones_like(lab1), lab1, range(1, n1+1))
    keep[..., 3] = np.where(np.isin(lab1, [k+1 for k, z in enumerate(sz1) if z > 3000]), keep[..., 3], 0)
    return keep, tr, ntm, bf
def tusk_layer(bf, ntm, dx, dy, sc, dark, rot=0):
    p = bf.copy(); p[..., 3] = bf[..., 3]*ntm; p[..., :3] *= dark
    M = W.trans(dx, dy) @ W.rotm(rot, (880+PAD, 360+PAD)) @ np.array([[sc,0,(1-sc)*880+PAD*(1-sc)],[0,sc,(1-sc)*360+PAD*(1-sc)],[0,0,1]], float)
    return W.warp((p*255+.5).astype(np.uint8), M).astype(np.float32)/255
def legs(bf, keep, UP, LO):
    H, Wd = bf.shape[:2]; yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32); sy = yy-PAD; sx = xx-PAD
    mN = V.pmask((Wd, H), [(603,470),(700,470),(712,520),(722,620),(730,700),(742,800),(603,800)], 1.0)
    top = S((sy-498)/40); kw = S((sy-625)/30)
    def lay(m, M):
        p = bf.copy(); p[..., 3] = bf[..., 3]*m
        return W.warp((p*255+.5).astype(np.uint8), M).astype(np.float32)/255
    sh = (668+PAD, 520+PAD); kn0 = np.array([676, 625.]); a = math.radians(UP); r = kn0-np.array([668, 520.])
    kn = np.array([668+r[0]*math.cos(a)+r[1]*math.sin(a), 520-r[0]*math.sin(a)+r[1]*math.cos(a)])
    M1 = W.rotm(UP, sh); M2 = W.rotm(LO, (kn[0]+PAD, kn[1]+PAD)) @ M1
    up = lay(mN*top*(1-kw), M1); lo = lay(mN*top*kw, M2)
    # vacated area: hard cut, filled with belly/body pixels above a belly line, empty below
    cut = (mN*top > .02)
    keep2 = keep.copy(); keep2[..., 3] = np.where(cut, 0, keep[..., 3])
    belly = 575-38*S((sx-592)/120)
    fillm = (cut & (sy < belly)).astype(np.float32)
    row = keep[PAD+504:PAD+516, :, :3].mean(0)                       # body colour just above the cut, per column
    row = cv2.GaussianBlur(row[None], (0,0), 4)[0]
    tt = np.clip((sy-516)/22, 0, 1)[..., None]; tt = tt*tt*(3-2*tt)
    ext = row[None]*(1-tt) + np.array([.15, .17, .12], np.float32)*tt
    ext = cv2.GaussianBlur(ext, (0,0), 1.5)
    keep2[..., :3] = np.where(fillm[..., None] > 0, ext, keep2[..., :3]); keep2[..., 3] = np.maximum(keep2[..., 3], fillm)
    return keep2, up, lo
def finish3(out, scale=1.03):
    a = np.clip(out, 0, 1).copy()
    A = a[..., 3]
    # hard opaque edge: threshold, drop specks, fill pinholes, erode 2 px to lose the pale grey-blended rim, 1 px AA
    m = (A > .5).astype(np.uint8)
    lab, n = ndi.label(m, np.ones((3,3)))
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n+1)); m = np.isin(lab, [k+1 for k, s_ in enumerate(sizes) if s_ > 2500]).astype(np.uint8)
    hl, nh = ndi.label(1-m); hs = ndi.sum(np.ones_like(hl), hl, range(1, nh+1)); m = np.where(np.isin(hl, [k+1 for k, z in enumerate(hs) if z < 700]), 1, m).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5,5)))
    fillh = ((m > 0) & (A < .5)).astype(np.uint8)
    if fillh.any():
        r8 = (a[..., :3]*255+.5).astype(np.uint8); r8 = cv2.inpaint(r8, cv2.dilate(fillh, np.ones((3,3), np.uint8))*255, 5, cv2.INPAINT_TELEA); a[..., :3] = r8.astype(np.float32)/255
    m = cv2.erode(m, np.ones((3,3), np.uint8), iterations=2)
    ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
    rgb = a[y0:y1, x0:x1, :3]; mm = m[y0:y1, x0:x1].astype(np.float32)
    h, w = mm.shape; s = scale*(1.0)
    s = min(s, .94*1024/h, .94*1024/w)
    # premultiplied upscale for clean edges
    rgbs = cv2.resize(rgb*mm[..., None], None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LANCZOS4)
    ms = cv2.resize(mm, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
    ms = np.clip((ms-.5)*2.2+.5, 0, 1)                      # re-harden to ~1 px AA
    rgbs = np.clip(rgbs/np.maximum(cv2.resize(mm, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)[..., None], 1e-3), 0, 1)
    hh, ww = ms.shape; cv = np.full((1024, 1024, 3), 128/255, np.float32)
    ox_, oy_ = (1024-ww)//2, (1024-hh)//2
    cv[oy_:oy_+hh, ox_:ox_+ww] = rgbs*ms[..., None] + cv[oy_:oy_+hh, ox_:ox_+ww]*(1-ms[..., None])
    return Image.fromarray((np.clip(cv, 0, 1)*255+.5).astype(np.uint8)), (ww, hh)
if __name__ == '__main__':
    arg = lambda k, d: float(sys.argv[sys.argv.index(k)+1]) if k in sys.argv else d
    b = dr.load(); keep, tr, ntm, bf = build(b)
    keep2, up, lo = legs(bf, keep, arg('--up', 32), arg('--lo', -70))
    ft = tusk_layer(bf, ntm, arg('--fx', 62), arg('--fy', 20), .88, .72, arg('--fr', 0))
    nt = bf.copy(); nt[..., 3] = bf[..., 3]*ntm
    out = W.over(W.over(W.over(W.over(W.over(keep2, ft), lo), up), tr), nt)
    cv, sz = finish3(out); print(sz)
    cv.save('waveD/_dbg3.png')
    if '--final' in sys.argv:
        cv.save('waveD/durrok_win3.png')
        base = Image.open(dr.SRC).convert('RGB'); bg = Image.new('RGB', (1024, 1024), (128,128,128))
        cb = np.asarray(base).astype(int); m = np.abs(cb-128).max(2) > 14; ys, xs = np.nonzero(m)
        bc = base.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1)); bc = bc.resize((round(bc.width*.98), round(bc.height*.98)), Image.LANCZOS)
        bg.paste(bc, ((1024-bc.width)//2, (1024-bc.height)//2))
        sh = Image.new('RGB', (2048, 1024)); sh.paste(bg, (0,0)); sh.paste(cv, (1024,0)); sh.save('waveD/_t3_durrok.png')
