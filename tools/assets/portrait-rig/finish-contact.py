"""Hero contrast pass, Phase 1: before/A contact sheets and edge-contrast metrics.

Reads the PNGs written by tools/assets/hero-finish-preview.ts, composites each frame on the arena floors (untinted, as Arcade
draws them, and tinted by BACKDROP_TINT, as Classic does) and writes labelled sheets plus metrics.json.
Run: ~/claudetmp/venv/bin/python -I tools/assets/portrait-rig/finish-contact.py <hero-finish dir> [<floor dir>]
"""
import io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

SRC = Path(sys.argv[1])
FLOORS = Path(sys.argv[2] if len(sys.argv) > 2 else "public/assets/img/floor")
TINT = {"fire": 0xA8715A, "air": 0x7D8EA3, "earth": 0x8F7A5A, "water": 0x52708F}
VARS = ["before", "A"]
CELL = 300  # 240 px frame at 1.25x
HEROES = sorted(p.name for p in SRC.iterdir() if p.is_dir())


def backdrops():
    out = {}
    for el, t in TINT.items():
        im = Image.open(FLOORS / f"{el}.png").convert("RGB")
        out[el] = im
        mul = np.array([(t >> 16) & 255, (t >> 8) & 255, t & 255], dtype=np.float32) / 255
        out[el + "-tint"] = Image.fromarray((np.asarray(im, dtype=np.float32) * mul).astype(np.uint8))
    return out


def comp(sprite, bg, size=CELL):
    sp = sprite.convert("RGBA").resize((size, size), Image.BILINEAR)
    x0, y0 = (bg.width - size) // 2, (bg.height - size) // 2
    crop = bg.crop((x0, y0, x0 + size, y0 + size)).convert("RGBA")
    crop.alpha_composite(sp)
    return crop.convert("RGB")


def boundary(sprite, bg):
    """|dY| (Rec.601 integer luma) across the silhouette: composited pixels where alpha >= 128 touches alpha < 128."""
    a = np.asarray(sprite.convert("RGBA"))
    n = a.shape[0]
    im = np.asarray(comp(sprite, bg, n)).astype(np.int32)
    y = (299 * im[..., 0] + 587 * im[..., 1] + 114 * im[..., 2]) // 1000
    solid = a[..., 3] >= 128
    ds = []
    for dy, dx in ((0, 1), (1, 0)):
        s1, s2 = solid[: n - dy, : n - dx], solid[dy:, dx:]
        edge = s1 != s2
        ds.append(np.abs(y[: n - dy, : n - dx] - y[dy:, dx:])[edge])
    return np.concatenate(ds)


def label(img, text):
    ImageDraw.Draw(img).text((4, 2), text, fill=(255, 255, 255))
    return img


def legacy(hero):
    r = subprocess.run(["git", "show", f"legacy-crafty-1.0:war/WEB-INF/private/img/map/{hero}Large.png"], capture_output=True)
    return Image.open(io.BytesIO(r.stdout)).convert("RGBA") if r.returncode == 0 and r.stdout else None


bgs = backdrops()
metrics, worst = {}, {}
for hero in HEROES:
    cells = sorted({p.name.rsplit("_", 1)[0] for p in (SRC / hero).glob("*_before.png")})
    m = {}
    for v in VARS:
        per = {}
        for name, bg in bgs.items():
            d = np.concatenate([boundary(Image.open(SRC / hero / f"{c}_{v}.png"), bg) for c in cells])
            per[name] = {"mean": round(float(d.mean()), 2), "p10": round(float(np.percentile(d, 10)), 2)}
        m[v] = per
    metrics[hero] = m
    worst[hero] = min(bgs, key=lambda k: m["before"][k]["p10"])
    # per-hero sheet: rows = sample cells, columns = variants, on the worst backdrop (top) and the air floor (bottom half)
    rows = []
    for bgname in (worst[hero], "air"):
        for c in cells:
            rows.append([label(comp(Image.open(SRC / hero / f"{c}_{v}.png"), bgs[bgname]), f"{v} {c} on {bgname}") for v in VARS])
    sheet = Image.new("RGB", (CELL * len(VARS), CELL * len(rows)))
    for r, row in enumerate(rows):
        for c, im in enumerate(row):
            sheet.paste(im, (c * CELL, r * CELL))
    sheet.save(SRC / f"{hero}-sheet.jpg", quality=88)

# summary: each hero idle/E on its worst backdrop: legacy | before | A | 3x top-edge crop of before and A
rowsum = []
for hero in HEROES:
    bg = bgs[worst[hero]]
    ims = [label(comp(Image.open(SRC / hero / f"idle-E0_{v}.png"), bg), f"{hero} {v} ({worst[hero]})") for v in VARS]
    leg = legacy(hero)
    ref = comp(leg, bg) if leg is not None else Image.new("RGB", (CELL, CELL), (40, 40, 40))
    crops = []
    for v in ("before", "A"):
        big = Image.open(SRC / hero / f"idle-E0_{v}.png").convert("RGBA")
        n = big.width
        top = comp(big, bg, n * 3)
        crops.append(label(top.crop((n * 3 // 2 - 150, 15, n * 3 // 2 + 150, 315)), f"{v} 3x top edge"))
    rowsum.append([label(ref, f"{hero} legacy ref")] + ims + crops)
W = CELL * len(rowsum[0])
for part in range(0, len(rowsum), 4):
    chunk = rowsum[part : part + 4]
    sheet = Image.new("RGB", (W, CELL * len(chunk)))
    for r, row in enumerate(chunk):
        for c, im in enumerate(row):
            sheet.paste(im, (c * CELL, r * CELL))
    sheet.save(SRC / f"summary-{part // 4 + 1}.jpg", quality=88)
(SRC / "metrics.json").write_text(json.dumps({"worstBackdrop": worst, "metrics": metrics}, indent=1))
print("ok", len(HEROES), "heroes")
