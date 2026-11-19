"""Seam mesh and geodesic auto-weights for a portrait rig skin (numpy + Pillow only; called by prep.py when a spec opts in).

A spec opts in with  "skin": {"mesh": "seam", "step": 12, "weights": "geodesic"}  (prep.py default is the plain grid skin).
Output is the free-form skin of tools/assets/bake-rig.ts (ADR-0020, plan M1): {"verts": flat [x0,y0,...] in part px,
"tris": flat vertex-index triples drawn in list order, "bones": [ids], "w": nv x nb Q8 weights (<= 3 non-zero, sum 256),
"dw": optional nv values 0..256}. There is no "grid"/"step" key.

  1. A grid at `step` over the canvas; a cell is live when it holds a pixel with alpha > 0 (1 px margin for the bilinear fringe).
  2. Seams: the solid pixels (alpha >= SOLID) in a vertex's 2*step square window are labelled with 8-connected components. A vertex
     gets one copy per component; each triangle corner takes the copy whose component covers most of the triangle's solid pixels
     (ties: the first component in raster order). A painted interior is one component per window, so it never splits.
  3. Each bone is a segment: its head to `tip` (spec), else to its first child's head, else just the head.
  4. Geodesic distance per bone: integer chamfer (5 straight / 7 diagonal) Dijkstra over solid pixels from the segment;
     a vertex copy reads it at the nearest solid pixel of its own component.
  5. Weight ~ 1/(d + 1)^2 over the 3 nearest bones, times the bone's poly mask when a mask is given (e.g. the jaw); Q8, remainder
     to the heaviest bone. A copy no bone reaches (a detached island) goes to bone 0.
  6. Triangle order: triangles led by a bone flagged "front" draw last, otherwise raster order (folds such as a curled tail).
Deterministic: integer distances, stable orderings, no randomness.
"""
import heapq
from collections import deque

import numpy as np

SOLID = 32
INF = 1 << 30
MAX_STEP = 64  # the baker rejects longer UV edges
NB8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def label(mask):
    """8-connected component labels (1..n in raster order of the first pixel), 0 = clear."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy, dx in NB8:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def bone_segments(bones):
    """[(x0, y0, x1, y1)] per bone: head to tip, else to the first child's head, else the head alone."""
    by = {b["id"]: b for b in bones}
    kid = {}
    for b in bones:
        if "parent" in b:
            kid.setdefault(b["parent"], b)
    out = []
    for b in bones:
        h = b["head"]
        t = b.get("tip") or (kid[b["id"]]["head"] if b["id"] in kid else h)
        out.append((h[0], h[1], t[0], t[1]))
    assert len(by) == len(bones), "duplicate bone id"
    return out


def geodesic(solid, seg, ys, xs):
    """Chamfer 5/7 distance (int list over a padded flat grid) from the segment to every solid pixel (INF when unreachable).
    ys, xs: coordinates of every solid pixel (for the nearest-solid snap of a segment point that lies off the paint)."""
    h, w = solid.shape
    w2 = w + 2
    ok = np.zeros((h + 2, w2), bool)
    ok[1:-1, 1:-1] = solid
    ok = ok.reshape(-1).tolist()
    dist = [INF] * len(ok)
    heap = []
    x0, y0, x1, y1 = seg
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    seeds = {}
    for k in range(n + 1):
        px = x0 + (x1 - x0) * k // n
        py = y0 + (y1 - y0) * k // n
        if 0 <= px < w and 0 <= py < h and solid[py, px]:
            seeds[(py, px)] = 0
            continue
        d2 = (ys - py) ** 2 + (xs - px) ** 2
        i = int(np.argmin(d2))  # first minimum in raster order
        c = 5 * int(np.sqrt(d2[i]) + 0.5)
        key = (int(ys[i]), int(xs[i]))
        if c < seeds.get(key, INF):
            seeds[key] = c
    for (y, x), c in sorted(seeds.items()):
        i = (y + 1) * w2 + x + 1
        dist[i] = c
        heap.append((c, i))
    heapq.heapify(heap)
    steps = [(dy * w2 + dx, 5 if dy == 0 or dx == 0 else 7) for dy, dx in NB8]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for o, c in steps:
            j = i + o
            if ok[j] and d + c < dist[j]:
                dist[j] = d + c
                heapq.heappush(heap, (d + c, j))
    return np.array(dist, np.int64).reshape(h + 2, w2)[1:-1, 1:-1]


