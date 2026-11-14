"""Procedural Ishimi rig (grim water elemental: a hunched mass of dripping murky slime, tendrils hanging from it, many pale glowing eyes sunk in the
gel; NOT a person: no limbs, no clothes). Run: python3 tools/assets/rig-gen/ishimi.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py).
Parts keep the old ids (tail = puddle, armB/armF = tendrils, torso = slime mass, head = forward lump) and the same 80x80 frame."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
SLIME = [(0.0, (5, 11, 10)), (0.35, (18, 38, 32)), (0.7, (46, 80, 64)), (1.0, (120, 160, 128))]
EYE = (190, 255, 200)
HALO = (70, 200, 120)

ten_f = E.catmull([(26, 46), (16, 50), (10, 60), (14, 70), (22, 76)], 7)
ten_b = E.catmull([(54, 44), (66, 48), (72, 58), (68, 68), (60, 74)], 7)
n_f, n_b = len(ten_f), len(ten_b)
G = {
 "tail": dict(polys=[[(6, 74), (12, 66), (26, 63), (42, 62), (60, 64), (72, 69), (74, 76), (62, 80), (40, 80), (18, 80)]], joint=(40, 70), z=1, parent="torso", puddle=True),
 "armB": dict(polys=[E.ribbon(ten_b, [6 - 4.6 * i / (n_b - 1) for i in range(n_b)])], joint=(54, 44), z=2, parent="torso", dark=0.12),
 "torso": dict(polys=[[(12, 68), (10, 54), (16, 40), (26, 30), (40, 26), (54, 32), (62, 44), (64, 58), (58, 70), (40, 72), (24, 72)]], joint=(38, 52), z=5, parent=None, eyes=[(24, 44, .9), (30, 36, .8), (18, 54, .7)]),
 "head": dict(polys=[[(42, 30), (48, 22), (58, 22), (66, 30), (68, 40), (58, 46), (46, 44)]], joint=(54, 36), z=7, parent="torso", eyes=[(52, 30, 1.5), (60, 28, 1.2), (62, 36, 1.0), (55, 38, 0.8), (47, 36, 0.7)]),
 "armF": dict(polys=[E.ribbon(ten_f, [6.5 - 5 * i / (n_f - 1) for i in range(n_f)])], joint=(26, 46), z=8, parent="torso", dark=-0.05),
}


# Frame margin: the slime used to touch the bottom and right frame edges (alpha 250+ there), so the bake clipped it flat and Ishimi read as a
# hard-edged box. Shrink every part about the foot centre so a clear margin is left even at the widest squash of the idle/walk/cast curves.
FITX, FITY, FOOT, LIFT = 0.8, 0.86, (36, 66), 12  # the drip fringe hangs up to ~8 px below the polygons and the cast swings the tendrils wide
def _fit(pt): return (FOOT[0] + (pt[0] - FOOT[0]) * FITX, FOOT[1] + (pt[1] - FOOT[1]) * FITY - LIFT)
for _g in G.values():
    _g["polys"] = [[_fit(q) for q in poly] for poly in _g["polys"]]
    _g["joint"] = _fit(_g["joint"])
    if "eyes" in _g: _g["eyes"] = [(*_fit((x, y)), s) for (x, y, s) in _g["eyes"]]


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
    core = E.blur(E.warp(ma, (n1 - .5) * SS * 4, (n2 - .5) * SS * 3), SS * 0.9)
    # drips: the fringe is pulled downward in vertical streaks
    drip = E.fbm(rs, 7, 2, sx=2.6, sy=0.35)
    fr = E.blur(E.warp(E.blur(ma, SS * 2.0), 0, -SS * (1 + 10 * drip)), SS * 0.5)
    fa = np.clip((fr - 0.45) * 3, 0, 1) * 0.9
    mid = E.fbm(rs, 4, 3)
    # murk: dark silt plus wet blobs; specular highlights from the bevel of a bubbly height field
    h = 0.9 * E.fbm(rs, 6, 3) + 0.1 * core
    spec = np.clip(E.bevel_light(h, 40.0) - 0.3, 0, 1) ** 1.4
    t = np.clip(0.2 + 0.4 * mid + 0.2 * (n2 - .5) + 0.15 * E.bevel_light(core, 14.0) - g.get("dark", 0), 0, 1)
    rgb = E.ramp(SLIME, t)
    rgb = rgb + spec[..., None] * np.array([70, 90, 80], np.float32)
    if g.get("puddle"):  # ripples on the puddle
        rip = 0.5 + 0.5 * np.sin(np.hypot((xx - .5) * 1.0, (yy - .9) * 3.0) * 70 + n1 * 5)
        rgb = rgb + (rip ** 8)[..., None] * np.array([30, 40, 36], np.float32)
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.45 * edge[..., None])
    alpha = np.maximum(core * (0.97 - 0.1 * edge), fa)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    g = G[name]
    if view == "NE" and name != "torso":
        return None
    for (x, y, s) in g.get("eyes", ()):
        if view == "NE":  # seen from behind: only a few dim eyes on the mass
            s *= 0.6
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.15 * s, 0.9 * s, EYE, HALO, 3.0)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"torso": c(sy=[100, 97, 95, 98], sx=[100, 102, 104, 101]), "tail": c(sx=[100, 103, 105, 102]),
    "head": c(dy=[0, 1, 1, 0], rot=[0, -2, -3, -1]), "armF": c(rot=[0, 4, 8, 4]), "armB": c(rot=[0, -4, -8, -4])}),
 "walk": dict(frames=4, curves={"torso": c(sy=[100, 94, 100, 94], sx=[100, 106, 100, 106], dy=[0, 2, 0, 2]), "tail": c(sx=[100, 108, 100, 108]),
    "head": c(rot=[-3, 0, 3, 0]), "armF": c(rot=[16, 0, -18, 0]), "armB": c(rot=[-18, 0, 16, 0])}),
 "cast": dict(frames=4, curves={"torso": c(sy=[100, 90, 106, 100], sx=[100, 108, 96, 100], dy=[0, 2, -2, 0]), "tail": c(sx=[100, 110, 98, 100]),
    "head": c(rot=[0, -4, -6, 2]), "armF": c(rot=[-6, -22, -38, 6]), "armB": c(rot=[-6, -20, -34, 4])}),
}
E.build(OUT, "ishimi", G, actions, paint,
        E.license_for("ishimi", "ishimi.py", "grim water elemental: hunched mass of dripping murky slime with hanging tendrils, wet specular sheen, many pale-green glowing eyes."),
        accents=accents)
