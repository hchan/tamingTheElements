"""Procedural Rokcore rig (grim earth elemental: a lopsided cairn of ancient cracked rock plates and moss, a glowing amber core in the
chest, a lopsided cairn of slabs with two amber slits set into a rock knot, no neck; the base is a heap of rubble and the "arms" are detached orbiting boulder clusters, no
limbs/clothes/person). Run: python3 tools/assets/rig-gen/rokcore.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py).
Parts keep the ids tail (rubble base), armB, torso, head, armF; the sim is unaffected. Hi-res (2026-11-14): painted at 8x and baked as a
240 px frame rig (ART=6 art px per sim unit, res 2, ss2 sampling, like the Pax/Sindarosa portrait rigs) so Rokcore is as dense as they are
(before it was an 80 px sprite upscaled ~3x and read blurry). Bake with: pnpm assets:bake && pnpm assets:sheets.
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from PIL import Image

E.SS, E.W = 8, 640  # paint at 8x (80 units -> 640 px); build() downsamples to ART px per unit
SS = E.SS
ART = 6

OUT = sys.argv[1]
STONE = [(0.0, (22, 23, 20)), (0.35, (58, 60, 52)), (0.7, (104, 106, 92)), (1.0, (158, 156, 136))]
MOSS = [(0.0, (22, 30, 14)), (0.5, (60, 76, 28)), (1.0, (112, 128, 52))]
AMBER = [(0.0, (130, 50, 8)), (0.5, (240, 150, 24)), (1.0, (255, 226, 130))]
EYE = (255, 206, 90)

G = {
 "tail": dict(polys=[[(8, 78), (10, 68), (20, 62), (32, 64), (44, 60), (58, 64), (68, 70), (72, 78)], [(16, 66), (20, 58), (26, 64)], [(50, 62), (56, 55), (62, 64)]],
              joint=(34, 62), z=1, parent=None, dark=-0.08, moss=0.5, chunk=22),
 # detached orbiting boulder clusters with a visible gap to the body (no shoulders, no arms)
 "armB": dict(polys=[[(58, 14), (68, 12), (74, 20), (70, 30), (60, 30)], [(62, 36), (70, 38), (72, 46), (64, 50), (58, 44)]],
              joint=(52, 30), z=2, parent="torso", dark=-0.12, moss=0.3, chunk=9),
 # a leaning cairn: slabs stacked wide to narrow, lopsided, no waist and no shoulders
 "torso": dict(polys=[[(10, 62), (14, 48), (12, 38), (22, 32), (24, 22), (36, 18), (44, 26), (52, 24), (54, 36), (58, 48), (56, 62), (34, 66)]],
               joint=(34, 48), z=5, parent="tail", dark=0.0, moss=1.0, chunk=24, core=(34, 46)),
 # the "head" is a rock knot on the slope of the cairn with eye slits set into it, no neck
 "head": dict(polys=[[(26, 36), (28, 26), (38, 22), (46, 26), (50, 34), (44, 42), (32, 42)], [(30, 26), (28, 16), (36, 24)], [(40, 24), (46, 14), (47, 25)]],
              joint=(38, 34), z=7, parent="torso", dark=0.04, moss=0.4, chunk=8),
 "armF": dict(polys=[[(2, 28), (10, 24), (16, 30), (14, 40), (6, 42), (1, 36)], [(4, 48), (12, 50), (14, 58), (8, 64), (2, 58)]],
              joint=(12, 40), z=8, parent="torso", dark=0.08, moss=0.6, chunk=9),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 14)
    core = E.blur(E.warp(ma, (n1 - 0.5) * SS * 2.5, (n2 - 0.5) * SS * 2.5), SS * 0.35)
    core = np.clip((core - 0.45) * 3.0, 0, 1)  # keep the edge chunky and hard, not fluffy
    n = g["chunk"]
    d1, d2, nid, vx, vy = E.voronoi(rs, n, stretch=(1.0, 1.1))
    cellv = np.take(rs.rand(n), nid).astype(np.float32)
    # each plate tilts: light varies with the offset from its site, so plates read as separate slabs
    tilt = np.clip(-(vx + vy) * 5.0, -0.5, 0.5)
    bev = E.bevel_light(np.clip(d1 / 0.1, 0, 1), 26.0)
    grain = E.fbm(rs, 28, 2)
    fine = E.fbm(rs, 110, 2)  # hi-res only: pitted, weathered surface grain and pores
    pores = np.clip((E.fbm(rs, 160, 1) - 0.72) * 6, 0, 1)
    lit = np.clip(0.32 + 0.3 * cellv + 0.25 * tilt + 0.3 * bev + 0.25 * (grain - 0.5) + 0.4 * (fine - 0.5) - 0.35 * pores + g.get("dark", 0) - 0.18 * yy + 0.1, 0, 1)
    rgb = E.ramp(STONE, lit)
    crack = np.clip(1 - (d2 - d1) / 0.012, 0, 1)
    rgb = rgb * (1 - 0.7 * crack[..., None])
    # moss on upward-facing plates and drifting patches
    top = np.clip(0.9 - yy * 1.1 + 0.9 * (n1 - 0.5), 0, 1)
    mm = np.clip((E.fbm(rs, 7, 3) + 0.35 * top - 0.7) * 5, 0, 1) * g.get("moss", 0.5)
    mcol = E.ramp(MOSS, np.clip(0.3 + 0.5 * grain + 0.3 * bev, 0, 1))
    rgb = rgb * (1 - mm[..., None] * 0.8) + mcol * mm[..., None] * 0.8
    if g.get("core"):  # glowing amber core in the chest, light spilling through cracks around it
        cx, cy = g["core"][0] / 80, g["core"][1] / 80
        r = np.hypot(xx - cx, (yy - cy) * 1.05)
        gl = np.clip(1 - r / 0.1, 0, 1) ** 1.2
        halo = np.clip(1 - r / 0.22, 0, 1) ** 2 * (0.4 + 0.9 * crack)
        rgb = rgb * (1 - np.clip(halo * 0.6, 0, 1)[..., None]) + E.ramp(AMBER, np.clip(0.3 + halo, 0, 1)) * (halo * 0.6)[..., None]
        rgb = rgb * (1 - gl[..., None]) + E.ramp(AMBER, np.clip(0.55 + 0.45 * gl, 0, 1)) * gl[..., None]
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.2, 0, 1)
    rgb = rgb * (1 - 0.5 * edge[..., None])
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), core * 255]).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(38, 33), (44, 33.5)] if view == "E" else [(37, 35), (44, 35.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.3, 0.7, EYE, (255, 150, 30))
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"torso": c(dy=[0, -1, -1, 0]), "head": c(rot=[0, -1, -2, -1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 2, 3, 1], dy=[0, -1, -1, 0]), "armB": c(rot=[0, -2, -3, -1], dy=[0, -1, 0, 0])}),
 "walk": dict(frames=4, curves={"tail": c(dy=[0, -1, 0, -1], rot=[-2, 0, 2, 0]), "torso": c(rot=[3, 1, 3, 1], dy=[1, 0, 1, 0]),
    "head": c(rot=[-3, -1, -3, -1]), "armF": c(rot=[14, 0, -16, 0]), "armB": c(rot=[-16, 0, 14, 0])}),
 "cast": dict(frames=4, curves={"tail": c(dy=[0, 0, 0, 1]), "torso": c(rot=[0, -4, -5, 4], dy=[0, -1, -2, 2]),
    "head": c(rot=[0, -5, -6, 3]), "armF": c(rot=[-8, -50, -76, 10]), "armB": c(rot=[-6, -44, -66, 8])}),
}
E.build(OUT, "rokcore", G, actions, paint,
        E.license_for("rokcore", "rokcore.py", "grim earth elemental: lopsided cairn of ancient cracked rock plates and moss, glowing amber chest core, floating boulder fists, rubble base; olive-grey stone and amber palette."),
        accents=accents, art=ART)
