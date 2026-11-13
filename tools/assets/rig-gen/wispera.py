"""Procedural Wispera rig (grim air elemental: a drifting cloud of pale mist and glowing motes with tattered vapour tails and ONE cold glow;
no person, no limbs, no clothes). Run: python3 tools/assets/rig-gen/wispera.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py).
Parts keep the old ids (tail, armB, torso, head, armF: the "arms" are trailing vapour tendrils, the head is the dense core with the glow)
and the same 80x80 frame. Concept: tools/assets/concepts-dark.py (wispera), studied by eye only. Smoky slate shadows inside the mist keep it
readable on the bright Air floor; the pale highlights and the cold glow keep it readable on the dark Fire floor."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
MIST = [(0.0, (34, 42, 54)), (0.35, (78, 92, 108)), (0.7, (158, 172, 184)), (1.0, (228, 236, 240))]
GLOW = [(0.0, (60, 150, 190)), (0.5, (150, 226, 244)), (1.0, (245, 255, 255))]
EYE = (235, 255, 255)

G = {
 # a cloud bank, not a body: low vapour tail, two long streamers trailing left, a wide billow, and a dense puff holding the glow
 "tail": dict(polys=[[(34, 54), (50, 54), (46, 62), (34, 68), (20, 74), (6, 72), (16, 66), (26, 60)]], joint=(40, 54), z=1, parent="torso", dark=0.08, wisp=1.0),
 "armB": dict(polys=[[(40, 34), (52, 32), (50, 38), (38, 40), (24, 36), (10, 30), (2, 22), (14, 28), (28, 31)]], joint=(42, 36), z=2, parent="torso", dark=0.1, wisp=1.0),
 "torso": dict(polys=[[(22, 54), (18, 44), (26, 34), (40, 30), (54, 34), (60, 46), (52, 58), (38, 62), (28, 60)]], joint=(40, 46), z=5, parent=None, dark=0.0, wisp=0.6),
 "head": dict(polys=[[(36, 28), (38, 20), (46, 16), (55, 20), (58, 30), (52, 38), (42, 38)]], joint=(46, 32), z=7, parent="torso", dark=-0.06, wisp=0.5, motes=True),
 "armF": dict(polys=[[(30, 46), (38, 44), (36, 52), (26, 56), (14, 54), (4, 58), (2, 50), (14, 48)]], joint=(34, 48), z=8, parent="torso", dark=-0.02, wisp=1.0),
}



def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2, n3 = E.fbm(rs, 4), E.fbm(rs, 9), E.fbm(rs, 6, 3, sx=0.5, sy=2.2)
    wisp = g.get("wisp", 0.6)
    # billowing body: heavy warp, then a drag to the left (trailing) so the edge streams into tatters
    core = E.blur(E.warp(ma, (n1 - 0.5) * SS * (8 + 8 * wisp), (n2 - 0.5) * SS * 7), SS * 1.4)
    fr = E.blur(E.warp(E.blur(ma, SS * 2.6), -SS * (2 + 9 * n3 * wisp), (n2 - 0.5) * SS * 3), SS * 0.9)
    dens = np.clip((fr - 0.18) * 2.2, 0, 1)
    # patchy density so it reads as mist, not as a blob
    patch = np.clip(0.55 + 1.1 * (E.fbm(rs, 7, 3) - 0.5) + 0.5 * (n3 - 0.5), 0, 1)
    alpha = np.clip(np.maximum(core * (0.55 + 0.45 * patch), dens * patch * 0.8), 0, 0.97)
    # shading: dark slate in the thick lower/right parts, pale on the upper left and along wisps
    light = E.bevel_light(E.blur(core, SS * 1.2) * (0.6 + 0.4 * n2), 10.0)
    t = np.clip(0.5 + 0.35 * light + 0.5 * (n3 - 0.5) + 0.3 * (n2 - 0.5) - 0.28 * yy + 0.25 - g.get("dark", 0.0) * 2, 0, 1)
    rgb = E.ramp(MIST, t)
    # cold glow veins running through the density, strongest in the head
    vein = np.clip(1 - np.abs(n1 - 0.5) / 0.04, 0, 1) ** 1.5 * np.clip(core * 1.5, 0, 1)
    gl = vein * (0.5 if name == "head" else 0.28)
    rgb = rgb * (1 - gl[..., None]) + E.ramp(GLOW, 0.3 + 0.7 * vein) * gl[..., None]
    # a faint desaturated slate edge instead of a hard outline
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.2, 0, 1)
    rgb = rgb * (1 - 0.35 * edge[..., None]) + np.array((40, 52, 66), np.float32) * 0.35 * edge[..., None]
    out = np.dstack([rgb, alpha * 255]).astype(np.float32)
    # glowing motes drifting in and around the mist
    sites = (rs.rand(W, W) > (0.9965 if g.get("motes") else 0.9982)).astype(np.float32)
    mote = np.clip(E.blur(sites, SS * 0.7) * 9, 0, 1) * (E.blur(core, SS * 4) > 0.04)
    halo = np.clip(E.blur(sites, SS * 2.2) * 14, 0, 1) * 0.35
    for m, col in ((halo, (120, 200, 230)), (mote, (235, 255, 255))):
        out[..., :3] = out[..., :3] * (1 - m[..., None]) + np.array(col, np.float32) * m[..., None]
        out[..., 3] = np.maximum(out[..., 3], m * 255 * 0.9)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    # one cold glow, not a pair of eyes
    x, y = E.apply(tf, (49, 26) if view == "E" else (47, 28))
    return E.glow_dot(im, x, y, 2.0, 1.5, EYE, (150, 225, 245), 3.6)


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # drifting bob, tails stream
    "torso": c(dy=[0, -1, -2, -1], rot=[0, 1, 0, -1]),
    "tail": c(rot=[0, 5, 9, 4]), "head": c(rot=[0, -2, -3, -1], dy=[0, 0, -1, 0]),
    "armF": c(rot=[0, 4, 7, 3]), "armB": c(rot=[0, -4, -7, -3]),
 }),
 "walk": dict(frames=4, curves={  # drift: tails stream behind, tendrils trail
    "tail": c(rot=[-9, 0, 9, 0]),
    "torso": c(rot=[2, 0, -2, 0], dy=[-1, 0, -1, 0]),
    "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[10, 0, -12, 0]), "armB": c(rot=[-12, 0, 10, 0]),
 }),
 "cast": dict(frames=4, curves={  # the cloud gathers, then billows outward in a pulse
    "tail": c(rot=[0, 8, 14, -4]),
    "torso": c(rot=[0, -3, -5, 3], dy=[0, -1, -3, 0], sx=[100, 96, 112, 100], sy=[100, 98, 108, 100]),
    "head": c(rot=[0, -5, -8, 3]),
    "armF": c(rot=[-6, -44, -74, 6]), "armB": c(rot=[-6, -40, -66, 6]),
 }),
}
E.build(OUT, "wispera", G, actions, paint,
        E.license_for("wispera", "wispera.py", "grim air elemental: drifting cloud of pale mist and glowing motes with tattered vapour tails and one cold glow; slate and pale grey palette."),
        accents=accents)
