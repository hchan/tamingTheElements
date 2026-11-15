"""Procedural Vortigal rig (air melee diver: a storm raptor, slate-grey feathered body with wide pale-edged wings, a hooked beak and bright talons).
Run: python3 tools/assets/rig-gen/vortigal.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py and b1_common.py). Parts keep the ids tail,
armB, torso, head, armF (armF/armB are the far and near wings). Same 80x80 frame; fills the common Roster 24 height band (about y 22..78)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
FEATHER = [(0.0, (18, 20, 30)), (0.4, (62, 70, 92)), (0.75, (126, 138, 164)), (1.0, (206, 214, 230))]
SKY = [(0.0, (60, 90, 140)), (0.5, (170, 210, 240)), (1.0, (250, 252, 255))]
GOLD = [(0.0, (120, 84, 20)), (0.5, (224, 176, 60)), (1.0, (255, 236, 160))]
tail_poly = ribbon_poly([(22, 58), (12, 64), (6, 74)], 5.0, 2.0, 8)
wingB = [[(34, 46), (24, 30), (30, 22), (44, 34), (46, 46)]]
wingF = [[(40, 48), (34, 30), (48, 22), (60, 30), (54, 46)]]
beak = [[(70, 40), (78, 44), (72, 50)]]
talons = [ribbon_poly([(36, 66), (38, 74), (44, 78)], 2.4, 0.8, 6), ribbon_poly([(46, 66), (48, 74), (54, 78)], 2.4, 0.8, 6)]
G = {
 "tail": dict(polys=[tail_poly], joint=(24, 58), z=1, parent="torso"),
 "armB": dict(polys=wingB, joint=(38, 46), z=2, parent="torso"),
 "torso": dict(polys=[[(22, 62), (28, 48), (42, 44), (56, 46), (62, 56), (54, 66), (42, 68), (30, 68)]] + talons, joint=(42, 56), z=5, parent=None),
 "head": dict(polys=[[(56, 36), (62, 32), (70, 34), (72, 42), (66, 48), (58, 48)]] + beak, joint=(58, 44), z=7, parent="torso"),
 "armF": dict(polys=wingF, joint=(46, 46), z=8, parent="torso"),
}
P = dict(body=FEATHER, cells=16, facet=0.2, mode="plates", rag=2.6, bevel=18.0, edge=(14, 16, 28), vert=1.0,
         sparks=dict(rate=0.9988, color=(210, 236, 255)),
         parts={
   "tail": dict(cells=6),
   "torso": dict(cells=14, overlays=[dict(polys=talons, ramp=GOLD, style="soft", opacity=1.0)]),
   "head": dict(cells=6, overlays=[dict(polys=beak, ramp=GOLD, style="soft", opacity=1.0)]),
   "armF": dict(cells=10, overlays=[dict(polys=[[(40, 28), (50, 22), (60, 30), (56, 36)]], ramp=SKY, style="soft", opacity=0.5)]),
   "armB": dict(cells=10, shade=-0.15)})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(65, 39)] if view == "E" else [(62, 39), (68, 39)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.3, 1.0, (255, 250, 210), (255, 210, 90), 2.6)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, 0, -1]), "head": c(rot=[0, 2, 0, -2]),
    "armF": c(rot=[0, -10, -18, -8]), "armB": c(rot=[0, -8, -14, -6]), "tail": c(rot=[0, 4, 8, 3])}),
 "walk": dict(frames=4, curves={  # a hopping, wing-beating stride
    "torso": c(dy=[0, -2, 0, -2], rot=[2, 0, -2, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[-24, 6, -24, 6]), "armB": c(rot=[-20, 4, -20, 4]), "tail": c(rot=[6, 0, -6, 0])}),
 "cast": dict(frames=4, curves={  # wings sweep up, then the body stoops forward
    "torso": c(rot=[0, -6, 10, 0], dy=[0, -2, 1, 0]), "head": c(rot=[0, -8, 14, 0]),
    "armF": c(rot=[0, -40, 24, 0]), "armB": c(rot=[0, -34, 20, 0]), "tail": c(rot=[0, 12, -10, 0])}),
}
E.build(OUT, "vortigal", G, actions, paint,
        E.license_for("vortigal", "vortigal.py", "storm raptor: slate feathered plates with pale edges, wide wings, a hooked gold beak and talons."),
        accents=accents)