def tri_pixels(a, b, c, h, w):
    """(ys, xs) of pixel centres inside triangle a, b, c (vertex (x, y) px), clipped to the image."""
    x0, x1 = max(int(min(a[0], b[0], c[0])), 0), min(int(max(a[0], b[0], c[0])) + 1, w)
    y0, y1 = max(int(min(a[1], b[1], c[1])), 0), min(int(max(a[1], b[1], c[1])) + 1, h)
    if x1 <= x0 or y1 <= y0:
        return np.zeros(0, int), np.zeros(0, int)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    px, py = 2 * xx + 1, 2 * yy + 1  # doubled coordinates: centres are integers
    P = [(2 * a[0], 2 * a[1]), (2 * b[0], 2 * b[1]), (2 * c[0], 2 * c[1])]
    area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0])
    s = 1 if area > 0 else -1
    m = np.ones(px.shape, bool)
    for i in range(3):
        p, q = P[i], P[(i + 1) % 3]
        m &= s * ((q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0])) >= 0
    return yy[m], xx[m]


def build_skin(rgba, bones, step, masks=None, dw_mask=None):
    """rgba: (H, W, 4) uint8 body canvas. bones: [{id, head [x, y] in canvas px, tip?, parent?, front?}] (bone 0 is the root).
    masks: optional {bone id: (H, W) float 0..1} multiplied into that bone's weights. dw_mask: optional (H, W) float 0..1.
    Returns (skin dict for rig.json, info dict for debug_images)."""
    if not 1 <= step <= MAX_STEP:
        raise ValueError(f"step {step} outside 1..{MAX_STEP}")
    masks = masks or {}
    H, W = rgba.shape[:2]
    alpha = rgba[..., 3]
    solid = alpha >= SOLID
    live = alpha > 0
    for dy, dx in NB8:  # 1 px margin
        live = live | np.roll(np.roll(alpha > 0, dy, 0), dx, 1)
    nx, ny = -(-W // step) + 1, -(-H // step) + 1
    gx = [min(i * step, W) for i in range(nx)]
    gy = [min(j * step, H) for j in range(ny)]

    # Step 2: per grid vertex, the component labels of its window.
    wins = {}

    def window(i, j):
        if (i, j) not in wins:
            x, y = gx[i], gy[j]
            ya, yb, xa, xb = max(y - step, 0), min(y + step, H), max(x - step, 0), min(x + step, W)
            lab, n = label(solid[ya:yb, xa:xb])
            wins[(i, j)] = (ya, xa, lab, n)
        return wins[(i, j)]

    tris = []  # (cell index, [(i, j, comp) per corner])
    for j in range(ny - 1):
        for i in range(nx - 1):
            if not live[gy[j]:gy[j + 1], gx[i]:gx[i + 1]].any():
                continue
            for ids in (((i, j), (i + 1, j), (i, j + 1)), ((i + 1, j), (i + 1, j + 1), (i, j + 1))):
                pts = [(gx[a], gy[b]) for a, b in ids]
                ys, xs = tri_pixels(*pts, H, W)
                if not len(ys):
                    continue
                if not live[ys, xs].any():
                    continue
                sel = solid[ys, xs]
                corners = []
                for a, b in ids:
                    ya, xa, lab, n = window(a, b)
                    comp = 0
                    if n:
                        inside = (ys >= ya) & (ys < ya + lab.shape[0]) & (xs >= xa) & (xs < xa + lab.shape[1]) & sel
                        cnt = np.bincount(lab[ys[inside] - ya, xs[inside] - xa], minlength=n + 1)[1:]
                        comp = int(np.argmax(cnt)) + 1 if cnt.sum() else 1
                    corners.append((a, b, comp))
                tris.append(corners)

    # Vertex copies actually used, in (row, column, component) order.
    used = sorted({c for t in tris for c in t}, key=lambda c: (c[1], c[0], c[2]))
    index = {c: k for k, c in enumerate(used)}
    verts = []
    for i, j, _ in used:
        verts += [gx[i], gy[j]]

    # Steps 3-5: geodesic weights per used copy.
    segs = bone_segments(bones)
    ys, xs = np.nonzero(solid)
    nb = len(bones)
    D = np.full((len(used), nb), INF, np.int64)
    if len(ys):
        for b in range(nb):
            dist = geodesic(solid, segs[b], ys, xs)
            for k, (i, j, comp) in enumerate(used):
                y, x = gy[j], gx[i]
                ya, xa, lab, n = window(i, j)
                if comp and n:
                    wy, wx = np.nonzero(lab == comp)
                    py, px = wy + ya, wx + xa
                else:
                    py, px = ys, xs
                d2 = (py - y) ** 2 + (px - x) ** 2
                m = int(np.argmin(d2))
                D[k, b] = dist[py[m], px[m]]
    Wf = np.zeros((len(used), nb), np.float64)
    for k, (i, j, _) in enumerate(used):
        y, x = min(gy[j], H - 1), min(gx[i], W - 1)
        for b in range(nb):
            if D[k, b] < INF:
                mk = masks.get(bones[b]["id"])
                Wf[k, b] = (1.0 if mk is None else float(mk[y, x])) / (float(D[k, b]) + 1.0) ** 2
        if Wf[k].sum() == 0:  # a mask zeroed every reachable bone, or the island is out of reach
            reach = [b for b in range(nb) if D[k, b] < INF]
            if reach:
                Wf[k, min(reach, key=lambda b: (D[k, b], b))] = 1.0
            else:
                Wf[k, 0] = 1.0
    order = np.argsort(-Wf, axis=1, kind="stable")
    Wf[np.arange(len(used))[:, None], order[:, 3:]] = 0
    Wf /= Wf.sum(1, keepdims=True)
    Q = np.floor(Wf * 256).astype(np.int64)
    Q[np.arange(len(used)), order[:, 0]] += 256 - Q.sum(1)

    # Step 6: draw order.
    front = {b for b, bone in enumerate(bones) if bone.get("front")}
    lead = []
    for corners in tris:
        tot = sum(Q[index[c]].astype(np.int64) for c in corners)
        lead.append(int(np.argmax(tot)) in front)
    seq = sorted(range(len(tris)), key=lambda t: (lead[t], t))
    flat = [index[c] for t in seq for c in tris[t]]

    out = {"verts": verts, "tris": flat, "bones": [b["id"] for b in bones], "w": Q.reshape(-1).tolist()}
    if dw_mask is not None:
        v = np.array(verts).reshape(-1, 2)
        out["dw"] = np.round(dw_mask[np.minimum(v[:, 1], H - 1), np.minimum(v[:, 0], W - 1)] * 256).astype(int).tolist()
    seams = len(used) - len({(i, j) for i, j, _ in used})
    return out, {"Q": Q, "used": used, "seams": seams, "size": (W, H)}


def debug_images(rgba, skin, info, out_dir):
    """weights.png (bone hues, seam copies ringed) and mesh.png (wireframe) over the body on a dark ground."""
    import os
    from PIL import Image, ImageDraw
    pal = [(255, 255, 255), (255, 80, 80), (80, 255, 80), (80, 140, 255), (255, 220, 60), (255, 80, 255), (60, 255, 255), (255, 150, 40), (160, 100, 255), (120, 255, 160)]
    W, H = info["size"]
    bg = Image.new("RGBA", (W, H), (38, 34, 44, 255))
    bg.alpha_composite(Image.fromarray(rgba, "RGBA"))
    v = np.array(skin["verts"]).reshape(-1, 2)
    Q = info["Q"]
    pos = {}
    for k, (x, y) in enumerate(v.tolist()):
        pos.setdefault((x, y), []).append(k)
    wt = bg.copy()
    d = ImageDraw.Draw(wt)
    for k, (x, y) in enumerate(v.tolist()):
        c = sum(np.array(pal[b % len(pal)]) * Q[k, b] / 256 for b in range(Q.shape[1]))
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=tuple(int(a) for a in c) + (255,))
        if len(pos[(x, y)]) > 1:
            d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 0, 0, 255), width=2)
    wt.resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(out_dir, "weights.png"))
    wf = bg.copy()
    d = ImageDraw.Draw(wf)
    t = skin["tris"]
    for a in range(0, len(t), 3):
        p = [tuple(v[t[a + k]]) for k in range(3)]
        d.polygon(p, outline=(120, 220, 255, 255))
    wf.resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(out_dir, "mesh.png"))
