# Provenance copy (2026-11-26) of the art session generator forge-proc/gen.py, unchanged below. It wrote forgeGore_c.png (tools/assets/fx-gen/provenance/brazgor-fx).
# Paths only: the spec path on line 4 loads the art session copy of proc-fx2/gen.py, in this repo tools/assets/roster24-art/hyalia-ouroth-proc-fx2-gen.py;
# the 'ship' path points at the art session checkout of public/assets/img/fx/forgeGore.png (comparison sheet only).
import importlib.util, random, math, sys
import numpy as np
from PIL import Image, ImageDraw
sp = importlib.util.spec_from_file_location("g", "/Users/henry.chan/tamingTheElements/.claude/worktrees/gpu-job-server/.scratch/proc-fx2/gen.py")
g = importlib.util.module_from_spec(sp); sp.loader.exec_module(g)
S = 4; W, H = 80, 60
RAMP = [(0, (40, 8, 6)), (.25, (110, 20, 10)), (.45, (205, 70, 14)), (.65, (255, 140, 30)), (.82, (255, 215, 120)), (1, (255, 250, 230))]
def ramp(h):
    out = np.zeros(h.shape + (3,), np.float32)
    for (a, ca), (b, cb) in zip(RAMP, RAMP[1:]):
        m = (h >= a) & (h <= b); t = ((h - a) / (b - a))[m][:, None]
        out[m] = np.array(ca) * (1 - t) + np.array(cb) * t
    return out
def make(seed, cx, cy, R, a0, a1, wmax, tilt=0):
    r = random.Random(seed); w, h = W * S, H * S
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx * S, yy - cy * S
    dist = np.sqrt(dx * dx + dy * dy); th = np.arctan2(dy, dx)
    t = np.clip((th - a0) / (a1 - a0), 0, 1)             # 0..1 along arc
    inside = (th >= a0) & (th <= a1)
    wid = wmax * S * np.maximum(np.sin(np.pi * t), 0) ** .8 + .6 * S     # crescent taper
    wob = (g.vnoise(w, h, 24, r) - .5) * 2.2 * S
    off = (dist - R * S + wob)
    n1 = g.vnoise(w, h, 5, r); n2 = g.vnoise(w, h, 12, r)
    nz = n1 * .5 + n2 * .5
    nd = np.abs(off) / np.maximum(wid, 1)                 # 0 center .. 1 edge
    # asymmetric: bulge on outer side
    nd = np.where(off > 0, nd * 1.15, nd * .9)
    heat = np.clip(1 - nd, 0, 1) ** .9 * (1 - t * .25) + (nz - .5) * .35
    erode = (1 - nd) + (nz - .5) * .9                     # ragged edge
    alpha = np.clip(erode * 7, 0, 1) * inside
    heat = np.clip(heat * 1.15 - (1 - alpha) * .5, 0, 1)
    rgb = ramp(heat)
    im = Image.fromarray(np.dstack([rgb, np.nan_to_num(alpha) * 255]).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)
    pt = lambda ang, rad: (cx * S + math.cos(ang) * rad * S, cy * S + math.sin(ang) * rad * S)
    # slag droplets: below the arc (gravity), dripping with a thin string
    for _ in range(r.randint(3, 5)):
        ang = a0 + (a1 - a0) * r.uniform(.15, .85); x, y = pt(ang, R - wmax * .55)
        ln = r.uniform(3, 7) * S; rad = r.uniform(.9, 1.6) * S
        d.line([(x, y), (x, y + ln)], fill=(200, 60, 12, 220), width=int(S * 1.3))
        d.ellipse([x - rad, y + ln - rad, x + rad, y + ln + rad * 1.4], fill=(255, 150, 40, 255))
        d.ellipse([x - rad * .5, y + ln - rad * .6, x + rad * .5, y + ln + rad * .3], fill=(255, 235, 170, 255))
    # sparks flying off, mostly outward
    for _ in range(r.randint(8, 14)):
        ang = a0 + (a1 - a0) * r.uniform(0, 1); rad0 = R + wmax * .5
        x, y = pt(ang, rad0 + r.uniform(1, 4)); fa = ang + r.uniform(-.5, .5)
        L = r.uniform(2, 6) * S; x2, y2 = x + math.cos(fa) * L, y + math.sin(fa) * L - r.uniform(0, 2) * S
        hot = r.random() < .5
        d.line([(x, y), (x2, y2)], fill=(255, 225, 150, 240) if hot else (255, 120, 25, 230), width=int(S * 1.3))
        s = S * r.uniform(.8, 1.3); d.ellipse([x2 - s, y2 - s, x2 + s, y2 + s], fill=(255, 245, 210, 255) if hot else (255, 160, 50, 255))
    im = Image.fromarray(np.asarray(im))
    return g.finish(im, 0, seed, outline=(30, 10, 8), oa=.7, grain=.2, disp=3)
if __name__ == "__main__":
    P = math.pi
    v = [make(11, 40, 52, 33, -2.5, -.6, 7), make(23, 40, 54, 30, -2.3, -.85, 6.5), make(37, 41, 50, 34, -2.65, -.45, 7.5)]
    for k, im in zip("abc", v): im.save(f"forgeGore_{k}.png"); assert im.size == (W, H)
    sh = Image.new("RGBA", (4 * 330, 250), (90, 90, 90, 255))
    ship = Image.open("/Users/henry.chan/tamingTheElements/public/assets/img/fx/forgeGore.png")
    for i, im in enumerate(v + [ship]): sh.alpha_composite(im.resize((320, 240), 0), (i * 330 + 5, 5))
    sh.save("sheet.png")
