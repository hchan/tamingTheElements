"""Procedural Fiara rig (grim fire elemental: a hulking hunched body of black cooled crust over molten fire, ember cracks, ragged flame
rising off every edge, a flame plume behind). Replaces the cut-from-legacy phoenix parts. Run: python3 tools/assets/rig-gen/fiara.py <out_rig_dir>
(needs Pillow + numpy). Parts: tail, armB, torso, head, armF (same 80x80 frame and footprint as before; the sim is unaffected).
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
CRUST = [(0.0, (14, 11, 12)), (0.4, (34, 27, 26)), (0.75, (62, 48, 42)), (1.0, (96, 74, 60))]
FLAME = [(0.0, (40, 10, 8)), (0.35, (120, 36, 12)), (0.65, (190, 80, 20)), (1.0, (226, 150, 60))]
EMBER = [(0.0, (110, 24, 10)), (0.5, (230, 96, 18)), (1.0, (255, 214, 120))]
EYE = (255, 226, 150)

G = {
 "tail": dict(polys=[[(28, 56), (14, 56), (6, 48), (3, 36), (10, 44), (14, 32), (20, 44), (28, 46)]], joint=(28, 54), z=1, parent="torso", flame_only=True),
 "armB": dict(polys=[[(50, 30), (60, 32), (66, 44), (68, 58), (60, 64), (56, 52), (50, 42)]], joint=(52, 33), z=2, parent="torso", dark=0.08),
 "torso": dict(polys=[[(20, 68), (16, 52), (20, 36), (32, 26), (46, 26), (58, 34), (62, 50), (58, 68), (40, 74)]], joint=(40, 50), z=5, parent=None, dark=0.0),
 "head": dict(polys=[[(44, 20), (47, 11), (57, 8), (65, 14), (64, 26), (54, 31), (44, 29)], [(47, 12), (45, 4), (51, 10)], [(58, 9), (62, 2), (63, 11)]],
              joint=(52, 27), z=7, parent="torso", dark=0.05),
 "armF": dict(polys=[[(22, 32), (34, 32), (39, 44), (37, 58), (41, 68), (30, 72), (21, 64), (18, 46)]], joint=(28, 35), z=8, parent="torso", dark=-0.03),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
    streak = E.fbm(rs, 7, 3, sx=3.0, sy=0.5)  # tall vertical streaks: flame tongues
    flame_only = g.get("flame_only", False)
    core = E.blur(E.warp(ma, (n1 - 0.5) * SS * 5, (E.fbm(rs, 8) - 0.5) * SS * 5), SS * 0.5)
    if flame_only:
        core = core * 0.0
    # flame fringe: the mask blurred wide, dragged upward by streaks, thresholded
    fl = E.blur(np.maximum(ma, core), SS * 2.6)
    fl_up = E.warp(fl, 0, SS * (4 + 7 * streak))
    fl_up = np.maximum(fl_up, E.warp(fl, 0, SS * 2 + (n2 * SS * 3)))
    fa = np.clip((fl_up - 0.2 - 0.32 * streak) * 3.0, 0, 1)
    if flame_only:
        fa = np.clip((fl_up - 0.14 - 0.3 * streak) * 3.0, 0, 1)
    fcol = E.ramp(FLAME, np.clip(fl_up * 0.9 + 0.25 * n2 - 0.35 * yy + 0.15, 0, 1))
    # crust plates with glowing cracks
    d1, d2, nid, vx, vy = E.voronoi(rs, 16, stretch=(1.0, 1.25))
    cellv = (np.take(rs.rand(16), nid)).astype(np.float32)
    h = np.clip(d1 / 0.09, 0, 1)
    light = E.bevel_light(h, 24.0)
    lit = np.clip(0.34 + 0.4 * cellv * 0.6 + 0.35 * (n2 - 0.5) + 0.35 * light + g.get("dark", 0.0), 0, 1)
    crust = E.ramp(CRUST, lit)
    crack = np.clip(1 - (d2 - d1) / 0.016, 0, 1) ** 1.4
    heat = np.clip(0.4 + 0.9 * n1 + 0.5 * yy - 0.2, 0, 1.2)
    glow = np.clip(crack * heat * 1.1, 0, 1) * 0.85
    haze = E.blur(glow, SS * 2.2) * 0.55
    rgb = crust * (1 - glow[..., None]) + E.ramp(EMBER, np.clip(glow * 0.9 + 0.1, 0, 1)) * glow[..., None]
    rgb = rgb + E.ramp(EMBER, haze * 0.8)[...] * haze[..., None] * 0.55
    # molten rim where crust meets flame (inner edge glow), crust darkens inward at the outline instead of a black line
    rim = np.clip(1 - E.blur(core, SS * 1.8) * 1.3, 0, 1) * (core > 0.2)
    rgb = rgb * (1 - 0.5 * rim[..., None] * 0.6) + E.ramp(EMBER, 0.45 + 0.4 * n2) * (rim[..., None] * 0.7)
    edge = np.clip(1 - E.blur(core, SS * 2.5) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.55 * edge[..., None])
    out = rgb * core[..., None] + fcol * (1 - core[..., None])
    alpha = np.maximum(core, fa * 0.92)
    if not flame_only:
        alpha = np.maximum(alpha, core)
    # sparse embers drifting up
    sp = (rs.rand(W, W) > 0.9985).astype(np.float32)
    sp = E.blur(sp, SS * 0.5) * 6
    sp = np.clip(sp * (E.warp(fl, 0, SS * 8) > 0.05), 0, 1)
    out = out * (1 - sp[..., None]) + np.array([255, 190, 90], np.float32) * sp[..., None]
    alpha = np.maximum(alpha, sp)
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(58, 19), (63, 19.5)] if view == "E" else [(55, 22), (62, 22.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.1, 0.8, EYE, (255, 150, 40))
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, 0, -1, -1]),
    "head": c(rot=[0, 1, 2, 1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 2, 3, 1]), "armB": c(rot=[0, -2, -3, -1]),
    "tail": c(rot=[0, 3, 6, 3]),
 }),
 "walk": dict(frames=4, curves={  # heavy lumbering step: body rocks, arms swing against each other
    "torso": c(rot=[-2, 0, 2, 0], dy=[1, 0, 1, 0]),
    "head": c(rot=[2, 0, -2, 0]),
    "armF": c(rot=[-10, 0, 10, 0]), "armB": c(rot=[10, 0, -10, 0]),
    "tail": c(rot=[5, 0, -5, 0]),
 }),
 "cast": dict(frames=4, curves={  # arms heave up and out, head rears, the flame plume flares
    "torso": c(rot=[0, -3, -5, 2], dy=[0, -1, -2, 1]),
    "head": c(rot=[0, -8, -14, 4]),
    "armF": c(rot=[0, -30, -55, -10]), "armB": c(rot=[0, -22, -44, -8]),
    "tail": c(rot=[0, 8, 14, -4]),
 }),
}

E.build(OUT, "fiara", G, actions, paint,
        E.license_for("fiara", "fiara.py", "grim fire elemental: black cooled crust plates over molten fire, glowing ember cracks, ragged rising flame fringe, ember-lit eyes; charcoal and ember orange palette."),
        accents=accents)
