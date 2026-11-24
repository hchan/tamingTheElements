"""Procedural rotating boulder strip for Quarrak's boulderRoll loop body.

Run: ~/claudetmp/venv/bin/python -I tools/assets/roster24-art/boulder-roll-proc.py [--out DIR] [--seed N]
Writes boulder_roll_strip.png (1024x128 RGBA, 8 frames of 128x128), boulder_32px_check.png and
boulder_sheet.png (dark + light backgrounds) into DIR (default .scratch/loop-cpu).
A sphere is shaded with fixed top-left light; its 3D surface texture (Worley cracks, lichen,
pitting) is rotated about the view axis by 45 degrees per frame, so the 8 frames loop seamlessly.
PIL + numpy only, deterministic for a given --seed.
"""
import argparse
import os

import numpy as np
from PIL import Image

F = 128          # frame size
SSX = 3          # supersample
N = F * SSX
R = 0.72         # boulder radius in unit frame (wide transparent margin)
LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT /= np.linalg.norm(LIGHT)


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


class VNoise3:
    def __init__(self, rng, n=16):
        self.n = n
        self.g = rng.random((n, n, n)).astype(np.float32)

    def __call__(self, p, freq):
        q = (p * freq + 100.0)
        i = np.floor(q).astype(np.int32)
        f = q - i
        f = f * f * (3 - 2 * f)
        n = self.n
        out = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                    out = out + w * self.g[(i[..., 0] + dx) % n, (i[..., 1] + dy) % n, (i[..., 2] + dz) % n]
        return out


def fbm(nz, p, base, octs=4):
    s, w, tot = 0, 1.0, 0
    for o in range(octs):
        s = s + w * nz(p + o * 7.3, base * 2 ** o)
        tot += w
        w *= 0.5
    return s / tot


def worley(pts, p):
    d = np.stack([np.sqrt(((p - c) ** 2).sum(-1)) for c in pts], 0)
    d.sort(0)
    return d[0], d[1]


def rotz(p, ang):
    c, s = np.cos(ang), np.sin(ang)
    return np.stack([c * p[..., 0] - s * p[..., 1], s * p[..., 0] + c * p[..., 1], p[..., 2]], -1)


