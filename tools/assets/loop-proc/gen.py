"""Procedural 8-frame roster24 ability loop strips, 1024x128 RGBA, numpy+PIL only, seeded.
Run: ~/claudetmp/venv/bin/python -I tools/assets/loop-proc/gen.py   (from worktree root). Output: .scratch/loop-proc/
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".scratch", "loop-proc", "")  # cinderSpray/abyssalPull are reloaded from here (approved files)
N, S = 8, 128
YY, XX = np.mgrid[0:S, 0:S].astype(np.float32)

def blur(a, r):
    k = np.arange(-int(3 * r) - 1, int(3 * r) + 2, dtype=np.float32); k = np.exp(-k * k / (2 * r * r)); k /= k.sum()
    p = len(k) // 2; a = np.pad(a.astype(np.float32), p, mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, a)
def noise(rng, scale, size=S):
    g = rng.random((max(2, size // scale + 2),) * 2).astype(np.float32)
    im = Image.fromarray(g, "F").resize((size, size), Image.BICUBIC)
    return np.asarray(im)
def grain(rng, amt=0.18):
    return 1 - amt + amt * 2 * rng.random((S, S)).astype(np.float32) * 0.5 + amt * 0.5 * noise(rng, 3)
def splat(acc, x, y, r, amp):
    x0, x1 = int(max(0, x - 3 * r - 1)), int(min(S, x + 3 * r + 2))
    y0, y1 = int(max(0, y - 3 * r - 1)), int(min(S, y + 3 * r + 2))
    if x1 <= x0 or y1 <= y0: return
    d2 = (XX[y0:y1, x0:x1] - x) ** 2 + (YY[y0:y1, x0:x1] - y) ** 2
    acc[y0:y1, x0:x1] += amp * np.exp(-d2 / (2 * r * r))
def over(rgb, a, col, la):
    """composite layer (col rgb tuple or HxWx3, alpha la HxW) over rgb,a (straight alpha)"""
    la = np.clip(la, 0, 1); col = np.asarray(col, np.float32) * np.ones((S, S, 3), np.float32)
    oa = la + a * (1 - la)
    orgb = (col * la[..., None] + rgb * (a * (1 - la))[..., None]) / np.maximum(oa, 1e-4)[..., None]
    return orgb, oa
def blank(): return np.zeros((S, S, 3), np.float32), np.zeros((S, S), np.float32)
def to_img(rgb, a):
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")
def ramp(t, stops):
    t = float(np.clip(t, 0, 1)); xs = [s[0] for s in stops]
    for i in range(len(stops) - 1):
        if t <= xs[i + 1]:
            u = (t - xs[i]) / (xs[i + 1] - xs[i]); return tuple(np.array(stops[i][1]) * (1 - u) + np.array(stops[i + 1][1]) * u)
    return stops[-1][1]
def sheet(frames):
    s = Image.new("RGBA", (N * S, S))
    for i, f in enumerate(frames): s.paste(f, (i * S, 0))
    return s

# 1 cinderSpray: cone to the right, hot core, trailing sparks
def cinder():
    fr = []
    cols = [(0, (255, 244, 190)), (.25, (255, 190, 70)), (.6, (205, 100, 35)), (1, (110, 45, 25))]
    for f in range(N):
        rng = np.random.default_rng(1000 + f); acc = np.zeros((S, S), np.float32)
        rgb, a = blank()
        # faint cone haze (embers smoke)
        d = np.clip((XX - 10) / 110, 0, 1.2); half = 4 + d * 36
        cone = np.clip(1 - np.abs(YY - 64) / half, 0, 1) * np.clip(1 - d, 0, 1) * (d > 0)
        n = noise(rng, 6)
        haze = cone * (0.5 + n) * 0.30
        rgb, a = over(rgb, a, (150, 60, 25), blur(haze, 2))
        # particles: coarse embers, dull
        for _ in range(150):
            t = rng.random() ** 1.3; dist = 8 + t * 108
            lat = (rng.random() - .5) * 2 * (3 + dist * 0.38) * (0.35 + 0.65 * t)
            r = 1.0 + 1.6 * (1 - t) * rng.random() + 0.5
            col = ramp(t + rng.random() * 0.15, cols)
            L = np.zeros((S, S), np.float32); splat(L, 10 + dist, 64 + lat, r, 1.0)
            rgb, a = over(rgb, a, col, L * (0.95 - 0.5 * t))
        # trailing sparks: short streaks fading backwards (toward origin)
        for _ in range(26):
            t = 0.2 + rng.random() * 0.8; dist = 10 + t * 108; ang = (rng.random() - .5) * 0.8
            for k in range(5):
                dd = dist - k * 2.2
                L = np.zeros((S, S), np.float32)
                splat(L, 10 + dd * math.cos(ang) , 64 + dd * math.sin(ang) + 0, 0.7, 1.0)
                rgb, a = over(rgb, a, (255, 205 - k * 25, 110 - k * 15), L * (1 - k * .2))
        # hot core near muzzle: yellow-white, tapered wedge
        core = np.clip(1 - np.abs(YY - 64) / (2.5 + np.clip(XX - 8, 0, 40) * 0.22), 0, 1) * np.clip(1 - (XX - 8) / 46, 0, 1) * (XX > 6)
        core = blur(core, 1.2) * (0.75 + 0.5 * noise(rng, 4))
        rgb, a = over(rgb, a, (255, 242, 185), core * 1.1)
        g = grain(rng, .22); rgb = rgb * g[..., None]
        fr.append(to_img(rgb, a * (0.8 + 0.2 * g)))
    return sheet(fr)

# 2 sporeBurst: ochre/moss puffs expanding from point, sickly haze
def spore():
    fr = []; base = np.random.default_rng(2000)
    P = [(base.random() * 6.283, 0.35 + base.random() * 0.65, base.random(), base.random()) for _ in range(46)]
    for f in range(N):
        rng = np.random.default_rng(2100 + f); rgb, a = blank(); u = (f + 1) / N
        rgb, a = over(rgb, a, (95, 105, 45), blur(noise(rng, 14) * radial(0.45 + .5 * u), 4) * 0.55 * (1 - 0.35 * u))
        for ang, spd, cm, sz in P:
            dist = spd * u * 50 + 2; x = 64 + dist * math.cos(ang); y = 64 + dist * math.sin(ang)
            r = 2.2 + 4.5 * sz * (0.4 + u)
            L = np.zeros((S, S), np.float32); splat(L, x, y, r, 1.0)
            L = L * (0.35 + 0.9 * noise(rng, 3)) * (1.0 - 0.6 * u * spd)   # mottled, not glossy
            col = np.array((175, 140, 55)) * (1 - cm) + np.array((105, 125, 55)) * cm
            col = col * 0.85 + 30  # desaturate
            rgb, a = over(rgb, a, col, np.clip(L * 0.7, 0, .75))
        g = grain(rng, .3); rgb = rgb * g[..., None]
        fr.append(to_img(rgb, a * 0.9))
    return sheet(fr)
def radial(r):
    return np.clip(1 - np.hypot(XX - 63.5, YY - 63.5) / (r * 62), 0, 1)

# 3 stingingFilament: thin bone whip, barbed tip, violet glow, sway
def filament():
    fr = []; K = 4
    for f in range(N):
        ph = 2 * math.pi * f / N
        pts = []
        for i in range(41):
            s = i / 40; x = 8 + s * 100 + 4 * math.sin(ph) * s
            y = 70 - 26 * math.sin(s * math.pi * .9) + 14 * math.sin(s * 5.2 - ph) * s + 6 * math.sin(s * 9 - 2 * ph) * s * s
            pts.append((x, y))
        big = Image.new("L", (S * K, S * K)); dr = ImageDraw.Draw(big)
        for i in range(40):
            w = (3.2 - 2.0 * i / 40) * K; dr.line([(p * K) for p in pts[i] + pts[i + 1]], fill=255, width=max(1, int(w)))
        x0, y0 = pts[-2]; x1, y1 = pts[-1]; ang = math.atan2(y1 - y0, x1 - x0)
        for sgn in (-1, 1):  # barbs
            for back, ln in ((7, 8), (14, 6)):
                bx = x1 - back * math.cos(ang); by = y1 - back * math.sin(ang)
                ex = bx - ln * math.cos(ang - sgn * 0.75) * -1 * -1; ey = by - ln * math.sin(ang - sgn * 0.75) * -1 * -1
                dr.line([bx * K, by * K, (bx + ln * math.cos(ang + sgn * 2.5)) * K, (by + ln * math.sin(ang + sgn * 2.5)) * K], fill=255, width=2 * K // 2 + 1)
        dr.polygon([((x1 + 5 * math.cos(ang)) * K, (y1 + 5 * math.sin(ang)) * K), ((x1 + 1.5 * math.cos(ang + 1.57)) * K, (y1 + 1.5 * math.sin(ang + 1.57)) * K), ((x1 + 1.5 * math.cos(ang - 1.57)) * K, (y1 + 1.5 * math.sin(ang - 1.57)) * K)], fill=255)
        line = np.asarray(big.resize((S, S), Image.BOX)).astype(np.float32) / 255
        rng = np.random.default_rng(3000 + f)
        rgb, a = blank()
        rgb, a = over(rgb, a, (120, 60, 190), np.clip(blur(line, 6) * 2.2, 0, .8))
        rgb, a = over(rgb, a, (165, 110, 235), np.clip(blur(line, 2.2) * 1.4, 0, .85))
        rgb, a = over(rgb, a, (236, 226, 200), np.clip(line * 1.15, 0, 1))
        rgb, a = over(rgb, a, (255, 252, 240), np.clip((line - .55) * 2, 0, 1))
        g = grain(rng, .08); rgb = rgb * (0.95 + 0.05 * g[..., None])
        fr.append(to_img(rgb, a))
    return sheet(fr)

# 4 boulderRoll
def boulder():
    fr = []; rng0 = np.random.default_rng(4000)
    kv = rng0.normal(size=(14, 3)); kv /= np.linalg.norm(kv, axis=1, keepdims=True); kf = rng0.uniform(2.5, 9, 14); kp = rng0.uniform(0, 6.28, 14)
    kl = rng0.normal(size=(8, 3)); kl /= np.linalg.norm(kl, axis=1, keepdims=True); klf = rng0.uniform(1.2, 2.6, 8); klp = rng0.uniform(0, 6.28, 8)
    h = rng0.uniform(0, 6.28, 5); ha = np.array([.12, .08, .06, .05, .035])
    cx, cy, R = 78.0, 66.0, 34.0
    for f in range(N):
        th = 2 * math.pi * f / N
        dx, dy = XX - cx, YY - cy; ang = np.arctan2(dy, dx)
        # jagged silhouette rotates with the boulder
        rad = R * (1 + sum(ha[i] * np.sin((i + 2) * 1.0 * (ang - th) + h[i]) * 1 for i in range(5)))
        rad = R * (1 + sum(ha[i] * np.sin((i + 2) * (ang - th) + h[i]) for i in range(5)))
        rr = np.hypot(dx, dy); edge = np.clip(rad - rr + .5, 0, 1)
        nx, ny = dx / R, dy / R; nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
        c, s = math.cos(th), math.sin(th)
        px, py = c * nx + s * ny, -s * nx + c * ny; pz = nz  # in-plane roll
        tl = 0.45; py2, pz2 = py * math.cos(tl) - pz * math.sin(tl), py * math.sin(tl) + pz * math.cos(tl)
        P = np.stack([px, py2, pz2], -1)
        def fbm(K, F, Ph, sc):
            return sum(np.sin((P @ K[i]) * F[i] * sc + Ph[i]) for i in range(len(F))) / len(F) * 1.6
        base = fbm(kv, kf, kp, 1.0)
        fine = fbm(kv[:8], kf[:8] * 2.6, kp[:8], 1.0)
        crack = np.clip(1 - np.abs(fbm(kv[3:11], kf[3:11] * .8, kp[3:11], 1.0)) * 9, 0, 1) ** 1.5
        lich = np.clip((fbm(kl, klf, klp, 1.0) - 0.18) * 4, 0, 1) * (0.6 + 0.4 * np.clip(fine + .5, 0, 1))
        # lighting: fixed from upper-left, plus bump from base noise
        gx, gy = np.gradient(base * 1.0)
        L = np.clip(nx * -.5 + ny * -.55 + nz * .65, 0, 1.2)
        shade = 0.30 + 0.85 * L + 0.18 * base + 0.08 * fine
        grey = np.array((128, 126, 118), np.float32); olive = np.array((112, 120, 66), np.float32)
        col = grey[None, None] * (1 - lich[..., None] * .75) + olive[None, None] * lich[..., None] * .75
        col = col * shade[..., None] * (1 - crack[..., None] * .75)
        rim = np.clip(1 - nz, 0, 1) ** 2; col *= (1 - .55 * rim[..., None])
        rgb, a = blank()
        # dust trail behind (left)
        rng = np.random.default_rng(4100 + f)
        for k in range(14):
            t = (k + (f / N)) / 14; x = cx - R * .6 - t * 70; y = cy + R * .75 - 4 - rng.random() * 12 * t * 2 + 6 * t
            L2 = np.zeros((S, S), np.float32); splat(L2, x, y, 3 + 7 * t, 1.0)
            L2 = L2 * (0.4 + 0.9 * noise(rng, 4)) * (1 - t) * .75
            rgb, a = over(rgb, a, (150, 138, 112), L2 * .8)
        rgb, a = over(rgb, a, np.clip(col, 0, 255), edge)
        g = grain(rng, .18); rgb = rgb * (0.9 + 0.1 * g[..., None])
        fr.append(to_img(rgb, a))
    return sheet(fr)

# 5 abyssalPull: thick tendril, grows then curls back toward the caster (left)
def abyssal():
    fr = []; K = 4
    for f in range(N):
        grow = min(1.0, (f + 1) / 4.0); pull = max(0.0, (f - 3) / 4.0)
        L = 22 + 88 * grow - 30 * pull
        curl = 0.25 + 3.4 * pull ** 1.1 + 0.5 * grow
        ox, oy = 12.0, 64.0; pts = []; x, y = ox, oy; a_ = -0.35
        n = 60
        for i in range(n + 1):
            s = i / n; pts.append((x, y, s))
            a_ = -0.35 + curl * (s ** 2) * 1.0 * (1 if pull > 0 else 0.7) + 0.35 * math.sin(s * 4 + f * .8)
            x += math.cos(a_) * L / n; y += math.sin(a_) * L / n
        def stroke(extra, fill):
            im = Image.new("L", (S * K, S * K)); d = ImageDraw.Draw(im)
            for (px, py, s) in pts:
                w = (11 - 5.5 * s + extra) * K / 2
                d.ellipse([px * K - w, py * K - w, px * K + w, py * K + w], fill=fill)
            return np.asarray(im.resize((S, S), Image.BOX)).astype(np.float32) / 255
        outer = stroke(2.5, 255); body = stroke(0, 255)
        hl = Image.new("L", (S * K, S * K)); d = ImageDraw.Draw(hl)
        for (px, py, s) in pts[::2]:
            w = (3.2 - 1.6 * s) * K / 2; d.ellipse([(px - 1.8) * K - w, (py - 2.6) * K - w, (px - 1.8) * K + w, (py - 2.6) * K + w], fill=255)
        hlt = np.asarray(hl.resize((S, S), Image.BOX)).astype(np.float32) / 255
        rng = np.random.default_rng(5000 + f); rgb, a = blank()
        rgb, a = over(rgb, a, (6, 40, 48), np.clip(blur(body, 7) * 1.4, 0, .6))      # abyss haze
        rgb, a = over(rgb, a, (3, 10, 14), outer)
        tex = 0.75 + 0.5 * noise(rng, 4)
        rgb, a = over(rgb, a, np.dstack([10 * tex, 62 * tex, 72 * tex]), body)
        rgb, a = over(rgb, a, (50, 150, 150), hlt * body * .6)
        # suckers (dark dots) along inner side
        for (px, py, s) in pts[6::6]:
            Ls = np.zeros((S, S), np.float32); splat(Ls, px + 1.5, py + 2.8, 1.3, 1.0)
            rgb, a = over(rgb, a, (4, 18, 24), np.clip(Ls, 0, 1) * body * .9)
        g = grain(rng, .1); rgb = rgb * (0.92 + 0.08 * g[..., None])
        fr.append(to_img(rgb, a))
    return sheet(fr)


# ---- revision 2 (director REVISE): these definitions override the earlier ones ----
def disc(x, y, r):
    return np.clip(r - np.hypot(XX - x, YY - y) + .5, 0, 1)   # hard-edged AA dot

def spore():
    fr = []; base = np.random.default_rng(2200)
    D = [(base.random() * 6.283, base.random() ** .6, base.uniform(1.6, 3.4), base.random() < .3) for _ in range(36)]
    for f in range(N):
        rng = np.random.default_rng(2300 + f); rgb, a = blank(); u = f / (N - 1)
        R = 20 + 28 * u                                   # frame 0 = ~40% of final radius
        rgb, a = over(rgb, a, (70, 85, 35), np.clip(blur(disc(64, 64, R * 1.05), 3) * .45, 0, .6))   # sickly haze
        ang = np.arctan2(YY - 64, XX - 64); rr = np.hypot(XX - 64, YY - 64)
        edge = R * (0.86 + .16 * np.sin(5 * ang + 1.0 + f) * .5 + .12 * (noise(rng, 6) - .5))
        core = np.clip(edge * .7 - rr + .5, 0, 1) * 0 + np.clip((edge * .72 - rr), 0, 1) ** .5
        tex = .7 + .6 * noise(rng, 3)
        rgb, a = over(rgb, a, np.dstack([78 * tex, 98 * tex, 38 * tex]), np.clip(core * 1.2, 0, 1) * .97)
        for ang_, d, r, pale in D:
            dist = R * (.45 + .65 * d) + 2 * u
            m = disc(64 + dist * math.cos(ang_), 64 + dist * math.sin(ang_), r * (.7 + .5 * u))
            col = (205, 228, 150) if pale else (92, 112, 46)
            rgb, a = over(rgb, a, (25, 32, 14), np.clip(disc(64 + dist * math.cos(ang_), 64 + dist * math.sin(ang_), r * (.7 + .5 * u) + 1.1), 0, 1) * .8)
            rgb, a = over(rgb, a, col, m)
        for _ in range(26):   # tiny pale specks
            ang_ = rng.random() * 6.283; dist = R * (.2 + 1.0 * rng.random())
            rgb, a = over(rgb, a, (210, 232, 165), disc(64 + dist * math.cos(ang_), 64 + dist * math.sin(ang_), .9) * .95)
        g = grain(rng, .22); rgb = rgb * (0.92 + .08 * g[..., None])
        fr.append(to_img(rgb, a))
    return sheet(fr)

def filament():
    fr = []; K = 4
    for f in range(N):
        ph = 2 * math.pi * f / N
        pts = []
        for i in range(41):
            s = i / 40; x = 10 + s * 96
            y = 70 - 20 * math.sin(s * math.pi * .9) + 9 * math.sin(s * 4.6 - ph) * s + 3 * math.sin(s * 8 - 2 * ph) * s * s
            pts.append((x, y))
        def tan(i):
            a_, b_ = pts[max(0, i - 1)], pts[min(40, i + 1)]; return math.atan2(b_[1] - a_[1], b_[0] - a_[0])
        def render(extra):
            im = Image.new("L", (S * K, S * K)); d = ImageDraw.Draw(im)
            for i in range(41):
                w = (7.5 - 3.5 * i / 40 + extra) * K / 2; x, y = pts[i]
                d.ellipse([x * K - w, y * K - w, x * K + w, y * K + w], fill=255)
            for j, (si, sg) in enumerate(((17, 1), (26, -1), (34, 1))):   # 3 constant thorns, swept back
                x, y = pts[si]; t = tan(si); ta = t + sg * (math.pi - .55)   # points back along the whip, to one side
                ln = 20 - 2 * j
                for q in range(9):
                    qq = q / 8; w = (4.4 * (1 - qq) + 1.0 + extra) * K / 2
                    px = (x + ln * qq * math.cos(ta)) * K; py = (y + ln * qq * math.sin(ta)) * K
                    d.ellipse([px - w, py - w, px + w, py + w], fill=255)
            x, y = pts[-1]; t = tan(40)   # sharp tapered tip
            for q in range(7):
                qq = q / 6; w = (2.2 * (1 - qq) + .5 + extra) * K / 2
                px = (x + 8 * qq * math.cos(t)) * K; py = (y + 8 * qq * math.sin(t)) * K
                d.ellipse([px - w, py - w, px + w, py + w], fill=255)
            return np.asarray(im.resize((S, S), Image.BOX)).astype(np.float32) / 255
        body = render(0); outl = render(3.0)
        rng = np.random.default_rng(3200 + f); rgb, a = blank()
        rgb, a = over(rgb, a, (90, 140, 40), np.clip(blur(outl, 3) * .55, 0, .5))     # minimal glow
        rgb, a = over(rgb, a, (14, 16, 8), outl)
        rgb, a = over(rgb, a, (222, 214, 140), body)
        hl = np.clip(blur(body, 1.5) - blur(np.roll(body, (2, 2), (0, 1)), 1.5), 0, 1) * 3
        rgb, a = over(rgb, a, (250, 246, 205), np.clip(hl, 0, 1) * body * .8)
        shade = np.clip(blur(np.roll(body, (-2, -2), (0, 1)), 1.5) - blur(body, 1.5), 0, 1) * 3
        rgb, a = over(rgb, a, (120, 110, 55), np.clip(shade, 0, 1) * body * .6)
        fr.append(to_img(rgb, a))
    return sheet(fr)

def boulder():
    fr = []; rng0 = np.random.default_rng(4200); K = 4; R = 34.0
    nv = 12; vr = rng0.uniform(.74, 1.04, nv); vr[::3] *= .93        # chipped polygon silhouette
    poly = [(64 + R * vr[i] * math.cos(2 * math.pi * i / nv + .2), 64 + R * vr[i] * math.sin(2 * math.pi * i / nv + .2)) for i in range(nv)]
    mk = Image.new("L", (S * K, S * K)); ImageDraw.Draw(mk).polygon([(x * K, y * K) for x, y in poly], fill=255)
    mask = np.asarray(mk.resize((S, S), Image.BOX)).astype(np.float32) / 255
    seeds = np.array([(64 + rng0.uniform(-24, 24), 64 + rng0.uniform(-24, 24)) for _ in range(9)])
    nang = rng0.uniform(0, 6.283, 9); nstr = rng0.uniform(.4, .9, 9)
    # branching tapering cracks, local space
    ck = Image.new("L", (S * K, S * K)); cd = ImageDraw.Draw(ck)
    def crack(x, y, a_, ln, w, depth):
        px, py = x, y
        for i in range(int(ln)):
            a_ += rng0.normal(0, .35); nx_, ny_ = px + 2 * math.cos(a_), py + 2 * math.sin(a_)
            ww = max(.5, w * (1 - i / ln)) * K / 2
            cd.line([px * K, py * K, nx_ * K, ny_ * K], fill=255, width=max(1, int(ww * 2)))
            px, py = nx_, ny_
            if depth < 2 and i % 5 == 3 and rng0.random() < .7:
                crack(px, py, a_ + rng0.choice([-1, 1]) * rng0.uniform(.6, 1.1), ln * .4, w * .6, depth + 1)
    for sa in (0.5, 2.6, 4.4):
        crack(64 + R * .9 * math.cos(sa), 64 + R * .9 * math.sin(sa), sa + math.pi + rng0.normal(0, .3), 17, 3.4, 0)
    cracks = np.asarray(ck.resize((S, S), Image.BOX)).astype(np.float32) / 255
    tex = .8 + .4 * noise(rng0, 3) + .15 * noise(rng0, 8)
    # asymmetric moss / dark patches
    mp = np.zeros((S, S), np.float32); dk = np.zeros((S, S), np.float32)
    for (x, y, r) in ((50, 48, 11), (82, 72, 7), (58, 82, 5)):
        mp += np.clip(1 - np.hypot(XX - x, YY - y) / r, 0, 1) * (.6 + .8 * noise(rng0, 4))
    for (x, y, r) in ((78, 50, 8), (46, 70, 6)):
        dk += np.clip(1 - np.hypot(XX - x, YY - y) / r, 0, 1) * (.6 + .8 * noise(rng0, 4))
    mp = np.clip(mp * 2.2 - .35, 0, 1); dk = np.clip(dk * 2.2 - .35, 0, 1)
    alb = np.dstack([126 * tex, 124 * tex, 116 * tex])
    alb = alb * (1 - mp[..., None]) + np.dstack([72 * tex, 92 * tex, 40 * tex]) * mp[..., None]
    alb = alb * (1 - .65 * dk[..., None]) * (1 - .85 * cracks[..., None])
    loc = to_img(alb, mask); idm = Image.fromarray(np.zeros((S, S), np.uint8), "L")
    ids = np.argmin((XX[..., None] - seeds[:, 0]) ** 2 + (YY[..., None] - seeds[:, 1]) ** 2, -1).astype(np.uint8)
    cx = 78 - 64
    for f in range(N):
        deg = 45 * f; th = math.radians(deg)
        rot = loc.rotate(-deg, Image.BICUBIC, center=(64, 64))
        rg = np.asarray(rot).astype(np.float32); ra = rg[..., 3] / 255; rg = rg[..., :3]
        rid = np.asarray(Image.fromarray(ids, "L").rotate(-deg, Image.NEAREST, center=(64, 64)))
        fn = nang[rid] + th                                       # facet normal direction, world space
        lit = np.cos(fn - math.radians(225)) * nstr[rid]           # light from upper-left
        sh = 0.78 + 0.5 * lit
        top = ra * (1 - np.roll(ra, 2, 0)); bot = ra * (1 - np.roll(ra, -2, 0))
        top = np.clip(top + .5 * ra * (1 - np.roll(ra, (2, 2), (0, 1))), 0, 1); bot = np.clip(bot, 0, 1)
        # facet seams: darken boundaries between cells
        seam = (rid != np.roll(rid, 1, 0)) | (rid != np.roll(rid, 1, 1))
        col = rg * sh[..., None] * (1 - .25 * seam[..., None])
        col = col * (1 - .55 * bot[..., None]) + 255 * .35 * top[..., None]
        rgb, a = blank(); rng = np.random.default_rng(4300 + f)
        for k in range(30):   # denser dust trail
            t = (k + f / N) / 30; x = 62 - t * 62; y = 96 - 4 * t - rng.random() * 10 * (.3 + t)
            L2 = np.zeros((S, S), np.float32); splat(L2, x, y, 3 + 5 * t, 1.0)
            L2 = L2 * (.55 + .8 * noise(rng, 4)) * (1 - .7 * t)
            rgb, a = over(rgb, a, (140, 128, 104), np.clip(L2 * .9, 0, .75))
        fcol = np.roll(col, cx, 1); fa = np.roll(ra, cx, 1)
        rgb, a = over(rgb, a, np.clip(fcol, 0, 255), fa)
        fr.append(to_img(rgb, a))
    return sheet(fr)

def contact(strips):
    names = list(strips); W = N * S; rowh = 128 + 8
    H = len(names) * (rowh + 56 * 2 + 12 + 14) + 10
    sh = Image.new("RGB", (W, H), (30, 30, 34)); dr = ImageDraw.Draw(sh); y = 6
    for nm in names:
        st = strips[nm]; dr.text((4, y), nm, fill=(255, 255, 255)); y += 12
        bg = Image.new("RGBA", st.size, (14, 14, 18, 255)); bg.alpha_composite(st); sh.paste(bg.convert("RGB"), (0, y)); y += 130
        x = 0
        for size, bgc in ((56, (14, 14, 18)), (56, (110, 110, 112)), (48, (14, 14, 18)), (48, (110, 110, 112))):
            pass
        for sz in (56, 48):
            for bgc in ((14, 14, 18), (110, 110, 112)):
                for i in range(N):
                    fimg = st.crop((i * S, 0, (i + 1) * S, S)).resize((sz, sz), Image.LANCZOS)
                    tile = Image.new("RGBA", (sz, sz), bgc + (255,)); tile.alpha_composite(fimg)
                    sh.paste(tile.convert("RGB"), (x, y)); x += sz
                x += 6
            if sz == 56: x = 0; y += 58 if False else 0
            # lay 56px pair on one row, 48px pair on next
            if sz == 56: x = 0; y += 58
        y += 52 + 8
    sh.save(OUT + "contact.png")

if __name__ == "__main__":
    # cinderSpray and abyssalPull are director-approved: keep the existing files untouched
    keep = {k: Image.open(OUT + k + ".png").convert("RGBA") for k in ("cinderSpray", "abyssalPull")}
    strips = dict(cinderSpray=keep["cinderSpray"], sporeBurst=spore(), stingingFilament=filament(), boulderRoll=boulder(), abyssalPull=keep["abyssalPull"])
    for k in ("sporeBurst", "stingingFilament", "boulderRoll"):
        assert strips[k].size == (1024, 128); strips[k].save(OUT + k + ".png")
    contact(strips); print("ok")
