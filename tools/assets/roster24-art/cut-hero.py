"""Cut a roster24 concept (flat painted backdrop) out to a transparent RGBA cutout.
Fits a smooth polynomial colour model to the border backdrop, seeds GrabCut from the distance to it, keeps the main blob,
fills small holes, optionally drops a ground strip (--ycut = fraction of height kept) and foam/bright junk (--nofoam),
fades alpha at image edges touched by the creature (wing tips), flips with --flip.
Run: ~/claudetmp/venv-cut/bin/python tools/assets/roster24-art/cut-hero.py SRC.png OUT.png [--lo 14 --hi 55 --ycut 0.94 --flip --fade 0]
Needs opencv-python-headless, numpy, Pillow. Outputs go to ~/claudetmp/, never straight into the repo."""
import argparse, cv2, numpy as np
from PIL import Image

def feats(h, w):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32); x = x / w - .5; y = y / h - .5
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y, x ** 3, y ** 3, x * x * y, x * y * y], -1).reshape(-1, 10)

def backdrop_distance(img):
    h, w = img.shape[:2]
    sm = cv2.resize(img, (256, 256), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(sm, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3)
    F = feats(256, 256)
    sel = np.zeros((256, 256), bool); sel[:10] = 1; sel[:, :10] = 1; sel[:, -10:] = 1; sel = sel.ravel()
    for it in range(6):
        coef = np.linalg.lstsq(F[sel], lab[sel], rcond=None)[0]
        res = np.sqrt(((F @ coef - lab) ** 2).sum(1))
        n, lb = cv2.connectedComponents((res < 8).reshape(256, 256).astype(np.uint8), connectivity=4)
        bd = set(np.unique(np.concatenate([lb[0], lb[-1], lb[:, 0], lb[:, -1]]))) - {0}
        sel = np.isin(lb, list(bd)).ravel() | sel * (it == 0)
    d = np.sqrt(((feats(h, w) @ coef - cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3)) ** 2).sum(1)).reshape(h, w)
    return cv2.GaussianBlur(d, (0, 0), 2)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--lo", type=float, default=14); ap.add_argument("--hi", type=float, default=55)
    ap.add_argument("--ycut", type=float, default=1.0); ap.add_argument("--flip", action="store_true")
    ap.add_argument("--fade", type=int, default=0, help="px of alpha fade where the creature touches the image edge")
    ap.add_argument("--foam", type=float, default=0, help="below this fraction of height, drop bright (V>foamv) pixels such as water splash")
    ap.add_argument("--foamv", type=int, default=120)
    ap.add_argument("--erase", default="", help="hand mask: polygons in source pixels 'x,y x,y ...;x,y ...' removed from the cutout (grey gaps between legs, rocks)")
    ap.add_argument("--minfrac", type=float, default=0.03, help="keep blobs at least this fraction of the biggest")
    ap.add_argument("--hole", type=int, default=1500, help="fill background holes smaller than this many px")
    a = ap.parse_args()
    img = cv2.imread(a.src); h, w = img.shape[:2]
    d = backdrop_distance(img)
    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8); mask[d < a.lo] = cv2.GC_PR_BGD; mask[d > a.hi] = cv2.GC_FGD
    ctr = np.zeros((h, w), bool); ctr[int(h * .08):int(h * .95), int(w * .02):int(w * .98)] = 1
    mask[(mask == cv2.GC_FGD) & ~ctr] = cv2.GC_PR_FGD
    mask[:3] = cv2.GC_BGD
    if a.fade == 0: mask[:, :3] = cv2.GC_BGD; mask[:, -3:] = cv2.GC_BGD
    smi = cv2.resize(img, None, fx=.5, fy=.5); mm = cv2.resize(mask, None, fx=.5, fy=.5, interpolation=cv2.INTER_NEAREST)
    cv2.grabCut(smi, mm, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    m = cv2.resize(((mm == 1) | (mm == 3)).astype(np.uint8) * 255, (w, h), interpolation=cv2.INTER_LINEAR)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m[int(h * a.ycut):] = 0
    if a.foam:
        v = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 2], (0, 0), 1.5)
        m[int(h * a.foam):][v[int(h * a.foam):] > a.foamv] = 0
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    for poly in filter(None, a.erase.split(";")):
        cv2.fillPoly(m, [np.array([[int(c) for c in pt.split(",")] for pt in poly.split()], np.int32)], 0)
    n, lb, st, _ = cv2.connectedComponentsWithStats((m > 127).astype(np.uint8))
    keep = np.zeros_like(m); big = st[1:, 4].max()
    for k in range(1, n):
        if st[k, 4] >= a.minfrac * big: keep[lb == k] = 255
    inv = 255 - keep; n2, lb2, st2, _ = cv2.connectedComponentsWithStats((inv > 127).astype(np.uint8))
    for k in range(1, n2):
        if st2[k, 4] < a.hole: keep[lb2 == k] = 255
    keep = cv2.GaussianBlur(keep, (0, 0), 1.0)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA); rgba[..., 3] = keep
    if a.fade:
        ramp = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / a.fade, 0, 1)
        rgba[..., 3] = (rgba[..., 3] * ramp[None, :]).astype(np.uint8)
    ys, xs = np.where(rgba[..., 3] > 127)
    out = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    if a.flip: out = out.transpose(Image.FLIP_LEFT_RIGHT)
    out.save(a.out); print(a.out, out.size)

main()
