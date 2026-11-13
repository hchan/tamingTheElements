"""Procedural Fiara rig (grim fire elemental: a living pillar of flame with a white-hot core, coals of dark cooled crust drifting inside the
body, flame tongues for arms, a leaning flame crown and a trailing flame. No rock shell, no horns, no person, no clothes; deliberately unlike
Sindarosa, who is charred black rock with horns). Run: python3 tools/assets/rig-gen/fiara.py <out_rig_dir> (needs Pillow + numpy; helpers in
elemental.py). Parts keep the ids tail, armB, torso, head, armF, the same 80x80 frame and 4-frame idle/walk/cast. Concept:
tools/assets/concepts-dark.py (fiara), studied by eye only."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
# desaturated, smoky flame: dark blood red at the rim, orange body, pale straw core (not cartoon yellow)
FLAME = [(0.0, (52, 10, 8)), (0.28, (130, 30, 12)), (0.55, (204, 78, 18)), (0.8, (236, 148, 52)), (1.0, (250, 222, 160))]
COAL = [(0.0, (10, 8, 8)), (0.5, (28, 22, 20)), (1.0, (58, 46, 40))]
EMBER = [(0.0, (130, 26, 8)), (0.6, (240, 100, 20)), (1.0, (255, 210, 130))]

tailp = E.catmull([(30, 62), (18, 64), (9, 56), (5, 44), (8, 32)], 8)
armFp = E.catmull([(30, 34), (20, 42), (13, 54), (14, 68)], 8)
armBp = E.catmull([(50, 36), (60, 44), (68, 54), (66, 68)], 8)
def rw(p, a, b): return [a + (b - a) * i / (len(p) - 1) for i in range(len(p))]
G = {
 "tail": dict(polys=[E.ribbon(tailp, rw(tailp, 7, 1))], joint=(30, 62), z=1, parent="torso", coals=0, lift=7),
 "armB": dict(polys=[E.ribbon(armBp, rw(armBp, 6, 2))], joint=(50, 36), z=2, parent="torso", coals=1, lift=5),
 "torso": dict(polys=[[(22, 74), (20, 60), (25, 46), (30, 34), (35, 14), (41, 28), (48, 34), (55, 44), (58, 58), (54, 74), (40, 78)]],
               joint=(40, 50), z=5, parent=None, coals=3, lift=8),
 "head": dict(polys=[[(44, 26), (47, 14), (52, 4), (55, 15), (61, 9), (63, 20), (57, 30), (48, 31)]], joint=(52, 27), z=7, parent="torso", coals=0, lift=6),
 "armF": dict(polys=[E.ribbon(armFp, rw(armFp, 7, 2))], joint=(30, 34), z=8, parent="torso", coals=1, lift=5),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
    streak = E.fbm(rs, 7, 3, sx=3.5, sy=0.5)  # tall tongues
    base = E.blur(ma, SS * 2.8)
    sway = (n1 - 0.5) * SS * 7
    d = np.maximum(E.warp(base, sway, SS * (3 + g["lift"] * streak)), E.warp(base, -sway * 0.5, SS * 2 + n2 * SS * 3))
    dens = np.clip(d * (0.75 + 0.5 * streak), 0, 1.2)
    alpha = np.clip((dens - 0.17 - 0.12 * streak) * 3.2, 0, 1)
    inner = E.blur(ma, SS * 5)
    # streaky heat: dark red gaps between tongues, orange body, a small straw-white core only where the mass is deepest
    heat = np.clip(0.12 + 0.55 * inner + 0.45 * (streak - 0.5) + 0.3 * (n2 - 0.5) + 0.18 * yy - 0.1 * (1 - dens), 0, 1) ** 1.25
    rgb = E.ramp(FLAME, heat)
    core = np.clip((inner - 0.7) * 3.0, 0, 1) * np.clip((streak - 0.45) * 5, 0, 1)
    rgb = rgb + (np.array([250, 226, 170], np.float32) - rgb) * (core[..., None] * 0.6)
    # coals: dark chunks of cooled crust floating in the body, each with a hot rim
    nc = g["coals"]
    if nc:
        d1, d2, nid, vx, vy = E.voronoi(rs, 9 + nc * 3, stretch=(1.0, 1.2))
        pick = np.take(rs.rand(9 + nc * 3), nid)
        chunk = (d1 < 0.06 + 0.03 * pick) & (pick > 1 - 0.3 * nc) & (E.blur(ma, SS * 2) > 0.8)
        cm = E.blur(chunk.astype(np.float32), SS * 0.5)
        rim = np.clip(E.blur(cm, SS * 1.8) - cm, 0, 1) * 1.6
        lit = np.clip(0.3 + 0.7 * E.bevel_light(np.clip(d1 / 0.06, 0, 1), 20.0) + 0.3 * n2, 0, 1)
        coal = E.ramp(COAL, lit)
        rgb = rgb * (1 - 0.9 * cm[..., None]) + coal * 0.9 * cm[..., None]
        rgb = rgb + E.ramp(EMBER, 0.5 + 0.4 * n2) * rim[..., None] * 0.55
        alpha = np.maximum(alpha, cm)
    # drifting sparks
    sp = E.blur((rs.rand(W, W) > 0.9987).astype(np.float32), SS * 0.5) * 6
    sp = np.clip(sp * (E.warp(base, 0, SS * 9) > 0.05), 0, 1)
    rgb = rgb * (1 - sp[..., None]) + np.array([255, 200, 110], np.float32) * sp[..., None]
    alpha = np.maximum(alpha, sp)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    # two narrow white-hot slits in the flame crown, no pupils
    pts = [(54, 21), (59, 21.5)] if view == "E" else [(51, 23), (57, 23.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.3, 0.6, (255, 246, 214), (255, 190, 90), 2.6)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # the flame licks and sways
    "torso": c(dy=[0, 0, -1, -1], rot=[0, 1, 0, -1]),
    "head": c(rot=[0, 2, 3, 1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 3, 5, 2]), "armB": c(rot=[0, -3, -5, -2]),
    "tail": c(rot=[0, 4, 7, 3]),
 }),
 "walk": dict(frames=4, curves={  # it surges along: lean forward, tongues stream behind
    "torso": c(rot=[3, 0, 3, 0], dy=[1, 0, 1, 0]),
    "head": c(rot=[3, 0, -3, 0]),
    "armF": c(rot=[-12, 2, 12, 2]), "armB": c(rot=[12, 2, -12, 2]),
    "tail": c(rot=[7, 0, -7, 0]),
 }),
 "cast": dict(frames=4, curves={  # the fire gathers, then flares out
    "torso": c(rot=[0, -3, -5, 2], dy=[0, -1, -2, 1]),
    "head": c(rot=[0, -8, -14, 4]),
    "armF": c(rot=[0, -34, -62, -10]), "armB": c(rot=[0, -26, -50, -8]),
    "tail": c(rot=[0, 10, 16, -4]),
 }),
}
E.build(OUT, "fiara", G, actions, paint,
        E.license_for("fiara", "fiara.py", "grim fire elemental: a living pillar of smoky flame with a pale hot core, dark coals drifting inside, flame-tongue arms, a leaning flame crown; dark red to orange to straw palette, no rock shell."),
        accents=accents)
