"""Procedural Glimmaw rig (water ranged: an abyssal anglerfish, a bruise-teal fat body with a wide toothed maw, pale ragged fins and a long
stalk ending in a luminous gold-cyan lure). Run: python3 tools/assets/rig-gen/glimmaw.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py
and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (tail fin, rear fin, body, jaw; armF is the lure stalk). Same 80x80 frame."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
SKIN = [(0.0, (8, 16, 26)), (0.4, (22, 56, 72)), (0.75, (52, 110, 118)), (1.0, (120, 178, 170))]
LURE = [(0.0, (60, 150, 170)), (0.5, (170, 240, 226)), (1.0, (255, 250, 214))]
FIN = [(0.0, (30, 60, 80)), (0.5, (96, 150, 160)), (1.0, (200, 230, 226))]
GLOW = [(0.0, (30, 120, 140)), (0.6, (110, 220, 214)), (1.0, (250, 255, 220))]
stalk = ribbon_poly([(50, 36), (54, 24), (66, 16), (72, 22)], 2.2, 1.2, 10)
bulb = [(68, 18), (72, 15), (76, 19), (74, 25), (69, 24)]
tailfin = [(12, 52), (2, 42), (4, 52), (2, 62)]
rearfin = [(30, 60), (24, 72), (36, 66)]
G = {
 "tail": dict(polys=[tailfin], joint=(14, 52), z=1, parent="torso"),
 "armB": dict(polys=[rearfin], joint=(32, 60), z=2, parent="torso"),
 "torso": dict(polys=[[(12, 52), (16, 40), (28, 32), (44, 30), (58, 36), (62, 48), (58, 62), (44, 68), (28, 66), (16, 60)]], joint=(38, 50), z=5, parent=None),
 "head": dict(polys=[[(54, 40), (66, 38), (78, 46), (78, 52), (66, 50), (62, 58), (54, 60)]], joint=(56, 50), z=7, parent="torso"),
 "armF": dict(polys=[stalk, bulb], joint=(50, 36), z=8, parent="torso"),
}
P = dict(body=SKIN, glow=GLOW, cells=0, facet=0.05, rag=2.4, bevel=16.0, edge=(6, 20, 30), vert=1.0,
         sparks=dict(rate=0.9984, color=(190, 255, 240)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=[tailfin], ramp=FIN, style="soft", opacity=0.9)]),
   "armB": dict(cells=0, overlays=[dict(polys=[rearfin], ramp=FIN, style="soft", opacity=0.9)]),
   "head": dict(cells=0),
   "armF": dict(cells=0, shade=0.1, overlays=[dict(polys=[bulb], ramp=LURE, style="soft", opacity=1.0)])})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name == "armF" and view != "NE":
        x, y = E.apply(tf, (71, 20))
        return E.glow_dot(im, x, y, 3.0, 2.4, (255, 252, 226), (120, 240, 224), 4.6)
    if name == "head" and view != "NE":
        x, y = E.apply(tf, (64, 43) if view == "E" else (62, 43))
        return E.glow_dot(im, x, y, 1.1, 1.0, (230, 255, 250), (120, 220, 220), 2.2)
    return None


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # hangs in the dark, the lure swaying
    "torso": c(dy=[0, -1, -1, 0]), "head": c(rot=[0, 1, 2, 1]),
    "armF": c(rot=[0, 4, 7, 3]), "armB": c(rot=[0, -4, -7, -3]), "tail": c(rot=[0, 5, 9, 3])}),
 "walk": dict(frames=4, curves={  # a slow sculling swim
    "torso": c(dy=[0, -1, 0, -1], rot=[1, 0, -1, 0]), "head": c(rot=[-1, 0, 1, 0]),
    "armF": c(rot=[6, 0, -6, 0]), "armB": c(rot=[-14, 0, 14, 0]), "tail": c(rot=[14, 0, -14, 0])}),
 "cast": dict(frames=4, curves={  # the stalk whips forward and the lure flares
    "torso": c(rot=[0, -3, 3, 0]), "head": c(rot=[0, -4, 6, 0]),
    "armF": c(rot=[0, -22, 30, 6]), "armB": c(rot=[0, 10, -10, 0]), "tail": c(rot=[0, 8, 14, 2])}),
}
E.build(OUT, "glimmaw", G, actions, paint,
        E.license_for("glimmaw", "glimmaw.py", "abyssal anglerfish: bruise-teal body, toothed maw, ragged pale fins and a luminous gold-cyan lure on a long stalk."),
        accents=accents)
