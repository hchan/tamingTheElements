# CPU KO warp for roster24 mattes (Umbrel, Nykra, Abyssor). Run from the repo root:
#   ~/claudetmp/venv/bin/python -I tools/assets/ko-gen/ko-warp-r24.py [umbrel|nykra|abyssor ...]
# Mattes are RGB on grey 128; keyed to alpha here. Pose = inverse-mapped sag/squash/droop (no plain rotation).
import sys, numpy as np
from PIL import Image
PAD = 320
MATTE = '.scratch/matte/'; OUT = '.scratch/ko-r24/'
SRC = dict(umbrel='umbrel-96104', nykra='nykra-94301', abyssor='abyssor-96322')
sm = lambda t: (lambda u: u*u*(3-2*u))(np.clip(t, 0, 1))

def key(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    d = np.sqrt(((rgb-128)**2).sum(-1))
    a = np.clip((d-7)/26, 0, 1)
    c = (rgb-128*(1-a[..., None]))/np.maximum(a[..., None], 1e-3)
    return np.dstack([np.clip(c, 0, 255)/255, a]).astype(np.float32)

def pad(im):
    h, w = im.shape[:2]; o = np.zeros((h+2*PAD, w+2*PAD, 4), np.float32); o[PAD:PAD+h, PAD:PAD+w] = im; return o

def sample(im, X, Y):
    h, w = im.shape[:2]; X = np.clip(X, 0, w-1.001); Y = np.clip(Y, 0, h-1.001)
    x0 = X.astype(int); y0 = Y.astype(int); fx = (X-x0)[..., None]; fy = (Y-y0)[..., None]
    p = im.copy(); p[..., :3] *= p[..., 3:]
    r = (p[y0, x0]*(1-fx)+p[y0, x0+1]*fx)*(1-fy)+(p[y0+1, x0]*(1-fx)+p[y0+1, x0+1]*fx)*fy
    a = r[..., 3:]; r[..., :3] = r[..., :3]/np.maximum(a, 1e-4); return r

# stages: each maps OUTPUT coords (X,Y arrays) -> INPUT coords of that stage. Applied last-to-first.
def rot(cx, cy, deg, wfn):
    def f(X, Y):
        th = np.radians(deg)*wfn(X, Y); c, s = np.cos(th), np.sin(th)  # inverse of rotation by th
        dx, dy = X-cx, Y-cy; return cx+c*dx+s*dy, cy-s*dx+c*dy
    return f
def squash(y0, k, lean=0.0, H=1.0):  # ground at y0; heights scaled by k; lean shifts x with height^2
    def f(X, Y):
        h = (y0-Y)/k; t = h/H; return X-lean*np.clip(t, 0, 1.5)**2, y0-h
    return f
def sag(y0, amp, x0, x1):  # sinusoid-free belly sag: pull middle of body down (src y smaller)
    def f(X, Y):
        w = sm(1-abs((X-(x0+x1)/2)/((x1-x0)/2)))*sm((y0-Y)/200+.0)
        return X, Y-amp*w
    return f
def run(stages, im):
    h, w = im.shape[:2]; Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    for f in reversed(stages): X, Y = f(X, Y)
    return sample(im, X, Y)

def umbrel(b):  # 1024^2 source (+PAD); cap droops + stem buckles + legs splay
    P = PAD; g = 985+P; one = lambda X, Y: 1.0
    cap = lambda X, Y: sm((520+P-Y)/90)
    legs = lambda X, Y: sm((Y-640-P)/120)
    return [rot(230+P, 880+P, 0, one),
            lambda X, Y: (230+P+(X-230-P)/1.0, Y),
            squash(g, .5, lean=0),
            rot(260+P, 500+P, 38, cap),                          # cap slumps onto its right side
            lambda X, Y: (X+(X-430-P)*0.22*legs(X, Y)*-1, Y),     # legs splay wide
            rot(430+P, 600+P, -8, one)]
def nykra(b):  # 743x625, facing left; ground ~ y 590. Gentle broad weights (sharp ones shred the mesh)
    P = PAD; g = 595+P; one = lambda X, Y: 1.0
    head = lambda X, Y: sm((460+P-X)/300)*sm((420+P-Y)/250)
    legs = lambda X, Y: sm((Y-330-P)/260)
    return [squash(g, .6),
            rot(420+P, 520+P, 12, one),                           # whole body slumps head-down
            rot(330+P, 330+P, -22, head),                         # head and neck hang
            rot(430+P, 430+P, 16, legs)]                          # legs buckle sideways
def abyssor(b):  # facing right, head upper-right; ground ~ y 940
    P = PAD; g = 940+P; one = lambda X, Y: 1.0
    head = lambda X, Y: sm((X-560-P)/300)*sm((600+P-Y)/300)
    lc = lambda X, Y: sm((330+P-X)/250)*sm((Y-500-P)/200)
    rc = lambda X, Y: sm((X-700-P)/250)*sm((Y-500-P)/200)
    return [squash(g, .62),
            rot(560+P, 560+P, 10, one),
            rot(600+P, 430+P, 14, head),
            rot(130+P, 560+P, 32, lc),
            rot(890+P, 590+P, -32, rc)]
FN = dict(umbrel=umbrel, nykra=nykra, abyssor=abyssor)

def grade(a):
    rgb, al = a[..., :3], a[..., 3:]
    g = (rgb*np.array([.299, .587, .114])).sum(-1, keepdims=True)
    rgb = (g+(rgb-g)*.75)*.88; return np.dstack([np.clip(rgb, 0, 1), al])

def finish(a, n):
    u8 = (a*255+.5).astype(np.uint8); u8[u8[..., 3] < 6] = 0
    ys, xs = np.nonzero(u8[..., 3] > 6); u8 = u8[ys.min():ys.max()+1, xs.min():xs.max()+1]
    h, w = u8.shape[:2]; assert ys.min() > 4 and xs.min() > 4, 'cropped'
    s = min(.78*1024/h, .86*1024/w, 1.0); im = Image.fromarray(u8, 'RGBA').resize((round(w*s), round(h*s)), Image.LANCZOS)
    cv = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); cv.alpha_composite(im, ((1024-im.width)//2, 1024-im.height-90))
    cv.save(f'{OUT}{n}_ko.png'); return cv

if __name__ == '__main__':
    names = sys.argv[1:] or list(FN); tiles = []
    for n in names:
        src = key(MATTE+SRC[n]+'.png'); b = pad(src)
        ko = finish(grade(run(FN[n](b), b)), n)
        m = Image.fromarray((src*255+.5).astype(np.uint8), 'RGBA'); m.thumbnail((512, 512))
        tiles.append((n, m, ko.resize((512, 512), Image.LANCZOS)))
    sheet = Image.new('RGB', (1024*1, 1)) if False else None
    rows = []
    for bg in [(0x3a, 0x3e, 0x46), (0, 0, 0)]:
        for n, m, k in tiles:
            r = Image.new('RGBA', (1024, 512), bg+(255,)); r.alpha_composite(m, (0, 512-m.height)); r.alpha_composite(k, (512, 0)); rows.append(r)
    S = Image.new('RGB', (1024*len(tiles), 1024))
    for i, r in enumerate(rows): S.paste(r.convert('RGB'), ((i % len(tiles))*1024, (i//len(tiles))*512))
    S.save(OUT+'sheet.png')
