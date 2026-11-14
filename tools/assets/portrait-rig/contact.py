"""Contact sheet of a hero's baked frames (imgWorkArea/sheets/<hero>/<action>/<dir>/NN.png) on a dark arena colour, for eyeballing.

    ~/venv/bin/python -I tools/assets/portrait-rig/contact.py <hero> <out.png> [scale] [action ...]

One row per action and direction, the visual box outlined in grey and the frame edge in dark red; nothing is written to the repo.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
ACTIONS = ["idle", "walk", "cast", "hurt", "guard", "dash", "ko", "victory", "tagIn"]


def main(argv):
    hero, out = argv[0], argv[1]
    scale = float(argv[2]) if len(argv) > 2 else 1.0
    dirs = ["E", "SE", "S", "N", "NE"]
    acts = []
    for a in argv[3:]:
        if a.startswith("--dirs="):
            dirs = a[7:].split(",")
        else:
            acts.append(a)
    acts = acts or ACTIONS
    base = os.path.join(ROOT, "imgWorkArea", "sheets", hero)
    box_path = os.path.join(base, "box.json")
    box = json.load(open(box_path)) if os.path.exists(box_path) else None
    rows = []
    for a in acts:
        for d in dirs:
            p = os.path.join(base, a, d)
            if os.path.isdir(p):
                rows.append((a, d, [Image.open(os.path.join(p, f)).convert("RGBA") for f in sorted(os.listdir(p)) if f.endswith(".png")]))
    fw = rows[0][2][0].width
    cell = int(fw * scale)
    ncol = max(len(r[2]) for r in rows)
    sheet = Image.new("RGBA", (ncol * cell + 70, len(rows) * cell), (38, 34, 44, 255))
    dr = ImageDraw.Draw(sheet)
    for j, (a, d, frames) in enumerate(rows):
        dr.text((4, j * cell + 4), f"{a}\n{d}", fill=(220, 220, 220, 255))
        for i, im in enumerate(frames):
            x, y = 70 + i * cell, j * cell
            if scale != 1:
                im = im.resize((cell, cell), Image.LANCZOS)
            sheet.alpha_composite(im, (x, y))
            dr.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(90, 30, 30, 255))
            if box:
                bx, by, bw, bh = (v * scale for v in box)
                dr.rectangle([x + bx, y + by, x + bx + bw - 1, y + by + bh - 1], outline=(70, 70, 80, 255))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1:])
