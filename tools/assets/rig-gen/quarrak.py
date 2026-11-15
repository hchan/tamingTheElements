"""Procedural Quarrak rig (earth ranged: a boulder tortoise, a domed shell of cracked slate-brown rock with mossy shoulders and faint amber rune
seams, a small blunt head, thick stump legs and a short rubble tail). Run: python3 tools/assets/rig-gen/quarrak.py <out_rig_dir> (Pillow + numpy;
helpers in elemental.py and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind legs). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
ROCK = [(0.0, (26, 22, 20)), (0.4, (70, 58, 50)), (0.75, (128, 110, 90)), (1.0, (186, 166, 136))]
MOSS = [(0.0, (30, 44, 22)), (0.5, (70, 96, 42)), (1.0, (136, 158, 84))]
RUNE = [(0.0, (150, 86, 24)), (0.6, (236, 170, 66)), (1.0, (255, 230, 150))]
moss = [[(20, 44), (28, 34), (40, 30), (50, 34), (42, 40), (30, 46)]]
G = {
 "tail": dict(polys=[ribbon_poly([(14, 62), (8, 66), (5, 72)], 4.5, 1.5)], joint=(16, 62), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(28, 62), (26, 70), (27, 77)], 7, 5)], joint=(28, 62), z=2, parent="torso"),
 "torso": dict(polys=[[(10, 63), (12, 46), (22, 32), (38, 26), (54, 31), (63, 45), (66, 62), (52, 69), (36, 71), (20, 69)]], joint=(38, 56), z=5, parent=None),
 "head": dict(polys=[[(60, 50), (68, 45), (77, 49), (79, 57), (71, 62), (61, 60)]], joint=(62, 55), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(52, 62), (54, 70), (56, 77)], 7, 5)], joint=(52, 62), z=8, parent="torso"),
}
P = dict(body=ROCK, glow=RUNE, cells=18, mode="plates", facet=0.3, rag=1.6, bevel=22.0, edge=(18, 14, 12), vert=1.3,
         sparks=None,
         parts={
   "torso": dict(cells=22, glow=0.0, overlays=[dict(polys=moss, ramp=MOSS, style="soft", opacity=0.85)]),
   "head": dict(cells=7), "tail": dict(cells=0, shade=-0.1), "armF": dict(cells=6), "armB": dict(cells=6, shade=-0.12)})
base_paint = make_paint(P)
# rune seams on the shell: a second pass tints a few seams amber (kept subtle so the rock reads first)
paint = base_paint


def accents(name, view, im, tf):
    if name == "head" and view != "NE":
        pts = [(71, 53)] if view == "E" else [(67, 54), (73, 54)]
        for (x, y) in pts:
            x, y = E.apply(tf, (x, y))
            im = E.glow_dot(im, x, y, 1.3, 1.0, (255, 236, 180), (236, 160, 60), 2.4)
        return im
    if name == "torso" and view != "NE":
        # three amber rune marks across the shell
        for (x, y) in [(30, 44), (42, 40), (52, 50)]:
            x, y = E.apply(tf, (x, y))
            im = E.glow_dot(im, x, y, 1.1, 1.6, (255, 226, 150), (230, 150, 50), 2.2)
        return im
    return None


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, 0, -1, 0]), "head": c(rot=[0, 2, 3, 1], dy=[0, 0, 1, 0]),
    "armF": c(rot=[0, 1, 2, 1]), "armB": c(rot=[0, -1, -2, -1]), "tail": c(rot=[0, 3, 5, 2])}),
 "walk": dict(frames=4, curves={  # a heavy plod
    "torso": c(dy=[1, 0, 1, 0], rot=[1, 0, -1, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[-18, 0, 18, 0]), "armB": c(rot=[18, 0, -18, 0]), "tail": c(rot=[5, 0, -5, 0])}),
 "cast": dict(frames=4, curves={  # rears up on the haunches and heaves a rock forward
    "torso": c(rot=[0, -8, -3, 2], dy=[0, 1, 0, 0]), "head": c(rot=[0, -8, 6, 0]),
    "armF": c(rot=[0, -56, -88, -10]), "armB": c(rot=[0, 6, 10, 0]), "tail": c(rot=[0, 8, 12, 0])}),
}
E.build(OUT, "quarrak", G, actions, paint,
        E.license_for("quarrak", "quarrak.py", "boulder tortoise: domed cracked rock shell with moss, faint amber rune marks, blunt head and stump legs; slate-brown palette."),
        accents=accents)
