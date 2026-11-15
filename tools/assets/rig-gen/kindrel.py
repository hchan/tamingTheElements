"""Procedural Kindrel rig (fire melee: a cinder hound, a low charred-hide beast whose seams glow like a banked fire, a flame mane down the neck
and a streaming flame tail; ember eyes). Run: python3 tools/assets/rig-gen/kindrel.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py
and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind legs). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
FLAME = [(0.0, (52, 10, 8)), (0.28, (130, 30, 12)), (0.55, (204, 78, 18)), (0.8, (236, 148, 52)), (1.0, (250, 222, 160))]
HIDE = [(0.0, (14, 10, 10)), (0.45, (40, 28, 26)), (0.8, (84, 58, 46)), (1.0, (128, 92, 70))]
GLOW = [(0.0, (160, 36, 10)), (0.55, (246, 112, 24)), (1.0, (255, 214, 140))]
mane = [[(56, 32), (50, 22), (40, 26), (30, 28), (22, 34), (32, 38), (44, 38)]]
tailp = [ribbon_poly([(16, 46), (8, 40), (4, 28), (8, 18)], 5, 1)]
G = {
 "tail": dict(polys=tailp, joint=(18, 46), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(22, 50), (17, 63), (19, 77)], 5, 2.6)], joint=(22, 50), z=2, parent="torso"),
 "torso": dict(polys=[[(14, 48), (18, 38), (30, 35), (46, 35), (58, 38), (63, 46), (57, 54), (40, 56), (22, 55)]], joint=(38, 46), z=5, parent=None),
 "head": dict(polys=[[(56, 32), (60, 22), (64, 28), (68, 28), (77, 36), (79, 41), (70, 44), (59, 44)]], joint=(60, 38), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(54, 50), (58, 63), (61, 77)], 5, 2.6)], joint=(54, 50), z=8, parent="torso"),
}
P = dict(body=HIDE, glow=GLOW, cells=26, stretch=(1.0, 1.4), glowk=1.0, facet=0.2, rag=2.4, bevel=18.0, edge=(40, 12, 8),
         sparks=dict(rate=0.9985, color=(255, 200, 110)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=tailp, ramp=FLAME, style="flame")]),
   "torso": dict(overlays=[dict(polys=mane, ramp=FLAME, style="flame")]),
   "head": dict(glow=1.3), "armF": dict(cells=9), "armB": dict(cells=9, shade=-0.1)})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(68, 36)] if view == "E" else [(63, 37), (69, 37)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.4, 1.0, (255, 240, 200), (255, 150, 50), 2.6)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, 0, -1, 0], rot=[0, 1, 0, -1]), "head": c(rot=[0, 2, 3, 1], dy=[0, 1, 1, 0]),
    "armF": c(rot=[0, 2, 3, 1]), "armB": c(rot=[0, -2, -3, -1]), "tail": c(rot=[0, 6, 10, 4])}),
 "walk": dict(frames=4, curves={  # a prowling lope
    "torso": c(rot=[2, 0, 2, 0], dy=[1, 0, 1, 0]), "head": c(rot=[-3, 0, 3, 0]),
    "armF": c(rot=[-26, 0, 26, 0]), "armB": c(rot=[26, 0, -26, 0]), "tail": c(rot=[10, 0, -10, 0])}),
 "cast": dict(frames=4, curves={  # coils back, then lunges and snaps
    "torso": c(rot=[0, -4, 5, 0], dy=[0, 1, -1, 0]), "head": c(rot=[0, -10, 12, 2], dy=[0, 1, 0, 0]),
    "armF": c(rot=[0, -30, 36, 6]), "armB": c(rot=[0, 14, -18, 0]), "tail": c(rot=[0, 14, 22, 4])}),
}
E.build(OUT, "kindrel", G, actions, paint,
        E.license_for("kindrel", "kindrel.py", "cinder hound: charred hide with glowing ember seams, flame mane and tail, ember eyes; dark red to orange to straw palette."),
        accents=accents)
