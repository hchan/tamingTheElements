"""Roster 24 batch 2 ability sprites (Brazgor, Glimmaw, Durrok, Zephra): forgeGore, moltenHide, lureOrb, abyssFlash, tuskGore, bristleStomp,
staticMote, skitter. Single frames written to public/assets/img/fx/<name>.png. Original art generated from code.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/fx-gen/batch-k-roster24-b2.py [outdir] [--only a,b]   (needs numpy + Pillow)
Look: same family as batch-j (paint.py soft density fields through muted element ramps, then grim_fx.grade).
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


def forge_gore(X, Y, w, h):
    """A heavy upward hammer-gore: a thick molten wedge with a hot core and flung sparks."""
    n = noise(81)
    D = seg(X, Y, (10, h - 12), (62, 14), 9, 5)
    D = np.maximum(D, seg(X, Y, (14, h - 20), (56, 10), 5, 2.5) * 0.85)
    D = np.maximum(D, blob(X, Y, 62, 14, 8, 8) * 1.1)
    rng = np.random.RandomState(7)
    for k in range(10):
        a = rng.uniform(-1.9, -0.4)
        p0 = (60 + rng.uniform(-4, 4), 16)
        D = np.maximum(D, seg(X, Y, p0, (p0[0] + 14 * math.cos(a), p0[1] + 14 * math.sin(a)), 1.5, 0.4) * rng.uniform(0.6, 1.0))
    D = D * (0.7 + 0.3 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def molten_hide(X, Y, w, h):
    """A cracked shell of slag around the caster: a broken ring with glowing seams."""
    n = noise(83)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy) + 2.5 * n(X * 0.3, Y * 0.3)
    ang = np.arctan2(Y - cy, X - cx)
    gaps = 0.55 + 0.45 * np.cos(ang * 5 + 1.0)
    D = np.exp(-((r - 28) / 5.0) ** 2) * (0.5 + 0.5 * gaps) + 0.5 * np.exp(-((r - 22) / 3.0) ** 2) * (1 - gaps)
    return np.clip(D, 0, 1), smooth(0.18, 0.42, D)


def lure_orb(X, Y, w, h):
    """A pale glowing lure: a bright core, a soft halo and a wavering tendril of light."""
    n = noise(85)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy)
    D = np.exp(-(r / 10.0) ** 2) * 1.2 + 0.5 * np.exp(-(r / 22.0) ** 2)
    D = np.maximum(D, seg(X, Y, (6, cy + 6), (cx - 8, cy + 2), 2.2, 0.8) * 0.7)
    D = D * (0.85 + 0.15 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def abyss_flash(X, Y, w, h):
    """A blinding burst: a radial flare of spikes over a pale core, the abyss lighting up."""
    n = noise(87)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy)
    D = np.exp(-(r / 12.0) ** 2) * 1.15 + 0.35 * np.exp(-((r - 30) / 5.0) ** 2)
    for k in range(12):
        a = k * math.pi / 6
        L = 36 if k % 2 == 0 else 24
        D = np.maximum(D, seg(X, Y, (cx, cy), (cx + L * math.cos(a), cy + L * math.sin(a)), 3.0, 0.5) * 0.9)
    D = D * (0.85 + 0.15 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.18, 0.44, D)


def tusk_gore(X, Y, w, h):
    """A pair of curved tusk slashes with a spray of rubble: a charging gore."""
    n = noise(89)
    D = np.zeros_like(X)
    for sgn in (-1, 1):
        for k in range(8):
            t = (k + 0.5) / 8
            D = np.maximum(D, blob(X, Y, 8 + 62 * t, h / 2 + sgn * (4 + 12 * (1 - (1 - t) ** 2)), 6 * (1 - 0.7 * t) + 1.8, 4 * (1 - 0.6 * t) + 1.3))
    rng = np.random.RandomState(9)
    for k in range(9):
        D = np.maximum(D, blob(X, Y, rng.uniform(10, 40), rng.uniform(6, h - 6), 2.2, 2.2) * 0.8)
    D = D * (0.72 + 0.28 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def bristle_stomp(X, Y, w, h):
    """A ground-stomp: a flat crack burst with bristle spikes fanning up from it."""
    n = noise(91)
    D = np.zeros_like(X)
    base = h - 14
    D = np.maximum(D, seg(X, Y, (8, base), (72, base), 4, 4) * 0.9)
    for k in range(9):
        x = 12 + k * 7
        D = np.maximum(D, seg(X, Y, (x, base), (x + (k - 4) * 1.5, base - 22 - 6 * (k % 2)), 2.4, 0.4) * 0.95)
    D = D * (0.72 + 0.28 * n(X * 0.3, Y * 0.3)) + 0.2 * blob(X, Y, 40, base, 26, 5)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def static_mote(X, Y, w, h):
    """A small crackling spark ball with a kinked arc through it."""
    n = noise(93)
    cx, cy = w / 2, h / 2
    r = np.hypot(X - cx, Y - cy)
    D = np.exp(-(r / 9.0) ** 2) * 1.2 + 0.4 * np.exp(-(r / 20.0) ** 2)
    pts = [(14, cy + 4), (28, cy - 8), (38, cy + 6), (50, cy - 7), (66, cy + 3)]
    for a, b in zip(pts, pts[1:]):
        D = np.maximum(D, seg(X, Y, a, b, 1.8, 1.0) * 0.9)
    D = D * (0.85 + 0.15 * n(X * 0.3, Y * 0.3))
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


def skitter(X, Y, w, h):
    """A puff of streaked wind and tiny sparks where a wisp darts away (streaks trail to the right)."""
    n = noise(95)
    D = np.zeros_like(X)
    for k, y in enumerate((20, 32, 40, 48, 60)):
        D = np.maximum(D, seg(X, Y, (14 + 3 * k, y), (70 - 4 * k, y + (k - 2) * 2), 2.6, 0.5) * 0.9)
    D = D * (0.75 + 0.25 * n(X * 0.25, Y * 0.5)) + 0.35 * blob(X, Y, 20, 40, 12, 16)
    rng = np.random.RandomState(4)
    for k in range(7):
        D = np.maximum(D, blob(X, Y, rng.uniform(16, 60), rng.uniform(16, 64), 1.8, 1.8) * 0.9)
    return np.clip(D, 0, 1), smooth(0.2, 0.46, D)


SPRITES = {
    "forgeGore": (forge_gore, "fire", 80, 60),
    "moltenHide": (molten_hide, "fire", 80, 80),
    "lureOrb": (lure_orb, "water", 80, 80),
    "abyssFlash": (abyss_flash, "water", 80, 80),
    "tuskGore": (tusk_gore, "earth", 80, 60),
    "bristleStomp": (bristle_stomp, "earth", 80, 60),
    "staticMote": (static_mote, "air", 80, 80),
    "skitter": (skitter, "air", 80, 80),
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
