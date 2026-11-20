"""Rebuilds the legacy-layout map strips (public/assets/img/map/<hero>.png, 320x80: four 80x80 frames) from the packed sheets' idle/E
frames, so the HUD portrait, the hero-select grid and panel, the Versus pick tiles, the garrison avatars and the character details match
the in-game sprite.

Run after `pnpm assets:bake && pnpm assets:sheets`:
    ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/map-strips.py [hero ...]   (default: every hero with a sheet)

Frame rects come from src/game/assets/sheets.generated.json, never from fixed offsets. An 80 px sheet without a box is copied pixel for
pixel (no resampling, as the old rig-gen/pax-portrait.py did). A sheet with a visual box (the portrait rigs, 240 px frames) has the box
cut out and area-downscaled once to fit 80 (premultiplied box filter; letterboxed: scale 80/max(w,h), bottom-centred, never squashed), so the strip shows the body at the same framing as the legacy art.
Never writes the 400x400 `<hero>Large.png` portraits."""
import json
import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
CELL = 80
# QA r66: the legacy Wispera was a translucent haze (mean alpha ~73) that dissolved into the HUD at 80 px, so it was lifted here. The redrawn
# Wispera (WISPERA-R2) is opaque, so no hero needs a lift now. Format kept: hero -> (floor, gamma): alpha becomes 255*(a/255)**gamma, fainter than floor dropped.
ALPHA_LIFT = {}
SPILL_ALPHA = 32  # art fainter than this (soft contact shadow, glow falloff) does not widen the crop
SPILL_TOL = 8  # px of spill past the box (in sheet px) that still counts as the box's own soft edge
SPILL_LUT = [255 if v >= SPILL_ALPHA else 0 for v in range(256)]


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
    # crop rect = the box united with the art's real extent (alpha >= SPILL_ALPHA) over the four strip frames, so a longer tail or wing that
    # spills past the box is not cut; the same rect for all four frames, still letterboxed. With no spill it is exactly the box.
    x0, y0, x1, y1 = bx, by, bx + bw, by + bh
    for i in range(4):
        fx, fy = row["frames"][i % len(row["frames"])]
        ext = sheet.crop((fx, fy, fx + frame, fy + frame)).getchannel("A").point(SPILL_LUT).getbbox()
        if ext:
            x0, y0, x1, y1 = min(x0, ext[0]), min(y0, ext[1]), max(x1, ext[2]), max(y1, ext[3])
    # a side widens only when the art spills past the box by more than SPILL_TOL px: the baked boxes already carry 1-3 px of soft edge
    # (shadow, anti-alias) below and above the body, and the strips must stay as they are
    x0 = x0 if bx - x0 > SPILL_TOL else bx
    y0 = y0 if by - y0 > SPILL_TOL else by
    x1 = x1 if x1 - (bx + bw) > SPILL_TOL else bx + bw
    y1 = y1 if y1 - (by + bh) > SPILL_TOL else by + bh
    bx, by, bw, bh = x0, y0, x1 - x0, y1 - y0
    for i in range(4):
        fx, fy = row["frames"][i % len(row["frames"])]
        cell = sheet.crop((fx + bx, fy + by, fx + bx + bw, fy + by + bh))
        if (bw, bh) != (CELL, CELL):
            # letterbox, never squash: scale by CELL / max(bw, bh), centred horizontally and sitting on the cell's bottom
            k = CELL / max(bw, bh)
            nw, nh = max(1, round(bw * k)), max(1, round(bh * k))
            cell = cell.resize((nw, nh), Image.Resampling.BOX)  # Pillow premultiplies RGBA for this filter
            out.paste(cell, (i * CELL + (CELL - nw) // 2, CELL - nh))
        else:
            out.paste(cell, (i * CELL, 0))
    if hero in ALPHA_LIFT:
        floor, gamma = ALPHA_LIFT[hero]
        r, g, b, a = out.split()
        a = a.point([0 if v == 0 else round(255 * (v / 255) ** gamma) if v >= floor else 0 for v in range(256)])
        out = Image.merge("RGBA", (r, g, b, a))
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
