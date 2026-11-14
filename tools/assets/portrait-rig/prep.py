"""Builds a portrait rig (imgWorkArea/rigs/<hero>/) from the hero's painted legacy portrait, for tools/assets/bake-rig.ts (sample "ss2").

    ~/venv/bin/python -I tools/assets/portrait-rig/prep.py [--check] [hero ...]    (default: every spec/<hero>.json; needs numpy + Pillow)

The painting itself is the art: one skinned `body` part holds every pixel of `public/assets/img/map/<hero>Large.png` (read only), so
nothing is cut out or inpainted. The bones move areas of that one mesh by feathered weights (spec `bones[].poly`). The script also:
  - cleans the matte: alpha below 8 is cleared, specks smaller than `matte.minIsland` px are dropped, and the outer `matte.band` px of
    the silhouette take the colour of the paint just inside them, which removes the white matte fringe and softens the dark contour
    (owner, 2026-11-13: thin or no outline; value contrast and rim light carry the edge);
  - adds a coloured rim light on the silhouette facing `rim.dir` (mystic glow, never darkening);
  - bleeds colour 8 px into the transparent margin, so linear filtering shows no halo;
  - paints additive glow parts (eyes, crystals: a hot core, a soft halo and a wide bloom, a little uneven) on a bone;
  - paints a soft contact shadow under the feet;
  - writes rig.json (spec frame, box, res, dirOffsets plus `<hero>.anim.json` actions), license.txt and parts/*.png, and removes any
    other part PNG left by the procedural generator. tools/assets/rig-gen refuses to overwrite a rig with `"source": "portrait"`.
prep.lock.json (next to this script) records the sha256 of every input and output; `--check` recomputes the input hashes only and
fails when a spec, animation, portrait or this script changed without a re-run (the bake's own lock covers the outputs).
Deterministic for a given numpy/Pillow (requirements.txt). Debug images go to ~/claudetmp/portrait-rig/<hero>/ when that folder exists.
"""
import hashlib
import json
import os
import sys
import zlib
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
SPEC_DIR = os.path.join(HERE, "spec")
RIGS = os.path.join(ROOT, "imgWorkArea", "rigs")
LOCK = os.path.join(HERE, "prep.lock.json")
DEBUG = os.path.expanduser("~/claudetmp/portrait-rig")
PAD = 16  # transparent margin around the portrait in the body part (the bilinear fringe stays inside the skin mesh)
STEP = 12  # skin grid step in part px
DIRS = ["E", "SE", "S", "N", "NE"]
LICENSE = (
    "Rig parts for {hero}: derived from the legacy portrait `map/{hero}Large.png` (tag legacy-crafty-1.0; owner's game art). Cut, matted,\n"
    "inpainted and animated by tools/assets/portrait-rig (prep.py, spec/{hero}.json, spec/{hero}.anim.json); numpy/PIL only.\n"
    "Licence: same as the repository's own art (still to be decided in README.md; owner to confirm).\n"
)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def shift(a, dy, dx):
    """a moved by (dy, dx), zero filled (no wrap)."""
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = a[ys, xs]
    return out


NB8 = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def depth(solid, maxd):
    """Chebyshev distance (1 = on the silhouette) from each solid pixel to the nearest clear one, capped at maxd + 1."""
    d = np.zeros(solid.shape, np.int32)
    cur = solid.copy()
    for k in range(1, maxd + 1):
        er = cur.copy()
        for dy, dx in NB8:
            er &= shift(cur, dy, dx)
        d[cur & ~er] = k
        cur = er
    d[cur] = maxd + 1
    return d


def bleed(rgb, known, iters):
    """Fills unknown pixels with the mean of their known 8-neighbours, ring by ring (iters rings)."""
    rgb = rgb.copy()
    known = known.copy()
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        n = np.zeros(known.shape, np.float32)
        for dy, dx in NB8:
            k = shift(known, dy, dx).astype(np.float32)
            acc += shift(rgb, dy, dx) * k[..., None]
            n += k
        grow = ~known & (n > 0)
        rgb[grow] = acc[grow] / n[grow][:, None]
        known |= grow
    return rgb, known


