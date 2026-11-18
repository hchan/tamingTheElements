#!/usr/bin/env python3
"""Contact sheet: each original beside its element-paired new roster24 candidate(s).

  contact-sheet.py PICKS.json OUT_PREFIX [--repo DIR]

PICKS.json: {"kindrel": ["a.png", "b.png"], ...}  (1..3 candidates per new hero; missing = blank cell).
Originals come from <repo>/public/assets/img/map/<id>Large.png (the released heroes; legacy tag
legacy-crafty-1.0 has the same art). Pairing is positional within an element:
  fire  fiara/lavax/sindarosa   <-> kindrel/brazgor/ouroth
  water curomo/ishimi/morblass  <-> nykra/glimmaw/abyssor
  earth pax/rokcore/treenoc     <-> quarrak/durrok/umbrel
  air   cyclonius/echo/wispera  <-> hyalia/zephra/vortigal
Writes OUT_PREFIX-<element>.png (3 rows) and OUT_PREFIX-overview.png (12 rows, 1 candidate each).
Pairing is for orientation only; the originals are different characters, not like-for-like redesigns.
"""
import json, os, sys
from PIL import Image, ImageDraw

PAIRS = {
    "fire": (["fiara", "lavax", "sindarosa"], ["kindrel", "brazgor", "ouroth"]),
    "water": (["curomo", "ishimi", "morblass"], ["nykra", "glimmaw", "abyssor"]),
    "earth": (["pax", "rokcore", "treenoc"], ["quarrak", "durrok", "umbrel"]),
    "air": (["cyclonius", "echo", "wispera"], ["hyalia", "zephra", "vortigal"]),
}
CELL = 320
BG = (226, 226, 230)


def cell(path, label):
    c = Image.new("RGB", (CELL, CELL + 22), BG)
    if path and os.path.exists(path):
        im = Image.open(path).convert("RGBA")
        im.thumbnail((CELL - 8, CELL - 8))
        c.paste(im, ((CELL - im.width) // 2, (CELL - im.height) // 2), im)
    ImageDraw.Draw(c).text((6, CELL + 5), label, fill=(20, 20, 20))
    return c


def sheet(rows, ncand, out):
    cols = 1 + ncand
    w, h = cols * (CELL + 4), len(rows) * (CELL + 26)
    s = Image.new("RGB", (w, h), (255, 255, 255))
    for r, (orig, name, cands) in enumerate(rows):
        s.paste(cell(orig, "ORIGINAL " + name[0]), (0, r * (CELL + 26)))
        for k in range(ncand):
            p = cands[k] if k < len(cands) else None
            s.paste(cell(p, f"NEW {name[1]} #{k + 1}"), ((k + 1) * (CELL + 4), r * (CELL + 26)))
    s.save(out)
    print("wrote", out)


def main():
    picks = json.load(open(sys.argv[1]))
    prefix = sys.argv[2]
    repo = sys.argv[sys.argv.index("--repo") + 1] if "--repo" in sys.argv else "."
    allrows = []
    for el, (olds, news) in PAIRS.items():
        rows = [(f"{repo}/public/assets/img/map/{o}Large.png", (o, n), picks.get(n, [])) for o, n in zip(olds, news)]
        sheet(rows, 3, f"{prefix}-{el}.png")
        allrows += rows
    sheet([(o, n, c[:1]) for o, n, c in allrows], 1, f"{prefix}-overview.png")


main()
