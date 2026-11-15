"""Procedural Ouroth rig (fire melee grappler: a coiled forge-wyrm, soot-black scaled body with molten seams, a horned head with ember eyes and a
smouldering tail that curls round the body). Run: python3 tools/assets/rig-gen/ouroth.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py
and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind coils). Same 80x80 frame; the body fills
the common Roster 24 height band (about y 22..78)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
SCALE = [(0.0, (14, 10, 10)), (0.4, (52, 34, 30)), (0.75, (110, 70, 52)), (1.0, (172, 112, 78))]
MOLTEN = [(0.0, (140, 26, 8)), (0.5, (236, 92, 18)), (1.0, (255, 214, 120))]
FLAME = [(0.0, (60, 12, 8)), (0.4, (170, 52, 14)), (0.8, (240, 140, 44)), (1.0, (252, 220, 150))]
BONE = [(0.0, (90, 76, 60)), (0.5, (200, 182, 150)), (1.0, (250, 240, 214))]
tail_poly = ribbon_poly([(20, 62), (8, 66), (6, 56), (14, 48)], 5.0, 1.4, 8)
horns = [ribbon_poly([(58, 34), (62, 26), (68, 22)], 2.6, 0.5, 6), ribbon_poly([(66, 36), (72, 30), (77, 28)], 2.4, 0.5, 6)]
G = {
 "tail": dict(polys=[tail_poly], joint=(20, 62), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(26, 64), (28, 72), (34, 77)], 9, 6)], joint=(26, 64), z=2, parent="torso"),
 "torso": dict(polys=[[(18, 68), (16, 56), (24, 46), (36, 42), (46, 48), (50, 60), (48, 72), (38, 77), (26, 76)]], joint=(34, 60), z=5, parent=None),
 "head": dict(polys=[[(52, 36), (60, 30), (70, 32), (78, 40), (76, 48), (66, 52), (56, 50), (50, 44)]], joint=(54, 48), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(44, 54), (48, 66), (58, 74)], 9, 7)], joint=(44, 54), z=8, parent="torso"),
}
P = dict(body=SCALE, glow=MOLTEN, cells=14, facet=0.2, rag=2.0, bevel=18.0, edge=(34, 10, 6), vert=1.0,
         sparks=dict(rate=0.9985, color=(255, 190, 90)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=[tail_poly], ramp=FLAME, style="flame", opacity=0.8)]),
   "torso": dict(cells=14),
   "head": dict(cells=8, overlays=[dict(polys=horns, ramp=BONE, style="soft", opacity=1.0)]),
   "armF": dict(cells=9), "armB": dict(cells=9, shade=-0.1)})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(68, 41)] if view == "E" else [(63, 41), (72, 41)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.5, 1.0, (255, 236, 190), (255, 130, 40), 2.8)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, -1, 0], sy=[100, 102, 103, 101]), "head": c(rot=[0, 3, 4, 1], dy=[0, -1, -1, 0]),
    "armF": c(rot=[0, 2, 3, 1]), "armB": c(rot=[0, -2, -3, -1]), "tail": c(rot=[0, 6, 10, 4])}),
 "walk": dict(frames=4, curves={  # a slow slither
    "torso": c(dy=[0, 1, 0, 1], rot=[2, 0, -2, 0]), "head": c(rot=[-3, 0, 3, 0], dy=[0, -1, 0, -1]),
    "armF": c(rot=[-14, 0, 14, 0]), "armB": c(rot=[14, 0, -14, 0]), "tail": c(rot=[10, 0, -10, 0])}),
 "cast": dict(frames=4, curves={  # the head rears back, then strikes and coils
    "torso": c(rot=[0, -4, 5, 0], dy=[0, 1, -2, 0]), "head": c(rot=[0, -16, 18, -2], dy=[0, -2, 2, 0]),
    "armF": c(rot=[0, -26, 24, 4]), "armB": c(rot=[0, 14, -18, 0]), "tail": c(rot=[0, 14, 24, 6])}),
}
E.build(OUT, "ouroth", G, actions, paint,
        E.license_for("ouroth", "ouroth.py", "forge wyrm: soot-black scaled coils with molten seams, bone horns and ember eyes."),
        accents=accents)
