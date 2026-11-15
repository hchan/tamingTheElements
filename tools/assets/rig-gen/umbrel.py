"""Procedural Umbrel rig (earth ranged: a cave fungus, a squat rot-brown stalk body under a broad mottled cap, glowing spore-green gills, two
dangling root-arms and a trailing mycelium tail). Run: python3 tools/assets/rig-gen/umbrel.py <out_rig_dir> (Pillow + numpy; helpers in
elemental.py and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (head is the cap). Same 80x80 frame; fills the common
Roster 24 height band (about y 22..78)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
STALK = [(0.0, (16, 12, 8)), (0.4, (58, 44, 30)), (0.75, (118, 96, 66)), (1.0, (190, 168, 124))]
CAP = [(0.0, (30, 14, 20)), (0.4, (92, 40, 46)), (0.75, (150, 84, 70)), (1.0, (216, 170, 130))]
SPORE = [(0.0, (40, 90, 20)), (0.5, (150, 220, 70)), (1.0, (240, 255, 170))]
tail_poly = ribbon_poly([(26, 70), (14, 72), (8, 66)], 3.4, 0.9, 8)
gills = [[(18, 46), (30, 42), (44, 40), (58, 42), (68, 46), (56, 50), (40, 52), (28, 50)]]
G = {
 "tail": dict(polys=[tail_poly], joint=(26, 70), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(32, 56), (28, 66), (30, 75)], 5, 2.4)], joint=(32, 56), z=2, parent="torso"),
 "torso": dict(polys=[[(28, 74), (30, 58), (36, 48), (46, 48), (52, 58), (54, 74), (42, 78)]], joint=(42, 62), z=5, parent=None),
 "head": dict(polys=[[(12, 46), (16, 34), (28, 26), (42, 22), (56, 26), (66, 34), (70, 46), (56, 50), (40, 52), (24, 50)]], joint=(40, 46), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(50, 56), (56, 66), (62, 74)], 5, 2.4)], joint=(50, 56), z=8, parent="torso"),
}
P = dict(body=STALK, glow=SPORE, cells=10, facet=0.18, rag=2.6, bevel=18.0, edge=(18, 10, 8), vert=1.0,
         sparks=dict(rate=0.9982, color=(190, 255, 120)),
         parts={
   "tail": dict(cells=0, overlays=[dict(polys=[tail_poly], ramp=SPORE, style="soft", opacity=0.55)]),
   "torso": dict(cells=8, glow=0.25),
   "head": dict(cells=16, glow=0.2, shade=0.0, overlays=[dict(polys=gills, ramp=SPORE, style="soft", opacity=0.55)]),
   "armF": dict(cells=0), "armB": dict(cells=0, shade=-0.1)})
P["body"] = STALK
capP = dict(P, body=CAP)
paint_stalk = make_paint(P)
paint_cap = make_paint(capP)


def paint(name, view, polys, g, seed):
    return (paint_cap if name == "head" else paint_stalk)(name, view, polys, g, seed)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(52, 48)] if view == "E" else [(34, 48), (48, 48)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.5, 1.0, (240, 255, 190), (150, 230, 80), 2.8)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={
    "torso": c(dy=[0, -1, -1, 0], sy=[100, 101, 102, 101]), "head": c(dy=[0, -1, -1, 0], rot=[0, 1, 2, 1]),
    "armF": c(rot=[0, 3, 5, 2]), "armB": c(rot=[0, -3, -5, -2]), "tail": c(rot=[0, 5, 8, 3])}),
 "walk": dict(frames=4, curves={  # a waddling shuffle
    "torso": c(dy=[0, -1, 0, -1], rot=[2, 0, -2, 0]), "head": c(rot=[-2, 0, 2, 0], dy=[0, -1, 0, -1]),
    "armF": c(rot=[-16, 0, 16, 0]), "armB": c(rot=[16, 0, -16, 0]), "tail": c(rot=[8, 0, -8, 0])}),
 "cast": dict(frames=4, curves={  # the cap tips back, then puffs forward
    "torso": c(rot=[0, -3, 3, 0]), "head": c(rot=[0, -8, 10, 0], dy=[0, 1, -2, 0], sx=[100, 96, 106, 100], sy=[100, 104, 94, 100]),
    "armF": c(rot=[0, -24, 20, 2]), "armB": c(rot=[0, 14, -14, 0]), "tail": c(rot=[0, 10, 16, 4])}),
}
E.build(OUT, "umbrel", G, actions, paint,
        E.license_for("umbrel", "umbrel.py", "cave fungus: rot-brown stalk under a mottled cap with spore-green gills and mycelium roots."),
        accents=accents)
