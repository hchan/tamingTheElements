"""Serpent / wyrm template (ouroth): root(feet) > spine0 (the whole painting, anchored on the coil) > seg1..segN along the body > head > jaw.
The body is one chain of bones along the painted S; every key sends a travelling wave down it (a whole-key lag per segment), so the
creature slithers in place. The head faces east or west as the landmarks say (fs = +1 east; a positive rot is clockwise, so it lowers an
east-facing head, a negative one raises it).

  joints.chain  3-8 points, coil (spine0 head) .. the neck end; seg i runs chain[i] -> chain[i+1]; the last point is the head joint
  joints.head   1 point (skull base; normally = last chain point)   joints.jaw 1 point (hinge)   joints.mouth 1 point (snout tip)
  tune          {sub {action: 1..4}, wave deg 2..8 (4), width px (56)}"""
from .common import (FRAMES, PlanError, WIDTHS, Curves, bone, capsule, deform_for, glow_curve, loop, need_pt, need_pts, read_glows, rect,
                     spec_skeleton, start)

PLAN = "serpent"
SUB = {"idle": 4, "walk": 2}


def read(lm):
    res, box, feet = start(lm, PLAN)
    j = lm.get("joints")
    if not isinstance(j, dict):
        raise PlanError(f"{PLAN}: joints is missing")
    d = {"chain": need_pts(j.get("chain"), "joints.chain", PLAN, 3, 8), "head": need_pt(j.get("head"), "joints.head", PLAN),
         "jaw": need_pt(j.get("jaw"), "joints.jaw", PLAN), "mouth": need_pt(j.get("mouth"), "joints.mouth", PLAN)}
    fs = 1 if d["mouth"][0] >= d["head"][0] else -1
    tune = lm.get("tune", {})
    wave = tune.get("wave", 4)
    if not isinstance(wave, int) or not 2 <= wave <= 8:
        raise PlanError(f"{PLAN}: tune.wave must be an integer 2..8")
    sub = {**SUB, **tune.get("sub", {})}
    if any(a not in FRAMES or not isinstance(v, int) or not 1 <= v <= 4 for a, v in sub.items()):
        raise PlanError(f"{PLAN}: tune.sub needs {{action: 1..4}}")
    return res, box, feet, d, fs, wave, tune.get("width", 56), sub


