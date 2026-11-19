"""Quadruped template (kindrel, brazgor, nykra, quarrak, durrok, zephra): root(feet) > spine0 > spine1 > neck0..n > head > jaw, tail chain
on spine0, up to four legs (hip, [knee], paw) and optional extras (trunk chain, ear). Walk is a diagonal trot with planted paws solved
from the bone lengths; the head faces east or west as the landmarks say (fs = +1 east). Landmarks: r3a-plan.md section 2.

  joints.spine  2 points (hips end, shoulders end)     joints.neck 1-3 points     joints.head 1 point     joints.jaw 1 point
  joints.mouth  optional point (snout tip)             joints.tail 2-6 points (root..tip)
  joints.legs   {FN, FF, HN, HF}: 2-3 points each (hip, [knee], paw), at least two legs; N = near, F = far
  extras.trunk  2-5 points (root..tip), extras.ears  1-2 chains of 2 points (root, tip)
  tune          {swing deg 4..22 (14), lift art px (3), sub {action: 1..4}}"""
from .common import (FRAMES, PlanError, WIDTHS, Curves, bone, capsule, circle_poly, deform_for, glow_curve, loop, need_pt, need_pts, read_glows,
                     rect, spec_skeleton, start)
import math

PLAN = "quadruped"
LEGS = ("FF", "HF", "FN", "HN")  # far legs first (drawn / overridden first)
PAIR_A = ("FN", "HF")  # diagonal trot: pair A, pair B = the other two, two keys apart
SUB = {"idle": 4, "walk": 2}


def _rot(p, a, c):
    """Point p rotated by a degrees (clockwise, y down) about c."""
    t = math.radians(a)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(t) - y * math.sin(t), c[1] + x * math.sin(t) + y * math.cos(t))


def _paw_y(leg, a, b):
    hip, paw = leg[0], leg[-1]
    if len(leg) == 2:
        return _rot(paw, a, hip)[1]
    knee = leg[1]
    return _rot(_rot(paw, b, knee), a, hip)[1]


def _solve_b(leg, a, target, fs):
    """The knee rotation (whole degrees) that puts the paw at y=target; ties fold the paw back (+fs)."""
    if len(leg) == 2:
        return 0
    return min((fs * n for n in range(0, 51)), key=lambda b: (round(abs(_paw_y(leg, a, b) - target) * 4), abs(b)))


def read(lm):
    res, box, feet = start(lm, PLAN)
    j = lm.get("joints")
    if not isinstance(j, dict):
        raise PlanError(f"{PLAN}: joints is missing")
    d = {
        "spine": need_pts(j.get("spine"), "joints.spine", PLAN, 2, 2), "neck": need_pts(j.get("neck"), "joints.neck", PLAN, 1, 3),
        "head": need_pt(j.get("head"), "joints.head", PLAN), "jaw": need_pt(j.get("jaw"), "joints.jaw", PLAN),
        "tail": need_pts(j.get("tail"), "joints.tail", PLAN, 2, 6),
    }
    legs = j.get("legs")
    if not isinstance(legs, dict):
        raise PlanError(f"{PLAN}: joints.legs needs {{FN, FF, HN, HF}}")
    d["legs"] = {k: need_pts(legs[k], f"joints.legs.{k}", PLAN, 2, 3) for k in LEGS if k in legs}
    if len(d["legs"]) < 2 or set(legs) - set(LEGS):
        raise PlanError(f"{PLAN}: joints.legs needs at least two of FN FF HN HF (got {sorted(legs)})")
    fs = 1 if d["head"][0] >= (d["spine"][0][0] + d["spine"][1][0]) / 2 else -1
    d["mouth"] = need_pt(j["mouth"], "joints.mouth", PLAN) if "mouth" in j else [d["jaw"][0] + fs * (abs(d["jaw"][0] - d["head"][0]) + 10), d["jaw"][1]]
    ex = lm.get("extras", {})
    d["trunk"] = need_pts(ex["trunk"], "extras.trunk", PLAN, 2, 5) if "trunk" in ex else None
    d["ears"] = [need_pts(e, "extras.ears", PLAN, 2, 2) for e in ex.get("ears", [])]
    if len(d["ears"]) > 2:
        raise PlanError(f"{PLAN}: extras.ears takes at most 2 chains")
    tune = lm.get("tune", {})
    swing = tune.get("swing", 14)
    if not isinstance(swing, int) or not 4 <= swing <= 22:
        raise PlanError(f"{PLAN}: tune.swing must be an integer 4..22")
    sub = {**SUB, **tune.get("sub", {})}
    if any(a not in FRAMES or not isinstance(v, int) or not 1 <= v <= 4 for a, v in sub.items()):
        raise PlanError(f"{PLAN}: tune.sub needs {{action: 1..4}}")
    return res, box, feet, d, fs, swing, tune.get("lift", 3), sub


