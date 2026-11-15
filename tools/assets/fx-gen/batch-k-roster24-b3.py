"""Roster 24 batch 3 ability sprites (Ouroth, Abyssor, Vortigal, Umbrel): wyrmCoil, scorchBreath, tentacleLash, abyssalPull, stoop, talonRake,
sporeBurst, myceliumMend. Single frames written to public/assets/img/fx/<name>.png. Original art generated from code.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-k-roster24-b3.py [outdir] [--only a,b]   (needs numpy + Pillow)
Look: same family as batch-k-roster24-b2.py (paint.py soft density fields through muted element ramps, then grim_fx.grade).
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


def wyrm_coil(X, Y, w, h):
    """A tight coil of molten rope round a hot core: the grab."""
    n = noise(101)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy) + 2.0 * n(X * 0.3, Y * 0.3)
    ang = np.arctan2(Y - cy, X - cx)
    D = np.exp(-((r - 18 - 5 * np.sin(ang * 2 + r * 0.15)) / 4.5) ** 2) * 0.95
    D = np.maximum(D, np.exp(-((r - 30 + 6 * np.sin(ang * 2 - 1.0)) / 4.0) ** 2) * 0.8)
    D = np.maximum(D, np.exp(-(r / 8.0) ** 2) * 1.1)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def scorch_breath(X, Y, w, h):
    """A long jet of flame fanning out from the left, with flung embers."""
    n = noise(103)
    D = np.zeros_like(X)
    for k in range(9):
        t = (k + 0.5) / 9
        D = np.maximum(D, blob(X, Y, 6 + 66 * t, h / 2 + 3 * math.sin(k * 1.7), 3 + 11 * t, 3 + 15 * t * t) * (1.0 - 0.35 * t))
    rng = np.random.RandomState(11)
    for k in range(10):
        D = np.maximum(D, blob(X, Y, rng.uniform(30, 74), rng.uniform(6, h - 6), 1.8, 1.8) * 0.9)
    D = D * (0.7 + 0.3 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def tentacle_lash(X, Y, w, h):
    """A thick tapering arm swept in a curve, with a suckered underside of pale beads."""
    n = noise(105)
    D = np.zeros_like(X)
    pts = [(6, h - 14), (24, h - 8), (44, h / 2 + 2), (62, 16), (74, 12)]
    for a, b in zip(pts, pts[1:]):
        D = np.maximum(D, seg(X, Y, a, b, 6.0, 2.4))
    for k in range(7):
        t = (k + 0.5) / 7
        px = 10 + 58 * t
        D = np.maximum(D, blob(X, Y, px, h - 12 - 40 * t * t + 4, 1.6, 1.6) * 0.8)
    D = D * (0.75 + 0.25 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def abyssal_pull(X, Y, w, h):
    """An inward spiral of dark water draining to a pale centre."""
    n = noise(107)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy)
    ang = np.arctan2(Y - cy, X - cx)
    arms = 0.5 + 0.5 * np.cos(3 * ang - r * 0.28)
    D = np.exp(-(r / 30.0) ** 2) * (0.35 + 0.75 * arms) + np.exp(-(r / 7.0) ** 2) * 0.9
    D = D * (0.85 + 0.15 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def stoop_fx(X, Y, w, h):
    """A steep dive: a feathered streak falling to the right with wind trails."""
    n = noise(109)
    D = np.zeros_like(X)
    D = np.maximum(D, seg(X, Y, (8, 8), (64, h - 14), 6.0, 1.0))
    for k, off in enumerate((-9, -5, 5, 9)):
        D = np.maximum(D, seg(X, Y, (14 + 3 * k, 8 + off * 0.5 + 6), (58 - 2 * k, h - 16 + off * 0.5), 1.8, 0.4) * 0.8)
    D = np.maximum(D, blob(X, Y, 66, h - 12, 8, 6) * 0.9)
    D = D * (0.75 + 0.25 * n(X * 0.25, Y * 0.4))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def talon_rake(X, Y, w, h):
    """Three parallel slash marks with a few drops of blood-dark spray."""
    n = noise(111)
    D = np.zeros_like(X)
    for off in (-12, 0, 12):
        D = np.maximum(D, seg(X, Y, (10, 10 + 12 + off * 0.0 + (off + 12) * 0.2), (70, h - 8 + off * 0.2 - 12), 3.2, 0.5) * 0.95)
    rng = np.random.RandomState(13)
    for k in range(8):
        D = np.maximum(D, blob(X, Y, rng.uniform(20, 70), rng.uniform(6, h - 6), 1.6, 1.6) * 0.8)
    D = D * (0.75 + 0.25 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def spore_burst(X, Y, w, h):
    """A puffed cloud of spores: a soft core with dozens of motes drifting out."""
    n = noise(113)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy) + 3.0 * n(X * 0.25, Y * 0.25)
    D = np.exp(-(r / 14.0) ** 2) * 1.1 + 0.3 * np.exp(-(r / 28.0) ** 2)
    rng = np.random.RandomState(17)
    for k in range(26):
        a = rng.uniform(0, 6.283)
        d = rng.uniform(12, 34)
        D = np.maximum(D, blob(X, Y, cx + d * math.cos(a), cy + d * math.sin(a), 1.6, 1.6) * 0.9)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def mycelium_mend(X, Y, w, h):
    """A web of glowing threads closing over a bright knot: a heal."""
    n = noise(115)
    cx, cy = w / 2, h / 2
    D = np.exp(-(np.hypot(X - cx, Y - cy) / 9.0) ** 2) * 1.0
    rng = np.random.RandomState(19)
    for k in range(9):
        a = k * 6.283 / 9 + rng.uniform(-0.2, 0.2)
        mid = (cx + 16 * math.cos(a + 0.5), cy + 16 * math.sin(a + 0.5))
        end = (cx + 32 * math.cos(a), cy + 32 * math.sin(a))
        D = np.maximum(D, seg(X, Y, (cx, cy), mid, 1.8, 1.2) * 0.9)
        D = np.maximum(D, seg(X, Y, mid, end, 1.2, 0.5) * 0.8)
        D = np.maximum(D, blob(X, Y, end[0], end[1], 2.2, 2.2) * 0.9)
    D = D * (0.85 + 0.15 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


SPRITES = {
    "wyrmCoil": (wyrm_coil, "fire", 80, 80),
    "scorchBreath": (scorch_breath, "fire", 80, 60),
    "tentacleLash": (tentacle_lash, "water", 80, 60),
    "abyssalPull": (abyssal_pull, "water", 80, 80),
    "stoop": (stoop_fx, "air", 80, 60),
    "talonRake": (talon_rake, "air", 80, 60),
    "sporeBurst": (spore_burst, "earth", 80, 80),
    "myceliumMend": (mycelium_mend, "earth", 80, 80),
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
