"""Procedural Hyalia rig (air ranged: a sky jellyfish, a translucent glass bell of pale lilac and rose with a luminous cyan core, trailing stinging
filaments and a ruffled rim; it hovers, never walks). Run: python3 tools/assets/rig-gen/hyalia.py <out_rig_dir> (Pillow + numpy; helpers in
elemental.py and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (the bell, its glowing core and three trailing filaments).
Same 80x80 frame. Violet-rose with a cyan core keeps it apart from Wispera's grey mist."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
GLASS = [(0.0, (70, 62, 112)), (0.4, (136, 124, 186)), (0.75, (214, 196, 232)), (1.0, (250, 240, 252))]
CORE = [(0.0, (60, 150, 196)), (0.55, (150, 230, 246)), (1.0, (248, 255, 255))]
FIL = [(0.0, (110, 90, 170)), (0.5, (196, 160, 220)), (1.0, (250, 214, 236))]
G = {
 "tail": dict(polys=[ribbon_poly([(48, 50), (52, 60), (46, 70), (50, 78)], 2.6, 0.7, 10)], joint=(48, 50), z=1, parent="torso"),
 "armB": dict(polys=[ribbon_poly([(30, 50), (25, 60), (30, 70), (24, 78)], 3.0, 0.8, 10)], joint=(30, 50), z=2, parent="torso"),
 "torso": dict(polys=[[(18, 50), (20, 36), (30, 25), (42, 21), (54, 25), (63, 36), (64, 50), (56, 54), (50, 50), (42, 54), (34, 50), (26, 54)]], joint=(40, 40), z=5, parent=None),
 "head": dict(polys=[[(34, 40), (36, 30), (44, 26), (52, 30), (54, 40), (46, 46), (38, 46)]], joint=(44, 36), z=7, parent="torso"),
 "armF": dict(polys=[ribbon_poly([(40, 52), (38, 62), (43, 71), (38, 79)], 3.2, 0.8, 10)], joint=(40, 52), z=8, parent="torso"),
}
P = dict(body=GLASS, opacity=0.8, rim=(255, 226, 242), cells=12, mode="plates", facet=0.1, rag=2.0, bevel=14.0, vert=0.6,
         sparks=dict(rate=0.9983, color=(240, 255, 255)),
         parts={
   "head": dict(cells=0, overlays=[dict(polys=[[(37, 38), (38, 31), (44, 28), (50, 31), (51, 38), (45, 43), (39, 43)]], ramp=CORE, style="soft", opacity=0.95)]),
   "tail": dict(cells=0, overlays=[dict(polys=[ribbon_poly([(48, 50), (52, 60), (46, 70), (50, 78)], 2.6, 0.7, 10)], ramp=FIL, style="soft")]),
   "armB": dict(cells=0, overlays=[dict(polys=[ribbon_poly([(30, 50), (25, 60), (30, 70), (24, 78)], 3.0, 0.8, 10)], ramp=FIL, style="soft")]),
   "armF": dict(cells=0, overlays=[dict(polys=[ribbon_poly([(40, 52), (38, 62), (43, 71), (38, 79)], 3.2, 0.8, 10)], ramp=FIL, style="soft")])})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    x, y = E.apply(tf, (45, 36) if view == "E" else (44, 37))
    return E.glow_dot(im, x, y, 2.2, 1.8, (250, 255, 255), (130, 220, 244), 3.6)


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # the bell pulses, filaments stream
    "torso": c(dy=[0, -1, -2, -1], sx=[100, 98, 94, 98], sy=[100, 102, 106, 102]),
    "head": c(dy=[0, -1, -1, 0]),
    "armF": c(rot=[0, 5, 8, 3]), "armB": c(rot=[0, -5, -8, -3]), "tail": c(rot=[0, 6, 10, 4])}),
 "walk": dict(frames=4, curves={  # a pulsing glide: each stroke squeezes the bell and the filaments trail
    "torso": c(dy=[0, -2, -3, -1], rot=[1, 0, -1, 0], sx=[100, 94, 100, 106], sy=[100, 106, 100, 94]),
    "head": c(dy=[0, -1, -1, 0]),
    "armF": c(rot=[10, -4, -10, 2]), "armB": c(rot=[-10, 4, 10, -2]), "tail": c(rot=[8, -2, -8, 2])}),
 "cast": dict(frames=4, curves={  # the bell draws in, then the filaments whip forward
    "torso": c(dy=[0, -1, -3, 0], sx=[100, 92, 108, 100], sy=[100, 108, 94, 100]),
    "head": c(dy=[0, 0, -1, 0]),
    "armF": c(rot=[0, 20, -60, -10]), "armB": c(rot=[0, -20, -50, -6]), "tail": c(rot=[0, 14, -40, -4])}),
}
E.build(OUT, "hyalia", G, actions, paint,
        E.license_for("hyalia", "hyalia.py", "sky jellyfish: translucent lilac-rose glass bell with a luminous cyan core and trailing stinging filaments."),
        accents=accents)
