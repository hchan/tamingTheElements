"""Shared helpers for the "grim elemental being" hero rigs (fiara.py, curomo.py, cyclonius.py).

Owner feedback 2026-11-13: heroes must be elemental beings (not humanoid, not cartoony): grim, desaturated, textured, painterly, no hard
black outlines. The old generators drew flat cel-banded polygons with a dark outline and a bright rim. These helpers instead paint each part at
4x from noise fields (fbm, Voronoi plates, flow streaks), warp the silhouette so it is ragged, fade edges instead of outlining them, and let a
few emissive accents (ember cracks, cold eyes, lightning) carry the read. Concept references: tools/assets/concepts-dark.py (SDXL-Turbo
stills, studied by eye only; no generated pixels are composited, so the committed art is fully reproducible from these scripts).

Needs Pillow + numpy. Original art; same licence as the repository's own art (owner to confirm in README.md).
"""
import json, os, sys, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4
W = 80 * SS


# ---------- fields ----------
def value_noise(rs, cx, cy):
    """Smooth noise in 0..1 on the WxW grid with cx x cy lattice cells (cx > cy gives vertical streaks)."""
    small = rs.rand(max(2, int(cy)) + 2, max(2, int(cx)) + 2)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((W, W), Image.BICUBIC), np.float32) / 255.0


def fbm(rs, cells, octs=3, sx=1.0, sy=1.0):
    out = np.zeros((W, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octs):
        out += amp * value_noise(rs, cells * (2 ** o) * sx, cells * (2 ** o) * sy)
        tot += amp
        amp *= 0.5
    return out / tot


def blur(a, r):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def grid():
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32) / W
    return xx, yy


def poly_mask(polys, ellipses=()):
    m = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(m)
    for pts in polys:
        d.polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    for (cx, cy, rx, ry) in ellipses:
        d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=255)
    return np.asarray(m, np.float32) / 255.0


def warp(a, dx, dy):
    """Sample a at (x + dx, y + dy) (pixels, arrays or scalars), nearest, clamped: content moves by -dx, -dy."""
    yy, xx = np.mgrid[0:W, 0:W]
    xs = np.clip((xx + dx).astype(np.int32), 0, W - 1)
    ys = np.clip((yy + dy).astype(np.int32), 0, W - 1)
    return a[ys, xs]


def voronoi(rs, n, stretch=(1.0, 1.0)):
    """Distance to the nearest and second-nearest of n random sites (0..1 units), nearest site id and the vector to the nearest site."""
    sx = rs.rand(n).astype(np.float32); sy = rs.rand(n).astype(np.float32)
    xx, yy = grid()
    d = np.stack([np.hypot((xx - sx[i]) * stretch[0], (yy - sy[i]) * stretch[1]) for i in range(n)])
    idx = np.argsort(d, axis=0)
    d1 = np.take_along_axis(d, idx[:1], 0)[0]
    d2 = np.take_along_axis(d, idx[1:2], 0)[0]
    nid = idx[0]
    return d1, d2, nid, xx - sx[nid], yy - sy[nid]


def lerp(a, b, t):
    return a + (b - a) * t


def ramp(stops, t):
    xs = [s[0] for s in stops]
    return np.stack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)], -1).astype(np.float32)


def ribbon(path, widths):
    """Polygon around a centre line (list of points) with a half-width per point."""
    left, right = [], []
    n = len(path)
    for i, (x, y) in enumerate(path):
        x0, y0 = path[max(0, i - 1)]; x1, y1 = path[min(n - 1, i + 1)]
        dx, dy = x1 - x0, y1 - y0
        ln = max(1e-6, (dx * dx + dy * dy) ** 0.5)
        nx, ny = -dy / ln, dx / ln
        left.append((x + nx * widths[i], y + ny * widths[i]))
        right.append((x - nx * widths[i], y - ny * widths[i]))
    return left + right[::-1]


def catmull(pts, per=6):
    """Smooth centre line through control points (Catmull-Rom)."""
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(per):
            t = s / per
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3) for k in (0, 1)))
    out.append(pts[-1])
    return out


def bevel_light(h, k=40.0):
    """Upper-left light from a height field: > 0 faces the light."""
    gy, gx = np.gradient(blur(h, SS * 0.6))
    return np.clip(-(gx + gy) * k, -1, 1)


def glow_dot(im, x, y, rx, ry, core, halo, halo_r=3.0):
    """Emissive eye: soft halo (additive via alpha-over) then a hard core ellipse. Drawn in place on an RGBA supersampled image."""
    a = np.asarray(im, np.float32)
    gl = Image.new("L", (W, W), 0)
    ImageDraw.Draw(gl).ellipse([(x - rx * halo_r) * SS, (y - ry * halo_r) * SS, (x + rx * halo_r) * SS, (y + ry * halo_r) * SS], fill=255)
    g = np.asarray(gl.filter(ImageFilter.GaussianBlur(SS * 1.6)), np.float32) / 255.0 * 0.75
    a[..., :3] = a[..., :3] * (1 - g[..., None]) + np.array(halo, np.float32) * g[..., None]
    a[..., 3] = np.maximum(a[..., 3], g * 90)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    ImageDraw.Draw(out).ellipse([(x - rx) * SS, (y - ry) * SS, (x + rx) * SS, (y + ry) * SS], fill=tuple(core) + (255,))
    return out


