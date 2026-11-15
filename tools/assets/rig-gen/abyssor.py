"""Procedural Abyssor rig (water melee: a trench kraken, a huge bruise-blue mantle with a pale bioluminescent eye and four heavy lashing arms
(armF/armB plus tail and a mantle fin). Run: python3 tools/assets/rig-gen/abyssor.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py and
b1_common.py). Parts keep the ids tail, armB, torso, head, armF. Same 80x80 frame; fills the common Roster 24 height band (about y 20..78)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
HIDE = [(0.0, (8, 14, 28)), (0.4, (28, 50, 84)), (0.75, (66, 104, 140)), (1.0, (140, 184, 204))]
LUM = [(0.0, (20, 90, 120)), (0.5, (80, 200, 210)), (1.0, (222, 255, 244))]
EYE = [(0.0, (120, 150, 60)), (0.5, (230, 232, 150)), (1.0, (255, 255, 230))]
t1 = ribbon_poly([(22, 56), (10, 62), (8, 72), (16, 78)], 5.0, 1.2, 8)
a1 = ribbon_poly([(26, 60), (20, 70), (24, 78)], 6.0, 1.5, 8)
a2 = ribbon_poly([(52, 58), (62, 68), (70, 74), (76, 68)], 6.0, 1.4, 8)
G = {
 "tail": dict(polys=[t1], joint=(22, 56), z=1, parent="torso"),
 "armB": dict(polys=[a1], joint=(26, 60), z=2, parent="torso"),
 "torso": dict(polys=[[(18, 60), (16, 40), (26, 24), (42, 20), (56, 26), (62, 40), (60, 56), (50, 62), (30, 62)]], joint=(40, 46), z=5, parent=None),
 "head": dict(polys=[[(40, 40), (48, 36), (58, 38), (62, 46), (58, 54), (48, 56), (40, 52)]], joint=(46, 46), z=7, parent="torso"),
 "armF": dict(polys=[a2], joint=(52, 58), z=8, parent="torso"),
}
P = dict(body=HIDE, glow=LUM, cells=12, facet=0.16, rag=2.4, bevel=20.0, edge=(6, 12, 24), vert=1.1,
         sparks=dict(rate=0.9985, color=(170, 240, 240)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=[t1], ramp=LUM, style="soft", opacity=0.45)]),
   "torso": dict(cells=12, glow=0.6),
   "head": dict(cells=0),
   "armF": dict(cells=0, overlays=[dict(polys=[a2], ramp=LUM, style="soft", opacity=0.4)]),
   "armB": dict(cells=0, shade=-0.1, overlays=[dict(polys=[a1], ramp=LUM, style="soft", opacity=0.35)])})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(55, 46)] if view == "E" else [(46, 46), (54, 46)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 2.4, 1.6, (255, 255, 230), (150, 240, 220), 3.6)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, -1, 0], sy=[100, 101, 102, 101]), "head": c(rot=[0, 2, 3, 1], dy=[0, -1, -1, 0]),
    "armF": c(rot=[0, 5, 9, 4]), "armB": c(rot=[0, -5, -9, -4]), "tail": c(rot=[0, 6, 10, 3])}),
 "walk": dict(frames=4, curves={  # a heavy drifting crawl
    "torso": c(dy=[0, 1, 0, 1], rot=[2, 0, -2, 0]), "head": c(rot=[-2, 0, 2, 0]),
    "armF": c(rot=[-18, 0, 18, 0]), "armB": c(rot=[18, 0, -18, 0]), "tail": c(rot=[8, 0, -8, 0])}),
 "cast": dict(frames=4, curves={  # arms draw back then lash out
    "torso": c(rot=[0, -3, 4, 0], dy=[0, 1, -1, 0]), "head": c(rot=[0, -6, 8, 0]),
    "armF": c(rot=[0, -40, 30, 4]), "armB": c(rot=[0, 24, -26, 0]), "tail": c(rot=[0, 14, 22, 6])}),
}
E.build(OUT, "abyssor", G, actions, paint,
        E.license_for("abyssor", "abyssor.py", "trench kraken: bruise-blue mantle with bioluminescent seams, a pale eye and heavy lashing arms."),
        accents=accents)
