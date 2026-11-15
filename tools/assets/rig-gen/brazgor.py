"""Procedural Brazgor rig (fire melee: a forge boar, a hulking slag-black iron-hide beast with a glowing molten flame mantle, heavy curled tusks,
ember-lit eyes and a stub tail dripping sparks). Run: python3 tools/assets/rig-gen/brazgor.py <out_rig_dir> (Pillow + numpy; helpers in
elemental.py and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind legs). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
IRON = [(0.0, (12, 10, 12)), (0.4, (44, 36, 38)), (0.75, (92, 74, 66)), (1.0, (146, 112, 90))]
SLAG = [(0.0, (150, 30, 8)), (0.5, (240, 104, 20)), (1.0, (255, 220, 130))]
FLAME = [(0.0, (60, 12, 8)), (0.4, (170, 52, 14)), (0.8, (240, 140, 44)), (1.0, (252, 220, 150))]
mantle = [[(18, 40), (24, 28), (38, 24), (52, 28), (58, 38), (46, 34), (32, 34)]]
tail_poly = ribbon_poly([(12, 52), (6, 56), (4, 64)], 4.0, 1.2)
BONE = [(0.0, (110, 96, 74)), (0.5, (214, 198, 164)), (1.0, (252, 244, 220))]
TUSKS = [ribbon_poly([(66, 56), (74, 62), (79, 52), (78, 44)], 3.2, 0.6, 8)]
G = {
 "tail": dict(polys=[tail_poly], joint=(14, 52), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(24, 58), (22, 68), (24, 77)], 8, 6)], joint=(24, 58), z=2, parent="torso"),
 "torso": dict(polys=[[(8, 62), (14, 48), (28, 40), (44, 24), (58, 26), (66, 40), (66, 58), (52, 66), (34, 67), (18, 66)]], joint=(38, 50), z=5, parent=None),
 "head": dict(polys=[[(60, 40), (68, 36), (76, 40), (79, 48), (76, 56), (66, 60), (60, 56)],
                     [(70, 54), (78, 50), (79, 40), (74, 46)]], joint=(62, 50), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(54, 58), (56, 68), (58, 77)], 8, 6)], joint=(54, 58), z=8, parent="torso"),
}
P = dict(body=IRON, glow=SLAG, cells=9, facet=0.22, rag=2.2, bevel=20.0, edge=(40, 12, 8), vert=1.2,
         sparks=dict(rate=0.9985, color=(255, 190, 90)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=[tail_poly], ramp=FLAME, style="flame")]),
   "torso": dict(cells=9, overlays=[dict(polys=mantle, ramp=FLAME, style="flame", opacity=0.7)]),
   "head": dict(cells=8, overlays=[dict(polys=TUSKS, ramp=BONE, style="soft", opacity=1.0)]), "armF": dict(cells=8), "armB": dict(cells=8, shade=-0.1)})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(71, 44)] if view == "E" else [(66, 45), (73, 45)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.5, 1.0, (255, 236, 190), (255, 130, 40), 2.8)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, -1, 0]), "head": c(rot=[0, 2, 3, 1], dy=[0, 1, 1, 0]),
    "armF": c(rot=[0, 1, 2, 1]), "armB": c(rot=[0, -1, -2, -1]), "tail": c(rot=[0, 5, 9, 3])}),
 "walk": dict(frames=4, curves={  # a heavy, stamping trudge
    "torso": c(dy=[1, 0, 1, 0], rot=[1, 0, -1, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[-20, 0, 20, 0]), "armB": c(rot=[20, 0, -20, 0]), "tail": c(rot=[6, 0, -6, 0])}),
 "cast": dict(frames=4, curves={  # the head drops and swings up in a gore
    "torso": c(rot=[0, -3, 4, 0], dy=[0, 1, -1, 0]), "head": c(rot=[0, 14, -22, -4], dy=[0, 2, -1, 0]),
    "armF": c(rot=[0, -22, 20, 4]), "armB": c(rot=[0, 12, -14, 0]), "tail": c(rot=[0, 10, 18, 4])}),
}
E.build(OUT, "brazgor", G, actions, paint,
        E.license_for("brazgor", "brazgor.py", "forge boar: slag-black iron hide with glowing molten flame mantle, ember-lit eyes and curled tusks."),
        accents=accents)
