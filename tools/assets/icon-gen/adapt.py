"""Probe: adapt Bjerk painterly spell icons (CC-BY 3.0, J. W. Bjerk / eleazzaar) to the 64 px action-bar tile look.
Run: python3 -I tools/assets/icon-gen/adapt.py <free-art dir>   (the dir holds oga-painterly-spell-icons/extracted; read as data only, never executed)
In-repo home of the generator (moved from the gpu-job-server .scratch/free-art probe); see tools/assets/icon-gen/README.md for the licence.
Element colour = the pack's own colour variants (red/orange fire, sky/blue ice, plain/orange rock, sky/blue wind, jade heal ...).
"""
import os, random
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageFilter

import sys
HERE = os.path.dirname(os.path.abspath(__file__))
# The free-art work dir (downloads + candidates) is the first argument, never inside the repo tree.
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", ".scratch", "free-art")
SRC = os.path.join(ROOT, "oga-painterly-spell-icons", "extracted")
SHEET = os.path.join(HERE, "..", "..", "..", "public", "assets", "img", "hud", "actions.png")
OUT = os.path.join(ROOT, "candidates")
TILE = 64
INGAME = 59  # SLOT_SIDE 75 minus ICON_PAD*2 (action-bar.ts) is about 59 px on screen at scale 1
BONE = (226, 218, 198)

# slot -> (shipped cell on actions.png, [4 candidate files as part/name])
SLOTS = {
    "fire":   (7,  ["part1/fireball-red-3", "part3/explosion-orange-3", "part1/fireball-red-2", "part2/beam-red-3"]),
    "water":  (8,  ["part2/ice-blue-3", "part2/ice-sky-3", "part2/ice-jade-3", "part1/fireball-sky-3"]),
    "earth":  (9,  ["part2/rock-plain-3", "part2/rock-orange-3", "part2/vines-plain-3", "part3/leaf-orange-3"]),
    "air":    (10, ["part3/wind-sky-3", "part3/wind-blue-3", "part2/haste-sky-3", "part2/lighting-sky-3"]),
    "heal":   (12, ["part1/heal-jade-3", "part1/heal-sky-3", "part1/heal-royal-3", "part3/leaf-jade-3"]),  # shipped ref: cleanse tile (no heal tile)
    "shield": (5,  ["part1/protect-eerie-3", "part1/protect-blue-3", "part1/protect-sky-3", "part1/protect-orange-3"]),
}

def grade(im, seed):
    im = im.convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.55)        # mute
    im = ImageEnhance.Brightness(im).enhance(0.88)
    im = ImageEnhance.Contrast(im).enhance(1.05)
    im = im.resize((TILE, TILE), Image.LANCZOS)
    px = im.load()
    rng = random.Random(seed)
    for y in range(TILE):
        for x in range(TILE):
            dx, dy = (x - 31.5) / 32, (y - 31.5) / 32
            v = 1 - min(1, (dx * dx + dy * dy)) * 0.25   # soft vignette
            n = int((rng.random() - 0.5) * 12)           # film grain, as actions.py
            r, g, b = px[x, y]
            px[x, y] = tuple(max(0, min(255, int(c * v + (BONE[i] - c) * 0.06 + n))) for i, c in enumerate((r, g, b)))
    ImageDraw.Draw(im).rectangle([0, 0, TILE - 1, TILE - 1], outline=(40, 38, 34))
    return im

def load(rel):
    p = os.path.join(SRC, rel.split("/")[0], rel.split("/")[1] + ".png")
    if not os.path.exists(p):  # part4 lives one level deeper
        p = os.path.join(SRC, "part4", "painterly-spell-icons-4", rel.split("/")[1] + ".png")
    return Image.open(p)

