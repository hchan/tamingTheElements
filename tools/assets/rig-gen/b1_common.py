"""Shared painter for the Roster 24 batch 1 heroes (kindrel.py, nykra.py, quarrak.py, hyalia.py). Same recipe as fiara.py / wispera.py (noise-warped
ragged silhouette, bevel-lit body ramp, Voronoi cells for cracks or plates, emissive accents, no hard outline) with the knobs gathered in one
params dict P so the four heroes stay one coherent family: luminous, painterly, grim-ish, never flat cel art. Needs Pillow + numpy; helpers in
elemental.py. Original art generated from code, no pixels copied from any other artwork."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import elemental as E
from elemental import SS, W
from PIL import Image


def ribbon_poly(pts, w0, w1, per=8):
    p = E.catmull(pts, per)
    return E.ribbon(p, [w0 + (w1 - w0) * i / (len(p) - 1) for i in range(len(p))])


def _layer(rs, polys, ramp, style, n1, n2, yy):
    """An overlay (flame, kelp, moss, filament glow) painted over the base: returns rgb, alpha."""
    m = E.poly_mask(polys)
    base = E.blur(m, SS * 2.0)
    if style == "flame":
        streak = E.fbm(rs, 7, 3, sx=3.5, sy=0.5)
        d = np.maximum(E.warp(base, (n1 - 0.5) * SS * 7, SS * (4 + 7 * streak)), E.warp(base, -(n1 - 0.5) * SS * 3, SS * 2 + n2 * SS * 3))
        a = np.clip((d * (0.75 + 0.5 * streak) - 0.2 - 0.1 * streak) * 3.2, 0, 1)
        heat = np.clip(0.15 + 0.6 * E.blur(m, SS * 4) + 0.4 * (streak - 0.5) + 0.15 * yy, 0, 1) ** 1.2
    else:  # "soft": ragged ribbon with veins
        d = E.warp(base, (n1 - 0.5) * SS * 4, (n2 - 0.5) * SS * 3)
        a = np.clip((d - 0.3) * 3.0, 0, 1)
        vein = E.fbm(rs, 9, 3, sx=2.5, sy=0.6)
        heat = np.clip(0.35 + 0.8 * (vein - 0.5) + 0.3 * (n2 - 0.5) + 0.2 * E.bevel_light(base, 12), 0, 1)
    return E.ramp(ramp, heat), a


def make_paint(P):
    def paint(name, view, polys, g, seed):
        rs = np.random.RandomState(seed)
        xx, yy = E.grid()
        ma = E.poly_mask(polys)
        n1, n2 = E.fbm(rs, 5), E.fbm(rs, 12)
        spec = P["parts"].get(name, {})
        rag = spec.get("rag", P.get("rag", 2.2))
        sil = E.blur(E.warp(E.blur(ma, SS * 1.4), (n1 - 0.5) * SS * rag * 2, (n2 - 0.5) * SS * rag), SS * 0.45)
        alpha = np.clip((sil - 0.45) * 4, 0, 1)
        inner = E.blur(ma, SS * 3.2)
        light = E.bevel_light(inner * (0.85 + 0.3 * n2), P.get("bevel", 16.0))
        t = np.clip(0.42 + 0.36 * light + 0.38 * (n2 - 0.5) + 0.22 * (0.5 - yy) * P.get("vert", 1.0) + spec.get("shade", 0.0), 0, 1)
        rgb = E.ramp(P["body"], t)
        # cells: cracks (emissive seams) or plates (dark seams with lit facets)
        nc = spec.get("cells", P.get("cells", 20))
        d1, d2, nid, vx, vy = E.voronoi(rs, max(2, nc), stretch=P.get("stretch", (1.0, 1.0)))
        if nc == 0:
            d2 = d1 + 1.0  # no seams on this part
        nc = max(2, nc)
        seam = np.clip(1 - (d2 - d1) / 0.022, 0, 1)
        within = np.clip((E.blur(ma, SS * 2.2) - 0.6) * 4, 0, 1)
        pick = np.take(rs.rand(nc), nid)
        facet = (pick - 0.5) * P.get("facet", 0.18)
        rgb = rgb * (1 + facet[..., None])
        if P.get("mode") == "plates":
            rgb = rgb * (1 - 0.5 * seam[..., None] * within[..., None])
        elif P.get("glow"):
            sm = seam * within * spec.get("glow", P.get("glowk", 1.0)) * (0.4 + 0.6 * (rs.rand(nc)[nid] > 0.35))
            gl = E.ramp(P["glow"], np.clip(0.35 + 0.65 * n2, 0, 1))
            rgb = rgb * (1 - 0.85 * sm[..., None]) + gl * 0.85 * sm[..., None]
        # translucent bodies: lighter, more luminous rim and see-through core
        if P.get("opacity") is not None:
            rim = np.clip(1 - inner * 1.25, 0, 1)
            rgb = rgb * (1 - 0.55 * rim[..., None]) + np.array(P["rim"], np.float32) * 0.55 * rim[..., None]
            alpha = alpha * np.clip(P["opacity"] - 0.22 * inner + 0.25 * rim, 0, 1)
        else:  # soft dark edge instead of an outline
            edge = np.clip(1 - inner * 1.3, 0, 1)
            rgb = rgb * (1 - 0.4 * edge[..., None]) + np.array(P.get("edge", (20, 16, 16)), np.float32) * 0.4 * edge[..., None]
        # overlays
        for ov in spec.get("overlays", []):
            opolys = [[E.apply(g["tf"], q) for q in poly] for poly in ov["polys"]]
            lrgb, la = _layer(rs, opolys, ov["ramp"], ov.get("style", "soft"), n1, n2, yy)
            la = la * ov.get("opacity", 1.0)
            rgb = rgb * (1 - la[..., None]) + lrgb * la[..., None]
            alpha = np.maximum(alpha, la)
        # sparkles / motes
        sk = P.get("sparks")
        if sk:
            s = E.blur((rs.rand(W, W) > sk["rate"]).astype(np.float32), SS * 0.5) * 6
            s = np.clip(s * (E.blur(ma, SS * 5) > 0.05), 0, 1)
            rgb = rgb * (1 - s[..., None]) + np.array(sk["color"], np.float32) * s[..., None]
            alpha = np.maximum(alpha, s)
        return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")
    return paint
