"""Regenerates the legacy-layout map strips (public/assets/img/map/<hero>.png, 320x80: four 80x80 frames) from the baked sheets' idle/E frames,
so the HUD portrait, the hero-select grid and panel, the Versus pick tiles, the garrison avatars and the character details all match the
rigged grim elemental beings (the legacy art was cartoony and humanoid; 2026-11-12 Pax, 2026-11-13 all twelve heroes).
Run after `pnpm assets:bake && pnpm assets:sheets`:  python3 tools/assets/rig-gen/pax-portrait.py [hero ...]   (default: every hero; needs Pillow)
Deterministic: a pure crop of the committed sheet, no resampling. Unlisted legacy strips (the Large 400x400 images, variants such as
paxAdrenaline) are untouched; nothing in src reads the Large files."""
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
HEROES = ["fiara", "pax", "treenoc", "wispera", "echo", "curomo", "cyclonius", "ishimi", "lavax", "morblass", "rokcore", "sindarosa"]

for hero in sys.argv[1:] or HEROES:
    sheet = Image.open(os.path.join(ROOT, "public/assets/img/sheets/%s.png" % hero)).convert("RGBA")
    out = Image.new("RGBA", (320, 80), (0, 0, 0, 0))
    for i in range(4):  # idle/E frames sit at (0,0), (80,0), (160,0), (240,0) in the sheet (the cells the legacy file used)
        out.paste(sheet.crop((i * 80, 0, i * 80 + 80, 80)), (i * 80, 0))
    out.save(os.path.join(ROOT, "public/assets/img/map/%s.png" % hero), optimize=True)
    print("ok", hero)
