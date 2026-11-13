"""Procedural Cyclonius rig (grim air elemental: a giant tornado of black storm cloud with a funnel of wind, lightning forking through it,
two blazing white eyes, no person). Run: python3 tools/assets/rig-gen/cyclonius.py <out_rig_dir> (needs Pillow + numpy; helpers in
elemental.py). Parts keep the old ids (tail, armB, torso, head, armF: the arms are cloud tendrils) and the same 80x80 frame."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
STORM = [(0.0, (10, 11, 16)), (0.4, (30, 34, 44)), (0.75, (66, 72, 84)), (1.0, (130, 138, 150))]
EYE = (255, 255, 255)

G = {
 "tail": dict(polys=[[(34, 80), (28, 70), (52, 70), (46, 80)]], joint=(40, 72), z=1, parent="torso", dark=0.1, tip=True),
 "armB": dict(polys=[[(52, 34), (62, 30), (72, 38), (70, 46), (60, 42), (54, 46)]], joint=(52, 40), z=2, parent="torso", dark=0.1),
 "torso": dict(polys=[[(22, 34), (60, 34), (56, 46), (52, 56), (47, 66), (42, 74), (36, 74), (32, 62), (28, 50)]], joint=(40, 52), z=5, parent=None, bolts=True),
 "head": dict(polys=[[(18, 30), (14, 20), (24, 10), (40, 6), (56, 10), (64, 20), (60, 30), (44, 36), (28, 36)]], joint=(40, 28), z=7, parent="torso", dark=0.0),
 "armF": dict(polys=[[(24, 40), (14, 40), (6, 48), (8, 58), (16, 52), (24, 54)]], joint=(24, 44), z=8, parent="torso", dark=-0.05),
}


def bolt(rs, x0, y0, x1, y1, n=7, jit=2.8):
    pts = [(x0, y0)]
    for i in range(1, n):
        t = i / n
        pts.append((x0 + (x1 - x0) * t + rs.uniform(-jit, jit), y0 + (y1 - y0) * t + rs.uniform(-jit, jit)))
    pts.append((x1, y1))
    return pts


def paint(name, view, polys, g, seed):
    rs = np.random.RandomState(seed)
    xx, yy = E.grid()
    ma = E.poly_mask(polys)
    n1, n2 = E.fbm(rs, 5), E.fbm(rs, 11)
    core = E.blur(E.warp(ma, (n1 - .5) * SS * 6, (n2 - .5) * SS * 5), SS * 1.0)
    # wispy edge: add a streaky fringe pulled sideways, like wind-torn cloud
    fr = E.blur(E.warp(E.blur(ma, SS * 2.4), SS * (3 + 5 * E.fbm(rs, 6, 3, sx=0.4, sy=2.5)), 0), SS * 0.6)
    fa = np.clip((fr - 0.35) * 2.4, 0, 1) * 0.55
    rot = 0.5 + 0.5 * np.sin((yy * 22 - xx * 9 + n1 * 6) * 3.1416)  # swirl bands
    streak = E.fbm(rs, 5, 3, sx=0.45, sy=2.4)
    t = np.clip(0.22 + 0.4 * streak + 0.25 * rot * streak + 0.2 * (n2 - .5) + 0.25 * E.bevel_light(core, 14.0) - g.get("dark", 0), 0, 1)
    rgb = E.ramp(STORM, t)
    edge = np.clip(1 - E.blur(core, SS * 2.4) * 1.15, 0, 1)
    rgb = rgb * (1 - 0.4 * edge[..., None])
    alpha = np.maximum(core * (0.97 - 0.15 * edge), fa)
    out = np.dstack([rgb, alpha * 255]).astype(np.float32)
    if g.get("bolts"):  # forking lightning inside the funnel
        for k in range(2):
            x0 = 26 + rs.rand() * 26
            pts = bolt(rs, x0, 36, x0 + rs.uniform(-8, 8), 68)
            for r, col, w in ((SS * 2.6, (130, 160, 220), 0), (0, (245, 248, 255), 0)):
                lg = Image.new("L", (W, W), 0)
                d = ImageDraw.Draw(lg)
                d.line([(x * SS, y * SS) for x, y in pts], fill=255, width=max(1, int(SS * (0.9 if r == 0 else 2.6))))
                if r:
                    lg = lg.filter(ImageFilter.GaussianBlur(r))
                m = np.asarray(lg, np.float32) / 255.0 * (out[..., 3] > 30) * (0.9 if r == 0 else 0.5)
                out[..., :3] = out[..., :3] * (1 - m[..., None]) + np.array(col, np.float32) * m[..., None]
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")


def accents(name, view, im, tf):
    if name != "head" or view == "NE":
        return None
    pts = [(46, 21), (55, 20.5)] if view == "E" else [(40, 23), (52, 22)]
    for (x, y) in pts:
        x, y = E.apply(tf, (x, y))
        im = E.glow_dot(im, x, y, 1.6, 1.0, EYE, (200, 220, 255), 3.4)
    return im


def c(**kw): return kw


actions = {
 "idle": dict(frames=4, curves={"torso": c(dy=[0, -1, -1, 0], rot=[0, 1, 0, -1]), "tail": c(rot=[0, 6, 12, 6]), "head": c(rot=[0, 2, 3, 1]),
    "armF": c(rot=[0, 4, 7, 3]), "armB": c(rot=[0, -4, -7, -3])}),
 "walk": dict(frames=4, curves={"tail": c(rot=[10, 0, -10, 0]), "torso": c(rot=[-3, 0, 3, 0], dy=[1, 0, 1, 0]), "head": c(rot=[3, 0, -3, 0]),
    "armF": c(rot=[-10, 0, 10, 0]), "armB": c(rot=[10, 0, -10, 0])}),
 "cast": dict(frames=4, curves={"tail": c(rot=[0, 12, 22, 6]), "torso": c(rot=[0, -4, -8, 2], dy=[0, -1, -2, 1]), "head": c(rot=[0, -8, -14, 4]),
    "armF": c(rot=[0, -30, -55, -10]), "armB": c(rot=[0, -24, -46, -8])}),
}
E.build(OUT, "cyclonius", G, actions, paint,
        E.license_for("cyclonius", "cyclonius.py", "grim air elemental: black storm-cloud tornado with swirl banding, wispy torn edges, forking lightning, blazing white eyes; storm grey and cold white palette."),
        accents=accents)
