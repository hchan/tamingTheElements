"""Procedural KO key frames for roster24 heroes whose bone rig tears limbs on a fall (abyssor, zephra; same method as quarrak-ko-keys.py).
Squashes the baked idle frame and drops it to the ground, writing imgWorkArea/rigs/<hero>/keys/ko/<dir>/00..03.png (the bake takes them in
place of its own render). Run after prep.py and a first bake (it reads the baked idle frame), then bake again.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/r24-ko-keys.py HERO [HERO...]"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
DIRS = ["E", "SE", "NE", "S", "N"]
F = 240
MARGIN = 4
# (rotation degrees clockwise about the feet, horizontal scale, vertical scale, dx, dy) per frame; the last frame holds
POSES = [(0, 1.0, 0.94, -2, 0), (0, 1.04, 0.84, -4, 0), (0, 1.08, 0.74, -5, 0), (0, 1.1, 0.7, -5, 0)]
# per-hero overrides: vortigal (a flier) tips over and drops hard, so the four frames read as a fall and not a squash
HERO_POSES = {"hyalia": [(0, 1.0, 0.98, -2, 0), (10, 0.92, 0.88, -5, 3), (22, 0.9, 0.78, -8, 8), (30, 0.9, 0.72, -9, 12)],  # hyalia: a tall quadruped that topples and slumps
              "vortigal": [(0, 1.0, 1.0, -2, 0), (24, 0.93, 0.9, -6, 6), (58, 0.88, 0.82, -10, 16), (82, 0.86, 0.78, -12, 22)]}
MARGINS = {"hyalia": 8, "vortigal": 9}  # the blurred contact shadow reaches a few px past the wing tips, so a flier needs a wider crop margin
heroes = sys.argv[1:] or sys.exit("usage: r24-ko-keys.py HERO [HERO...]")

for hero in heroes:
    M = MARGINS.get(hero, MARGIN)
    for d in DIRS:
        src = Image.open(os.path.join(ROOT, "imgWorkArea", "sheets", hero, "idle", d, "00.png")).convert("RGBA")
        out_dir = os.path.join(ROOT, "imgWorkArea", "rigs", hero, "keys", "ko", d)
        os.makedirs(out_dir, exist_ok=True)
        bbox = src.getbbox()
        assert bbox is not None
        pivot = ((bbox[0] + bbox[2]) // 2, bbox[3])  # the feet line
        H = F // 2
        for i, (rot, sx, sy, dx, dy) in enumerate(HERO_POSES.get(hero, POSES)):
            img = src.resize((round(F * sx), round(F * sy)), Image.LANCZOS)
            big = Image.new("RGBA", (F * 2, F * 2), (0, 0, 0, 0))
            big.alpha_composite(img, (pivot[0] + H - round(pivot[0] * sx), pivot[1] + H - round(pivot[1] * sy)))
            big = big.rotate(-rot, resample=Image.BICUBIC, center=(pivot[0] + H, pivot[1] + H))
            bb = big.getbbox()
            assert bb is not None
            ox = max(min(H - dx, bb[0] - M), bb[2] + M - F)
            oy = max(min(H - dy, bb[1] - M), bb[3] + M - F)
            out = big.crop((ox, oy, ox + F, oy + F))
            sh = Image.new("RGBA", (F, F), (0, 0, 0, 0))
            b2 = out.getbbox()
            cx, fy = (b2[0] + b2[2]) // 2, b2[3]
            ImageDraw.Draw(sh).ellipse((cx - (b2[2] - b2[0]) // 2, fy - 7, cx + (b2[2] - b2[0]) // 2, fy - 1), fill=(0, 0, 0, 110))
            out = Image.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2)), out)
            out.save(os.path.join(out_dir, f"{i:02d}.png"))
        print(hero, d, "ok")
