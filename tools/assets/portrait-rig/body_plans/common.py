"""Shared pieces of the roster24 body-plan templates (R3a): landmark validation, capsule skin polygons, integer motion curves, element
presets and the spec/anim skeleton. A template module exposes `build(landmarks) -> (spec, anim)`; the pair is what prep.py reads
(spec/<hero>.json + spec/<hero>.anim.json). Pure Python (no numpy), deterministic: the same landmarks give byte-identical JSON."""
import math
import zlib

FRAME = 240
FRAMES = {"idle": 4, "walk": 4, "cast": 4, "hurt": 2, "guard": 2, "dash": 3, "ko": 4, "victory": 4, "tagIn": 4}  # keys per action (sheet-spec)
LOOPING = ("idle", "walk", "victory")
DIRS = {"SE": {"body": {"sx": 94}, "head": {"dy": 4}}, "S": {"body": {"sx": 88}, "head": {"dy": 6}},
        "N": {"body": {"sx": 88}, "head": {"dy": -6}}, "NE": {"body": {"sx": 94}, "head": {"dy": -4}}}
LICENSE = (
    "Rig parts for {hero}: the painting is generated with Stable Diffusion XL (stabilityai/stable-diffusion-xl-base-1.0; sd-turbo/SDXL-Turbo for\n"
    "refinements) under the CreativeML Open RAIL++-M licence, which permits commercial use of the outputs with its use-based restrictions;\n"
    "the repository owner holds the outputs. Cut, matted and animated by tools/assets/portrait-rig (prep.py, body_plans); numpy/PIL only.\n"
)
ELEMENTS = {  # element -> rim colour; the motion presets are in deform_for / glow_curve
    "fire": [255, 190, 120], "water": [150, 210, 255], "air": [220, 235, 255], "earth": [200, 190, 160], "crystal": [210, 230, 255],
}
WIDTHS = {"body": 70, "neck": 30, "head": 45, "jaw": 24, "legs": 22, "tail": 18, "trunk": 16, "ears": 16}


class PlanError(ValueError):
    """Bad landmarks: the message names the missing or malformed field."""


def is_pt(v):
    return isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(x, int) and not isinstance(x, bool) for x in v)


def need_pt(v, path, plan):
    if not is_pt(v):
        raise PlanError(f"{plan}: {path} needs one [x, y] integer point")
    return [int(v[0]), int(v[1])]


def need_pts(v, path, plan, lo, hi):
    if not isinstance(v, (list, tuple)) or not lo <= len(v) <= hi or not all(is_pt(p) for p in v):
        raise PlanError(f"{plan}: {path} needs {lo}-{hi} [x, y] points")
    return [[int(p[0]), int(p[1])] for p in v]


