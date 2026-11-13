"""Procedural Echo rig (grim air elemental: a towering hollow spiral vortex of pale air with concentric sound-wave rings and a calm glowing eye at
its centre; NOT a person: no limbs, no clothes, no face). Run: python3 tools/assets/rig-gen/echo.py <out_rig_dir> (needs Pillow + numpy; helpers in
elemental.py). Parts keep the old ids (torso = the vortex, head = crown of spiral, tail = funnel tip, armF/armB = trailing wind arcs)."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
AIR = [(0.0, (22, 28, 38)), (0.4, (66, 78, 94)), (0.75, (150, 162, 178)), (1.0, (238, 244, 250))]
EYE = (235, 246, 255)
HALO = (140, 180, 230)

arc_f = E.catmull([(26, 38), (14, 36), (6, 46), (10, 58), (20, 62)], 7)
arc_b = E.catmull([(54, 38), (66, 36), (74, 46), (70, 58), (60, 62)], 7)
nf, nb = len(arc_f), len(arc_b)
G = {
 "tail": dict(polys=[[(28, 62), (52, 62), (48, 72), (43, 80), (38, 80), (33, 72)]], joint=(40, 64), z=1, parent="torso", cx=40, cy=70, k=1.3, dark=0.1),
 "armB": dict(polys=[E.ribbon(arc_b, [4.5 - 3.5 * i / (nb - 1) for i in range(nb)])], joint=(54, 38), z=2, parent="torso", cx=64, cy=48, k=1.0, dark=0.15, thin=True),
 "torso": dict(polys=[[(14, 30), (30, 24), (50, 24), (66, 30), (62, 44), (54, 58), (46, 68), (34, 68), (26, 58), (18, 44)]], joint=(40, 46), z=5, parent=None, cx=40, cy=46, k=1.0, eye=(40, 46)),
 "head": dict(polys=[[(22, 24), (26, 12), (38, 4), (52, 8), (60, 18), (58, 28), (44, 32), (30, 30)]], joint=(40, 26), z=7, parent="torso", cx=42, cy=18, k=1.0, dark=-0.05),
 "armF": dict(polys=[E.ribbon(arc_f, [4.5 - 3.5 * i / (nf - 1) for i in range(nf)])], joint=(26, 38), z=8, parent="torso", cx=14, cy=48, k=1.0, dark=-0.05, thin=True),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 11)
    core = E.blur(E.warp(ma, (n1 - .5) * SS * 4, (n2 - .5) * SS * 3), SS * 0.8)
    fr = E.blur(E.warp(E.blur(ma, SS * 2.2), SS * (3 + 5 * E.fbm(rs, 6, 3, sx=0.4, sy=2.5)), 0), SS * 0.6)
    fa = np.clip((fr - 0.35) * 2.4, 0, 1) * 0.4
    # concentric sound-wave rings (squashed ellipses) around (cx, cy), rippled by noise; a phase by angle gives the spiral twist
    cx, cy = g["cx"] / 80.0, g["cy"] / 80.0
    r = np.hypot(xx - cx, (yy - cy) * 1.45 * g["k"]) + 0.03 * (n1 - .5) * 4
    ang = np.arctan2(yy - cy, xx - cx)
    ph = r * 30 + ang * 0.5 + n2 * 1.0
    ring = 0.5 + 0.5 * np.sin(ph * 3.1416 * 0.5)
    line = np.clip((ring - 0.78) * 3.2, 0, 1) ** 1.3 * 0.8
    flow = E.fbm(rs, 5, 3, sx=0.5, sy=2.2)
    t = np.clip(0.12 + 0.32 * flow + 0.2 * (n2 - .5) + 0.25 * E.bevel_light(core, 14.0) - g.get("dark", 0), 0, 1)
    rgb = E.ramp(AIR, t)
    ln = line * (0.55 + 0.45 * flow)
    rgb = rgb * (1 - ln[..., None]) + np.array([240, 246, 252], np.float32) * ln[..., None]
    edge = np.clip(1 - E.blur(core, SS * 2.4) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.45 * edge[..., None])
    # hollow: the middle is nearly see-through dark air, solid at the rim and along the rings
    inner = E.blur(core, SS * 5)
    hollow = np.clip((inner - 0.35) * 1.6, 0, 1) * (0.0 if g.get("thin") else 1.0)
    base = 0.9 - 0.62 * hollow
    alpha = np.maximum(core * np.clip(base + 0.7 * line, 0, 0.97), fa)
    if g.get("eye"):  # darker well behind the calm eye
        w = np.clip(1 - np.hypot((xx - g["eye"][0] / 80) * 1.2, (yy - g["eye"][1] / 80) * 1.6) / 0.11, 0, 1)
        rgb = rgb * (1 - 0.5 * w[..., None])
        alpha = np.maximum(alpha, core * w * 0.9)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "torso" or view == "NE":
        return None
    x, y = E.apply(tf, G[name]["eye"])
    return E.glow_dot(im, x, y, 2.6, 2.0, EYE, HALO, 3.2)  # the calm eye of the storm


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"torso": c(dy=[0, -1, -1, 0], rot=[0, 1, 2, 1]), "tail": c(rot=[0, -3, -5, -2]), "head": c(rot=[0, -1, -2, -1]),
    "armF": c(rot=[0, 3, 6, 3]), "armB": c(rot=[0, -3, -6, -3])}),
 "walk": dict(frames=4, curves={"tail": c(rot=[-8, 0, 8, 0]), "torso": c(rot=[3, 0, -3, 0], dy=[1, 0, 1, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[12, 0, -14, 0]), "armB": c(rot=[-14, 0, 12, 0])}),
 "cast": dict(frames=4, curves={"tail": c(rot=[0, 8, 12, -6]), "torso": c(rot=[0, -4, -6, 4], dy=[0, -1, -2, 1]), "head": c(rot=[0, -4, -6, 3]),
    "armF": c(rot=[-6, -40, -68, 8]), "armB": c(rot=[-6, -36, -60, 6])}),
}
E.build(OUT, "echo", G, actions, paint,
        E.license_for("echo", "echo.py", "grim air elemental: hollow spiral vortex of pale air, concentric sound-wave rings, a calm glowing eye at the centre."),
        accents=accents)
