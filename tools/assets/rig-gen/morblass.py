"""Procedural Morblass rig (grim ice elemental: a towering glacier beast of jagged blue ice and icicles, eyes frozen inside the ice; NOT a person:
no limbs, no clothes). Run: python3 tools/assets/rig-gen/morblass.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py).
Parts keep the old ids (tail = rubble base, armB/armF = ice spurs, torso = glacier mass, head = crown of spires)."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
ICE = [(0.0, (12, 22, 32)), (0.35, (44, 74, 98)), (0.7, (110, 150, 176)), (1.0, (220, 236, 246))]
EYE = (150, 215, 245)
HALO = (60, 130, 190)

G = {
 "tail": dict(polys=[[(6, 80), (10, 70), (16, 74), (22, 64), (30, 72), (38, 66), (48, 72), (56, 62), (64, 72), (70, 68), (74, 80)]], joint=(40, 72), z=1, parent="torso", rubble=True, dark=0.1),
 "armB": dict(polys=[[(52, 36), (62, 26), (66, 38), (76, 44), (70, 56), (74, 70), (62, 62), (54, 52)]], joint=(54, 44), z=2, parent="torso", dark=0.18),
 "torso": dict(polys=[[(16, 72), (12, 54), (18, 42), (14, 30), (24, 34), (28, 22), (36, 30), (42, 18), (50, 30), (58, 26), (60, 40), (66, 54), (62, 72)]], joint=(40, 56), z=5, parent=None, eyes=[(26, 50, 0.8), (50, 48, 0.7)]),
 "head": dict(polys=[[(30, 30), (28, 14), (35, 20), (38, 4), (44, 18), (50, 8), (54, 20), (60, 14), (58, 32), (44, 38)]], joint=(44, 30), z=7, parent="torso", eyes=[(40, 27, 1.5), (49, 26, 1.3)]),
 "armF": dict(polys=[[(24, 40), (16, 34), (12, 46), (4, 52), (10, 62), (6, 76), (18, 68), (26, 60), (30, 50)]], joint=(26, 44), z=8, parent="torso", dark=-0.05),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
    core = E.blur(E.warp(ma, (n1 - .5) * SS * 1.6, (n2 - .5) * SS * 1.6), SS * 0.35)
    # glacial plates: Voronoi facets stretched vertically, each its own shade, bevelled; cracks along plate borders
    d1, d2, nid, vx, vy = E.voronoi(rs, 22, stretch=(1.0, 1.9))
    cv = np.take(rs.rand(22), nid).astype(np.float32)
    plate = np.clip(d1 / 0.2, 0, 1)
    light = 0.5 * E.bevel_light(plate * 0.25 + core * 0.75, 20.0)
    crack = np.clip(1 - (d2 - d1) / 0.012, 0, 1)
    streak = E.fbm(rs, 5, 3, sx=0.5, sy=2.4)
    t = np.clip(0.2 + 0.42 * cv + 0.2 * streak + 0.3 * light + 0.12 * yy - g.get("dark", 0), 0, 1)
    rgb = E.ramp(ICE, t)
    rgb = rgb * (1 - 0.5 * crack[..., None]) + crack[..., None] * np.array([150, 190, 215], np.float32) * 0.12
    # pale rime in the highlights
    rime = np.clip((E.fbm(rs, 9, 3) - 0.55) * 3, 0, 1) * np.clip(light + 0.4, 0, 1)
    rgb = rgb + rime[..., None] * np.array([55, 60, 60], np.float32)
    if g.get("rubble"):
        rgb = rgb * 0.8
    edge = np.clip(1 - E.blur(core, SS * 1.8) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.4 * edge[..., None])
    return Image.fromarray(np.dstack([rgb, core * (0.98 - 0.08 * edge) * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    g = G[name]
    if view == "NE":
        return None
    for (x, y, s) in g.get("eyes", ()):
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.3 * s, 0.8 * s, EYE, HALO, 2.8)  # eyes frozen in the ice: small, cold, slit-like
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"tail": c(dy=[0, 0, 1, 0]), "torso": c(rot=[0, 1, 1, 0], dy=[0, -1, -1, 0]), "head": c(rot=[0, -1, -2, -1]),
    "armF": c(rot=[0, 2, 3, 1]), "armB": c(rot=[0, -2, -3, -1])}),
 "walk": dict(frames=4, curves={"tail": c(rot=[-2, 0, 2, 0], dy=[0, 1, 0, 1]), "torso": c(rot=[2, 0, -2, 0], dy=[1, 0, 1, 0]), "head": c(rot=[-2, -1, 2, 1]),
    "armF": c(rot=[8, 0, -10, 0]), "armB": c(rot=[-10, 0, 8, 0])}),
 "cast": dict(frames=4, curves={"torso": c(rot=[0, -3, -3, 2], dy=[0, -1, -2, 1]), "head": c(rot=[-1, -5, -4, 2]),
    "armF": c(rot=[-10, -40, -62, -20]), "armB": c(rot=[-8, -34, -52, -16]), "tail": c(dy=[0, 0, -1, 1])}),
}
E.build(OUT, "morblass", G, actions, paint,
        E.license_for("morblass", "morblass.py", "grim ice elemental: towering glacier of jagged blue plated ice with cracks, rime and spires, cold eyes frozen inside."),
        accents=accents)
