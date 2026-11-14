"""Side-by-side of an in-game screenshot crop and the painted portrait it was rigged from, for the visual QA of the portrait rigs.

    ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/compare-shots.py <shot.png> <out.png> <hero> [x y w h] [hero x y w h ...]

Each (hero, crop) pair becomes one row: the screenshot crop at 1:1 (screen pixels, so dpr 2 shots show device pixels) and the
portrait (public/assets/img/map/<hero>Large.png) box-scaled to the crop's height on the arena grey. With no crop the whole
screenshot is used. Screenshots come from tests/e2e/hero-portrait-shot.spec.ts with SHOT_DIR set; nothing is written to the repo.
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
BG = (38, 34, 44, 255)


def portrait(hero, h):
    p = Image.open(os.path.join(ROOT, "public", "assets", "img", "map", hero + "Large.png")).convert("RGBA")
    w = max(1, round(p.width * h / p.height))
    out = Image.new("RGBA", (w, h), BG)
    out.alpha_composite(p.resize((w, h), Image.LANCZOS))
    return out


def main(argv):
    shot, out = Image.open(argv[0]).convert("RGBA"), argv[1]
    rest = argv[2:]
    rows = []
    while rest:
        hero = rest[0]
        if len(rest) >= 5 and all(v.lstrip("-").isdigit() for v in rest[1:5]):
            x, y, w, h = (int(v) for v in rest[1:5])
            rest = rest[5:]
        else:
            x, y, w, h = 0, 0, shot.width, shot.height
            rest = rest[1:]
        crop = shot.crop((x, y, x + w, y + h))
        rows.append((hero, crop, portrait(hero, h)))
    width = max(c.width + p.width for _, c, p in rows) + 12
    sheet = Image.new("RGBA", (width, sum(c.height for _, c, _ in rows) + 4 * len(rows)), BG)
    dr = ImageDraw.Draw(sheet)
    y = 0
    for hero, crop, por in rows:
        sheet.alpha_composite(crop, (0, y))
        sheet.alpha_composite(por, (crop.width + 12, y))
        dr.text((crop.width + 16, y + 4), hero + " (portrait)", fill=(230, 230, 230, 255))
        y += crop.height + 4
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1:])