def main():
    sheet = Image.open(SHEET).convert("RGB")
    font = ImageFont.load_default()
    cell, pad, lab = 128, 8, 14
    cols = 5
    w = pad + cols * (cell + pad)
    rows = len(SLOTS)
    H = rows * (cell + lab + pad) + pad + 20 + rows * (INGAME + 3)
    out = Image.new("RGB", (w, H), (18, 17, 16))
    d = ImageDraw.Draw(out)
    real_y = rows * (cell + lab + pad) + pad
    d.text((pad, real_y), f"real in-game size ({INGAME}px): shipped | cand 1-4, per slot", fill=(200, 200, 190), font=font)
    for r, (slot, (cellidx, cands)) in enumerate(SLOTS.items()):
        os.makedirs(os.path.join(OUT, slot), exist_ok=True)
        y = pad + r * (cell + lab + pad)
        ship = sheet.crop(((cellidx % 4) * TILE, (cellidx // 4) * TILE, (cellidx % 4) * TILE + TILE, (cellidx // 4) * TILE + TILE))
        tiles = [("shipped", ship)]
        for i, rel in enumerate(cands, 1):
            t = grade(load(rel), 100 + r * 10 + i)
            t.save(os.path.join(OUT, slot, f"c{i}-{rel.split('/')[1]}.png"))
            tiles.append((f"c{i} {rel.split('/')[1]}", t))
        for c, (name, t) in enumerate(tiles):
            x = pad + c * (cell + pad)
            out.paste(t.resize((cell, cell), Image.LANCZOS), (x, y + lab))
            d.text((x, y), f"{slot}: {name}", fill=(220, 215, 200), font=font)
            out.paste(t.resize((INGAME, INGAME), Image.LANCZOS), (pad + c * (INGAME + 3), real_y + 14 + r * (INGAME + 3)))
    out = out.crop((0, 0, w, H + 0))
    p = os.path.join(OUT, "contact-sheet.png")
    out.save(p)
    print(p, out.size)


# ---- regrade pass (art-director): the 6 approved picks only ----
PICKS = {"fire": "part1/fireball-red-3", "water": "part2/ice-blue-3", "earth": "part2/rock-plain-3",
         "air": "part3/wind-sky-3", "heal": "part1/heal-jade-3", "shield": "part1/protect-sky-3"}
CLAMP = {"fire", "air", "shield"}

def border_colour(sheet):
    """Median RGB of the 1-2px outer ring of every shipped action tile."""
    px = []
    for i in range(16):
        ox, oy = (i % 4) * TILE, (i // 4) * TILE
        if ox + TILE > sheet.width or oy + TILE > sheet.height:
            continue
        for k in range(2):
            for t in range(TILE):
                px += [sheet.getpixel((ox + t, oy + k)), sheet.getpixel((ox + t, oy + TILE - 1 - k)),
                       sheet.getpixel((ox + k, oy + t)), sheet.getpixel((ox + TILE - 1 - k, oy + t))]
    px = [p for p in px if sum(p) > 30]
    return tuple(sorted(p[c] for p in px)[len(px) // 2] for c in range(3))

def regrade(src, slot, seed, bronze):
    im = src.convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.55 * 0.82)   # 18% less saturated than adapt grade
    im = im.resize((TILE, TILE), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
    px = im.load()
    rng = random.Random(seed)
    for y in range(TILE):
        for x in range(TILE):
            dx, dy = (x - 31.5) / 32, (y - 31.5) / 32
            d2 = min(1, dx * dx + dy * dy)
            v = 1 - d2 * 0.12 - max(0, d2 - 0.5) * 0.12  # edge vignette, ~12% black at rim
            n = (rng.random() - 0.5) * 10
            out = []
            for i, c in enumerate(px[x, y]):
                c = c * 0.88 * 0.9                      # prior brightness 0.88, then mid/highlights -10%
                c = c * v + (BONE[i] - c) * 0.06 + n
                if slot in CLAMP and c > 200:           # soft knee so white cores do not blow out
                    c = 200 + (c - 200) * 0.45
                out.append(max(0, min(235 if slot in CLAMP else 255, int(c))))
            px[x, y] = tuple(out)
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, TILE - 1, TILE - 1], outline=bronze)
    dr.rectangle([1, 1, TILE - 2, TILE - 2], outline=tuple(int(c * 0.6) for c in bronze))
    return im

def main_regrade():
    sheet = Image.open(SHEET).convert("RGB")
    bronze = border_colour(sheet)
    print("bronze border", bronze)
    od = os.path.join(OUT, "regrade"); os.makedirs(od, exist_ok=True)
    font = ImageFont.load_default()
    names = list(PICKS)
    cell, pad, lab = 128, 8, 14
    w = pad + 2 * 6 * (cell + pad) // 2 + 0
    w = pad + 6 * (cell + pad)
    cols_rows = 2 * (cell + lab + pad)
    H = pad + 12 * (cell // 2 // 1) // 12 + 0
    # layout: row A (128: shipped over regraded per slot, side by side pairs, 3 pairs per line)
    pairs_per_line = 3
    pw = 2 * cell + pad
    W = pad + pairs_per_line * (pw + pad)
    y128 = 2 * (cell + lab + pad)
    y59 = y128 + 14 + pad
    ctx_h = 59 + 24
    H = pad + y128 + 14 + (59 + 6) + 14 + ctx_h + pad
    out = Image.new("RGB", (W, H), (18, 17, 16)); d = ImageDraw.Draw(out)
    tiles = {}
    for r, slot in enumerate(names):
        t = regrade(load(PICKS[slot]), slot, 500 + r, bronze)
        t.save(os.path.join(od, f"{slot}.png"))
        cellidx = SLOTS[slot][0]
        ship = sheet.crop(((cellidx % 4) * TILE, (cellidx // 4) * TILE, (cellidx % 4) * TILE + TILE, (cellidx // 4) * TILE + TILE))
        tiles[slot] = (ship, t)
        gx, gy = r % pairs_per_line, r // pairs_per_line
        x = pad + gx * (pw + pad); y = pad + gy * (cell + lab + pad)
        d.text((x, y), f"{slot}: shipped | regraded ({PICKS[slot].split('/')[1]})", fill=(220, 215, 200), font=font)
        out.paste(ship.resize((cell, cell), Image.LANCZOS), (x, y + lab))
        out.paste(t.resize((cell, cell), Image.LANCZOS), (x + cell + pad, y + lab))
    y = pad + y128
    d.text((pad, y), "59px: shipped / regraded per slot", fill=(200, 200, 190), font=font)
    x = pad
    for slot in names:
        for t in tiles[slot]:
            out.paste(t.resize((59, 59), Image.LANCZOS), (x, y + 14)); x += 59 + 4
        x += 8
    y += 14 + 59 + 6
    d.text((pad, y), "in context: regraded 59px in 75px dark HUD slots", fill=(200, 200, 190), font=font)
    y += 14
    strip_w = pad * 2 + 6 * 75 + 5 * 6
    d.rectangle([pad, y, pad + strip_w, y + 75 + 8], fill=(24, 22, 20), outline=(60, 52, 40))
    # shipped row then regraded row inside same strip is too tall; show interleaved: shipped | regraded
    for i, slot in enumerate(names):
        sx = pad + 4 + i * 81
        sl = Image.new("RGB", (75, 75), (34, 30, 26))
        ImageDraw.Draw(sl).rectangle([0, 0, 74, 74], outline=(70, 58, 40))
        sl.paste(tiles[slot][1].resize((59, 59), Image.LANCZOS), (8, 8))
        out.paste(sl, (sx, y + 4))
    out.save(os.path.join(od, "contact.png"))
    print(os.path.join(od, "contact.png"), out.size)

if __name__ == "__main__":
    import sys
    main_regrade() if "--regrade" in sys.argv else main()