def render(rng_seed, k):
    rng = np.random.default_rng(rng_seed)
    nz = VNoise3(rng)
    nz2 = VNoise3(rng)
    nzl = VNoise3(rng)
    cells = rng.uniform(-1, 1, (26, 3)).astype(np.float32)
    # unit-frame coords, y down
    ax = (np.arange(N, dtype=np.float32) + 0.5) / N * 2 - 1
    X, Y = np.meshgrid(ax, ax)
    u, v = X / R, Y / R
    r2 = u * u + v * v
    # slightly lumpy silhouette
    ang = np.arctan2(v, u)
    lump = 1 + 0.035 * np.sin(3 * ang + 0.7) + 0.025 * np.sin(5 * ang + 2.1) + 0.015 * np.sin(9 * ang)
    rr = np.sqrt(r2) / lump
    inside = rr < 1
    z = np.sqrt(np.clip(1 - rr * rr, 0, 1))
    n = np.stack([u / lump, v / lump, z], -1)  # surface normal / sphere point
    # texture point: rotate about view axis (rolling), clockwise for +k
    tp = rotz(n, -k * np.pi / 4)
    # shape: geometric normal perturbation from fbm bumps (texture-space, so it rotates)
    bump = fbm(nz, tp, 2.5, 4)
    d1, d2 = worley(cells, tp)
    crack = 1 - smooth(d2 - d1, 0.0, 0.06)          # 1 on crack line
    crack *= smooth(fbm(nz2, tp, 1.6, 2), 0.4, 0.55)  # cracks fade in and out
    facet = (d1 * 3.0) % 1.0
    lich_f = fbm(nzl, tp + 3.1, 2.2, 4)
    lichen = smooth(lich_f, 0.5, 0.58) * (1 - 0.7 * crack)
    pit = smooth(fbm(nz2, tp + 9.0, 9.0, 2), 0.66, 0.8)

    # lighting from perturbed normal (finite diff of height in screen space)
    h = (bump * 0.5 + facet * 0.12 - crack * 0.35 + lichen * 0.05 - pit * 0.1).astype(np.float32)
    gx = np.gradient(h, axis=1) * N * 0.045
    gy = np.gradient(h, axis=0) * N * 0.045
    nn = n.copy()
    nn[..., 0] -= gx * (0.4 + 0.6 * z)
    nn[..., 1] -= gy * (0.4 + 0.6 * z)
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-9
    diff = np.clip((nn * LIGHT).sum(-1), 0, 1)
    ao = 0.45 + 0.55 * smooth(z, 0.0, 0.6)            # darker toward the rim
    rim = smooth(rr, 0.82, 1.0)
    shade = (0.18 + 0.95 * diff) * ao

    # albedo: desaturated grey-brown with tonal variation
    t = fbm(nz, tp + 5.0, 3.0, 3)
    base = np.array([112, 100, 88], np.float32)
    dark = np.array([70, 62, 56], np.float32)
    alb = dark + (base - dark) * smooth(t, 0.3, 0.7)[..., None]
    alb = alb * (0.85 + 0.3 * smooth(facet, 0.2, 0.8))[..., None]
    olive = np.array([88, 92, 52], np.float32)
    olive2 = np.array([118, 120, 70], np.float32)
    lc = olive + (olive2 - olive) * smooth(fbm(nzl, tp, 14, 2), 0.4, 0.7)[..., None]
    alb = alb * (1 - lichen[..., None] * 0.85) + lc * lichen[..., None] * 0.85
    alb = alb * (1 - 0.6 * pit[..., None] * (1 - lichen[..., None]))
    alb = alb * (1 - 0.82 * crack[..., None])

    col = alb * shade[..., None]
    # cool-warm: faint warm top-left spec bounce, dark rim
    spec = np.clip((nn * (LIGHT + np.array([0, 0, 1.0])) / 1.6).sum(-1), 0, 1) ** 24
    col += (spec * 28 * (1 - crack))[..., None] * np.array([1, 0.95, 0.85], np.float32)
    col *= (1 - 0.35 * rim)[..., None]
    col = np.clip(col, 0, 255)

    # soft coverage alpha from distance to silhouette (AA via supersampling)
    a = np.clip((1 - rr) * R * N * 0.5, 0, 1)
    rgba = np.dstack([col, a * 255]).astype(np.float32)
    # premultiplied downsample
    pm = rgba[..., :3] * (rgba[..., 3:] / 255)
    pm = pm.reshape(F, SSX, F, SSX, 3).mean((1, 3))
    al = rgba[..., 3].reshape(F, SSX, F, SSX).mean((1, 3))
    rgb = pm / np.maximum(al[..., None] / 255, 1e-4)
    return np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8)


def over_bg(strip, bg):
    im = Image.new("RGBA", strip.size, bg + (255,))
    im.alpha_composite(strip)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".scratch/loop-cpu")
    ap.add_argument("--seed", type=int, default=631)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    frames = [render(a.seed, k) for k in range(8)]
    strip = Image.new("RGBA", (F * 8, F))
    for k, fr in enumerate(frames):
        strip.paste(Image.fromarray(fr, "RGBA"), (k * F, 0))
    strip.save(os.path.join(a.out, "boulder_roll_strip.png"))
    # 32 px legibility check: frames 0..7 at 32 px, dark then light
    small = strip.resize((32 * 8, 32), Image.LANCZOS)
    chk = Image.new("RGBA", (32 * 8, 64))
    chk.paste(over_bg(small, (30, 28, 26)), (0, 0))
    chk.paste(over_bg(small, (200, 196, 186)), (0, 32))
    chk.resize((chk.width * 3, chk.height * 3), Image.NEAREST).save(os.path.join(a.out, "boulder_32px_check.png"))
    sheet = Image.new("RGBA", (F * 8, F * 2 + 64))
    sheet.paste(over_bg(strip, (22, 20, 20)), (0, 0))
    sheet.paste(over_bg(strip, (196, 190, 176)), (0, F))
    sheet.paste(over_bg(small, (30, 28, 26)), (0, F * 2))
    sheet.paste(over_bg(small, (200, 196, 186)), (0, F * 2 + 32))
    sheet.save(os.path.join(a.out, "boulder_sheet.png"))
    print("ok", a.out)


if __name__ == "__main__":
    main()
