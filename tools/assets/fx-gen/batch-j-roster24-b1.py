"""Roster 24 batch 1 ability sprites (Kindrel, Nykra, Quarrak, Hyalia): emberBite, cinderSpray, hoofCrash, kelpLash, boulderRoll,
stingingFilament, bellPulse. Single frames written to public/assets/img/fx/<name>.png. Original art generated from code.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-j-roster24-b1.py [outdir] [--only a,b]   (needs numpy + Pillow)
Look: the paint.py soft density fields through muted element ramps with a smoky underlay, then grim_fx.grade (same family as batch-i).
Sizes: melee swipes sit at about the hitbox aspect; ranged and omni sprites are 80x80 and the sprite def's w/h scales them.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import grim_fx
from paint import Noise, blob, finish, grid, seg, smooth

args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = args[0] if args else "public/assets/img/fx"
ONLY = None
for i, a in enumerate(sys.argv):
    if a == "--only":
        ONLY = set(sys.argv[i + 1].split(","))
SS = 3


def noise(seed, terms=6, base=1.4):
    return Noise(seed, terms, base)


def ember_bite(X, Y, w, h):
    """Two fanged flame crescents closing on each other: a jaw snap."""
    n = noise(11)
    D = np.zeros_like(X)
    for sgn in (-1, 1):
        for k in range(7):
            t = (k + 0.5) / 7
            cx = 8 + 60 * t
            cy = h / 2 + sgn * (4 + 15 * (1 - (2 * t - 1) ** 2) * 1.0)
            D = np.maximum(D, blob(X, Y, cx, cy, 6.5 * (1 - 0.6 * t) + 2, 4.5 * (1 - 0.5 * t) + 1.5))
        # fangs
        for fx in (24, 38, 50):
            D = np.maximum(D, seg(X, Y, (fx, h / 2 + sgn * 15), (fx + 3, h / 2 + sgn * 6), 2.2, 0.5) * 1.1)
    D = D * (0.75 + 0.25 * n(X * 0.25, Y * 0.25)) + 0.12 * blob(X, Y, 40, h / 2, 26, 6)
    A = smooth(0.22, 0.5, D)
    return np.clip(D, 0, 1.0), A


def cinder_spray(X, Y, w, h):
    """A ring of embers with sparks flung outward."""
    n = noise(23)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy)
    ang = np.arctan2(Y - cy, X - cx)
    ring = np.exp(-((r - 24) / 6.5) ** 2) * (0.6 + 0.4 * n(X * 0.3, Y * 0.3))
    D = ring * 0.85
    rng = np.random.RandomState(5)
    for k in range(18):
        a = k * 2 * math.pi / 18 + rng.uniform(-0.1, 0.1)
        r0, r1 = 20, rng.uniform(31, 38)
        D = np.maximum(D, seg(X, Y, (cx + r0 * math.cos(a), cy + r0 * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a)), 1.7, 0.4) * rng.uniform(0.7, 1.0))
    D = np.maximum(D, blob(X, Y, cx, cy, 9, 9) * 0.55)
    return np.clip(D, 0, 1), smooth(0.2, 0.45, D)


def hoof_crash(X, Y, w, h):
    """A heavy downward hoof-strike: a crushing wedge with a spray of water thrown to both sides."""
    n = noise(31)
    D = seg(X, Y, (14, 8), (46, h - 14), 7.5, 4.5)
    D = np.maximum(D, seg(X, Y, (34, 6), (60, h - 12), 5, 2.5) * 0.8)
    # splash crown where the hoof lands
    for k, sgn in enumerate((-1, 1)):
        for j in range(5):
            D = np.maximum(D, seg(X, Y, (46, h - 12), (46 + sgn * (10 + 6 * j), h - 12 - 7 * (j % 3) - 4), 3.2, 0.5) * (0.9 - 0.08 * j))
    D = D * (0.7 + 0.3 * n(X * 0.3, Y * 0.3)) + 0.2 * blob(X, Y, 46, h - 12, 14, 6)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def kelp_lash(X, Y, w, h):
    """A long whip of kelp: a waving ribbon with leafy tines and a flicked tip."""
    n = noise(41)
    D = np.zeros_like(X)
    pts = []
    for i in range(41):
        t = i / 40
        pts.append((6 + (w - 20) * t, h / 2 + 9 * math.sin(t * 2 * math.pi * 1.4) * (0.4 + 0.8 * t)))
    for a, b, t in zip(pts, pts[1:], np.linspace(0, 1, 40)):
        D = np.maximum(D, seg(X, Y, a, b, 4.2 * (1 - 0.7 * t) + 0.9))
    for i in range(4, 38, 4):
        x, y = pts[i]
        side = 1 if (i // 4) % 2 == 0 else -1
        D = np.maximum(D, seg(X, Y, (x, y), (x + 5, y + side * 9), 1.9, 0.4) * 0.85)
    D = D * (0.72 + 0.28 * n(X * 0.22, Y * 0.5))
    D = np.maximum(D, blob(X, Y, pts[-1][0], pts[-1][1], 5, 5) * 0.9)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def boulder_roll(X, Y, w, h):
    """A rolling boulder, cracked and mossy, trailing dust behind it (it travels right)."""
    n, m = noise(53, 7, 1.8), noise(54, 5, 3.0)
    cx, cy, R = 50, 42, 24
    r = np.hypot(X - cx, Y - cy)
    body = smooth(R, R - 5, r + 3.0 * n(X * 0.3, Y * 0.3))
    crack = np.exp(-np.abs(m(X * 0.5, Y * 0.5)) * 14)
    lit = 0.45 + 0.4 * np.clip(0.5 - ((X - cx) * 0.012 + (Y - cy) * 0.016), 0, 1) + 0.12 * n(X * 0.5, Y * 0.5)
    D = body * (lit - 0.28 * crack)
    dust = blob(X, Y, 20, 46, 18, 12) * 0.5 + blob(X, Y, 10, 50, 10, 8) * 0.3
    D = np.maximum(D, dust * (0.7 + 0.3 * n(X * 0.3, Y * 0.3)) * 0.8)
    return np.clip(D, 0, 1), np.clip(np.maximum(body, smooth(0.22, 0.45, dust)), 0, 1)


def stinging_filament(X, Y, w, h):
    """A long whip-thin filament with a glowing barbed tip (stretched in game to a thin, long line)."""
    n = noise(61)
    cy = h / 2
    path = cy + 5 * np.sin(X * 0.18)
    D = np.exp(-((Y - path) / 14.0) ** 2) * smooth(2, 18, X) * (1 - 0.35 * smooth(40, 74, X))
    D = np.maximum(D, blob(X, Y, 70, cy, 10, 16) * 1.1)
    D = D * (0.82 + 0.18 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.45, D)


def bell_pulse(X, Y, w, h):
    """A soft glassy ring pulse from a jellyfish bell: two pale lilac concentric rings."""
    n = noise(71)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy) + 2.0 * n(X * 0.3, Y * 0.3)
    D = np.exp(-((r - 28) / 4.6) ** 2) * 0.95 + np.exp(-((r - 17) / 3.6) ** 2) * 0.6 + 0.35 * blob(X, Y, cx, cy, 10, 10)
    return np.clip(D, 0, 1), smooth(0.18, 0.42, D)


SPRITES = {
    "emberBite": (ember_bite, "fire", 80, 52),
    "cinderSpray": (cinder_spray, "fire", 80, 80),
    "hoofCrash": (hoof_crash, "water", 80, 60),
    "kelpLash": (kelp_lash, "water", 160, 40),
    "boulderRoll": (boulder_roll, "earth", 80, 80),
    "stingingFilament": (stinging_filament, "void", 80, 80),
    "bellPulse": (bell_pulse, "air", 80, 80),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, (fn, ramp, w, h) in SPRITES.items():
        if ONLY is not None and name not in ONLY:
            continue
        X, Y = grid(w, h, SS)
        D, A = fn(X, Y, w, h)
        im = grim_fx.grade(finish(D, A, ramp, SS, (w, h)), name, sat=0.9, gamma=1.05, edge=0.06)
        path = os.path.join(OUT, name + ".png")
        im.save(path, optimize=True)
        print(path, im.size)