# ---------- views and rig plumbing ----------
def default_view_tf(view, part, head="head", arms=("armF", "armB"), torso="torso"):
    if view == "E":
        return dict(sx=1.0, dx=-3 if part == head else 0, dy=0)
    if view == "SE":
        d = dict(sx=0.93, dx=2, dy=1)
        if part == head: d = dict(sx=1.06, dx=-8, dy=4, scale=1.06)
        if part == arms[0]: d = dict(sx=0.95, dx=-3, dy=1)
        if len(arms) > 1 and part == arms[1]: d = dict(sx=0.95, dx=3, dy=1)
        if part == torso: d = dict(sx=0.96, dx=1, dy=2)
        return d
    d = dict(sx=0.93, dx=-1, dy=-1)  # NE: seen from behind
    if part == head: d = dict(sx=0.92, dx=-6, dy=-2, scale=0.94)
    if part == arms[0]: d = dict(sx=0.95, dx=1, dy=-1)
    if len(arms) > 1 and part == arms[1]: d = dict(sx=0.95, dx=2, dy=-1)
    if part == torso: d = dict(sx=1.0, dx=-2, dy=-1)
    return d


def apply(tf, p, c=(40, 40)):
    s = tf.get("scale", 1.0)
    return (c[0] + (p[0] - c[0]) * tf["sx"] * s + tf["dx"], c[1] + (p[1] - c[1]) * s + tf["dy"])


def refuse_portrait_rig(out):
    """Exits if <out>/rig.json is a portrait rig (tools/assets/portrait-rig): this procedural generator would clobber it."""
    path = os.path.join(out, "rig.json")
    if os.path.exists(path) and json.load(open(path)).get("source") == "portrait":
        sys.exit(f"{path} is a portrait rig (tools/assets/portrait-rig/prep.py); refusing to overwrite it")


def build(out, name, G, actions, paint, license_text, view_tf=default_view_tf, accents=None):
    """G: part id -> dict(polys=[[pts]], joint=(x,y), z, parent, ...extra for paint). paint(part_id, view, polys, g, seed) -> RGBA WxW.
    accents(part_id, view, im, tf) -> RGBA (eyes etc, optional). Writes <out>/parts/*.png, rig.json, license.txt."""
    refuse_portrait_rig(out)
    os.makedirs(os.path.join(out, "parts"), exist_ok=True)
    parts = []
    for view in ("E", "SE", "NE"):
        tfs = {k: view_tf(view, k) for k in G}
        for k, g in G.items():
            polys = [[apply(tfs[k], p) for p in poly] for poly in g["polys"]]
            seed = zlib.crc32((name + k + view).encode()) % 99991 + 11
            im = paint(k, view, polys, dict(g, tf=tfs[k], view=view), seed)
            if accents:
                im = accents(k, view, im, tfs[k]) or im
            small = im.resize((80, 80), Image.LANCZOS)
            a = np.asarray(small)
            ys, xs = np.nonzero(a[..., 3] > 8)
            x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
            crop = small.crop((x0, y0, x1, y1))
            fname = f"{k}.png" if view == "E" else f"{k}_{view.lower()}.png"
            crop.save(os.path.join(out, "parts", fname))
            parts.append(dict(view=view, id=k, png=fname, joint=apply(tfs[k], g["joint"]), off=(x0, y0), size=crop.size))
    byv = {v: {e["id"]: e for e in parts if e["view"] == v} for v in ("E", "SE", "NE")}

    def pv(e):
        return [int(round(e["joint"][0])) - e["off"][0], int(round(e["joint"][1])) - e["off"][1]]

    def at(v, pid):
        e = byv[v][pid]
        jx, jy = int(round(e["joint"][0])), int(round(e["joint"][1]))
        if G[pid]["parent"] is None:
            return [jx, jy]
        pe = byv[v][G[pid]["parent"]]
        return [jx - int(round(pe["joint"][0])), jy - int(round(pe["joint"][1]))]

    rig_parts = []
    for pid, g in G.items():
        p = {"id": pid}
        if g["parent"]: p["parent"] = g["parent"]
        p["png"] = byv["E"][pid]["png"]; p["pivot"] = pv(byv["E"][pid]); p["at"] = at("E", pid); p["z"] = g["z"]
        p["views"] = {v: {"png": byv[v][pid]["png"], "pivot": pv(byv[v][pid]), "at": at(v, pid)} for v in ("SE", "NE")}
        rig_parts.append(p)
    json.dump(dict(dirs=["E", "SE", "NE"], parts=rig_parts, actions=actions), open(os.path.join(out, "rig.json"), "w"), indent=2)
    open(os.path.join(out, "license.txt"), "w").write(license_text)
    print("ok", name)


def license_for(name, script, look):
    return f"""Rig parts for {name}: original art generated by tools/assets/rig-gen/{script} (shared helpers: tools/assets/rig-gen/elemental.py; pilot grim
elemental-being redo, 2026-11-13, Claude). Look: {look}
No pixels are copied from any other artwork (the SDXL-Turbo concept stills from tools/assets/concepts-dark.py were studied by eye only, never
composited). Licence: same as the repository's own original code and art (still to be decided in README.md; owner to confirm).
"""
