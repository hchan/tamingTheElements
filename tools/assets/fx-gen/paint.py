"""Painterly density-field helpers for the loop and impact effect sheets (batch-i-loops-impacts.py).
Owner (2026-11-12): recent art reads too cartoony; want grim, desaturated, textured. So no flat polygons and no bold outlines here:
every sprite is a soft density field (noise-eroded, domain-warped), mapped through a muted element ramp with a little light/shade from the
field's gradient, given a dark smoky underlay (so it reads on bright floors) and then film-grained by grim_fx.grade.
Needs numpy + Pillow (no scipy). Deterministic: all noise is seeded, sums of sinusoids with integer time frequencies, so loops close.
"""
import math
import numpy as np
from PIL import Image, ImageFilter

# Muted ramps, dark -> light (about half the saturation of palette.ELEMENT_RAMPS; hue still shifts: cool shadows, warm lights).
RAMPS = {
    "fire":  [(0.0, (22, 14, 14)), (0.30, (84, 34, 22)), (0.55, (158, 70, 32)), (0.78, (206, 132, 66)), (1.0, (232, 208, 168))],
    "ice":   [(0.0, (16, 24, 34)), (0.30, (48, 78, 102)), (0.55, (104, 148, 172)), (0.78, (176, 208, 222)), (1.0, (228, 240, 246))],
    "earth": [(0.0, (26, 20, 16)), (0.30, (68, 54, 40)), (0.55, (112, 92, 64)), (0.78, (160, 134, 94)), (1.0, (208, 188, 150))],
    "air":   [(0.0, (34, 42, 54)), (0.30, (84, 102, 122)), (0.55, (136, 158, 176)), (0.78, (190, 208, 220)), (1.0, (232, 240, 244))],
    "water": [(0.0, (12, 26, 38)), (0.30, (30, 70, 94)), (0.55, (62, 120, 146)), (0.78, (132, 184, 198)), (1.0, (214, 234, 236))],
    "slime": [(0.0, (14, 24, 16)), (0.30, (40, 70, 38)), (0.55, (84, 118, 54)), (0.78, (146, 172, 92)), (1.0, (208, 220, 160))],
    "void":  [(0.0, (10, 8, 16)), (0.30, (38, 24, 56)), (0.55, (78, 52, 108)), (0.78, (136, 108, 164)), (1.0, (196, 180, 218))],
}


def ramp(name, t):
    stops = RAMPS[name]
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / (p1 - p0))[..., None]
        out = np.where(m[..., None], np.array(c0, np.float32) * (1 - k) + np.array(c1, np.float32) * k, out)
    return out


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Noise:
    """Looping smooth noise in about [-1, 1]: a sum of sinusoids; time frequencies are integers so phase 2*pi is one full loop."""

    def __init__(self, seed, terms=6, base=1.6):
        r = np.random.RandomState(seed)
        self.k = []
        for i in range(terms):
            f = base * (1.55 ** (i / 2.0))
            a = r.uniform(0, 2 * math.pi)
            self.k.append((f * math.cos(a), f * math.sin(a), int(r.randint(-2, 3)), r.uniform(0, 2 * math.pi), 1.0 / (1 + i * 0.35)))
        self.norm = sum(k[4] for k in self.k) * 0.55

    def __call__(self, X, Y, phase=0.0):
        acc = np.zeros_like(X)
        for kx, ky, w, p, amp in self.k:
            acc += amp * np.sin(kx * X + ky * Y + w * phase + p)
        return acc / self.norm


def grid(w, h, ss):
    """Pixel-centre coordinates of a w x h frame at ss supersampling, in frame pixels (0..w, 0..h)."""
    ys, xs = np.mgrid[0:h * ss, 0:w * ss].astype(np.float32)
    return (xs + 0.5) / ss, (ys + 0.5) / ss


def blob(X, Y, cx, cy, rx, ry=None):
    ry = rx if ry is None else ry
    return np.exp(-(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2))


def seg(X, Y, p, q, w0, w1=None):
    """Soft line segment p -> q, half width w0 at p and w1 at q (default constant)."""
    w1 = w0 if w1 is None else w1
    dx, dy = q[0] - p[0], q[1] - p[1]
    L2 = dx * dx + dy * dy + 1e-6
    t = np.clip(((X - p[0]) * dx + (Y - p[1]) * dy) / L2, 0, 1)
    d = np.hypot(X - (p[0] + t * dx), Y - (p[1] + t * dy))
    w = w0 + (w1 - w0) * t
    return np.exp(-(d / w) ** 2)


def warp(F, dx, dy):
    """Bilinear domain warp: sample F at (x + dx, y + dy) in pixel units (edge clamped)."""
    h, w = F.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xs + dx, 0, w - 1.001)
    sy = np.clip(ys + dy, 0, h - 1.001)
    x0, y0 = sx.astype(np.int32), sy.astype(np.int32)
    fx, fy = sx - x0, sy - y0
    return (F[y0, x0] * (1 - fx) * (1 - fy) + F[y0, x0 + 1] * fx * (1 - fy) + F[y0 + 1, x0] * (1 - fx) * fy + F[y0 + 1, x0 + 1] * fx * fy)


def finish(D, A, name, ss, size, lo=0.12, hi=0.34, light=0.35, halo=1.0):
    """Density D (colour index 0..1) and alpha field A (0..1) -> graded RGBA frame of `size` (w, h)."""
    D = np.clip(D, 0, 1).astype(np.float32)
    gy, gx = np.gradient(D)
    shade = np.clip(0.5 - (gx + gy) * 2.5 * ss, 0, 1)  # light from the upper left
    t = np.clip(D * (1 - light) + shade * D * light * 1.6, 0, 1)
    rgb = ramp(name, t)
    a = smooth(lo, hi, D) if A is None else np.clip(A, 0, 1)
    img = np.dstack([rgb, a * 255]).astype(np.uint8)
    im = Image.fromarray(img, "RGBA")
    # Dark smoky underlay: a blurred, darkened copy of the alpha under the art, so pale sprites separate from bright floors.
    al = im.getchannel("A")
    under = Image.new("RGBA", im.size, tuple(int(c * 0.45) for c in ramp(name, np.array(0.05, np.float32))) + (0,))
    under.putalpha(al.filter(ImageFilter.GaussianBlur(1.6 * ss)).point(lambda v: min(255, int(v * 0.62 * halo))))
    under.alpha_composite(im)
    return under.resize(size, Image.LANCZOS)
