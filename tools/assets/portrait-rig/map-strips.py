"""Rebuilds the legacy-layout map strips (public/assets/img/map/<hero>.png, 320x80: four 80x80 frames) from the packed sheets' idle/E
frames, so the HUD portrait, the hero-select grid and panel, the Versus pick tiles, the garrison avatars and the character details match
the in-game sprite.

Run after `pnpm assets:bake && pnpm assets:sheets`:
    ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/map-strips.py [hero ...]   (default: every hero with a sheet)

Frame rects come from src/game/assets/sheets.generated.json, never from fixed offsets. An 80 px sheet without a box is copied pixel for
pixel (no resampling, as the old rig-gen/pax-portrait.py did). A sheet with a visual box (the portrait rigs, 240 px frames) has the box
cut out and area-downscaled once to 80 (premultiplied box filter), so the strip shows the body at the same framing as the legacy art.
Never writes the 400x400 `<hero>Large.png` portraits."""
import json
import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
CELL = 80


def entry_of(manifest, hero):
    for e in manifest["sheets"]:
        if e["sprite"] == hero and e.get("url"):
            return e
    return None


def strip(manifest, hero):
    e = entry_of(manifest, hero)
    if e is None:
        raise SystemExit("%s: no packed sheet" % hero)
    frame = e.get("frame", manifest["spec"]["frame"])
    bx, by, bw, bh = e.get("box", [0, 0, frame, frame])
    row = next((r for r in e["rows"] if r["key"] == "idle/E"), None)
    if row is None:
        raise SystemExit("%s: sheet has no idle/E row" % hero)
    sheet = Image.open(os.path.join(ROOT, "public/assets/img/sheets/%s.png" % hero)).convert("RGBA")
    out = Image.new("RGBA", (4 * CELL, CELL), (0, 0, 0, 0))
    for i in range(4):
        fx, fy = row["frames"][i % len(row["frames"])]
        cell = sheet.crop((fx + bx, fy + by, fx + bx + bw, fy + by + bh))
        if (bw, bh) != (CELL, CELL):
            cell = cell.resize((CELL, CELL), Image.Resampling.BOX)  # Pillow premultiplies RGBA for this filter
        out.paste(cell, (i * CELL, 0))
    return out


def main(argv):
    with open(os.path.join(ROOT, "src/game/assets/sheets.generated.json")) as f:
        manifest = json.load(f)
    heroes = argv or [e["sprite"] for e in manifest["sheets"] if e.get("url")]
    for hero in heroes:
        if hero.endswith("Large"):
            raise SystemExit("refusing to write a Large portrait")
        strip(manifest, hero).save(os.path.join(ROOT, "public/assets/img/map/%s.png" % hero), optimize=True)
        print("ok", hero)


if __name__ == "__main__":
    main(sys.argv[1:])