def build(lm):
    res, box, feet, d, fs, wave, width, sub = read(lm)
    w = {**WIDTHS, **lm.get("widths", {})}
    ch, cv = d["chain"], lm["canvas"]
    bones = [bone("root", None, feet), bone("spine0", "root", ch[0], rect(0, 0, cv[0], cv[1]), 18, tip=ch[1])]
    segs = []
    for i in range(1, len(ch) - 1):
        bones.append(bone(f"seg{i}", segs[-1] if segs else "spine0", ch[i], capsule(ch[i], ch[i + 1], width), 14, tip=ch[i + 1]))
        segs.append(f"seg{i}")
    bones.append(bone("head", segs[-1], d["head"], capsule(d["head"], d["mouth"], w["head"] + 15), 10, tip=d["mouth"]))
    (jx, jy), (mx, my) = d["jaw"], d["mouth"]
    r = w["jaw"]
    bones.append(bone("jaw", "head", d["jaw"], rect(min(jx, mx) - r // 2, jy - r // 2, max(jx, mx) + r // 2, jy + r), 6, tip=d["mouth"]))
    ids = {b["id"] for b in bones}
    glows = read_glows(lm, PLAN, ids)
    spec = spec_skeleton(lm, PLAN, bones, glows, res, box, feet)
    return spec, _anim(lm, segs, fs, wave, sub, glows)


def _anim(lm, segs, fs, wave, sub, glows):
    el = lm.get("fx", {}).get("element")
    seed = lm.get("hero", lm["source"])
    c = Curves()
    up, dn = -fs, fs
    n = len(segs)
    # idle: breathing wave down the body, head counter-rot, jaw twitch
    for i, s in enumerate(segs):
        c.put("idle", s, "rot", [dn * v for v in loop(1 + (i % 2), i)])
    c.put("idle", "head", "rot", [up * v for v in loop(2, 1)])
    c.put("idle", "jaw", "rot", [0, dn, 0, dn])
    c.put("idle", "body", "sy", [100, 101, 102, 101])  # slow breathing, distinct from the walk wave
    # walk: slither, a wave travelling along the chain; the body bobs on the beat
    c.put("walk", "body", "dy", [0, 2, 0, 2])
    c.put("walk", "body", "dx", [fs * 2, 0, -fs * 2, 0])
    for i, s in enumerate(segs):
        c.put("walk", s, "rot", [dn * v for v in loop(wave, i)])
    c.put("walk", "head", "rot", [up * v for v in loop(wave, n)])
    c.put("walk", "jaw", "rot", [0, dn, 0, dn])
    # cast: rear back (head and upper body up, jaw open), strike (lunge, head down), recover
    c.put("cast", "body", "dx", [-fs * 4, -fs * 8, fs * 16, fs * 4])
    for i, s in enumerate(segs):
        k = (i + 1) / n
        c.put("cast", s, "rot", [round(up * v * k) for v in (3, 6, -5, 0)])
    c.put("cast", "head", "rot", [up * v for v in (6, 12, -9, 0)])
    c.put("cast", "jaw", "rot", [dn * v for v in (4, 10, 18, 3)])
    # hurt: recoil, head thrown up
    c.put("hurt", "body", "dx", [-fs * 6, -fs * 2])
    for s in segs:
        c.put("hurt", s, "rot", [up * 4, up * 1])
    c.put("hurt", "head", "rot", [up * 14, up * 5])
    c.put("hurt", "jaw", "rot", [dn * 12, dn * 5])
    # guard: coil tight, head tucked
    c.put("guard", "body", "dy", [1, 1])
    c.put("guard", "body", "sy", [97, 97])
    c.put("guard", "head", "rot", [dn * 8, dn * 9])
    # dash: lunge
    c.put("dash", "body", "dx", [-fs * 6, fs * 14, 0])
    c.put("dash", "body", "sx", [100, 107, 100])
    c.put("dash", "body", "rot", [-fs * 2, fs * 7, 0])
    c.put("dash", "head", "rot", [up * v for v in (3, -6, 0)])
    c.put("dash", "jaw", "rot", [dn * v for v in (4, 14, 4)])
    # ko: fallback for the bake (the procedural keys replace it): slump and sink
    c.put("ko", "body", "dy", [0, 4, 8, 8])
    c.put("ko", "body", "rot", [0, -fs * 2, -fs * 4, -fs * 4])
    c.put("ko", "head", "rot", [0, dn * 10, dn * 20, dn * 20])
    c.put("ko", "jaw", "rot", [0, dn * 6, dn * 12, dn * 12])
    # victory: rise tall, jaw open
    c.put("victory", "body", "dy", [0, -2, -3, -2])
    for s in segs:
        c.put("victory", s, "rot", [up * v for v in (0, 1, 2, 1)])
    c.put("victory", "head", "rot", [up * v for v in (0, 5, 9, 5)])
    c.put("victory", "jaw", "rot", [0, dn * 4, dn * 9, dn * 4])
    c.put("tagIn", "body", "dy", [-3, -2, 1, 0])
    c.put("tagIn", "body", "alpha", [160, 210, 256, 256])
    c.put("tagIn", "head", "rot", [up * 6, up * 3, dn * 2, 0])
    for gi, g in enumerate(glows):
        for a, k in FRAMES.items():
            c.put(a, g["id"], "bright", glow_curve(el, gi, k))
    anim = {}
    for a, k in FRAMES.items():
        act = {"frames": k, "curves": c.a[a]}
        if sub.get(a, 1) > 1:
            act["sub"] = sub[a]
        dfm = deform_for(el, a, k, f"{seed}")
        if dfm:
            act["deform"] = {"body": dfm}
        anim[a] = act
    return anim
