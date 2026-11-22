"""Treenoc round 5: faithful whole-body sprite from the approved crisp 1024 i2i treant, plus ONE rigid arm piece for cast.

usage: treenoc-whole.py <crisp.png> <rig out dir>
Reproduce: python tools/rig-assist/treenoc-whole.py tools/rig-assist/provenance/treenoc-crisp-r430-seed58500-d0.25.png imgWorkArea/rigs/treenoc
then `pnpm assets:bake && pnpm assets:sheets`.
Source sha256 (the 1024 px crisp image, GPU job r430 seed 58500 denoise 0.25):
a29408e48d6923c248e4e38e0721423d5bc014f3402695ddf0d92e296b3b7434
Writes a 160 px frame / res 2 / ss2 rig (art canvas 320): body.png, armF.png, shadow.png, rig.json. The subject keeps its own
aspect (printed next to treenocLarge.png's), sits with >= 8% margin in the frame, and `box` maps the subject area onto the
80 px visual box, so the on-screen size stays what the 80 px sheet had."""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CANVAS = 320
FIT = 246  # subject limit in art px (rim and stray specks included, keeps >= 8% margin)
OUTLINE = np.array([0x1a, 0x12, 0x0a], np.float32)
MOSS = np.array([0x4e, 0x66, 0x2a], np.float32)
MOSS_HI = np.array([0x8a, 0xa0, 0x4a], np.float32)
EDGE_HI = np.array([0xb4, 0xa0, 0x70], np.float32)
ARM_POLY = [(540, 330), (885, 330), (885, 672), (640, 672), (540, 575), (545, 470), (560, 400)]  # in 1024 source px
SHOULDER = (575, 430)
KEEP_R = 30  # art px of the body kept under the arm so a rotation shows no gap


LICENSE = """Treenoc rig parts (body.png, armF.png, shadow.png).
Source: the owner's original Treenoc treant (the shipped Treenoc art of this project).
Pipeline: img2img repaint of that image (GPU job r430, seed 58500, denoise 0.25) to a crisp 1024 px
image, kept in tools/rig-assist/provenance/ with its sha256 in tools/rig-assist/treenoc-whole.py; then treenoc-whole.py keys the
grey background, Lanczos-downscales it, applies the colour grade (olive-brown, gamma lift, moss patches)
and a dark outline with a 1 px light edge, and cuts one rigid arm piece for the cast animation.
Approval: tools/rig-assist/provenance/treenoc-approval.json (art-director).
Licence: the owner's own artwork and generated derivative; same terms as the rest of the project art.
"""


def key(src: Path):
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    bg = np.median(np.concatenate([im[:40].reshape(-1, 3), im[-40:].reshape(-1, 3)]), 0)
    d = np.sqrt(((im - bg) ** 2).sum(-1))
    a = np.clip((d - 14) / (46 - 14), 0, 1)
    a = a * a * (3 - 2 * a)
    rgb = np.clip((im - bg * (1 - a[..., None])) / np.maximum(a, 1e-3)[..., None], 0, 255)
    return rgb, a


