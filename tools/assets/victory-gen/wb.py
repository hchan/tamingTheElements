# Wave B victory warps. Run from .scratch/victory-warp: ~/claudetmp/venv/bin/python -I waveB/wb.py [hero...]
import sys; sys.path.insert(0,'.'); sys.path.insert(0,'waveA')
import numpy as np
from PIL import Image
import warp as W, wave as V
V.PAD = PAD = 200
S = V.sstep
SRC = dict(brazgor='brazgor-96003', nykra='nykra-94301', quarrak='quarrak-96214', hyalia='hyalia-96433-pad', ouroth='ouroth-95402', abyssor='abyssor-96322')
def load(n):
    a = np.asarray(Image.open(f'../matte/{SRC[n]}.png').convert('RGBA')); h, w = a.shape[:2]
    b = np.zeros((h+2*PAD, w+2*PAD, 4), np.uint8); b[PAD:PAD+h, PAD:PAD+w] = a; return a, b
def brazgor(b):  # left-facing: raise snout = clockwise (neg)
    w = lambda x, y: S((330-x)/90)*S((560-y)/80)
    return V.zone_warp(b, [((330, 430), -20, w)])
def nykra(b):
    w = lambda x, y: S((280-x)/90)*S((330-y)/60)
    return V.zone_warp(b, [((210, 250), -18, w)])
def quarrak(b):
    w = lambda x, y: S((x-690)/60)*S((545-y)/40)*S((y-338)/14)
    return V.zone_warp(b, [((660, 450), 24, w)])
def hyalia(b):
    w = lambda x, y: S((x-745)/45)*S((480-y)/60)
    return V.zone_warp(b, [((885, 470), 14, w)])
def ouroth(b):
    w = lambda x, y: S((x-520)/70)*S((500-y)/40)
    return V.zone_warp(b, [((500, 260), 16, w)])
def abyssor(b):
    P = [(40,585),(125,560),(215,585),(200,700),(180,880),(120,930),(40,930),(30,700)]
    R = [(35,590),(120,565),(215,590),(205,700),(185,880),(125,935),(35,935),(25,700)]
    return V.limb_warp(b, [(P, R, (130, 590), -125, 1)])
FN = dict(brazgor=brazgor, nykra=nykra, quarrak=quarrak, hyalia=hyalia, ouroth=ouroth, abyssor=abyssor)
def finish(n, out):
    a = (out*255+.5).astype(np.uint8); a[a[..., 3] < 8] = 0; ys, xs = np.nonzero(a[..., 3] > 8); a = a[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = a.shape[:2]; s = min(.72*1024/h, .92*1024/w); im = Image.fromarray(a, 'RGBA').resize((round(w*s), round(h*s)), Image.LANCZOS)
    cv = Image.new('RGBA', (1024, 1024), (128,128,128,255)); cv.alpha_composite(im, ((1024-im.width)//2, (1024-im.height)//2))
    cv = cv.convert('RGB'); cv.save(f'waveB/{n}_win.png'); return cv, im.size
if __name__ == '__main__':
    for n in sys.argv[1:] or FN:
        src, b = load(n); out = FN[n](b); cv, sz = finish(n, out)
        o = Image.fromarray(src, 'RGBA'); o.thumbnail((700, 700)); S_ = Image.new('RGB', (1400, 1024), (128,128,128)); S_.paste(o, (0, 150), o); S_.paste(cv.resize((1024,1024)), (376, 0)); S_.save(f'waveB/_t_{n}.png'); print(n, sz)
