"""Shared palette helpers for the procedural art generators (original colours, no copied pixels).
Import from a sibling script:  sys.path.insert(0, os.path.dirname(__file__)); import palette
Pure Python (no numpy needed). pax.py and treenoc.py keep their own ramps so their baked output stays byte-identical.

API:
  ramp(stops, t)            stops = [(pos 0..1, (r,g,b)), ...] sorted by pos; t float or numpy array -> rgb (tuple, or array with last dim 3)
  hue_shift(rgb, deg, sat=1.0, val=1.0)   rotate hue by deg degrees (cool shadows / warm lights), scale saturation and value
  ELEMENT_RAMPS[name]       5 rgb steps dark -> light (step 0 near-black of the hue, step 4 highlight); names in ELEMENTS
  element_ramp(name)        the 5 steps;  element_ramp(name, t)  smooth lookup at t in 0..1
  outline(name)             outline colour for an element (its step 0, never pure black)
  luminance(rgb)            Rec. 709 relative value 0..255 (gamma-encoded, as the eye reads pixel art)
"""
import colorsys

ELEMENTS = ("fire", "water", "earth", "air", "ice", "nature", "chaos", "void")

ELEMENT_RAMPS = {
    "fire":   ((44, 14, 16), (136, 38, 22), (222, 84, 24), (255, 160, 40), (255, 232, 140)),
    "water":  ((10, 22, 52), (22, 62, 130), (40, 120, 200), (96, 190, 240), (210, 244, 255)),
    "earth":  ((36, 24, 18), (92, 64, 42), (148, 108, 66), (202, 164, 104), (244, 218, 160)),
    "air":    ((30, 40, 66), (76, 104, 150), (140, 176, 214), (206, 228, 244), (255, 255, 255)),
    "ice":    ((14, 24, 58), (46, 84, 164), (110, 176, 232), (190, 238, 252), (244, 255, 255)),
    "nature": ((16, 36, 22), (36, 88, 40), (82, 148, 56), (156, 206, 84), (222, 244, 150)),
    "chaos":  ((34, 10, 44), (96, 24, 112), (170, 52, 170), (232, 110, 216), (255, 196, 244)),
    "void":   ((8, 6, 18), (30, 22, 56), (62, 46, 102), (112, 90, 160), (190, 170, 230)),
}


def ramp(stops, t):
    """Piecewise-linear colour ramp. t may be a float or a numpy array (result gets a trailing channel axis)."""
    xs = [s[0] for s in stops]
    try:
        import numpy as np
        if not isinstance(t, (int, float)):
            t = np.asarray(t, np.float32)
            return np.dstack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)]).astype(np.float32) if t.ndim == 2 \
                else np.stack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)], -1).astype(np.float32)
    except ImportError:
        pass
    t = min(max(float(t), xs[0]), xs[-1])
    for (x0, c0), (x1, c1) in zip(stops, stops[1:]):
        if t <= x1:
            f = 0.0 if x1 == x0 else (t - x0) / (x1 - x0)
            return tuple(c0[i] + (c1[i] - c0[i]) * f for i in range(3))
    return tuple(stops[-1][1])


def hue_shift(rgb, deg, sat=1.0, val=1.0):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255.0 for c in rgb))
    h = (h + deg / 360.0) % 1.0
    s = min(max(s * sat, 0.0), 1.0)
    v = min(max(v * val, 0.0), 1.0)
    return tuple(int(round(c * 255)) for c in colorsys.hsv_to_rgb(h, s, v))


def element_ramp(name, t=None):
    steps = ELEMENT_RAMPS[name]
    if t is None:
        return steps
    return ramp([(i / 4.0, c) for i, c in enumerate(steps)], t)


def outline(name):
    return ELEMENT_RAMPS[name][0]


def luminance(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
