#!/usr/bin/env python3
"""Stage approved roster24 ability icons: 512x512 PNGs + contact sheet in .scratch/stage-icons/.
Run: ~/claudetmp/venv/bin/python -I tools/assets/roster24-art/stage-icons.py   (from the worktree root)
Stages only; never writes under public/."""
import glob, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.getcwd()
SCR = os.path.join(ROOT, ".scratch")
OUT = os.path.join(SCR, "stage-icons")
# slot -> (file stem, options). options: r = circle radius as fraction of min side,
# c = centre in source px, inset = square inset fraction first, scale = shrink before crop, orb = auto-fit bright orb
S = {
    "gust": ("r864-gust_114233_d0.35", {}),
    "static": ("r864-static_114244", {}),
    "myc": ("r864-myc_114271", {}),
    "forge_gore": ("r865-forgegore_114302", {}),
    "cinder_spray": ("r876-cinder_114613", {}),
    "hoof_crash": ("r876-hoofwater_114592", {}),
    "stoop": ("r876-stoop_114583", {}),
    "abyss_flash": ("r877-abyssflash_114634", {}),
    "kelp_lash": ("r878-kelp_114652", {}),
    "spore_burst": ("r878-spore_114673", {}),
    "tusk_gore": ("r878-tusk_114661", {}),
    "wyrm_coil": ("r878-wyrm_114681", {}),
    "bell_pulse": ("r881-bell_114754", {"r": 0.40}),
    "scorch_breath": ("r881-scorch_114732", {"c": (450, 450), "r": 0.41}),
    "frost_shard": ("r882-frost_114761", {}),
    "filament": ("r880-filament_114704", {}),
    "skitter": ("r880-skitter_114711_d0.4", {"scale": 0.88}),
    "mist_veil": ("r885-mist_114801", {"inset": 0.12}),
    "stone_skin": ("r885-stoneskin_114792", {}),
    "lure_orb": ("r887-lure_114822_d0.45", {"orb": True}),
}

def find(stem):
    hits = sorted(glob.glob(os.path.join(SCR, "**", stem + "*.png"), recursive=True))
    hits = [h for h in hits if "stage-icons" not in h]
    return hits[0] if hits else None

def orb_circle(im):
    a = np.asarray(im.convert("L"), dtype=float)
    m = a > max(60, a.max() * 0.45)
    ys, xs = np.nonzero(m)
    x0, x1 = np.percentile(xs, [1, 99]); y0, y1 = np.percentile(ys, [1, 99])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = max(x1 - x0, y1 - y0) / 2 * 1.08 + 0.08 * im.width * 0.25
    return cx, cy, r

def make(path, o):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    if "scale" in o:
        k = o["scale"]
        small = im.resize((int(W * k), int(H * k)), Image.LANCZOS)
        px, py = (W - small.width) // 2, (H - small.height) // 2
        pad = np.pad(np.asarray(small), ((py, H - small.height - py), (px, W - small.width - px), (0, 0)), mode="symmetric")
        im = Image.fromarray(pad).filter(ImageFilter.GaussianBlur(2))
        im.paste(small, (px, py))
    m = min(W, H)
    cx, cy, r = W / 2, H / 2, m / 2 * o.get("r", 1.0)
    if "inset" in o:
        r = m / 2 * (1 - 2 * o["inset"])
    if "c" in o:
        cx, cy = o["c"]
        r = min(r, cx, cy, W - cx, H - cy)
    if o.get("orb"):
        cx, cy, r = orb_circle(im)
        r = min(r, m / 2)
    cx = min(max(cx, r), W - r); cy = min(max(cy, r), H - r)
    crop = im.crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r))).resize((512, 512), Image.LANCZOS)
    yy, xx = np.mgrid[0:512, 0:512]
    d = np.hypot(xx - 255.5, yy - 255.5) / 256
    v = np.clip((d - 0.72) / 0.28, 0, 1) ** 1.5
    arr = np.asarray(crop, dtype=float) * (1 - 0.85 * v)[..., None]
    out = Image.fromarray(arr.astype("uint8"))
    mask = Image.fromarray((np.clip((1 - d) / 0.02, 0, 1) * 255).astype("uint8"))
    rgba = out.convert("RGBA"); rgba.putalpha(mask)
    return rgba

os.makedirs(OUT, exist_ok=True)
done, missing = [], []
for slot, (stem, o) in S.items():
    p = find(stem)
    if not p:
        missing.append(slot); continue
    make(p, o).save(os.path.join(OUT, slot + ".png"))
    done.append(slot)

cols = 5; cell = 256; rows = (len(done) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), (24, 24, 28))
dr = ImageDraw.Draw(sheet)
for i, s in enumerate(done):
    t = Image.open(os.path.join(OUT, s + ".png")).resize((cell, cell), Image.LANCZOS)
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    sheet.paste(t, (x, y + 18), t)
    dr.text((x + 4, y + 3), s, fill=(230, 230, 230))
sheet.save(os.path.join(OUT, "sheet.png"))
print("staged", len(done), done)
print("missing", missing)
