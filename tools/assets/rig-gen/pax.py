"""Procedural Pax rig (grim earth elemental: a colossus of dark granite boulders and slabs, neutral cold grey stone with deep fissures that glow
ember red-orange, a sunken boulder for a head with two ember slits, a ridge of black basalt shards down the back; the "legs" are blocky rubble
stumps and the "arms" are huge boulder fists, no person, no clothes). Replaces the earlier purple spiky quadruped. Run:
python3 tools/assets/rig-gen/pax.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py). Parts keep the ids hips, legB, legF,
armB, spikes, torso, head, armF, the same 80x80 frame and 4-frame idle/walk/cast. Concept: tools/assets/concepts-dark.py (pax), studied by
eye only. tools/assets/rig-gen/pax-portrait.py regenerates the map portrait from the baked sheet."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
GRANITE = [(0.0, (9, 9, 12)), (0.35, (32, 32, 38)), (0.7, (66, 64, 72)), (1.0, (118, 114, 120))]  # neutral cold grey, no purple
BASALT = [(0.0, (6, 6, 8)), (0.5, (20, 20, 25)), (1.0, (52, 52, 60))]
EMBER = [(0.0, (110, 20, 8)), (0.5, (226, 70, 14)), (0.85, (255, 150, 44)), (1.0, (255, 214, 130))]
EYE = (255, 190, 90)

G = {
 "hips": dict(polys=[[(14, 58), (20, 46), (36, 43), (52, 46), (60, 56), (52, 66), (34, 68), (18, 66)]], joint=(36, 52), z=3, parent=None, plates=12, dark=-0.1, heat=0.6),
 "legB": dict(polys=[[(20, 56), (34, 54), (37, 68), (39, 79), (16, 79), (19, 66)]], joint=(28, 58), z=1, parent="hips", plates=8, dark=-0.14, heat=0.35),
 "legF": dict(polys=[[(38, 56), (54, 54), (60, 68), (62, 79), (34, 79), (38, 66)]], joint=(46, 58), z=4, parent="hips", plates=8, dark=-0.04, heat=0.5),
 "armB": dict(polys=[[(44, 28), (54, 25), (64, 33), (69, 48), (67, 62), (58, 68), (49, 62), (46, 46)], [(50, 66), (58, 71), (64, 66)]],
              joint=(46, 32), z=2, parent="torso", plates=9, dark=-0.12, heat=0.55),
 "spikes": dict(polys=[[(12, 26), (9, 8), (21, 18)], [(22, 18), (22, 0), (33, 13)], [(34, 13), (40, -1), (47, 11)], [(46, 12), (54, 2), (57, 16)]],
                joint=(34, 28), z=5, parent="torso", shards=True),
 "torso": dict(polys=[[(6, 44), (6, 30), (13, 20), (24, 13), (37, 10), (49, 13), (58, 21), (62, 32), (58, 44), (49, 54), (34, 58), (19, 56), (10, 50)]],
               joint=(34, 36), z=6, parent="hips", plates=16, dark=0.0, heat=1.0),
 "head": dict(polys=[[(46, 24), (50, 16), (60, 14), (70, 17), (74, 25), (70, 33), (60, 35), (50, 33)]],
              joint=(52, 27), z=7, parent="torso", plates=7, dark=0.06, heat=0.7),
 "armF": dict(polys=[[(10, 24), (24, 22), (32, 34), (31, 50), (29, 64), (24, 74), (10, 76), (4, 64), (7, 48), (6, 34)], [(8, 70), (16, 78), (26, 74)]],
              joint=(20, 28), z=8, parent="torso", plates=11, dark=0.06, heat=0.7),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2, n3 = E.fbm(rs, 5), E.fbm(rs, 14), E.fbm(rs, 8)
    core = E.blur(E.warp(ma, (n2 - 0.5) * SS * 3.0, (n3 - 0.5) * SS * 3.0), SS * 0.4)
    core = np.clip((core - 0.45) * 3.0, 0, 1)  # chunky, hard-edged
    if g.get("shards"):
        d1, d2, nid, vx, vy = E.voronoi(rs, 6, stretch=(1.0, 1.4))
        sh = E.ramp(BASALT, np.clip(0.3 + 0.5 * np.clip(E.bevel_light(np.clip(yy * 0 + (d1 / 0.2), 0, 1), 20.0), -1, 1) + 0.4 * n2, 0, 1))
        base_glow = np.clip(1 - (yy - 0.12) / 0.2, 0, 1) * 0.0
        out = np.dstack([sh, core * 255])
        # a dull ember line along each shard base where it meets the body
        lowedge = np.clip((yy - 0.22) * 8, 0, 1) * core * (n1 > 0.4)
        out[..., :3] = out[..., :3] * (1 - lowedge[..., None] * 0.6) + E.ramp(EMBER, 0.45 + 0.3 * n3) * lowedge[..., None] * 0.6
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    n = g["plates"]
    d1, d2, nid, vx, vy = E.voronoi(rs, n, stretch=(1.0, 1.15))
    cellv = np.take(rs.rand(n), nid).astype(np.float32)
    tilt = np.clip(-(vx + vy) * 5.0, -0.5, 0.5)  # each plate tilts, so slabs read separately
    bev = E.bevel_light(np.clip(d1 / 0.11, 0, 1), 26.0)
    grain = E.fbm(rs, 26, 2)
    lit = np.clip(0.3 + 0.28 * cellv + 0.22 * tilt + 0.3 * bev + 0.25 * (grain - 0.5) + g["dark"] - 0.18 * yy + 0.1, 0, 1)
    rgb = E.ramp(GRANITE, lit)
    # lichen-free pitting: darken tiny pits so the stone has texture
    pits = np.clip((E.fbm(rs, 40, 2) - 0.62) * 6, 0, 1)
    rgb = rgb * (1 - 0.35 * pits[..., None])
    # fissures: the Voronoi seams crack open and glow; the glow is strongest low and in the middle of the mass
    crack = np.clip(1 - (d2 - d1) / 0.02, 0, 1) ** 1.3
    deep = np.clip((E.blur(ma, SS * 5) - 0.25) * 1.8, 0, 1)
    hot = np.clip(0.35 + 0.9 * n1 + 0.4 * yy - 0.15, 0, 1.2)
    glow = np.clip(crack * hot * g["heat"] * 1.2 * deep, 0, 1) * 0.92
    haze = E.blur(glow, SS * 2.2) * 0.4
    rgb = rgb * (1 - glow[..., None]) + E.ramp(EMBER, np.clip(glow * 0.9 + 0.1 * n2, 0, 1)) * glow[..., None]
    rgb = rgb + E.ramp(EMBER, haze) * haze[..., None] * 0.45
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.5 * edge[..., None])
    out = np.dstack([rgb, core * 255]).astype(np.float32)
    sp = E.blur((rs.rand(W, W) > 0.9991).astype(np.float32), SS * 0.5) * 6
    sp = np.clip(sp * (E.blur(core, SS * 5) > 0.05), 0, 1)
    out[..., :3] = out[..., :3] * (1 - sp[..., None]) + np.array([255, 150, 60], np.float32) * sp[..., None]
    out[..., 3] = np.maximum(out[..., 3], sp * 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(60, 23), (67, 23.5)] if view == "E" else [(57, 25), (64, 25.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.8, 0.8, EYE, (255, 100, 20), 3.0)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # slow heavy breathing
    "torso": c(rot=[0, 0, 1, 1], dy=[0, 0, 1, 1]),
    "head": c(rot=[0, -1, -1, 0]),
    "armF": c(rot=[0, 1, 2, 1]),
    "armB": c(rot=[0, -1, -2, -1]),
    "spikes": c(rot=[0, 1, 1, 0]),
 }),
 "walk": dict(frames=4, curves={  # a lumbering stomp
    "hips": c(rot=[2, 2, 2, 2], dy=[1, 0, -1, 0]),
    "torso": c(rot=[2, 2, 2, 2], dy=[0, 1, 0, 1]),
    "head": c(rot=[-2, -1, -2, -1], dy=[0, 0, 1, 0]),
    "legF": c(rot=[-12, 0, 12, 0], dy=[0, -1, 0, 0]),
    "legB": c(rot=[12, 0, -12, 0], dy=[0, 0, 0, -1]),
    "armF": c(rot=[5, 0, -9, 0]),
    "armB": c(rot=[-9, 0, 5, 0]),
 }),
 "cast": dict(frames=4, curves={  # earth buff: both fists heave up and forward, torso rears, then slams
    "torso": c(rot=[0, -4, -3, 2], dy=[0, 1, 0, 2]),
    "head": c(rot=[-2, -6, -4, 3], dx=[0, -1, 0, 1]),
    "armF": c(rot=[-8, -30, -48, -18]),
    "armB": c(rot=[-6, -26, -40, -14]),
    "spikes": c(rot=[0, -2, -1, 1]),
    "legF": c(dy=[0, 0, 0, 1]),
    "legB": c(dy=[0, 0, 0, 1]),
 }),
}
E.build(OUT, "pax", G, actions, paint,
        E.license_for("pax", "pax.py", "grim earth elemental: a colossus of dark neutral-grey granite boulders with ember-glowing fissures, ember eye slits, a ridge of black basalt shards; no person, no clothes."),
        accents=accents)