def start(lm, plan):
    """Validates the plan name, canvas, resolution and feet; returns (res, box, feet)."""
    if lm.get("plan") != plan:
        raise PlanError(f"{plan}: landmarks say plan {lm.get('plan')!r}")
    if not isinstance(lm.get("source"), str):
        raise PlanError(f"{plan}: source (repo-relative png path) is missing")
    res = lm.get("res", 2)
    if res not in (1, 2):
        raise PlanError(f"{plan}: res must be 1 or 2")
    cv = lm.get("canvas")
    if not is_pt(cv) or cv[0] <= 0 or cv[1] <= 0:
        raise PlanError(f"{plan}: canvas needs [width, height] in px")
    if cv[0] % res or cv[1] % res:
        raise PlanError(f"{plan}: canvas {cv} does not divide by res {res}")
    w, h = cv[0] // res, cv[1] // res
    if w > FRAME - 4 or h > FRAME - 28:
        raise PlanError(f"{plan}: canvas {cv} at res {res} does not fit the {FRAME} px frame with a 2 px margin")
    feet = need_pt(lm.get("feet"), "feet", plan)
    if not (0 <= feet[0] <= cv[0] and 0 <= feet[1] <= cv[1]):
        raise PlanError(f"{plan}: feet {feet} lie outside the canvas {cv}")
    return res, [(FRAME - w) // 2, 224 - h, w, h], feet


def capsule(p0, p1, hw):
    """A rectangle around p0..p1 (ends extended by hw/2), half-width hw: the grid-skin weight polygon of one bone."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    n = math.hypot(dx, dy) or 1.0
    ux, uy = dx / n, dy / n
    e = hw / 2
    a = (p0[0] - ux * e, p0[1] - uy * e)
    b = (p1[0] + ux * e, p1[1] + uy * e)
    nx, ny = -uy * hw, ux * hw
    return [[round(a[0] + nx), round(a[1] + ny)], [round(b[0] + nx), round(b[1] + ny)], [round(b[0] - nx), round(b[1] - ny)], [round(a[0] - nx), round(a[1] - ny)]]


def circle_poly(x, y, r):
    k = 0.7071
    return [[round(x + dx * r), round(y + dy * r)] for dx, dy in ((1, 0), (k, k), (0, 1), (-k, k), (-1, 0), (-k, -k), (0, -1), (k, -k))]


SIN4 = (0, 100, 0, -100)  # percent of the amplitude at 0/90/180/270 deg (a 4-key loop)


def loop(amp, lag=0, n=4):
    """A 4-key sine-like loop of integers: amp * sin(90 deg * (k - lag)); a whole-key lag. n 4 only (the looping actions have 4 keys)."""
    assert n == 4
    return [round(amp * SIN4[(k - lag) % 4] / 100) for k in range(4)]


def rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def bone(id_, parent, head, poly=None, feather=12, tip=None, front=False):
    b = {"id": id_, "head": list(head)}
    if parent:
        b["parent"] = parent
    if tip:
        b["tip"] = list(tip)
    if front:
        b["front"] = True
    if poly:
        b["feather"] = feather
        b["poly"] = poly
    return b


class Curves:
    """action -> bone/part -> channel -> list of ints; `put` checks the length against the sheet's key count."""

    def __init__(self):
        self.a = {n: {} for n in FRAMES}

    def put(self, action, target, channel, values):
        assert len(values) == FRAMES[action], f"{action}.{target}.{channel}: {len(values)} values, need {FRAMES[action]}"
        self.a[action].setdefault(target, {})[channel] = [int(v) for v in values]


def glow_curve(element, index, n):
    """Brightness keys (512 = double): fire flickers irregularly, crystal glints are staggered per glow, the rest breathe gently."""
    base = {"fire": [256, 330, 290, 360, 300, 340], "crystal": [256, 256, 256, 420]}.get(element, [256, 300, 330, 300])
    return [base[(k + index) % len(base)] for k in range(n)]


def deform_for(element, action, frames, seed):
    """The body deformer of one action (None = rigid). One wave axis + one noise field per hero, scaled per vertex by deformMask."""
    if action in ("hurt", "guard", "ko", "tagIn") or element in (None, "crystal"):
        return None
    s = zlib.crc32(f"{seed}:{action}".encode()) % 99991
    if element == "fire":
        return {"noise": {"ampPx": 2 if action in ("cast", "dash") else 1, "cellPx": 12, "seed": s}}
    if element == "water":
        return {"wave": {"axis": "y", "ampPx": 2 if action in ("cast", "dash") else 1, "wavelengthPx": 110, "phasePerFrame": 360 // frames}}
    return {"noise": {"ampPx": 2, "cellPx": 20, "seed": s}, "wave": {"axis": "y", "ampPx": 1, "wavelengthPx": 140, "phasePerFrame": 360 // frames}}


def spec_skeleton(lm, plan, bones, glows, res, box, feet):
    """The spec dict common to every template (frame, box, feet, matte, rim, shadow, glows, dirOffsets, deformMask, licence, skin)."""
    el = lm.get("fx", {}).get("element")
    if el is not None and el not in ELEMENTS:
        raise PlanError(f"{plan}: fx.element {el!r} is not one of {sorted(ELEMENTS)}")
    spec = {
        "source": lm["source"], "frame": FRAME, "box": box, "res": res, "feet": feet,
        "matte": {"minIsland": 40, "band": 1, "fringeLum": 35},
        "rim": {"color": ELEMENTS.get(el, [220, 220, 220]), "dir": [-0.55, -0.85], "strength": 0.22, "width": 1.6},
        "shadow": {"rx": min(120, box[2] * res // 3), "ry": 13, "alpha": 66, "dy": 2},
        "bones": bones, "glows": glows, "dirOffsets": DIRS, "license": LICENSE.format(hero=lm.get("hero", "<hero>")),
    }
    zones = lm.get("fx", {}).get("zones")
    if zones:
        spec["deformMask"] = {"feather": 16, "polys": [circle_poly(x, y, r) for x, y, r in zones]}
    skin = lm.get("skin", "grid")
    if skin == "seam":
        spec["skin"] = {"mesh": "seam", "step": 12, "weights": "geodesic"}
    elif skin != "grid":
        raise PlanError(f"{plan}: skin must be 'grid' or 'seam'")
    return spec


def read_glows(lm, plan, bone_ids):
    out = []
    for g in lm.get("glows", []):
        for k in ("id", "at", "r", "color"):
            if k not in g:
                raise PlanError(f"{plan}: glows[].{k} is missing")
        b = g.get("bone", "head")
        if b not in bone_ids:
            raise PlanError(f"{plan}: glow {g['id']} binds to unknown bone {b}")
        e = {"id": g["id"], "bone": b, "at": need_pt(g["at"], f"glows.{g['id']}.at", plan), "r": g["r"], "color": g["color"], "gain": g.get("gain", 0.9), "hot": g.get("hot", 0.5)}
        if "hideIn" in g:
            e["hideIn"] = g["hideIn"]
        out.append(e)
    return out
