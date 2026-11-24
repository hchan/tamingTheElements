"""Procedural Zephra skitter fx: 3 torn wind streaks + spiral gust core. 256x256 RGBA.
Run: ~/claudetmp/venv/bin/python -I tools/assets/victory-warp/skitter-proc.py [outdir]"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

N = 256
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)

def vnoise(rng, sx, sy):
    """value noise, sx/sy = lattice cells across; smooth-upsampled."""
    g = rng.random((sy + 3, sx + 3)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((int((sx + 3) * N / sx), int((sy + 3) * N / sy)), Image.BICUBIC)
    a = np.asarray(im)
    ox, oy = int(N / sx), int(N / sy)
    return a[oy:oy + N, ox:ox + N]

def fbm(rng, sx, sy, octs=4):
    t = np.zeros((N, N), np.float32); amp = 1.0; tot = 0
    for o in range(octs):
        t += amp * vnoise(rng, sx * 2 ** o, sy * 2 ** o); tot += amp; amp *= 0.55
    t /= tot
    return (t - t.min()) / (t.max() - t.min() + 1e-6)

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-6), 0, 1); return t * t * (3 - 2 * t)

def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
GREY, TEAL, DARK = hexc("#b8c0c8"), hexc("#3f8f8a") * 0.9 + hexc("#b8c0c8") * 0.1, hexc("#555d66")

def render(seed):
    rng = np.random.default_rng(seed)
    # noise fields
    erode = fbm(rng, 6, 10, 5)              # edge tearing
    erode2 = fbm(rng, 30, 60, 2)
    grain_long = fbm(rng, 3, 90, 3)         # horizontal dry-brush streaks (long in x, fine in y)
    grain_fine = fbm(rng, 40, 120, 2)       # mild x stretch, smooth (no blocky NEAREST)
    wob = fbm(rng, 3, 3, 2) - 0.5
    cx, cy = 208.0, 128.0 + rng.uniform(-3, 3)
    # (yoff, head_x, tip_x, halfwidth, colour, alpha gain)
    streaks = [
        (-26 + rng.uniform(-3, 3), 192, 38 + rng.uniform(0, 8), 11, GREY, 1.0),
        (0 + rng.uniform(-2, 2),   200, 26 + rng.uniform(0, 6), 16, GREY, 1.0),
        (+27 + rng.uniform(-3, 3), 192, 46 + rng.uniform(0, 10), 9, GREY * 0.35 + TEAL * 0.65, 1.0),
    ]
    A = np.zeros((N, N), np.float32); C = np.zeros((N, N, 3), np.float32)
    # dark underlayer: broad, smeared shape under all streaks
    d = np.abs(yy - (cy + 4 + wob * 14)) / (30 * np.clip((xx - 30) / 170, 0, 1) ** 0.7 + 1e-3)
    u = (1 - d) + (erode - 0.5) * 1.1 + (grain_long - 0.5) * 0.5
    ua = sstep(0.0, 0.7, u) * sstep(30, 90, xx) * sstep(215, 150, xx) * 0.7
    A = ua; C[:] = DARK
    for i, (yo, hx, tx, hw, col, gain) in enumerate(streaks):
        t = np.clip((hx - xx) / (hx - tx), 0, 1)          # 0 at head, 1 at tip
        wid = hw * (1 - t) ** 0.9 * np.sqrt(np.clip(1 - np.exp(-t * 28), 0, 1) * 0.0 + np.clip(t / 0.05, 0, 1) * 0.35 + 0.65)   # taper
        yc = cy + yo + wob * 10 * t + np.sin(t * 3 + i) * 2.5 * t
        d = np.abs(yy - yc) / (wid + 0.4)
        cov = 1 - d
        cov += (erode - 0.5) * (0.9 + 0.8 * t) + (erode2 - 0.5) * 0.45
        # dry-brush: gaps along streak
        brush = grain_long * 0.65 + grain_fine * 0.35
        cov += (brush - 0.5) * 0.9
        a = sstep(0.0, 0.22, cov) * (xx < hx + 8) * (xx > tx)
        # head: blunt but torn
        a *= sstep(hx + 6, hx - 14, xx + (erode - 0.5) * 26)
        a *= (1 - 0.8 * t ** 1.6) * gain
        # brightness: bright spine + grain
        lum = 0.55 + 0.8 * (1 - d.clip(0, 1)) * (1 - t * 0.5) + (brush - 0.5) * 0.5
        lum = np.clip(lum, 0.4, 1.0)
        col_i = col[None, None, :] * lum[..., None]
        m = a > A
        w = a / (a + A * (1 - a) + 1e-6)
        C = C * (1 - w[..., None]) + col_i * w[..., None]
        A = a + A * (1 - a)
    # spiral gust core
    dx, dy = xx - cx, yy - cy
    r = np.sqrt(dx * dx + dy * dy) + 1e-3
    th = np.arctan2(dy, dx)
    R = 40.0
    twist = 2 * th - 0.24 * r + (erode - 0.5) * 2.2
    arms = 0.5 + 0.5 * np.sin(twist * 1.0 + 1.0)
    body = sstep(R, R * 0.35, r) * sstep(0.0, 3.0, r)
    cov = body * (0.25 + 1.0 * arms) + (erode2 - 0.5) * 0.5 + (grain_fine - 0.5) * 0.45
    ca = sstep(0.28, 0.6, cov)
    # tight hollow eye
    ca *= sstep(1.5, 4.5, r)
    lum = np.clip(0.62 + 0.4 * arms + (grain_long - 0.5) * 0.4, 0.35, 1.0)
    ccol = np.where((arms > 0.78)[..., None], np.clip(GREY * 1.15, 0, 255), GREY * 0.78 + DARK * 0.22) * lum[..., None]
    w = ca / (ca + A * (1 - ca) + 1e-6)
    C = C * (1 - w[..., None]) + ccol * w[..., None]
    A = ca + A * (1 - ca)
    # global speckle erosion of low alpha, desaturate slightly
    bl = np.asarray(Image.fromarray((np.clip(A, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))).astype(np.float32) / 255
    A = A * sstep(0.06, 0.2, bl)
    A = A * (0.85 + 0.15 * grain_fine) * sstep(0.04, 0.16, A)
    gray = C.mean(axis=2, keepdims=True)
    C = C * 0.88 + gray * 0.12
    out = np.dstack([np.clip(C, 0, 255), np.clip(A, 0, 1) * 255]).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    al = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(al)
    return im.resize((128, 128), Image.LANCZOS).resize((N, N), Image.LANCZOS)

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else ".scratch/skitter-proc2"
    os.makedirs(out, exist_ok=True)
    bg = (0x1a, 0x1e, 0x22, 255)
    prevs = []
    for k, seed in enumerate([47, 23, 71, 97]):
        im = render(seed)
        im.save(f"{out}/skitter-proc-{k}.png")
        big = Image.new("RGBA", (N * 3, N * 3), bg)
        big.alpha_composite(im.resize((N * 3, N * 3), Image.NEAREST))
        big.convert("RGB").save(f"{out}/preview-{k}.png")
        prevs.append(big.resize((N * 2, N * 2), Image.LANCZOS))
    sheet = Image.new("RGBA", (N * 4, N * 4), bg)
    for k, p in enumerate(prevs):
        sheet.alpha_composite(p, ((k % 2) * N * 2, (k // 2) * N * 2))
    sheet.convert("RGB").save(f"{out}/sheet.png")
    a = np.asarray(render(23))[..., 3] > 30
    cols = np.where(a.sum(axis=0) > 2)[0]
    print("width fill", (cols.max() - cols.min() + 1) / N)

main()
