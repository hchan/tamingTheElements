"""Procedural Lavax rig (grim earth/fire elemental: a towering beast of black obsidian, jagged glassy plates with rivers of molten magma running
in the cracks, a lava-lit slit for a face, smoke rising off the shoulders; no person, no clothes). Run: python3 tools/assets/rig-gen/lavax.py
<out_rig_dir> (needs Pillow + numpy; helpers in elemental.py). Parts keep the old ids (tail = the broken rubble and lava pool it stands in,
armB/armF = massive shard slabs that heave, torso, head = the crag with the face slit) and the same 80x80 frame. Concept:
tools/assets/concepts-dark.py (lavax), studied by eye only."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
OBSID = [(0.0, (6, 6, 9)), (0.4, (18, 18, 26)), (0.75, (40, 42, 56)), (1.0, (96, 100, 118))]  # glassy blue-black with cold sheen
MAGMA = [(0.0, (120, 22, 8)), (0.45, (232, 84, 14)), (0.8, (255, 170, 50)), (1.0, (255, 232, 150))]
SMOKE = [(0.0, (22, 20, 22)), (0.6, (58, 54, 56)), (1.0, (104, 98, 98))]
EYE = (255, 214, 120)

G = {
 "tail": dict(polys=[[(8, 72), (14, 66), (24, 70), (34, 64), (48, 68), (60, 64), (70, 72), (66, 79), (40, 79), (14, 79)]], joint=(40, 68), z=1, parent="torso", dark=0.05, pool=True),
 "armB": dict(polys=[[(52, 32), (62, 28), (70, 36), (74, 52), (72, 66), (64, 72), (58, 58), (54, 44)]], joint=(54, 34), z=2, parent="torso", dark=0.1, spike=True),
 "torso": dict(polys=[[(14, 68), (10, 52), (16, 36), (26, 24), (40, 18), (54, 24), (62, 36), (64, 52), (58, 68), (40, 72)]], joint=(40, 50), z=5, parent=None, dark=0.0, smoke=True),
 "head": dict(polys=[[(30, 24), (30, 14), (38, 6), (44, 2), (50, 8), (58, 12), (60, 22), (52, 30), (40, 30)]], joint=(46, 28), z=7, parent="torso", dark=-0.04, smoke=True),
 "armF": dict(polys=[[(22, 30), (12, 32), (6, 44), (6, 60), (10, 72), (20, 74), (26, 62), (28, 46)]], joint=(24, 32), z=8, parent="torso", dark=-0.05, spike=True),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2, n3 = E.fbm(rs, 5), E.fbm(rs, 12), E.fbm(rs, 8)
    # jagged silhouette: small hard warp, no soft blob
    core = E.blur(E.warp(ma, (n2 - 0.5) * SS * 3.5, (n3 - 0.5) * SS * 3.5), SS * 0.45)
    # obsidian plates: large angular Voronoi facets with a glassy bevel and bright edge sheen
    d1, d2, nid, vx, vy = E.voronoi(rs, 12, stretch=(1.0, 1.35))
    cellv = np.take(rs.rand(12), nid).astype(np.float32)
    face = 0.5 + 0.5 * np.clip((vx * 0.7 - vy * 0.9) * 4.0, -1, 1)  # per-facet tilt so plates catch light differently
    light = E.bevel_light(np.clip(d1 / 0.13, 0, 1), 26.0)
    t = np.clip(0.2 + 0.32 * cellv + 0.22 * face + 0.3 * light + 0.15 * (n2 - 0.5) - g.get("dark", 0.0), 0, 1)
    stone = E.ramp(OBSID, t)
    # secondary hairline fractures (finer cells) carry thin magma too
    f1, f2, _, _, _ = E.voronoi(rs, 34, stretch=(1.0, 1.2))
    crack_big = np.clip(1 - (d2 - d1) / 0.026, 0, 1) ** 1.6
    crack_fine = np.clip(1 - (f2 - f1) / 0.011, 0, 1) ** 1.6 * (n1 > 0.42)
    heat = np.clip(0.45 + 0.9 * n1 + 0.5 * yy - 0.15, 0, 1.2)
    glow = np.clip(np.maximum(crack_big * heat * 1.15, crack_fine * heat * 0.9), 0, 1) * 0.92
    haze = E.blur(glow, SS * 2.4) * 0.35
    rgb = stone * (1 - glow[..., None]) + E.ramp(MAGMA, np.clip(glow * 0.85 + 0.12 * n2, 0, 1)) * glow[..., None]
    rgb = rgb + E.ramp(MAGMA, haze * 0.9) * haze[..., None] * 0.5
    if g.get("pool"):  # molten pool the beast stands in
        pool = np.clip((n1 - 0.45) * 5, 0, 1) * np.clip((yy - 0.84) * 12, 0, 1)
        rgb = rgb * (1 - pool[..., None]) + E.ramp(MAGMA, 0.4 + 0.5 * n2) * pool[..., None]
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.5 * edge[..., None])
    alpha = core * 0.99
    out = np.dstack([rgb, alpha * 255]).astype(np.float32)
    if g.get("smoke"):  # smoke rising off the top, dragged upward and torn
        sm_src = E.blur(ma, SS * 3.0)
        up = E.warp(sm_src, (n1 - 0.5) * SS * 6, SS * (5 + 12 * E.fbm(rs, 6, 3, sx=1.0, sy=0.45)))
        sa = np.clip((up - 0.3) * 2.2, 0, 1) * np.clip(1 - core, 0, 1) * 0.8
        sc = E.ramp(SMOKE, np.clip(0.3 + 0.7 * n3 - 0.3 * yy + 0.2, 0, 1))
        out[..., :3] = out[..., :3] * (core[..., None]) + sc * (1 - core[..., None])
        out[..., 3] = np.maximum(out[..., 3], sa * 255)
    # sparse rising embers
    sp = np.clip(E.blur((rs.rand(W, W) > 0.9988).astype(np.float32), SS * 0.5) * 6, 0, 1) * (E.blur(core, SS * 5) > 0.05)
    out[..., :3] = out[..., :3] * (1 - sp[..., None]) + np.array([255, 170, 70], np.float32) * sp[..., None]
    out[..., 3] = np.maximum(out[..., 3], sp * 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    # a lava-lit slit for a face: two narrow ember slits, not human eyes
    pts = [(48, 19), (55, 19.5)] if view == "E" else [(44, 22), (52, 22.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.7, 0.7, EYE, (255, 120, 30), 3.4)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # heavy slow breathing, smoke drifts
    "torso": c(dy=[0, 0, -1, -1]),
    "head": c(rot=[0, -1, -2, -1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 1, 2, 1]), "armB": c(rot=[0, -1, -2, -1]),
    "tail": c(dy=[0, 0, 0, 0]),
 }),
 "walk": dict(frames=4, curves={  # lumbering: the mass rocks, slabs swing against each other
    "tail": c(dy=[0, -1, 0, -1], rot=[-1, 0, 1, 0]),
    "torso": c(rot=[3, 1, 3, 1], dy=[1, 0, 1, 0]),
    "head": c(rot=[-3, -1, -3, -1]),
    "armF": c(rot=[12, 0, -14, 0]), "armB": c(rot=[-14, 0, 12, 0]),
 }),
 "cast": dict(frames=4, curves={  # rears back, both slabs heave up, then slam down
    "tail": c(dy=[0, 0, 0, 1]),
    "torso": c(rot=[0, -4, -5, 4], dy=[0, -1, -2, 2]),
    "head": c(rot=[0, -5, -6, 3]),
    "armF": c(rot=[-8, -40, -62, 10]), "armB": c(rot=[-6, -36, -56, 8]),
 }),
}
E.build(OUT, "lavax", G, actions, paint,
        E.license_for("lavax", "lavax.py", "grim magma elemental: black glassy obsidian plates, rivers of molten magma in the cracks, lava-lit face slits, smoke rising; blue-black and ember orange palette."),
        accents=accents)
