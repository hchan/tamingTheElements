"""Procedural Durrok rig (earth melee: an armoured tunnel tusker, a squat boar-like beast in overlapping slate-brown plates with a dark spine
ridge, bone tusks and a blunt snout; moss in the plate seams). Run: python3 tools/assets/rig-gen/durrok.py <out_rig_dir> (Pillow + numpy;
helpers in elemental.py and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind legs). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
PLATE = [(0.0, (24, 20, 16)), (0.4, (78, 62, 46)), (0.75, (138, 112, 80)), (1.0, (196, 168, 120))]
MOSS = [(0.0, (30, 44, 22)), (0.5, (74, 100, 44)), (1.0, (146, 168, 90))]
SPINE = [(0.0, (14, 12, 10)), (0.5, (52, 42, 34)), (1.0, (110, 92, 70))]
spines = [[(16, 44), (22, 30), (28, 40), (34, 26), (40, 38), (48, 26), (52, 38), (58, 32), (56, 42)]]
moss = [[(18, 52), (26, 44), (38, 46), (46, 50), (36, 54), (24, 56)]]
BONE = [(0.0, (110, 96, 74)), (0.5, (214, 198, 164)), (1.0, (252, 244, 220))]
TUSKS = [ribbon_poly([(66, 56), (74, 62), (79, 52), (78, 44)], 3.2, 0.6, 8)]
G = {
 "tail": dict(polys=[ribbon_poly([(12, 56), (6, 60), (3, 66)], 3.4, 1.0)], joint=(14, 56), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(24, 60), (22, 69), (24, 77)], 8, 6.4)], joint=(24, 60), z=2, parent="torso"),
 "torso": dict(polys=[[(8, 62), (14, 48), (28, 40), (44, 24), (58, 26), (66, 40), (66, 58), (52, 66), (34, 67), (18, 66)]], joint=(38, 52), z=5, parent=None),
 "head": dict(polys=[[(60, 44), (68, 40), (77, 46), (79, 54), (72, 60), (62, 58)],
                     [(72, 58), (79, 52), (79, 44), (74, 50)]], joint=(62, 52), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(54, 60), (56, 69), (58, 77)], 8, 6.4)], joint=(54, 60), z=8, parent="torso"),
}
P = dict(body=PLATE, cells=8, mode="plates", facet=0.3, rag=1.8, bevel=22.0, edge=(18, 14, 10), vert=1.2,
         sparks=None,
         parts={
   "tail": dict(cells=0, shade=-0.1),
   "torso": dict(cells=8, overlays=[dict(polys=spines, ramp=SPINE, style="soft", opacity=0.95),
                                     dict(polys=moss, ramp=MOSS, style="soft", opacity=0.75)]),
   "head": dict(cells=7, overlays=[dict(polys=TUSKS, ramp=BONE, style="soft", opacity=1.0)]), "armF": dict(cells=6), "armB": dict(cells=6, shade=-0.12)})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(70, 49)] if view == "E" else [(66, 50), (72, 50)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.2, 1.0, (255, 236, 190), (230, 170, 60), 2.2)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, 0, -1, 0]), "head": c(rot=[0, 2, 3, 1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 1, 2, 1]), "armB": c(rot=[0, -1, -2, -1]), "tail": c(rot=[0, 3, 5, 2])}),
 "walk": dict(frames=4, curves={  # a stolid trot
    "torso": c(dy=[1, 0, 1, 0], rot=[1, 0, -1, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[-22, 0, 22, 0]), "armB": c(rot=[22, 0, -22, 0]), "tail": c(rot=[5, 0, -5, 0])}),
 "cast": dict(frames=4, curves={  # lowers the head, then drives forward
    "torso": c(rot=[0, -3, 5, 0], dy=[0, 1, -1, 0]), "head": c(rot=[0, 10, -16, -2], dy=[0, 2, 0, 0]),
    "armF": c(rot=[0, -26, 24, 4]), "armB": c(rot=[0, 16, -20, 0]), "tail": c(rot=[0, 8, 14, 2])}),
}
E.build(OUT, "durrok", G, actions, paint,
        E.license_for("durrok", "durrok.py", "tunnel tusker: overlapping slate-brown plates, dark spine ridge, mossy seams, bone tusks and dull amber eyes."),
        accents=accents)
