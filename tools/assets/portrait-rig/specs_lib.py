"""Importable spec helpers shared by gen-specs.py and the roster24 spec generators (R0): R/FULL/DIRS, the SPECS and ANIMS tables, and the
bone/glow/biped/blobby/arm_curves builders. Non-biped bodies (quadruped first) are built from landmarks by the plan templates in
body_plans/ (see gen-r24.py), not here.
Import with `sys.path.insert(0, HERE)` (python -I does not add the script directory)."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda x0, y0, x1, y1: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
FULL = R(0, 0, 400, 400)
DIRS = {"SE": {"body": {"sx": 94}}, "S": {"body": {"sx": 88}}, "N": {"body": {"sx": 88}}, "NE": {"body": {"sx": 94}}}
SPECS = {}
ANIMS = {}


def bone(id_, parent, head, poly=None, feather=12):
    b = {"id": id_, "head": head}
    if parent:
        b["parent"] = parent
    if poly:
        b["feather"] = feather
        b["poly"] = poly
    return b


def glow(id_, bone_, at, r, color, gain=0.9, hot=0.5):
    return {"id": id_, "bone": bone_, "at": at, "r": r, "color": color, "gain": gain, "hot": hot}


def biped(h, feet, hd, eye, color, rim, head_poly, armB, armF, legB, legF):
    SPECS[h] = {
        "source": f"public/assets/img/map/{h}Large.png", "frame": 240, "box": [20, 24, 200, 200], "res": 2, "feet": feet,
        "matte": {"minIsland": 40, "band": 1, "fringeLum": 35},
        "rim": {"color": rim, "dir": [-0.55, -0.85], "strength": 0.22, "width": 1.6},
        "shadow": {"rx": 120, "ry": 13, "alpha": 72, "dy": 2},
        "bones": [
            bone("root", None, feet),
            bone("torso", "root", [200, 290], FULL, 18),
            bone("legB", "root", [legB[0], 300], R(legB[0] - 60, 296, legB[1], 400), 10),
            bone("legF", "root", [legF[1], 300], R(legB[1], 296, legF[1] + 70, 400), 10),
            bone("head", "torso", hd, head_poly, 10),
            bone("armB", "torso", armB[0], armB[1], 12),
            bone("armF", "torso", armF[0], armF[1], 12),
        ],
        "glows": [glow("eye", "head", eye, 6, color)],
        "dirOffsets": {**DIRS, "SE": {"body": {"sx": 94}, "head": {"dy": 4}}, "S": {"body": {"sx": 88}, "head": {"dy": 6}},
                       "N": {"body": {"sx": 88}, "head": {"dy": -6}}, "NE": {"body": {"sx": 94}, "head": {"dy": -4}}},
    }
    a = json.load(open(os.path.join(HERE, "spec", "pax.anim.json")))
    for act in a.values():
        for k in ("gem1", "gem2"):
            act["curves"].pop(k, None)
    ANIMS[h] = a


def blobby(h, feet, glows, rim, wave, deform_poly, bones):
    SPECS[h] = {
        "source": f"public/assets/img/map/{h}Large.png", "frame": 240, "box": [20, 24, 200, 200], "res": 2, "feet": feet,
        "matte": {"minIsland": 40, "band": 1, "fringeLum": 35},
        "rim": {"color": rim, "dir": [-0.5, -0.87], "strength": 0.2, "width": 1.6},
        "shadow": {"rx": 110, "ry": 12, "alpha": 60, "dy": 2},
        "bones": bones, "glows": glows, "dirOffsets": DIRS,
    }
    if deform_poly:
        SPECS[h]["deformMask"] = {"feather": 18, "polys": [deform_poly]}
    gl = lambda a: {g["id"]: {"bright": a} for g in glows}
    gone = {g["id"]: {"alpha": [256, 180, 90, 0]} for g in glows}
    tag = {g["id"]: {"alpha": [128, 220, 256, 256]} for g in glows}
    wv = {"body": {"wave": {"axis": "y", "ampPx": wave[0], "wavelengthPx": wave[1], "phasePerFrame": 90}}} if wave else None

    def act(frames, curves, deform=None):
        o = {"frames": frames, "curves": curves}
        if deform:
            o["deform"] = deform
        return o

    ANIMS[h] = {
        "idle": act(4, {"torso": {"sy": [100, 101, 102, 101], "rot": [0, -1, -1, 0]}, **gl([256, 330, 290, 360])}, wv),
        "walk": act(4, {"body": {"dy": [0, -3, 0, -3]}, "torso": {"rot": [2, 0, -2, 0]}, **gl([300, 270, 320, 280])}, wv),
        "cast": act(4, {"body": {"dx": [-4, 8, 5, 0]}, "torso": {"rot": [-5, 6, 4, 1], "sy": [100, 103, 102, 100]}, **gl([300, 512, 420, 320])}),
        "hurt": act(2, {"body": {"dx": [-7, -3]}, "torso": {"rot": [-6, -3]}, **gl([160, 220])}),
        "guard": act(2, {"body": {"sy": [94, 93]}, "torso": {"rot": [3, 3]}, **gl([300, 330])}),
        "dash": act(3, {"body": {"dx": [4, 8, 6], "sx": [103, 104, 103], "sy": [98, 97, 98]}, "torso": {"rot": [8, 9, 7]}, **gl([360, 400, 360])}),
        "ko": act(4, {"body": {"rot": [-2, -5, -7, -8], "sy": [97, 91, 85, 82], "dy": [0, 1, 2, 2]}, "torso": {"rot": [3, 6, 9, 10]},
                      **gone, "shadow": {"alpha": [256, 240, 220, 200]}}),
        "victory": act(4, {"torso": {"rot": [-2, -5, -6, -5], "sy": [100, 103, 104, 103]}, **gl([320, 460, 512, 440])}),
        "tagIn": act(4, {"body": {"dy": [-8, -3, 1, 0], "sy": [101, 101, 97, 100], "alpha": [128, 220, 256, 256]},
                         "shadow": {"alpha": [60, 140, 256, 256], "sx": [70, 85, 100, 100]}, **tag}),
    }


def arm_curves(h, table):
    for name, (f, b) in table.items():
        ANIMS[h][name]["curves"]["armF"] = {"rot": f}
        ANIMS[h][name]["curves"]["armB"] = {"rot": b}


def write_specs(names=None):
    """Writes spec/<hero>.json and spec/<hero>.anim.json for every hero in SPECS (or `names`)."""
    for h in names or list(SPECS):
        for suffix, data in ((".json", SPECS[h]), (".anim.json", ANIMS[h])):
            with open(os.path.join(HERE, "spec", h + suffix), "w") as f:
                json.dump(data, f, indent=1)
                f.write("\n")
