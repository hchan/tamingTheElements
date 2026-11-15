"""Procedural Zephra rig (air ranged: a storm-wisp, a small tight knot of bruise-grey cloud with a white-hot spark core and three trailing
lightning tendrils; it hovers, never walks). Run: python3 tools/assets/rig-gen/zephra.py <out_rig_dir> (Pillow + numpy; helpers in elemental.py
and b1_common.py). Parts keep the ids tail, armB, torso, head, armF (the cloud body, its spark core and the tendrils). Same 80x80 frame; the sim
size is small (60), so the body sits compact in the frame. Grey-violet with electric yellow keeps it apart from Hyalia's lilac glass."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from b1_common import make_paint, ribbon_poly

OUT = sys.argv[1]
CLOUD = [(0.0, (36, 34, 56)), (0.4, (84, 82, 120)), (0.75, (150, 148, 184)), (1.0, (216, 214, 236))]
SPARK = [(0.0, (190, 150, 30)), (0.5, (252, 226, 90)), (1.0, (255, 255, 226))]
BOLT = [(0.0, (120, 120, 210)), (0.5, (230, 226, 120)), (1.0, (255, 255, 236))]
# QA r58: the wisp read tiny next to the other heroes; every coordinate is grown (1.5x wide, 1.1x tall) about the feet centre (40, 79) to fill the common height band
K = 1.5
def T(p): return (40 + (p[0] - 40) * K, 79 + (p[1] - 79) * 1.1)
def TL(l): return [T(p) for p in l]
t1 = ribbon_poly(TL([(34, 52), (28, 60), (34, 68), (26, 78)]), 2.4 * K, 0.7 * K, 10)
t2 = ribbon_poly(TL([(46, 52), (52, 60), (44, 68), (52, 78)]), 2.4 * K, 0.7 * K, 10)
t3 = ribbon_poly(TL([(40, 54), (38, 62), (44, 70), (38, 79)]), 2.6 * K, 0.7 * K, 10)
core = TL([(36, 40), (38, 35), (43, 34), (47, 37), (47, 43), (42, 46), (37, 45)])
G = {
 "tail": dict(polys=[t1], joint=T((34, 52)), z=1, parent="torso"),
 "armB": dict(polys=[t2], joint=T((46, 52)), z=2, parent="torso"),
 "torso": dict(polys=[TL([(26, 46), (30, 36), (36, 30), (42, 38), (48, 28), (54, 36), (52, 44), (58, 52), (46, 54), (40, 60), (34, 52)])], joint=T((40, 42)), z=5, parent=None),
 "head": dict(polys=[TL([(34, 40), (37, 34), (43, 32), (48, 36), (48, 44), (42, 48), (36, 46)])], joint=T((41, 40)), z=7, parent="torso"),
 "armF": dict(polys=[t3], joint=T((40, 54)), z=8, parent="torso"),
}
P = dict(body=CLOUD, opacity=0.85, rim=(236, 232, 255), cells=0, facet=0.0, rag=5.0, bevel=12.0, vert=0.5,
         sparks=dict(rate=0.9975, color=(255, 250, 170)),
         parts={
   "head": dict(cells=0, overlays=[dict(polys=[core], ramp=SPARK, style="soft", opacity=0.98)]),
   "tail": dict(cells=0, overlays=[dict(polys=[t1], ramp=BOLT, style="soft")]),
   "armB": dict(cells=0, overlays=[dict(polys=[t2], ramp=BOLT, style="soft")]),
   "armF": dict(cells=0, overlays=[dict(polys=[t3], ramp=BOLT, style="soft")])})
paint = make_paint(P)


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    x, y = E.apply(tf, T((42, 40) if view == "E" else (41, 40)))
    return E.glow_dot(im, x, y, 2.2 * K, 2.0 * K, (255, 255, 236), (250, 226, 90), 3.8 * K)


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={  # a jittery hover
    "torso": c(dy=[0, -1, 0, -1], dx=[0, 1, 0, -1]), "head": c(dy=[0, -1, 0, 0]),
    "armF": c(rot=[0, 7, -6, 4]), "armB": c(rot=[0, -7, 6, -4]), "tail": c(rot=[0, 8, -7, 5])}),
 "walk": dict(frames=4, curves={  # a darting glide
    "torso": c(dy=[0, -2, 0, -2], rot=[3, 0, -3, 0]), "head": c(dy=[0, -1, 0, -1]),
    "armF": c(rot=[14, -6, -14, 4]), "armB": c(rot=[-14, 6, 14, -4]), "tail": c(rot=[12, -4, -12, 4])}),
 "cast": dict(frames=4, curves={  # the cloud tightens and a spark is flung forward
    "torso": c(dy=[0, -1, -2, 0], sx=[100, 92, 108, 100], sy=[100, 108, 94, 100]), "head": c(dy=[0, 0, -1, 0]),
    "armF": c(rot=[0, 24, -60, -8]), "armB": c(rot=[0, -20, -50, -6]), "tail": c(rot=[0, 16, -40, -4])}),
}
E.build(OUT, "zephra", G, actions, paint,
        E.license_for("zephra", "zephra.py", "storm-wisp: a small bruise-grey cloud knot with a white-hot spark core and trailing lightning tendrils."),
        accents=accents)