def drop_islands(solid, min_px):
    """Clears 8-connected solid islands smaller than min_px."""
    h, w = solid.shape
    seen = np.zeros_like(solid)
    keep = solid.copy()
    for y0, x0 in zip(*np.nonzero(solid)):
        if seen[y0, x0]:
            continue
        comp = [(y0, x0)]
        seen[y0, x0] = True
        q = deque(comp)
        while q:
            y, x = q.popleft()
            for dy, dx in NB8:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and solid[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
                    comp.append((yy, xx))
        if len(comp) < min_px:
            for y, x in comp:
                keep[y, x] = False
    return keep


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def clean(spec, src):
    a = src.astype(np.float32)
    m = spec.get("matte", {})
    alpha = a[..., 3]
    alpha[alpha < 8] = 0
    solid = drop_islands(alpha > 0, m.get("minIsland", 40))
    alpha[~solid] = 0
    rgb = a[..., :3]
    band = m.get("band", 2)
    d = depth(solid, band + 6)
    # Decontaminate the silhouette band: its colour comes from the paint just inside (the band blends 100% at the edge, less inward).
    inner, _ = bleed(rgb, solid & (d > band), band + 2)
    t = np.clip((band + 1 - d) / band, 0, 1) * solid
    lum = rgb.mean(-1)
    fringe = solid & (d <= band + 1) & (lum > inner.mean(-1) + m.get("fringeLum", 35))
    t = np.maximum(t, fringe.astype(np.float32))
    rgb = rgb * (1 - t[..., None]) + inner * t[..., None]
    # Rim light: the silhouette facing `dir` lifts toward `color` (adds light only).
    rim = spec.get("rim")
    if rim:
        soft = blur(solid.astype(np.float32), 3.0)
        gy, gx = np.gradient(soft)
        n = np.sqrt(gx * gx + gy * gy) + 1e-6
        lx, ly = rim["dir"]
        ln = (lx * lx + ly * ly) ** 0.5
        facing = np.clip(-(gx * lx + gy * ly) / (n * ln), 0, 1)
        k = facing * np.exp(-(np.clip(d, 1, 99) - 1) / rim.get("width", 1.6)) * solid * rim.get("strength", 0.3)
        col = np.array(rim["color"], np.float32)
        rgb = rgb + (np.maximum(col - rgb, 0)) * k[..., None]
    # Colour bleed into the clear margin (linear filtering at runtime then never mixes in black).
    rgb, _ = bleed(rgb, solid, 8)
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).round().astype(np.uint8)
    out[..., :3][depth(~solid, 8) > 8] = 0  # beyond the bleed: plain black (keeps the PNG small)
    return out


def poly_mask(size, poly, feather):
    im = Image.new("L", (size, size), 0)
    ImageDraw.Draw(im).polygon([(x + PAD, y + PAD) for x, y in poly], fill=255)
    if feather > 0:
        im = im.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(im, np.float32) / 255.0


