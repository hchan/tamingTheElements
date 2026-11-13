"""Procedural Treenoc rig (grim nature elemental: a gnarled, half-rotten tree-beast, dark streaky bark with moss-grey lichen, a hollow in the
trunk that glows sickly green, root tendrils for legs, knotted branch limbs, a crown of bare twisted branches and a burl head with two green
slits; no person, no clothes). Replaces the earlier bipedal humanoid. Run: python3 tools/assets/rig-gen/treenoc.py <out_rig_dir> (needs Pillow +
numpy; helpers in elemental.py). Parts keep the ids hips, legB, legF, armB, crown, torso, head, armF, the same 80x80 frame and 4-frame
idle/walk/cast."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
BARK = [(0.0, (22, 19, 15)), (0.35, (62, 52, 42)), (0.7, (116, 102, 84)), (1.0, (178, 164, 140))]  # dark brown-grey, desaturated
LICHEN = [(0.0, (74, 88, 62)), (1.0, (150, 168, 124))]
GLOW = [(0.0, (10, 40, 18)), (0.5, (52, 140, 56)), (0.85, (110, 190, 100)), (1.0, (180, 225, 160))]
EYE = (200, 255, 170)


def rw(p, a, b): return [a + (b - a) * i / (len(p) - 1) for i in range(len(p))]


rootB = E.catmull([(24, 58), (18, 64), (20, 72), (12, 78)], 8)
rootB2 = E.catmull([(26, 60), (30, 70), (34, 76), (40, 79)], 8)
rootF = E.catmull([(44, 58), (50, 66), (58, 70), (66, 78)], 8)
rootF2 = E.catmull([(46, 60), (42, 70), (48, 76), (54, 79)], 8)
armFp = E.catmull([(24, 30), (14, 38), (10, 50), (14, 62), (10, 72)], 8)
armBp = E.catmull([(46, 32), (58, 36), (68, 44), (74, 56), (70, 68)], 8)
tw1 = E.catmull([(20, 26), (14, 16), (16, 6)], 6)
tw2 = E.catmull([(30, 20), (28, 8), (34, 0)], 6)
tw3 = E.catmull([(40, 20), (46, 8), (42, 0)], 6)
tw4 = E.catmull([(48, 24), (58, 14), (60, 4)], 6)

G = {
 "hips": dict(polys=[[(12, 64), (20, 52), (34, 48), (48, 50), (58, 58), (64, 68), (54, 72), (36, 70), (20, 72)]], joint=(36, 58), z=3, parent=None, kind="bark", dark=-0.1),
 "legB": dict(polys=[E.ribbon(rootB, rw(rootB, 7, 1.5)), E.ribbon(rootB2, rw(rootB2, 6, 1.5))], joint=(26, 62), z=1, parent="hips", kind="bark", dark=-0.15),
 "legF": dict(polys=[E.ribbon(rootF, rw(rootF, 7, 1.5)), E.ribbon(rootF2, rw(rootF2, 6, 1.5))], joint=(48, 62), z=4, parent="hips", kind="bark", dark=-0.05),
 "armB": dict(polys=[E.ribbon(armBp, rw(armBp, 7, 2))], joint=(44, 32), z=2, parent="torso", kind="bark", dark=-0.12),
 "crown": dict(polys=[E.ribbon(tw1, rw(tw1, 3, 0.6)), E.ribbon(tw2, rw(tw2, 3.4, 0.6)), E.ribbon(tw3, rw(tw3, 3.4, 0.6)), E.ribbon(tw4, rw(tw4, 3, 0.6))],
               joint=(34, 24), z=5, parent="torso", kind="twig", dark=-0.1),
 "torso": dict(polys=[[(14, 64), (16, 48), (14, 36), (19, 24), (28, 18), (38, 17), (47, 21), (52, 32), (54, 46), (56, 56), (52, 64), (40, 68), (26, 68)]],
               joint=(34, 44), z=6, parent="hips", kind="trunk", dark=0.0),
 "head": dict(polys=[[(40, 20), (46, 14), (54, 13), (60, 17), (62, 24), (58, 31), (50, 34), (43, 30)]], joint=(46, 26), z=7, parent="torso", kind="burl", dark=0.05),
 "armF": dict(polys=[E.ribbon(armFp, rw(armFp, 8, 2))], joint=(19, 30), z=8, parent="torso", kind="bark", dark=0.05),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 14)
    streak = E.fbm(rs, 6, 3, sx=0.5, sy=4.0)  # vertical bark grain
    fine = E.fbm(rs, 10, 3, sx=0.6, sy=6.0)
    core = E.blur(E.warp(ma, (n2 - 0.5) * SS * 3.5, (E.fbm(rs, 9) - 0.5) * SS * 3.5), SS * 0.4)
    core = np.clip((core - 0.45) * 3.0, 0, 1)
    ridge = 1 - np.abs(fine - 0.5) * 2  # furrow lines
    lit = np.clip(0.34 + 0.4 * (streak - 0.5) + 0.35 * (ridge - 0.6) + 0.18 * (n2 - 0.5) + g["dark"] - 0.15 * yy + 0.08, 0, 1)
    rgb = E.ramp(BARK, lit)
    # pale lichen patches on the lit upper surfaces
    lich = np.clip((E.fbm(rs, 7, 3) - 0.6) * 5, 0, 1) * np.clip(0.9 - yy, 0, 1) * (0.55 if g["kind"] != "twig" else 0)
    rgb = rgb * (1 - lich[..., None]) + E.ramp(LICHEN, n2) * lich[..., None]
    glow = np.zeros_like(core)
    kind = g["kind"]
    if kind in ("trunk", "burl"):
        # a hollow in the wood: dark cavity with a sick green glow deep inside
        if kind == "trunk":
            cx, cy, rx, ry = 0.46, 0.50, 0.12, 0.2
        else:
            cx, cy, rx, ry = 0.5, 0.5, 0.0, 0.0
        if rx:
            dd = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
            dd = dd + (n1 - 0.5) * 0.8
            hole = np.clip((1.0 - dd) * 3.0, 0, 1)
            inner = np.clip((0.55 - dd) * 2.2, 0, 1)
            glow = np.clip(inner * (0.3 + 0.6 * n2) * (0.45 + 0.6 * E.fbm(rs, 11)), 0, 1) * hole * 0.85
            rim = np.clip(E.blur(hole, SS * 2.0) - hole, 0, 1)
            rgb = rgb * (1 - 0.75 * hole[..., None]) + rgb * 0
            rgb = rgb * (1 - glow[..., None]) + E.ramp(GLOW, np.clip(glow, 0, 1)) * glow[..., None]
            rgb = rgb + E.ramp(GLOW, 0.3) * E.blur(glow, SS * 3)[..., None] * 0.35
            rgb = rgb * (1 - rim[..., None] * 0.4)
    edge = np.clip(1 - E.blur(core, SS * 2.0) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.5 * edge[..., None])
    # drifting green motes
    sp = E.blur((rs.rand(W, W) > 0.9992).astype(np.float32), SS * 0.5) * 6
    sp = np.clip(sp * (E.blur(core, SS * 5) > 0.05), 0, 1) if kind in ("trunk", "burl", "bark") else sp * 0
    rgb = rgb * (1 - sp[..., None]) + np.array([150, 235, 120], np.float32) * sp[..., None]
    alpha = np.maximum(core, sp)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(49, 23), (55, 23.5)] if view == "E" else [(47, 24), (53, 24.5)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.5, 0.7, EYE, (80, 200, 70), 3.0)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(rot=[0, 0, 1, 1], dy=[0, 0, 1, 1]),
    "head": c(rot=[0, -1, -1, 0]),
    "armF": c(rot=[0, 1, 2, 1]),
    "armB": c(rot=[0, -1, -2, -1]),
    "crown": c(rot=[0, 1, 2, 1]),
 }),
 "walk": dict(frames=4, curves={
    "hips": c(rot=[2, 2, 2, 2], dy=[1, 0, -1, 0]),
    "torso": c(rot=[2, 2, 2, 2], dy=[0, 1, 0, 1]),
    "head": c(rot=[-2, -1, -2, -1], dy=[0, 0, 1, 0]),
    "legF": c(rot=[-12, 0, 12, 0], dy=[0, -1, 0, 0]),
    "legB": c(rot=[12, 0, -12, 0], dy=[0, 0, 0, -1]),
    "armF": c(rot=[5, 0, -9, 0]),
    "armB": c(rot=[-9, 0, 5, 0]),
    "crown": c(rot=[1, 0, -1, 0]),
 }),
 "cast": dict(frames=4, curves={
    "torso": c(rot=[0, -4, -3, 2], dy=[0, 1, 0, 2]),
    "head": c(rot=[-2, -6, -4, 3], dx=[0, -1, 0, 1]),
    "armF": c(rot=[-8, -30, -48, -18]),
    "armB": c(rot=[-6, -26, -40, -14]),
    "crown": c(rot=[0, -3, -4, 1]),
    "legF": c(dy=[0, 0, 0, 1]),
    "legB": c(dy=[0, 0, 0, 1]),
 }),
}
E.build(OUT, "treenoc", G, actions, paint,
        E.license_for("treenoc", "treenoc.py", "grim nature elemental: a gnarled dark-bark tree-beast with a hollow glowing sickly green, root legs, branch limbs, bare twisted crown; no person, no clothes."),
        accents=accents)