def _chain(prefix, pts, parent, width, out, tip_poly=True):
    """Bones prefix0..prefixN along pts (heads root..tip, the last point is the tip of the last bone); returns the ids."""
    ids = []
    for i in range(len(pts) - 1):
        id_ = f"{prefix}{i}"
        out.append(bone(id_, ids[-1] if ids else parent, pts[i], capsule(pts[i], pts[i + 1], width) if tip_poly else None, 10, tip=pts[i + 1]))
        ids.append(id_)
    return ids


def build(lm):
    res, box, feet, d, fs, swing, lift_art, sub = read(lm)
    w = {**WIDTHS, **lm.get("widths", {})}
    seam = lm.get("skin", "grid") == "seam"
    cv = lm["canvas"]
    sp = d["spine"]
    bones = [bone("root", None, feet)]
    neck_pts = [sp[1]] + d["neck"] + [d["head"]]
    bones.append(bone("spine0", "root", sp[0], None if seam else rect(0, 0, cv[0], cv[1]), 18, tip=sp[1]))
    bones.append(bone("spine1", "spine0", sp[1], None if seam else capsule(sp[1], d["neck"][0], w["body"] // 2), 14, tip=d["neck"][0]))
    legs = {}
    for k in LEGS:
        if k not in d["legs"]:
            continue
        pts, near = d["legs"][k], k.endswith("N")
        par = "spine1" if k[0] == "F" else "spine0"
        legs[k] = []
        for i in range(len(pts) - 1):
            id_ = f"leg{k}{i}"
            b = bone(id_, legs[k][-1] if legs[k] else par, pts[i], None if seam else capsule(pts[i], pts[i + 1], w["legs"]), 8, tip=pts[i + 1], front=seam and near)
            bones.append(b)
            legs[k].append(id_)
    tail = _chain("tail", d["tail"], "spine0", w["tail"], bones)
    if seam:
        for b in bones:
            b.pop("poly", None), b.pop("feather", None)
    neck = []
    for i, p in enumerate(d["neck"]):
        nxt = d["neck"][i + 1] if i + 1 < len(d["neck"]) else d["head"]
        id_ = f"neck{i}"
        bones.append(bone(id_, neck[-1] if neck else "spine1", p, None if seam else capsule(p, nxt, w["neck"]), 10, tip=nxt))
        neck.append(id_)
    bones.append(bone("head", neck[-1], d["head"], None if seam else capsule(d["head"], d["mouth"], w["head"]), 10, tip=d["mouth"]))
    bones.append(bone("jaw", "head", d["jaw"], rect(*_jaw_box(d, w, fs)), 6, tip=d["mouth"]))
    trunk = _chain("trunk", d["trunk"], "head", w["trunk"], bones) if d["trunk"] else []
    ears = [_chain(f"ear{i}", e, "head", w["ears"], bones) for i, e in enumerate(d["ears"])]
    if seam:
        for b in bones:
            if b["id"] != "jaw":
                b.pop("poly", None), b.pop("feather", None)
    ids = {b["id"] for b in bones}
    glows = read_glows(lm, PLAN, ids)
    spec = spec_skeleton(lm, PLAN, bones, glows, res, box, feet)
    return spec, _anim(lm, spec, d, fs, swing, lift_art, sub, legs, tail, neck, trunk, ears, glows, res)


def _jaw_box(d, w, fs):
    (x, y), (mx, my) = d["jaw"], d["mouth"]
    r = w["jaw"]
    return (min(x, mx) - r // 2, y - r // 2, max(x, mx) + r // 2, y + r)


def _anim(lm, spec, d, fs, swing, lift_art, sub, legs, tail, neck, trunk, ears, glows, res):
    el = lm.get("fx", {}).get("element")
    seed = lm.get("hero", lm["source"])
    c = Curves()
    up = -fs  # a positive rot raises an east-facing head / tail tip; this is the signed multiplier for "up"
    dn = fs

    def put(a, t, ch, v):
        c.put(a, t, ch, v)

    def ramp(a, ids, amps, lag_step=2, mult=1):
        for i, id_ in enumerate(ids):
            put(a, id_, "rot", [mult * v for v in _shift(amps[min(i, len(amps) - 1)], i // lag_step)])

    def _shift(v, lag):
        return [v[(k - lag) % len(v)] for k in range(len(v))]

    tn = len(tail)
    # idle: breathing, tail sway rising along the chain, head counter-rot
    put("idle", "spine1", "rot", [dn * v for v in loop(1)])
    for i, id_ in enumerate(tail):
        put("idle", id_, "rot", loop(2 + i, i // 2))
    for i, id_ in enumerate(neck):
        put("idle", id_, "rot", [dn * v for v in loop(1, 1)])
    put("idle", "head", "rot", [dn * v for v in loop(2, 1)])
    put("idle", "jaw", "rot", [0, dn, 0, dn])
    for i, id_ in enumerate(trunk):
        put("idle", id_, "rot", loop(2 + i, i // 2))
    for chain in ears:
        put("idle", chain[0], "rot", [0, dn * 2, 0, 0])
    # walk: diagonal trot; planted paws are solved from the bone lengths so the feet stay on the ground
    ground = {k: pts[-1][1] for k, pts in d["legs"].items()}
    ang = {"A": [-fs * swing, 0, fs * swing, 0], "B": [fs * swing, 0, -fs * swing, 0]}
    planted = {"A": [1, 1, 1, 0], "B": [1, 0, 1, 1]}
    lift = lift_art * res
    bob = []
    sol = {}
    for k, pts in d["legs"].items():
        g = "A" if k in PAIR_A else "B"
        sol[k] = []
        for key in range(4):
            sol[k].append((ang[g][key], planted[g][key]))
    for key in range(4):  # body dy (art px) that grounds the planted legs on average
        diffs = [(ground[k] - _paw_y(d["legs"][k], sol[k][key][0], 0)) for k in d["legs"] if sol[k][key][1]]
        bob.append(max(0, round(sum(diffs) / len(diffs) / res)) if diffs else 0)
    put("walk", "body", "dy", bob)
    for k, pts in d["legs"].items():
        a_l, b_l = [], []
        for key in range(4):
            a, pl = sol[k][key]
            a_l.append(a)
            b_l.append(_solve_b(pts, a, ground[k] - bob[key] * res - (0 if pl else lift), fs) if len(pts) == 3 else 0)
        put("walk", legs[k][0], "rot", a_l)
        if len(legs[k]) > 1:
            put("walk", legs[k][1], "rot", b_l)
    put("walk", "head", "rot", [up * v for v in loop(2, 0)])
    for id_ in neck:
        put("walk", id_, "rot", [dn * v for v in loop(1, 1)])
    for i, id_ in enumerate(tail):
        put("walk", id_, "rot", loop(3 + i, i // 2))
    for i, id_ in enumerate(trunk):
        put("walk", id_, "rot", loop(3 + i, i // 2))
    for chain in ears:
        put("walk", chain[0], "rot", [0, dn * 3, 0, dn * 3])
    put("walk", "jaw", "rot", [0, dn, 0, dn])
    # cast: wind-up (head up, jaw open), strike (lunge, head down), recover
    put("cast", "body", "dx", [-fs, -2 * fs, 3 * fs, 0])
    put("cast", "spine1", "rot", [up * v for v in (2, 4, -3, 0)])
    for id_ in neck:
        put("cast", id_, "rot", [up * v for v in (3, 6, -5, 0)])
    put("cast", "head", "rot", [up * v for v in (4, 8, -6, 0)])
    put("cast", "jaw", "rot", [dn * v for v in (4, 10, 14, 2)])
    for i, id_ in enumerate(tail):
        put("cast", id_, "rot", [up * v for v in (2 + i, 4 + i, 6 + i, 2)])
    for i, id_ in enumerate(trunk):
        put("cast", id_, "rot", [up * v for v in (4, 10 + 2 * i, -6, 0)])
    put("hurt", "body", "dx", [-2 * fs, -fs])
    put("hurt", "head", "rot", [up * 8, up * 4])
    put("hurt", "jaw", "rot", [dn * 10, dn * 5])
    for id_ in tail:
        put("hurt", id_, "rot", [up * 5, up * 2])
    put("guard", "body", "dy", [1, 1])
    put("guard", "body", "sy", [97, 97])
    put("guard", "head", "rot", [dn * 6, dn * 7])
    for id_ in neck:
        put("guard", id_, "rot", [dn * 4, dn * 5])
    put("dash", "body", "dx", [-2 * fs, 5 * fs, 0])
    put("dash", "spine1", "rot", [dn * v for v in (2, 6, 1)])
    put("dash", "head", "rot", [up * v for v in (2, 5, 0)])
    put("dash", "jaw", "rot", [dn * v for v in (4, 12, 4)])
    for i, id_ in enumerate(tail):
        put("dash", id_, "rot", [up * v for v in (3, 8 + i, 3)])
    for k, ids in legs.items():
        s = fs * 18 * (-1 if k[0] == "F" else 1)  # front legs reach forward, hind legs push back
        put("dash", ids[0], "rot", [s, s * 4 // 3, 0])
    put("ko", "body", "rot", [0, -fs * 6, -fs * 11, -fs * 11])
    put("ko", "body", "dy", [0, 2, 4, 4])
    put("ko", "head", "rot", [0, dn * 8, dn * 14, dn * 14])
    put("ko", "jaw", "rot", [0, dn * 6, dn * 12, dn * 12])
    for id_ in tail:
        put("ko", id_, "rot", [0, dn * 3, dn * 6, dn * 6])
    put("victory", "body", "dy", [0, -1, -2, -1])
    put("victory", "spine1", "rot", [up * v for v in (0, 3, 5, 3)])
    for id_ in neck:
        put("victory", id_, "rot", [up * v for v in (0, 3, 5, 3)])
    put("victory", "head", "rot", [up * v for v in (0, 4, 7, 4)])
    put("victory", "jaw", "rot", [0, dn * 4, dn * 8, dn * 4])
    for i, id_ in enumerate(tail):
        put("victory", id_, "rot", loop(5 + i, i // 2))
    put("tagIn", "body", "dy", [-3, -2, 1, 0])
    put("tagIn", "body", "alpha", [160, 210, 256, 256])
    put("tagIn", "head", "rot", [up * 6, up * 3, dn * 2, 0])
    for gi, g in enumerate(glows):
        for a, n in FRAMES.items():
            put(a, g["id"], "bright", glow_curve(el, gi, n))
    anim = {}
    for a, n in FRAMES.items():
        act = {"frames": n, "curves": c.a[a]}
        if a in sub and sub[a] > 1:
            act["sub"] = sub[a]
        dfm = deform_for(el, a, n, f"{seed}")
        if dfm:
            act["deform"] = {"body": dfm}
        anim[a] = act
    return anim
