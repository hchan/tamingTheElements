"""Pure-Python forward kinematics of a template's spec + anim, for the template tests and gen-r24 checks. It mirrors the baker's curve
handling (R1 Catmull-Rom sub-frames with the same Q14 weights) but poses bone points in floats: it checks reach, margins and feet, it
never renders. Coordinates are portrait px (the spec's bone heads); curve dx/dy are art px (x res)."""
import math

from .common import LOOPING


def sub_weights(r, k):
    d = 2 * k * k * k
    num = [-r ** 3 + 2 * r * r * k - r * k * k, 3 * r ** 3 - 5 * r * r * k + 2 * k ** 3, -3 * r ** 3 + 4 * r * r * k + r * k * k, r ** 3 - r * r * k]
    w = [(2 * 16384 * n + d) // (2 * d) for n in num]  # Math.round
    i = 1 if w[1] >= w[2] else 2
    w[i] += 16384 - sum(w)
    return w


def expand_curve(v, k, loop, clamp):
    n = len(v)
    at = (lambda i: v[i % n]) if loop else (lambda i: v[min(max(i, 0), n - 1)])
    out = []
    for f in range(n * k):
        j, r = divmod(f, k)
        if r == 0 or (not loop and j >= n - 1):
            out.append(at(j))
            continue
        w = sub_weights(r, k)
        x = (sum(w[i] * at(j - 1 + i) for i in range(4)) + 8192) // 16384
        out.append(min(max(x, min(at(j), at(j + 1))), max(at(j), at(j + 1))) if clamp else x)
    return out


def expanded(anim, action):
    """{target: {channel: values per output frame}}, frames * sub of them."""
    act = anim[action]
    k = act.get("sub", 1)
    loop = action in LOOPING
    if k == 1:
        return act["curves"], act["frames"]
    return ({t: {c: expand_curve(v, k, loop, c not in ("rot", "dx", "dy")) for c, v in ch.items()} for t, ch in act["curves"].items()}, act["frames"] * k)


def segments(spec):
    """{bone: (head, tip)}: tip = bone.tip, else the first child's head, else the head."""
    by = {b["id"]: b for b in spec["bones"]}
    kid = {}
    for b in spec["bones"]:
        if "parent" in b:
            kid.setdefault(b["parent"], b)
    return {i: (tuple(b["head"]), tuple(b.get("tip") or (kid[i]["head"] if i in kid else b["head"]))) for i, b in by.items()}


def pose(spec, anim, action, f):
    """{bone: (head, tip)} in portrait px at output frame f (the body part's own curves applied last, about the feet)."""
    curves, _ = expanded(anim, action)
    res = spec["res"]
    parent = {b["id"]: b.get("parent") for b in spec["bones"]}
    seg = segments(spec)

    def val(t, c, default=0):
        v = curves.get(t, {}).get(c)
        return default if v is None else v[f]

    def apply(i, p):
        hx, hy = seg[i][0]
        th = math.radians(val(i, "rot"))
        x, y = (p[0] - hx) * val(i, "sx", 100) / 100, (p[1] - hy) * val(i, "sy", 100) / 100
        c, s = math.cos(th), math.sin(th)
        return (hx + x * c - y * s + val(i, "dx") * res, hy + x * s + y * c + val(i, "dy") * res)

    def world(i, p):
        while i:
            p = apply(i, p)
            i = parent[i]
        return p

    fx, fy = spec["feet"]
    out = {}
    for i, (h, t) in seg.items():
        pts = []
        for p in (h, t):
            x, y = world(i, p)
            x, y = fx + (x - fx) * val("body", "sx", 100) / 100, fy + (y - fy) * val("body", "sy", 100) / 100
            th = math.radians(val("body", "rot"))
            c, s = math.cos(th), math.sin(th)
            x, y = fx + (x - fx) * c - (y - fy) * s, fy + (x - fx) * s + (y - fy) * c
            pts.append((x + val("body", "dx") * res, y + val("body", "dy") * res))
        out[i] = tuple(pts)
    return out


def to_frame(spec, p):
    """Portrait px -> 240 px frame coordinates."""
    return (spec["box"][0] + p[0] / spec["res"], spec["box"][1] + p[1] / spec["res"])