def skin(spec, size):
    bones = spec["bones"]
    n = -(-size // STEP) + 1
    idx = np.minimum(np.arange(n) * STEP, size - 1)
    nv = n * n
    W = np.zeros((nv, len(bones)), np.float64)
    W[:, 0] = 1.0
    masks = {}
    for b, bone in enumerate(bones):
        if b == 0:
            if "poly" in bone:
                sys.exit("the first bone is the root: it takes every vertex no other bone claims (no poly)")
            continue
        m = poly_mask(size, bone["poly"], bone.get("feather", 12))
        masks[bone["id"]] = m
        mv = m[idx][:, idx].reshape(-1).astype(np.float64)
        W *= (1 - mv)[:, None]
        W[:, b] += mv
    # At most 3 bones per vertex, Q8, each vertex sums to 256 (the rounding remainder goes to its heaviest bone).
    order = np.argsort(-W, axis=1, kind="stable")
    W[np.arange(nv)[:, None], order[:, 3:]] = 0
    W /= W.sum(1, keepdims=True)
    Q = np.floor(W * 256).astype(np.int64)
    Q[np.arange(nv), order[:, 0]] += 256 - Q.sum(1)
    out = {"grid": [n, n], "step": STEP, "bones": [b["id"] for b in bones], "w": Q.reshape(-1).tolist()}
    dm = spec.get("deformMask")
    if dm:
        m = np.zeros((size, size), np.float32)
        for poly in dm["polys"]:
            m = np.maximum(m, poly_mask(size, poly, dm.get("feather", 16)))
        out["dw"] = np.round(m[idx][:, idx].reshape(-1) * 256).astype(int).tolist()
    return out, masks, Q.reshape(n, n, len(bones))


def glow_img(g, src, seed):
    """Additive glow: hot core, halo, wide bloom; the halo is a little uneven (seeded)."""
    r = float(g["r"])
    half = int(np.ceil(r * 2.8 * 2))
    yy, xx = np.mgrid[-half:half + 1, -half:half + 1].astype(np.float32)
    d = np.sqrt(xx * xx + yy * yy)
    rs = np.random.RandomState(seed)
    ang = np.arctan2(yy, xx)
    wob = 1 + 0.18 * sum(np.cos(k * ang + rs.rand() * 6.283) * rs.rand() for k in (2, 3, 5))
    core = np.exp(-((d / (0.45 * r)) ** 2))
    halo = 0.55 * np.exp(-((d / (r * wob)) ** 2))
    bloom = 0.22 * np.exp(-((d / (2.8 * r * wob)) ** 2))
    i = np.clip((core + halo + bloom) * g.get("gain", 1.0), 0, 1)
    col = g.get("color")
    if col is None:  # the brightest paint around the spot
        gx, gy = g["at"]
        p = src[max(0, gy - int(r)):gy + int(r) + 1, max(0, gx - int(r)):gx + int(r) + 1].reshape(-1, 4).astype(np.float32)
        p = p[p[:, 3] > 128]
        lum = p[:, :3].mean(1)
        col = p[lum >= np.percentile(lum, 80), :3].mean(0)
    col = np.array(col, np.float32)
    hot = np.exp(-((d / (0.3 * r)) ** 2)) * g.get("hot", 0.55)
    rgb = col * (1 - hot[..., None]) + 255 * hot[..., None]
    return Image.fromarray(np.dstack([rgb, i * 255]).round().clip(0, 255).astype(np.uint8), "RGBA")


def shadow_img(s):
    rx, ry = s["rx"], s["ry"]
    # The Gaussian is tapered to exactly 0 on the ellipse at 1.3 radii, so its faint tail never reaches the frame edge
    # (an untapered tail clipped Curomo's frame on the right at alpha 3).
    k = 1.3
    hw, hh = int(rx * k) + 1, int(ry * k) + 1
    yy, xx = np.mgrid[-hh:hh + 1, -hw:hw + 1].astype(np.float32)
    e = (xx / rx) ** 2 + (yy / ry) ** 2
    taper = np.clip(1 - (e / (k * k)) ** 2, 0, 1)
    a = np.exp(-e * 1.4) * taper * s.get("alpha", 80)
    z = np.zeros_like(a)
    return Image.fromarray(np.dstack([z, z, z, a]).round().clip(0, 255).astype(np.uint8), "RGBA")


def inputs_of(hero):
    return {
        "prep.py": sha(os.path.abspath(__file__)),
        "spec": sha(os.path.join(SPEC_DIR, hero + ".json")),
        "anim": sha(os.path.join(SPEC_DIR, hero + ".anim.json")),
        "portrait": sha(os.path.join(ROOT, json.load(open(os.path.join(SPEC_DIR, hero + ".json")))["source"])),
    }


def build(hero):
    spec = json.load(open(os.path.join(SPEC_DIR, hero + ".json")))
    actions = json.load(open(os.path.join(SPEC_DIR, hero + ".anim.json")))
    src = np.asarray(Image.open(os.path.join(ROOT, spec["source"])).convert("RGBA"))
    ph, pw = src.shape[:2]
    frame, box, res = spec["frame"], spec["box"], spec["res"]
    if pw != ph or box[2] * res != pw or box[3] * res != ph:
        sys.exit(f"{hero}: the {pw}x{ph} portrait must fill the box {box} at res {res} exactly (1:1 art px)")
    fx, fy = spec["feet"]
    bx, by = box[0] * res, box[1] * res
    out = os.path.join(RIGS, hero)
    rig_path = os.path.join(out, "rig.json")
    if os.path.exists(rig_path) and json.load(open(rig_path)).get("source") != "portrait":
        print(f"{hero}: replacing the procedural rig")
    os.makedirs(os.path.join(out, "parts"), exist_ok=True)

    body = clean(spec, src)
    size = pw + 2 * PAD
    padded = np.zeros((size, size, 4), np.uint8)
    padded[PAD:PAD + ph, PAD:PAD + pw] = body
    # Bleed the colour on into the pad too (the bake samples bilinearly across the mesh edge).
    rgb, _ = bleed(padded[..., :3].astype(np.float32), padded[..., 3] > 0, PAD)
    padded[..., :3] = np.where(padded[..., 3:] > 0, padded[..., :3], np.clip(rgb, 0, 255).round().astype(np.uint8))
    sk, masks, q = skin(spec, size)

    files = {"body.png": Image.fromarray(padded, "RGBA")}
    bones = []
    for b in spec["bones"]:
        e = {"id": b["id"], "part": "body", "head": [b["head"][0] + PAD, b["head"][1] + PAD]}
        if "parent" in b:
            e["parent"] = b["parent"]
        bones.append(e)
    parts = []
    s = spec.get("shadow")
    if s:
        files["shadow.png"] = shadow_img(s)
        w, h = files["shadow.png"].size
        parts.append({"id": "shadow", "png": "shadow.png", "pivot": [w // 2, h // 2], "at": [bx + fx + s.get("dx", 0), by + fy + s.get("dy", 0)], "z": -10})
    parts.append({"id": "body", "png": "body.png", "pivot": [fx + PAD, fy + PAD], "at": [bx + fx, by + fy], "z": 0, "skin": sk})
    for i, g in enumerate(spec.get("glows", [])):
        name = g["id"] + ".png"
        files[name] = glow_img(g, src, zlib.crc32((hero + g["id"]).encode()) % 99991)
        w, h = files[name].size
        p = {"id": g["id"], "parent": "body", "bone": g["bone"], "png": name, "pivot": [w // 2, h // 2], "at": [g["at"][0] - fx, g["at"][1] - fy], "z": 1 + i, "blend": "add"}
        hide = g.get("hideIn", ["N", "NE"])
        if hide:
            p["views"] = {d: {"hide": True} for d in hide}
        parts.append(p)
    rig = {"source": "portrait", "frame": frame, "sample": "ss2", "res": res, "box": box, "dirs": DIRS}
    if spec.get("dirOffsets"):
        rig["dirOffsets"] = spec["dirOffsets"]
    rig.update({"bones": bones, "parts": parts, "actions": actions})

    for f in os.listdir(os.path.join(out, "parts")):
        if f not in files:
            os.remove(os.path.join(out, "parts", f))
    hashes = {}
    for name, im in files.items():
        p = os.path.join(out, "parts", name)
        im.save(p, optimize=True)
        hashes["parts/" + name] = sha(p)
    with open(rig_path, "w") as fh:
        json.dump(rig, fh, indent=1)
        fh.write("\n")
    with open(os.path.join(out, "license.txt"), "w") as fh:
        fh.write(LICENSE.format(hero=hero))
    hashes["rig.json"] = sha(rig_path)
    debug(hero, spec, src, padded, masks, q, size)
    print("ok", hero)
    return {"inputs": inputs_of(hero), "outputs": hashes}


def debug(hero, spec, src, padded, masks, q, size):
    if not os.path.isdir(DEBUG):
        return
    d = os.path.join(DEBUG, hero)
    os.makedirs(d, exist_ok=True)
    bg = Image.new("RGBA", (size, size), (38, 34, 44, 255))
    bg.alpha_composite(Image.fromarray(padded, "RGBA"))
    bg.save(os.path.join(d, "body-on-dark.png"))
    # Bone weights: each bone a hue, vertex dots sized by weight, over the body.
    pal = [(255, 255, 255), (255, 80, 80), (80, 255, 80), (80, 140, 255), (255, 220, 60), (255, 80, 255), (60, 255, 255), (255, 150, 40), (160, 100, 255), (120, 255, 160)]
    im = bg.copy()
    dr = ImageDraw.Draw(im)
    n = q.shape[0]
    for j in range(n):
        for i in range(n):
            w = q[j, i]
            c = np.zeros(3)
            for b in range(len(w)):
                c += np.array(pal[b % len(pal)]) * w[b] / 256
            x, y = i * STEP, j * STEP
            dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=tuple(int(v) for v in c) + (255,))
    for b, bone in enumerate(spec["bones"]):
        x, y = bone["head"][0] + PAD, bone["head"][1] + PAD
        dr.rectangle([x - 5, y - 5, x + 5, y + 5], outline=pal[b % len(pal)] + (255,), width=2)
        dr.text((x + 7, y - 6), bone["id"], fill=pal[b % len(pal)] + (255,))
    im.resize((size * 2, size * 2), Image.NEAREST).save(os.path.join(d, "weights.png"))


def main(argv):
    check = "--check" in argv
    heroes = [a for a in argv if not a.startswith("--")] or sorted(f[:-5] for f in os.listdir(SPEC_DIR) if f.endswith(".json") and not f.endswith(".anim.json"))
    lock = json.load(open(LOCK)) if os.path.exists(LOCK) else {}
    if check:
        stale = [h for h in heroes if lock.get(h, {}).get("inputs") != inputs_of(h)]
        if stale:
            sys.exit("portrait rigs out of date (run tools/assets/portrait-rig/prep.py): " + ", ".join(stale))
        print("portrait rigs up to date:", ", ".join(heroes))
        return
    for h in heroes:
        lock[h] = build(h)
    with open(LOCK, "w") as fh:
        json.dump({k: lock[k] for k in sorted(lock)}, fh, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
