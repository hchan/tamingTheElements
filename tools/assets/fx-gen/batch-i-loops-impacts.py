"""Effect sprite style pass: looping projectile strips and element impact strips (ideas/in-progress/effect-sprite-style-pass.md).
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-i-loops-impacts.py [outdir=public/assets/img/fx] [--only name,name]   (Pillow + numpy)
Writes, in <outdir>:
  loop/<sprite>Loop.png  8 looping frames side by side (frame = 2x the static sprite's size, caster at the left, head right) for the
                         projectile sprites fireball, fireBlast, crimsonFire, hurlRock, rockPellet, windCone, sonarBlast, icicles,
                         shardsOfIce, slimeBlast, chaosBolt, chaosOrb. The view cycles them (src/game/views/projectile-view.ts).
  impact/impact<Element>.png  12 frames of 128x128 (fire, ice, earth, air, water, void): a pale flash first, then the element's own
                         debris and cloud fading out. Spawned on a hit by the Phaser fx sink (src/game/fx/impact-view.ts).
Shape language (docs/ART-REFERENCES.md rule 8): fire = teardrop with a flickering tail and shed embers; ice = hard angular shard with a frost
contrail; earth = chunky tumbling rock with a dust trail; air = thin curved streaks and swirl rings; water/slime = blob with spray; void =
dark orb with violet veins. Look: paint.py (soft density fields through muted ramps, smoky underlay, no outlines) and grim_fx.grade.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import grim_fx
from paint import Noise, blob, finish, grid, seg, smooth

args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = args[0] if args else "public/assets/img/fx"
ONLY = None
for i, a in enumerate(sys.argv):
    if a == "--only":
        ONLY = set(sys.argv[i + 1].split(","))
SS = 2
LOOP_FRAMES = 8
IMPACT_FRAMES = 12
IMPACT_SIZE = 128
TAU = 2 * math.pi


def want(name):
    return ONLY is None or name in ONLY


# ---------------------------------------------------------------------------------------------------------------- loops
def fire_loop(X, Y, W, H, ph, seed, hs=1.0, tail=0.6):
    """Teardrop head at the right, a flickering tail to the left, shed embers."""
    n = Noise(seed)
    hx, hy, R = 0.72 * W, H / 2, 0.27 * H * hs
    d = np.hypot(X - hx, (Y - hy) * 1.05)
    head = np.exp(-(d / R) ** 2 * 1.5)
    s = np.clip((hx - X) / (tail * W), 0, 1.4)
    flick = n(X * 0.16, Y * 0.16, ph) * R * 0.55 * np.clip(s, 0, 1)
    half = R * (1 - np.clip(s, 0, 1)) ** 1.15 * 0.95 + 0.4
    tl = np.clip(1 - np.abs(Y - hy - flick) / half, 0, 1) ** 1.2 * (1 - np.clip(s, 0, 1)) * (X < hx + 2)
    tl *= 0.65 + 0.35 * n(X * 0.14 - ph * 2, Y * 0.14, ph * 2)
    D = np.maximum(head, tl * 0.92)
    # hot core, a cooler eroded rim
    D = D * (0.86 + 0.2 * n(X * 0.11, Y * 0.11, ph)) + 0.25 * np.exp(-(d / (R * 0.5)) ** 2)
    rs = np.random.RandomState(seed + 5)
    for i in range(7):
        t = (rs.uniform() + ph / TAU) % 1.0
        ex = hx - R * 0.6 - t * (hx - R)
        ey = hy + rs.uniform(-1, 1) * R * (0.7 + t * 0.8) - t * R * 0.5
        D = np.maximum(D, 0.85 * (1 - t) * blob(X, Y, ex, ey, max(0.7, R * 0.075), max(0.7, R * 0.075)))
    return D, None


def ice_loop(X, Y, W, H, ph, seed, hs=1.0):
    """Hard angular kite shard (two facets and a ridge), frost contrail of drifting specks, a pulsing sparkle at the tip."""
    n = Noise(seed)
    hy = H / 2
    tip, shoulder, base = (0.95 * W, hy), (0.6 * W, 0.26 * H * hs), 0.3 * W
    # signed depth inside the kite (convex): min over the four edges
    pts = [(base, hy), (shoulder[0], hy - shoulder[1]), tip, (shoulder[0], hy + shoulder[1])]
    depth = np.full(X.shape, 1e9, np.float32)
    for i in range(4):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % 4]
        ex, ey = x1 - x0, y1 - y0
        L = math.hypot(ex, ey)
        depth = np.minimum(depth, (ex * (Y - y0) - ey * (X - x0)) / L * (1 if True else -1))
    depth = -depth if depth.max() <= 0 else depth
    depth = depth + 1.3 * n(X * 0.35, Y * 0.35, 0)
    inside = smooth(-0.3, 1.2, depth)
    upper = (Y < hy + (X - base) * 0.0).astype(np.float32)
    facet = 0.52 + 0.2 * upper + 0.14 * smooth(0, 5, depth)
    ridge = np.exp(-((Y - hy) / (0.03 * H + 0.5)) ** 2) * (X > base) * (X < tip[0])
    D = inside * (facet + 0.18 * ridge + 0.06 * n(X * 0.5, Y * 0.5, 0))
    rs = np.random.RandomState(seed + 9)
    for i in range(26):
        t = (rs.uniform() + ph / TAU) % 1.0
        x = base + 4 - t * base * 0.98
        spread = (0.03 + 0.2 * t) * H
        y = hy + rs.uniform(-1, 1) * spread
        D = np.maximum(D, 0.78 * (1 - t) ** 1.2 * blob(X, Y, x, y, 0.9 + 1.6 * rs.uniform(), 0.7 + 0.5 * rs.uniform()))
    mist = np.clip(1 - np.abs(Y - hy) / (0.22 * H * (1 - (X / base) * 0.5)), 0, 1) * (X < base + 3) * (X / base) ** 0.7
    D = np.maximum(D, 0.32 * mist * (0.55 + 0.45 * n(X * 0.12 - ph, Y * 0.2, ph)))
    sp = 0.5 + 0.5 * math.cos(ph)
    D = np.maximum(D, sp * (blob(X, Y, tip[0] - 0.14 * W, hy, 0.12 * W, 0.7) + blob(X, Y, tip[0] - 0.14 * W, hy, 0.7, 0.12 * H)) * 0.9)
    return D, None


def rock_loop(X, Y, W, H, ph, seed, hs=1.0):
    """Chunky jagged rock, tumbling (a full turn over the loop), with a dust trail and shed chips."""
    n = Noise(seed, base=3)
    rs = np.random.RandomState(seed)
    hx, hy = 0.72 * W, H / 2
    R = 0.4 * min(W * 0.55, H) * hs
    k = 9
    radii = R * rs.uniform(0.72, 1.12, k)
    ang = np.arctan2(Y - hy, X - hx) - ph  # rotate the rock
    r = np.hypot(X - hx, Y - hy)
    u = ((ang % TAU) / TAU) * k
    i0 = np.floor(u).astype(np.int32) % k
    f = u - np.floor(u)
    rb = radii[i0] * (1 - f) + radii[(i0 + 1) % k] * f
    depth = (rb - r) / R
    inside = smooth(-0.02, 0.1, depth)
    # facet shade: each sector has its own light, so the rock reads chunky; seams darker; cracks from noise
    sec = np.floor(u + 0.5).astype(np.int32) % k
    wang = np.arctan2(Y - hy, X - hx)
    secv = rs.uniform(-0.08, 0.08, k)[sec]
    shade = 0.5 + 0.28 * np.cos(wang + 2.3) * smooth(0.0, 0.7, r / R) + secv + 0.1 * smooth(0.0, 0.5, depth)
    seam = 1 - 0.18 * np.exp(-((f - 0.0) / 0.06) ** 2) * (depth > 0.05)
    crack = 1 - 0.3 * smooth(0.72, 0.9, np.abs(n(X * 0.3, Y * 0.3, 0)))
    D = inside * np.clip(shade * seam * crack + 0.16 * smooth(0.1, 0.6, depth), 0, 1)
    for i in range(6):  # dust puffs trailing, growing as they fall behind
        t = (rs.uniform() + ph / TAU) % 1.0
        x = hx - R * 0.8 - t * hx * 0.95
        y = hy + rs.uniform(-0.35, 0.35) * R + (t - 0.5) * R * 0.2
        D = np.maximum(D, 0.4 * (1 - t) * blob(X, Y, x, y, R * (0.28 + 0.4 * t), R * (0.22 + 0.34 * t)) * (0.7 + 0.3 * n(X * 0.2, Y * 0.2, ph)))
    for i in range(5):  # chips
        t = (rs.uniform() + ph / TAU) % 1.0
        D = np.maximum(D, 0.6 * (1 - t) * blob(X, Y, hx - R * 0.9 - t * hx * 0.6, hy + rs.uniform(-1, 1) * R * (0.6 + t), max(0.8, R * 0.09)))
    return D, None


def air_loop(X, Y, W, H, ph, seed, hs=1.0, rings=True):
    """Thin curved streaks sweeping back from a leading swirl arc (few tones, bright leading edge)."""
    rs = np.random.RandomState(seed)
    hy = H / 2
    D = np.zeros_like(X)
    for i in range(6):
        off = (i - 2.5) / 2.5
        amp = H * (0.07 + 0.09 * rs.uniform())
        fq = 1.1 + rs.uniform() * 0.9
        pp = rs.uniform(0, TAU)
        s = np.clip((X - 0.1 * W) / (0.84 * W), 0, 1)
        yc = hy + off * H * 0.3 * (0.3 + 0.7 * s) + amp * np.sin(TAU * fq * s - ph + pp) * s
        th = (0.7 + 1.3 * rs.uniform()) * H * 0.02 * hs + 0.5
        env = np.maximum(np.sin(np.pi * np.clip((s - 0.04) / 0.96, 0, 1)), 0) ** 0.7 * (X > 0.1 * W) * (X < 0.94 * W)
        lead = smooth(0.35, 1.0, s)
        D = np.maximum(D, np.exp(-((Y - yc) / th) ** 2) * env * (0.35 + 0.65 * lead))
    if rings:
        hx = 0.82 * W
        r = np.hypot((X - hx) / 0.5, Y - hy)
        a = np.arctan2(Y - hy, (X - hx) / 0.5)
        arc = np.exp(-((r - 0.36 * H) / (0.035 * H + 0.5)) ** 2) * (0.5 + 0.5 * np.sin(a * 2 - ph * 1))
        arc *= smooth(-1.9, -0.5, a) + smooth(1.9, 0.5, a) > 0.3
        D = np.maximum(D, arc * 0.9)
    return D * 0.92, None


def slime_loop(X, Y, W, H, ph, seed, hs=1.0):
    n = Noise(seed)
    hx, hy, R = 0.7 * W, H / 2, 0.34 * H * hs
    ang = np.arctan2(Y - hy, X - hx)
    r = np.hypot(X - hx, Y - hy)
    rb = R * (1 + 0.13 * np.sin(3 * ang + ph) + 0.08 * np.sin(5 * ang - 2 * ph))
    body = smooth(-0.04, 0.12, (rb - r) / R)
    D = body * (0.42 + 0.3 * n(X * 0.22, Y * 0.22, ph) * 0.5 + 0.25 * smooth(0.2, 0.9, (rb - r) / R))
    D += 0.5 * blob(X, Y, hx - R * 0.3, hy - R * 0.35, R * 0.18, R * 0.12) * body  # wet sheen
    rs = np.random.RandomState(seed + 2)
    for i in range(6):
        t = (rs.uniform() + ph / TAU) % 1.0
        D = np.maximum(D, 0.6 * (1 - t) * blob(X, Y, hx - R * 0.9 - t * hx * 0.7, hy + rs.uniform(-1, 1) * R * 0.9 + t * R * 0.8, max(0.9, R * 0.13)))
    return D, None


def void_loop(X, Y, W, H, ph, seed, hs=1.0, tail=0.55):
    n = Noise(seed)
    hx, hy, R = 0.7 * W, H / 2, 0.3 * H * hs
    ang = np.arctan2(Y - hy, X - hx)
    r = np.hypot(X - hx, Y - hy)
    orb = smooth(1.0, 0.82, r / R)
    vein = np.clip(np.sin(ang * 3 + r / R * 7 - ph * 2) * 0.5 + 0.5, 0, 1) ** 2.5
    rim = np.exp(-((r - R * 0.96) / (R * 0.1)) ** 2)
    s = np.clip((hx - X) / (tail * W), 0, 1)
    wisp = np.clip(1 - np.abs(Y - hy - n(X * 0.18, Y * 0.18, ph) * R * 0.7 * s) / (R * (1 - s) * 0.9 + 0.4), 0, 1) ** 1.6 * (1 - s) * (X < hx)
    D = np.maximum(orb * (0.16 + 0.42 * vein), 0.55 * rim)
    D = np.maximum(D, wisp * 0.42 * (0.6 + 0.4 * n(X * 0.3 - ph, Y * 0.3, ph)))
    A = np.clip(np.maximum(orb, np.maximum(rim * 0.9, wisp * 0.75)), 0, 1)
    return D, A


# sprite -> (builder, kind-name for the ramp, static px size w x h, builder kwargs)
LOOPS = {
    "fireball": (fire_loop, "fire", 80, 50, dict(hs=1.05)),
    "fireBlast": (fire_loop, "fire", 74, 26, dict(hs=1.1, tail=0.72)),
    "crimsonFire": (fire_loop, "fire", 80, 64, dict(hs=1.15, tail=0.55)),
    "hurlRock": (rock_loop, "earth", 80, 64, dict(hs=1.0)),
    "rockPellet": (rock_loop, "earth", 80, 19, dict(hs=1.25)),
    "windCone": (air_loop, "air", 54, 28, dict(rings=False)),
    "sonarBlast": (air_loop, "air", 80, 38, dict()),
    "icicles": (ice_loop, "ice", 80, 42, dict(hs=1.0)),
    "shardsOfIce": (ice_loop, "ice", 80, 11, dict(hs=1.3)),
    "slimeBlast": (slime_loop, "slime", 80, 45, dict()),
    "chaosBolt": (void_loop, "void", 80, 41, dict(hs=1.05)),
    "chaosOrb": (void_loop, "void", 80, 80, dict(hs=0.92, tail=0.4)),
}
LOOP_SCALE = 2  # frames are drawn at twice the static sprite (still displayed at the same size)


def make_loop(name):
    fn, ramp_name, sw, sh, kw = LOOPS[name]
    w, h = sw * LOOP_SCALE, sh * LOOP_SCALE
    X, Y = grid(w, h, SS)
    seed = zlib_seed(name)
    strip = Image.new("RGBA", (w * LOOP_FRAMES, h), (0, 0, 0, 0))
    for k in range(LOOP_FRAMES):
        ph = TAU * k / LOOP_FRAMES
        D, A = fn(X * 1.0, Y * 1.0, w, h, ph, seed, **kw)
        fr = finish(D, A, ramp_name, SS, (w, h))
        strip.alpha_composite(fr, (k * w, 0))
    out = grim_fx.grade(strip, name + "Loop", sat=0.85, gamma=1.08, edge=0.06)
    path = os.path.join(OUT, "loop", name + "Loop.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, optimize=True)
    print(path, out.size)


def zlib_seed(s):
    import zlib
    return zlib.crc32(s.encode()) & 0x7FFFFFFF


# -------------------------------------------------------------------------------------------------------------- impacts
def ease(t):
    return 1 - (1 - t) ** 2.2


def impact(kind, X, Y, t, seed):
    """One impact frame at t in 0..1 (centre of the 128 box). Returns density D and alpha A."""
    c = IMPACT_SIZE / 2
    n = Noise(seed, base=2.4)
    rs = np.random.RandomState(seed)
    dx, dy = X - c, Y - c
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    fade = (1 - t) ** 1.15
    D = np.zeros_like(X)
    # first frames: a pale flash, eroded by noise so it is a burst of light, not a disc
    fl = max(0.0, 1 - t / 0.2)
    flash = fl * np.exp(-(r / (14 + 22 * t * 3)) ** 2) * (0.8 + 0.3 * n(X * 0.2, Y * 0.2, 0))
    if kind == "fire":
        R = 46 * ease(t) + 6
        cl = np.exp(-(r / R) ** 2 * 1.6) * (0.55 + 0.5 * n(X * 0.07 + 3, Y * 0.07, t * 2))
        D = np.maximum(D, cl * (0.95 - 0.55 * t) * fade ** 0.6)
        ring = np.exp(-((r - R * 1.12) / (4 + 3 * t)) ** 2) * (1 - t) ** 2 * 0.4
        D = np.maximum(D, ring * 0.55)
        for i in range(14):  # embers rise
            a = rs.uniform(0, TAU); v = rs.uniform(18, 52); sz = rs.uniform(1.2, 2.6)
            D = np.maximum(D, 0.9 * (1 - t) ** 1.3 * blob(X, Y, c + math.cos(a) * v * ease(t), c + math.sin(a) * v * ease(t) - 22 * t * t - 6 * t, sz))
    elif kind == "ice":
        R = 40 * ease(t) + 5
        D = np.maximum(D, 0.3 * np.exp(-(r / (R * 1.1)) ** 2) * fade * (0.6 + 0.4 * n(X * 0.15, Y * 0.15, t * 2)))
        for i in range(11):  # hard angular shards, long and thin, flying out and shrinking
            a = (i / 11) * TAU + rs.uniform(-0.2, 0.2); v = rs.uniform(30, 58); ln = rs.uniform(10, 22) * (1 - 0.6 * t)
            p0 = ease(t) * v
            p = (c + math.cos(a) * p0, c + math.sin(a) * p0)
            q = (c + math.cos(a) * (p0 + ln), c + math.sin(a) * (p0 + ln))
            D = np.maximum(D, (0.95 - 0.35 * t) * seg(X, Y, p, q, 3.4 * (1 - 0.4 * t), 0.7) * (1 - t) ** 0.6)
        for i in range(16):
            a = rs.uniform(0, TAU); v = rs.uniform(14, 56)
            D = np.maximum(D, 0.7 * (1 - t) * blob(X, Y, c + math.cos(a) * v * ease(t), c + math.sin(a) * v * ease(t), 1.1))
    elif kind == "earth":
        R = 44 * ease(t) + 6
        dust = np.exp(-(r / (R * 1.1)) ** 2) * (0.5 + 0.5 * n(X * 0.1 + 3, Y * 0.1, t * 2)) * fade
        D = np.maximum(D, 0.45 * dust)
        for i in range(10):  # chunks arc out and fall
            a = rs.uniform(-math.pi, 0) if i % 2 else rs.uniform(0, TAU); v = rs.uniform(26, 54); sz = rs.uniform(3.4, 6.5)
            px = c + math.cos(a) * v * ease(t)
            py = c + math.sin(a) * v * ease(t) + 36 * t * t
            D = np.maximum(D, (0.75 - 0.2 * t) * blob(X, Y, px, py, sz * (1 - 0.3 * t), sz * 0.8 * (1 - 0.3 * t)) * (1 - t * 0.5))
        for i in range(6):  # ground cracks
            a = rs.uniform(0, TAU)
            D = np.maximum(D, 0.55 * (1 - t) * seg(X, Y, (c, c), (c + math.cos(a) * 36 * ease(t), c + math.sin(a) * 36 * ease(t)), 1.5, 0.5))
    elif kind == "air":
        for j in range(3):  # thin swirl rings, each a little behind the last
            tt = np.clip(t * 1.25 - j * 0.16, 0, 1)
            if tt <= 0:
                continue
            R = 8 + 52 * ease(tt)
            gap = 0.5 + 0.5 * np.sin(ang * 2 + j * 2 + t * 5)
            D = np.maximum(D, np.exp(-((r - R) / (1.6 + 1.2 * tt)) ** 2) * (1 - tt) ** 1.2 * gap ** 0.7 * 0.5)
        for i in range(10):  # radial streaks
            a = (i / 10) * TAU + rs.uniform(-0.15, 0.15); v0 = rs.uniform(12, 26); v1 = rs.uniform(40, 60)
            p = (c + math.cos(a) * (v0 + (v1 - v0) * ease(t) * 0.5), c + math.sin(a) * (v0 + (v1 - v0) * ease(t) * 0.5))
            q = (c + math.cos(a) * (v0 + (v1 - v0) * ease(t)), c + math.sin(a) * (v0 + (v1 - v0) * ease(t)))
            D = np.maximum(D, 0.65 * (1 - t) * seg(X, Y, p, q, 1.3, 0.5))
        D = np.maximum(D, 0.22 * np.exp(-(r / 34) ** 2) * fade)
    elif kind == "water":
        R = 38 * ease(t) + 6
        D = np.maximum(D, 0.28 * np.exp(-(r / (R * 1.2)) ** 2) * fade)
        ell = np.hypot(dx / (1.0), dy / 0.55)
        D = np.maximum(D, np.exp(-((ell - 12 - 40 * ease(t)) / (2.2 + 1.5 * t)) ** 2) * (1 - t) * 0.7)
        for i in range(15):  # crown droplets on parabolic arcs
            a = rs.uniform(-math.pi * 0.95, -math.pi * 0.05); v = rs.uniform(22, 50); sz = rs.uniform(1.4, 3.1)
            px = c + math.cos(a) * v * ease(t) * 1.1
            py = c + math.sin(a) * v * ease(t) * 1.3 + 40 * t * t
            D = np.maximum(D, 0.85 * (1 - t) ** 0.9 * blob(X, Y, px, py, sz * 1.0, sz * 1.3))
    else:  # void: a dark ring pulls in, then a violet burst of shards
        pull = smooth(0.0, 0.3, t) * (1 - smooth(0.3, 0.4, t))
        Rr = 38 - 24 * smooth(0, 0.3, t) if t < 0.3 else 14 + 46 * ease((t - 0.3) / 0.7)
        ring = np.exp(-((r - Rr) / (2.6 + 1.4 * t)) ** 2) * (0.9 if t < 0.3 else (1 - (t - 0.3) / 0.7) ** 1.3)
        D = np.maximum(D, ring * (0.55 + 0.25 * n(ang * 2, r * 0.1, t * 3)))
        core = np.exp(-(r / (10 + 14 * (1 - pull))) ** 2) * (0.3 + 0.5 * (t > 0.3) * (1 - t))
        D = np.maximum(D, core)
        if t >= 0.3:
            u = (t - 0.3) / 0.7
            for i in range(9):
                a = (i / 9) * TAU + rs.uniform(-0.2, 0.2); v = rs.uniform(30, 58); ln = rs.uniform(8, 18)
                p0 = ease(u) * v
                D = np.maximum(D, 0.8 * (1 - u) ** 0.9 * seg(X, Y, (c + math.cos(a) * p0, c + math.sin(a) * p0), (c + math.cos(a) * (p0 + ln), c + math.sin(a) * (p0 + ln)), 2.6, 0.7))
    D = np.maximum(D, flash)
    D = D * (0.94 + 0.08 * n(X * 0.15, Y * 0.15, t))
    # alpha: the field itself (soft), the flash a touch wider; void keeps a dark body (index low, alpha from D plus a dim disc)
    A = smooth(0.06, 0.3, D)
    if kind == "void":
        A = np.maximum(A, 0.6 * np.exp(-(r / (28 + 16 * t)) ** 2) * (1 - t) ** 1.3)
    return D, A


IMPACTS = {"Fire": "fire", "Ice": "ice", "Earth": "earth", "Air": "air", "Water": "water", "Void": "void"}
IMPACT_RAMP = {"fire": "fire", "ice": "ice", "earth": "earth", "air": "air", "water": "water", "void": "void"}


def make_impact(label, kind):
    X, Y = grid(IMPACT_SIZE, IMPACT_SIZE, SS)
    seed = zlib_seed("impact" + label)
    strip = Image.new("RGBA", (IMPACT_SIZE * IMPACT_FRAMES, IMPACT_SIZE), (0, 0, 0, 0))
    for k in range(IMPACT_FRAMES):
        t = k / (IMPACT_FRAMES - 1) * 0.98
        D, A = impact(kind, X, Y, t, seed)
        fr = finish(D, A, IMPACT_RAMP[kind], SS, (IMPACT_SIZE, IMPACT_SIZE), halo=0.8)
        strip.alpha_composite(fr, (k * IMPACT_SIZE, 0))
    out = grim_fx.grade(strip, "impact" + label, sat=0.85, gamma=1.08, edge=0.06)
    path = os.path.join(OUT, "impact", "impact" + label + ".png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, optimize=True)
    print(path, out.size)


if __name__ == "__main__":
    for name in LOOPS:
        if want(name):
            make_loop(name)
    for label, kind in IMPACTS.items():
        if want("impact" + label):
            make_impact(label, kind)
