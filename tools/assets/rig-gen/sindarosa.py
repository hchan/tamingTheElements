"""Procedural Sindarosa rig (grim fire elemental beast: a hunched mass of charred black rock, ember cracks, a crown of roaring flame between two
great curved horns, tall flame plumes streaming off the back, no limbs/clothes/person). Replaces the old red dragon. Run:
python3 tools/assets/rig-gen/sindarosa.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py). Parts keep the ids
tail, wingB, torso, head, wingF (the two "wings" are now flame plumes) and the same 80x80 frame; the sim is unaffected.
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
CHAR = [(0.0, (8, 7, 8)), (0.4, (26, 21, 22)), (0.75, (50, 40, 38)), (1.0, (82, 64, 54))]
FLAME = [(0.0, (46, 8, 6)), (0.35, (140, 30, 10)), (0.7, (214, 78, 14)), (1.0, (244, 156, 52))]
EMBER = [(0.0, (120, 20, 8)), (0.5, (236, 84, 14)), (1.0, (255, 206, 110))]
EYE = (255, 214, 120)

tailp = E.catmull([(34, 70), (22, 73), (12, 70), (4, 73), (2, 76)], 8)  # a low smear of burning ground, not a tail
G = {
 "tail": dict(polys=[E.ribbon(tailp, [4 - 2.5 * i / (len(tailp) - 1) for i in range(len(tailp))])],
              joint=(30, 70), z=1, parent="torso", flame_only=True),
 "wingB": dict(polys=[[(36, 38), (38, 26), (40, 14), (43, 4), (47, 16), (48, 28), (52, 38)]], joint=(44, 38), z=2, parent="torso", flame_only=True, tall=1),
 # a collapsed pyre: a wide lopsided heap of charred slag with broken spires, no neck, no limbs
 "torso": dict(polys=[[(10, 72), (8, 60), (16, 50), (14, 40), (24, 34), (30, 22), (36, 32), (44, 26), (48, 18), (54, 32), (62, 40), (66, 54), (70, 66), (64, 74), (40, 77)]],
               joint=(38, 54), z=5, parent=None, dark=0.0),
 # the "head" is a slumped knot of the heap with a vertical molten rift, no snout and no ears
 "head": dict(polys=[[(40, 36), (40, 26), (47, 20), (55, 24), (62, 32), (62, 42), (54, 46), (45, 44)],
                     [(44, 22), (42, 10), (49, 18)], [(54, 24), (58, 12), (62, 24)], [(60, 30), (70, 26), (66, 36)]],
              joint=(50, 40), z=7, parent="torso", dark=0.03, horns=3, crown=1),
 "wingF": dict(polys=[[(20, 42), (16, 30), (12, 18), (17, 8), (22, 20), (26, 30), (30, 42)]], joint=(24, 42), z=8, parent="torso", flame_only=True, tall=1),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
    streak = E.fbm(rs, 7, 3, sx=3.0, sy=0.5)
    fo = g.get("flame_only", False)
    core = E.blur(E.warp(ma, (n1 - 0.5) * SS * 4, (E.fbm(rs, 8) - 0.5) * SS * 4), SS * 0.45)
    if fo:
        core = core * 0.0
    base = ma
    if g.get("crown"):  # crown of fire rising from over the spires
        crown = E.poly_mask([[(42, 26), (44, 16), (49, 22), (53, 12), (57, 22), (62, 16), (62, 28)]])
        base = np.maximum(ma, crown * 0.7)
    fl = E.blur(np.maximum(base, core), SS * (3.0 if g.get("tall") else 2.4))
    lift = 5 + 3 * g.get("tall", 0)
    fl_up = np.maximum(E.warp(fl, 0, SS * (4 + lift * streak)), E.warp(fl, 0, SS * 2 + n2 * SS * 3))
    fa = np.clip((fl_up - (0.12 if fo else 0.2) - 0.3 * streak) * 3.0, 0, 1)
    fcol = E.ramp(FLAME, np.clip(fl_up * 0.95 + 0.25 * n2 - 0.35 * yy + 0.2, 0, 1))
    d1, d2, nid, vx, vy = E.voronoi(rs, 20, stretch=(1.0, 1.3))
    cellv = np.take(rs.rand(20), nid).astype(np.float32)
    light = E.bevel_light(np.clip(d1 / 0.08, 0, 1), 24.0)
    lit = np.clip(0.3 + 0.25 * cellv + 0.3 * (n2 - 0.5) + 0.35 * light + g.get("dark", 0.0), 0, 1)
    crust = E.ramp(CHAR, lit)
    crack = np.clip(1 - (d2 - d1) / 0.014, 0, 1) ** 1.4
    heat = np.clip((n1 - 0.38) * 3.2 + 0.5 * yy, 0, 1.2)
    glow = np.clip(crack * heat * 1.1, 0, 1) * 0.9
    haze = E.blur(glow, SS * 2.2) * 0.5
    rgb = crust * (1 - glow[..., None]) + E.ramp(EMBER, np.clip(glow * 0.9 + 0.1, 0, 1)) * glow[..., None]
    rgb = rgb + E.ramp(EMBER, haze * 0.8) * haze[..., None] * 0.5
    if g.get("horns"):  # horns: black rock, tips heat to ember (upper part of the head image)
        hm = E.poly_mask(polys[1:])
        tip = np.clip((0.07 - yy) * 9, 0, 1) * hm
        rgb = rgb * (1 - tip[..., None] * 0.7) + E.ramp(EMBER, 0.55 + 0.3 * n2) * tip[..., None] * 0.7
    rim = np.clip(1 - E.blur(core, SS * 1.8) * 1.3, 0, 1) * (core > 0.2)
    rgb = rgb * (1 - 0.3 * rim[..., None]) + E.ramp(EMBER, 0.4 + 0.4 * n2) * rim[..., None] * 0.6
    edge = np.clip(1 - E.blur(core, SS * 2.5) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.55 * edge[..., None])
    out = rgb * core[..., None] + fcol * (1 - core[..., None])
    alpha = np.maximum(core, fa * 0.92)
    sp = E.blur((rs.rand(W, W) > 0.9985).astype(np.float32), SS * 0.5) * 6
    sp = np.clip(sp * (E.warp(fl, 0, SS * 8) > 0.05), 0, 1)
    out = out * (1 - sp[..., None]) + np.array([255, 180, 80], np.float32) * sp[..., None]
    alpha = np.maximum(alpha, sp)
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(52, 31), (52, 36.5), (58, 32)] if view == "E" else [(50, 33), (50, 38.5), (56, 34)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 0.8, 1.7, EYE, (255, 120, 20), 3.2)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, 0, -1, -1]), "head": c(rot=[0, 1, 2, 1], dy=[0, 0, 1, 0]),
    "wingF": c(rot=[0, -3, -5, -2]), "wingB": c(rot=[0, 2, 4, 1]), "tail": c(rot=[0, 3, 5, 2])}),
 "walk": dict(frames=4, curves={
    "torso": c(rot=[-2, 0, 2, 0], dy=[1, 0, 1, 0]), "head": c(rot=[2, 0, -2, 0]),
    "wingF": c(rot=[-8, 4, -8, 4]), "wingB": c(rot=[6, -3, 6, -3]), "tail": c(rot=[6, 0, -6, 0])}),
 "cast": dict(frames=4, curves={  # roar: head rears, plumes flare, then snap forward
    "torso": c(rot=[0, -3, -4, 2], dy=[0, -1, -2, 1]), "head": c(rot=[0, -10, -16, 6]),
    "wingF": c(rot=[0, -22, -36, -8]), "wingB": c(rot=[0, 18, 30, 6]), "tail": c(rot=[0, 6, 10, -4])}),
}
E.build(OUT, "sindarosa", G, actions, paint,
        E.license_for("sindarosa", "sindarosa.py", "grim fire elemental: collapsed pyre of charred black slag with ember cracks, broken burning spires, a molten rift face, flame plumes rising behind; charcoal and blood-red ember palette."),
        accents=accents)
