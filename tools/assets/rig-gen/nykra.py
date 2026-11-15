"""Procedural Nykra rig (water melee: a kelpie, a sleek horse of dark tidal water with a pale foam rim, a mane and tail of trailing kelp, cold
sea-green eyes and heavy hooves). Run: python3 tools/assets/rig-gen/nykra.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py and
b1_common.py). Parts keep the ids tail, armB, torso, head, armF (armF/armB are the fore and hind legs). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
TIDE = [(0.0, (10, 28, 44)), (0.4, (28, 76, 104)), (0.75, (74, 142, 164)), (1.0, (196, 232, 236))]
KELP = [(0.0, (14, 34, 22)), (0.5, (44, 94, 56)), (1.0, (126, 170, 96))]
FOAM = [(0.0, (110, 160, 176)), (1.0, (232, 248, 250))]
mane = [ribbon_poly([(60, 22), (52, 24), (44, 30), (34, 36), (24, 42)], 4.5, 1.5)]
tailp = [ribbon_poly([(14, 46), (7, 52), (4, 63), (9, 75)], 5, 1.2)]
G = {
 "tail": dict(polys=tailp, joint=(16, 46), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(22, 52), (18, 63), (20, 77)], 4.6, 2.6)], joint=(22, 52), z=2, parent="torso"),
 "torso": dict(polys=[[(12, 46), (18, 38), (32, 37), (46, 38), (56, 34), (62, 24), (68, 26), (63, 42), (58, 54), (46, 58), (30, 58), (18, 56)]], joint=(38, 48), z=5, parent=None),
 "head": dict(polys=[[(60, 20), (66, 12), (74, 14), (79, 26), (77, 31), (70, 29), (64, 27)]], joint=(63, 24), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(54, 52), (57, 64), (58, 77)], 4.6, 2.6)], joint=(54, 52), z=8, parent="torso"),
}
P = dict(body=TIDE, opacity=0.94, rim=(190, 230, 236), cells=4, mode="plates", facet=0.12, rag=1.8, bevel=14.0, vert=0.7,
         sparks=dict(rate=0.9988, color=(230, 250, 252)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=tailp, ramp=KELP, style="soft")]),
   "torso": dict(overlays=[dict(polys=mane, ramp=KELP, style="soft"),
                           dict(polys=[ribbon_poly([(16, 50), (28, 54), (44, 56), (54, 52)], 2.5, 2.5)], ramp=FOAM, style="soft", opacity=0.55)]),
   "armF": dict(cells=6, overlays=[dict(polys=[[(53, 72), (60, 72), (61, 78), (52, 78)]], ramp=[(0.0, (30, 36, 40)), (1.0, (90, 98, 104))], opacity=0.9)]),
   "armB": dict(cells=6, shade=-0.1, overlays=[dict(polys=[[(18, 73), (25, 73), (26, 79), (17, 79)]], ramp=[(0.0, (30, 36, 40)), (1.0, (90, 98, 104))], opacity=0.9)])})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(70, 20)] if view == "E" else [(66, 21), (72, 21)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.4, 1.0, (230, 255, 240), (80, 220, 170), 2.6)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, 0, 0], rot=[0, 0, 1, 0]), "head": c(rot=[0, -2, -3, -1]),
    "armF": c(rot=[0, 2, 0, -2]), "armB": c(rot=[0, -2, 0, 2]), "tail": c(rot=[0, 5, 9, 4])}),
 "walk": dict(frames=4, curves={  # a trot
    "torso": c(dy=[1, 0, 1, 0], rot=[1, 0, 1, 0]), "head": c(rot=[-3, 0, 3, 0]),
    "armF": c(rot=[-28, 0, 28, 0]), "armB": c(rot=[28, 0, -28, 0]), "tail": c(rot=[10, 0, -10, 0])}),
 "cast": dict(frames=4, curves={  # rears, then the hooves come down
    "torso": c(rot=[0, -9, 4, 0], dy=[0, -2, 1, 0]), "head": c(rot=[0, -10, 8, 0]),
    "armF": c(rot=[0, -52, 30, 4]), "armB": c(rot=[0, 8, -6, 0]), "tail": c(rot=[0, 16, 6, 0])}),
}
E.build(OUT, "nykra", G, actions, paint,
        E.license_for("nykra", "nykra.py", "kelpie: a horse of dark tidal water with a foam rim, kelp mane and tail, sea-green eyes; deep teal to pale foam palette."),
        accents=accents)
