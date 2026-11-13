"""Procedural Curomo rig (grim water elemental: a serpentine torrent of dark teal water, frozen spike crest, two cold glowing eyes, no limbs).
Run: python3 tools/assets/rig-gen/curomo.py <out_rig_dir> (needs Pillow + numpy; helpers in elemental.py). Parts keep the old ids
(tail, wingB, torso, head, wingF: the two wing parts are now ice-shard crests) and the same 80x80 frame."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image

OUT = sys.argv[1]
WATER = [(0.0, (8, 22, 28)), (0.4, (18, 58, 66)), (0.75, (40, 100, 108)), (1.0, (110, 160, 168))]
ICE = [(0.0, (60, 96, 120)), (0.5, (140, 184, 204)), (1.0, (214, 232, 240))]
EYE = (190, 245, 255)

body = E.catmull([(30, 78), (22, 66), (30, 54), (44, 46), (36, 34), (40, 24)], 8)
tailp = E.catmull([(30, 78), (18, 76), (8, 68), (6, 58)], 8)


def widths(n, a, b): return [a + (b - a) * (i / (n - 1)) for i in range(n)]


G = {
 "tail": dict(polys=[E.ribbon(tailp, widths(len(tailp), 6, 1.5))], joint=(30, 74), z=1, parent="torso", kind="water"),
 "wingB": dict(polys=[[(40, 48), (50, 40), (60, 44), (52, 50)], [(36, 36), (46, 24), (50, 34)]], joint=(38, 44), z=2, parent="torso", kind="ice", dark=0.15),
 "torso": dict(polys=[E.ribbon(body, widths(len(body), 11, 8))], joint=(32, 62), z=5, parent=None, kind="water"),
 "head": dict(polys=[[(34, 28), (38, 17), (50, 14), (62, 20), (54, 28), (44, 33)], [(37, 18), (30, 4), (42, 14)], [(44, 14), (46, 2), (51, 14)], [(50, 15), (58, 6), (57, 18)]],
              joint=(40, 28), z=7, parent="torso", kind="water", ice_polys=3),
 "wingF": dict(polys=[[(22, 62), (10, 50), (16, 46), (28, 54)], [(26, 50), (16, 34), (24, 38), (32, 48)], [(34, 44), (30, 28), (38, 36)]], joint=(30, 56), z=8, parent="torso", kind="ice"),
}


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 10)
    if g["kind"] == "ice":
        core = E.blur(E.warp(ma, (n1 - .5) * SS * 1.5, (n2 - .5) * SS * 1.5), SS * .4)
        d1, d2, nid, vx, vy = E.voronoi(rs, 14, stretch=(1.0, 2.2))
        cv = np.take(rs.rand(14), nid).astype(np.float32)
        light = E.bevel_light(np.clip(d1 / 0.07, 0, 1), 24.0)
        t = np.clip(0.3 + 0.35 * cv + 0.3 * light - g.get("dark", 0) + 0.2 * n2, 0, 1)
        rgb = E.ramp(ICE, t) * np.array([0.8, 0.9, 1.0], np.float32)
        rgb = rgb * (1 - 0.35 * np.clip(1 - E.blur(core, SS * 2) * 1.2, 0, 1)[..., None])
        return Image.fromarray(np.dstack([rgb, core * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    core = E.blur(E.warp(ma, (n1 - .5) * SS * 3.5, (n2 - .5) * SS * 3.5), SS * .7)
    flow = E.fbm(rs, 4, 3, sx=2.2, sy=0.45)  # vertical flow streaks
    swirl = 0.5 + 0.5 * np.sin((yy * 18 + xx * 6 + n1 * 5) * 3.1416)
    t = np.clip(0.18 + 0.5 * flow + 0.15 * swirl * flow + 0.25 * E.bevel_light(core, 18.0), 0, 1)
    rgb = E.ramp(WATER, t)
    foam = np.clip((E.fbm(rs, 14, 2, sx=2.0, sy=0.7) - 0.66) * 6, 0, 1) * (0.4 + 0.6 * swirl)
    rgb = rgb * (1 - foam[..., None] * 0.6) + np.array([150, 190, 196], np.float32) * foam[..., None] * 0.6
    edge = np.clip(1 - E.blur(core, SS * 2.2) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.35 * edge[..., None])
    alpha = core * (0.94 - 0.2 * edge)
    a = np.dstack([rgb, alpha * 255]).astype(np.float32)
    if g.get("ice_polys"):  # frozen crest spikes over the head
        sm = E.poly_mask(polys[1:])
        d1, d2, nid, vx, vy = E.voronoi(rs, 8, stretch=(1, 2))
        light = E.bevel_light(np.clip(d1 / 0.06, 0, 1), 24)
        ic = E.ramp(ICE, np.clip(0.35 + 0.4 * light + 0.3 * n2, 0, 1)) * 0.85
        a[..., :3] = a[..., :3] * (1 - sm[..., None]) + ic * sm[..., None]
        a[..., 3] = np.maximum(a[..., 3], sm * 255)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(48, 22), (55, 21.5)] if view == "E" else [(46, 24), (54, 23)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.1, 0.8, EYE, (90, 200, 230))
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"torso": c(dy=[0, -1, -1, 0], rot=[0, 1, 0, -1]), "head": c(rot=[0, 2, 3, 1], dy=[0, 1, 1, 0]),
    "wingF": c(rot=[0, 3, 5, 2]), "wingB": c(rot=[0, -3, -5, -2]), "tail": c(rot=[0, 5, 10, 5])}),
 "walk": dict(frames=4, curves={"torso": c(rot=[-3, 0, 3, 0], dy=[1, 0, 1, 0]), "head": c(rot=[3, 0, -3, 0]),
    "wingF": c(rot=[-6, 0, 6, 0]), "wingB": c(rot=[6, 0, -6, 0]), "tail": c(rot=[10, 0, -10, 0])}),
 "cast": dict(frames=4, curves={"torso": c(rot=[0, -4, -7, 2], dy=[0, -2, -3, 1]), "head": c(rot=[0, -8, -14, 4]),
    "wingF": c(rot=[0, -16, -28, -6]), "wingB": c(rot=[0, 14, 24, 6]), "tail": c(rot=[0, 10, 18, 4])}),
}
E.build(OUT, "curomo", G, actions, paint,
        E.license_for("curomo", "curomo.py", "grim water elemental: serpentine torrent of dark teal water with flow streaks and foam, frozen ice-shard crest, cold glowing eyes; deep teal and glacial blue palette."),
        accents=accents)