def grade(rgb, a, rng):
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    grey = lum[..., None]
    c = grey + (rgb - grey) * 0.8  # saturation -20%
    olive = np.array([0x5a, 0x4a, 0x30], np.float32)
    t = np.clip(lum / 200, 0, 1)[..., None]
    c = c * 0.62 * (1 - 0.35) + (olive * (0.6 + 0.8 * t)) * 0.35
    c = 255 * (np.clip(c, 0, 255) / 255) ** (1 / 1.3)  # mid-tone lift, gamma 1.3 (readability against the soil)
    c = np.minimum(c, 180)
    h, w = a.shape
    yy = np.linspace(0, 1, h)[:, None]
    c = c * (0.85 + 0.15 * (1 - yy)[..., None])  # slightly lighter at the top
    # moss: low-frequency noise, strongest low on the sprite, <= 10% of the subject area
    n = Image.fromarray(rng.integers(0, 255, (h // 8, w // 8), dtype=np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(5))
    n = np.asarray(n).astype(np.float32) / 255 + 0.25 * yy
    inside = a > 0.5
    thr = np.quantile(n[inside], 0.91)
    m = np.clip((n - thr) / 0.04, 0, 1) * (lum < 150)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    c = c * (1 - 0.7 * m[..., None]) + MOSS * 0.7 * m[..., None]
    c = c + (MOSS_HI - c) * 0.55 * (np.clip((m - 0.5) * 2, 0, 1) * np.clip((lum - 40) / 60, 0, 1))[..., None]  # lit moss tips
    print("moss area %.1f%%" % (100 * ((m > 0.5) & inside).sum() / inside.sum()))
    return np.clip(c, 0, 255)


def thicken(rgb, a, zone):
    """Grow the thin branches inside `zone` (0..1) by 1 px: the new pixels take a dark bark colour."""
    ai = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    g = np.asarray(ai).astype(np.float32) / 255
    na = np.maximum(a, g * zone)
    new = (na - a)[..., None]
    bark = np.array([0x4a, 0x3c, 0x26], np.float32)
    return (rgb * a[..., None] + bark * new) / np.maximum(na, 1e-3)[..., None], na


def edge_light(rgb, a):
    """1 px lighter rim just inside the silhouette (trunk and antler edges)."""
    er = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255
    inner = np.clip(a - er, 0, 1) * (a > 0.9)
    return rgb + (EDGE_HI - rgb) * 0.7 * inner[..., None]


def rim(rgb, a):
    ai = Image.fromarray((a * 255).astype(np.uint8))
    da = np.asarray(ai.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.4))).astype(np.float32) / 255
    da = np.maximum(da, a)
    out_a = a + (1 - a) * da
    out_rgb = (rgb * a[..., None] + OUTLINE * ((1 - a) * da)[..., None]) / np.maximum(out_a, 1e-3)[..., None]
    return out_rgb, out_a


def to_img(rgb, a):
    return Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def main() -> None:
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    rgb, a = key(src)
    ys, xs = np.where(a > 0.5)
    x0, x1, y0, y1 = np.percentile(xs, 0.05), np.percentile(xs, 99.95), np.percentile(ys, 0.05), np.percentile(ys, 99.95)
    w, h = x1 - x0, y1 - y0
    s = min(FIT / w, FIT / h)
    print("subject bbox %.0fx%.0f src px, w/h %.3f; treenocLarge w/h 0.997; diff %.1f%%" % (w, h, w / h, 100 * abs(w / h / 0.9975 - 1)))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    n = int(round(1024 * s))
    ox, oy = CANVAS / 2 - cx * s, CANVAS / 2 - cy * s
    prem = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").convert("RGBa").resize((n, n), Image.LANCZOS)
    can = Image.new("RGBa", (CANVAS, CANVAS), (0, 0, 0, 0))
    can.paste(prem, (int(round(ox)), int(round(oy))))
    px = np.asarray(can.convert("RGBA")).astype(np.float32)
    rgb2, a2 = px[..., :3], px[..., 3] / 255
    rng = np.random.default_rng(5)
    # arm cut: polygon mask at 4x, blurred 1 px
    def tp(p): return ((p[0] * s + ox), (p[1] * s + oy))
    big = Image.new("L", (CANVAS * 4, CANVAS * 4), 0)
    ImageDraw.Draw(big).polygon([(tp(p)[0] * 4, tp(p)[1] * 4) for p in ARM_POLY], fill=255)
    arm_m = np.asarray(big.resize((CANVAS, CANVAS), Image.LANCZOS)).astype(np.float32) / 255
    rgb2 = grade(rgb2, a2, rng)
    rgb2 = edge_light(rgb2, a2)
    rgb2, a2 = thicken(rgb2, a2, np.clip(arm_m * 1.0, 0, 1))
    rgb2, a2 = rim(rgb2, a2)
    ys, xs = np.where(a2 > 0.5)
    mx0, mx1, my0, my1 = xs.min(), xs.max(), ys.min(), ys.max()
    print("margins in frame px (of 160): L %.1f R %.1f T %.1f B %.1f (need >= 12.8)" % (mx0 / 2, (CANVAS - 1 - mx1) / 2, my0 / 2, (CANVAS - 1 - my1) / 2))
    sh = tp(SHOULDER)
    yy, xx = np.mgrid[0:CANVAS, 0:CANVAS]
    keep = np.clip((KEEP_R - np.hypot(xx - sh[0], yy - sh[1])) / 3, 0, 1)
    body = to_img(rgb2, a2 * (1 - arm_m * (1 - keep)))
    arm = to_img(rgb2, a2 * arm_m)
    out.mkdir(parents=True, exist_ok=True)
    (out / "parts").mkdir(exist_ok=True)
    for f in (out / "parts").glob("*.png"):
        f.unlink()
    body.save(out / "parts" / "body.png")
    arm.save(out / "parts" / "armF.png")
    shadow = Image.new("RGBA", (200, 48), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([4, 6, 196, 42], fill=(0, 0, 0, 110))
    shadow.filter(ImageFilter.GaussianBlur(3)).save(out / "parts" / "shadow.png")
    foot = [CANVAS // 2, int(my1) - 4]
    box_bottom = int(math.ceil((my1 + 1) / 2))  # feet sit on the bottom edge of the 80 px visual box
    shp = [round(sh[0]), round(sh[1])]
    rig = {
        "frame": 160, "sample": "ss2", "res": 2, "box": [13, box_bottom - 134, 134, 134], "dirs": ["E", "SE", "NE"],
        "parts": [
            {"id": "shadow", "png": "shadow.png", "pivot": [100, 24], "at": [foot[0], foot[1] + 4], "z": -10},
            {"id": "body", "png": "body.png", "pivot": foot, "at": foot, "z": 0},
            {"id": "armF", "png": "armF.png", "pivot": shp, "at": [shp[0] - foot[0], shp[1] - foot[1]], "z": 1, "parent": "body"},
        ],
        "actions": {
            "idle": {"frames": 4, "curves": {"body": {"dy": [0, -2, -3, -2], "rot": [0, 0, 0, 0]}, "armF": {"rot": [0, 1, 2, 1]}}},
            "walk": {"frames": 4, "curves": {"body": {"rot": [-3, 0, 3, 0], "dy": [0, -3, 0, -3]}, "armF": {"rot": [3, 0, -3, 0]}}},
            "cast": {"frames": 4, "curves": {"armF": {"rot": [4, -12, -20, -6], "sx": [100, 104, 108, 102], "sy": [100, 104, 108, 102]}}},
        },
    }
    (out / "rig.json").write_text(json.dumps(rig, indent=2) + "\n")
    (out / "license.txt").write_text(LICENSE)
    print("wrote", out, "foot", foot, "shoulder", shp)


if __name__ == "__main__":
    main()
