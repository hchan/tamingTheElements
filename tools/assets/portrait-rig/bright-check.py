"""A portrait-rig hero's baked frames over a bright air-stage backdrop (top) and a dark one (bottom), enlarged, to spot see-through holes and a torn or ragged matte.

    ~/venv/bin/python -I tools/assets/portrait-rig/bright-check.py <hero> <out.png> [scale] [key:frameIndex ...]   (default hurt/E:0 hurt/E:1 idle/E:0 cast/E:2)

Reads the packed sheet public/assets/img/sheets/<hero>.png through its manifest rects; nothing is written to the repo.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def main(argv):
    hero, out = argv[0], argv[1]
    scale = int(argv[2]) if len(argv) > 2 else 2
    picks = argv[3:] or ["hurt/E:0", "hurt/E:1", "idle/E:0", "cast/E:2"]
    man = json.load(open(os.path.join(ROOT, "src", "game", "assets", "sheets.generated.json")))
    ent = next(s for s in man["sheets"] if s["sprite"] == hero)
    rows = {r["key"]: r["frames"] for r in ent["rows"]}
    sheet = Image.open(os.path.join(ROOT, "public", "assets", ent["url"])).convert("RGBA")
    f = ent["frame"]
    cell = f * scale
    img = Image.new("RGBA", (cell * len(picks), cell * 2), (0, 0, 0, 255))
    for i, p in enumerate(picks):
        key, idx = p.split(":")
        x, y = rows[key][int(idx)]
        fr = sheet.crop((x, y, x + f, y + f)).resize((cell, cell), Image.BILINEAR)
        for j, bg in enumerate(((214, 226, 246, 255), (34, 30, 44, 255))):
            tile = Image.new("RGBA", (cell, cell), bg)
            tile.alpha_composite(fr)
            img.paste(tile, (i * cell, j * cell))
    img.convert("RGB").save(out)


if __name__ == "__main__":
    main(sys.argv[1:])
