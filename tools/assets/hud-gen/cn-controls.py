#!/usr/bin/env python3
"""ControlNet (canny) control images and gpu-queue JSONs for the icon tiles and a small fx set. Needs Pillow only.

  python3 tools/assets/hud-gen/cn-controls.py OUTDIR [--pc-dir <PC dir>]

Writes OUTDIR/control/*.png (1024x1024, white shapes on pure black; gpu-queue.py runs canny on them), and the queues
OUTDIR/queue-icons-cat-cn.json (13 action-bar category tiles, the actions.py glyphs rendered at 1024, 4 seeds x scales
[0.5, 0.65] = 104 images) and OUTDIR/queue-fx-cn.json (6 outline shapes x 4 elements, 2 seeds x scale 0.6 = 48 images).
Both are 1024x1024, non-bulk. Control paths in the queues are under --pc-dir (copy OUTDIR/control there). Nothing runs on the GPU here.
Icon controls reuse the draw functions of actions.py (same cell order, same silhouettes), except tag (heads and shoulders there, two interlocked rings here); no text, no people.
"""
import importlib.util
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 1024
PC_DIR = os.environ.get("TTE_PC_ICONS_DIR", "")

ICON_STYLE = ", single emblem centered, square ability icon, grimdark medieval oil painting, heavy textured brushwork, desaturated, dark smoky background, soft vignette"
ICON_NEG = "text, letters, numbers, runes, watermark, frame, border, bevel, glossy button, cartoon, anime, vector, flat, clip art, human, face, hands, fingers, person, multiple objects"
FX_STYLE = ", isolated magic effect on pure black background, wide empty black margin, centered, grimdark oil painting, textured impasto, smoky, desaturated"
FX_NEG = "creature, animal, person, human face, hands, fingers, text, letters, watermark, frame, border, cartoon, anime, cel shading, vector, flat colours, cropped, touching edges, ground, landscape, white background, lens flare"

ICON_SUBJECT = {
    "trap": "a rusted iron bear trap with jagged teeth",
    "tag": "two interlocked iron rings",
    "charge": "a steel spear point driving forward, streaks of dust",
    "weather": "a heavy storm cloud pouring slanted rain",
    "dash": "a blurred lunge, long smeared motion streaks",
    "guard": "a worn iron heater shield with a raised boss",
    "super": "a violent burst of jagged golden rays round a hot core",
    "fire": "a guttering flame of glowing ember and lava",
    "water": "a heavy drop of translucent teal water",
    "earth": "a jagged lichen covered stone outcrop",
    "air": "three pale wind curls spiralling in torn mist",
    "element": "a broken ring of dull brass around a single point",
    "cleanse": "a snapped chain ring above drifting ash flecks",
}
ELEMENTS = {
    "fire": "molten lava and glowing embers",
    "water": "translucent teal water and foam",
    "earth": "lichen covered stone and dust",
    "air": "cyan wind and crackling pale bolts",
}
FX_SHAPES = ("burst", "wave", "shards", "cyclone", "bolt", "ring")
FX_NOUN = {"burst": "an exploding burst", "wave": "a rolling wave crest", "shards": "a fan of sharp shards",
           "cyclone": "a spiralling cyclone", "bolt": "a forking bolt", "ring": "an expanding shockwave ring"}


def load_actions():
    spec = importlib.util.spec_from_file_location("hud_actions", os.path.join(HERE, "actions.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def icon_control(name):
    """The actions.py glyph (with its cut-out) as a white mask on black, 1024x1024."""
    if name == "tag":  # the actions.py glyph is two heads and shoulders; no people in art, so use two interlocked rings (a swap)
        m = Image.new("L", (SIZE, SIZE), 0)
        d = ImageDraw.Draw(m)
        for cx in (400, 624):
            d.ellipse([cx - 230, 282, cx + 230, 742], fill=255)
            d.ellipse([cx - 160, 352, cx + 160, 672], fill=0)
        return m
    a = load_actions()
    old = a.SS
    a.SS = SIZE // a.TILE  # P() and line widths read the module global, so this renders at 1024 directly
    try:
        draw, cut = a.DRAW[name]
        mask = Image.new("L", (SIZE, SIZE), 0)
        draw(ImageDraw.Draw(mask))
        if cut is not None:
            hole = Image.new("L", (SIZE, SIZE), 0)
            cut(ImageDraw.Draw(hole))
            mask = Image.composite(Image.new("L", (SIZE, SIZE), 0), mask, hole)
    finally:
        a.SS = old
    return mask


def _c(x):
    return SIZE / 2 + x


def fx_control(shape):
    """A simple white outline-able shape on pure black, kept inside the central ~60 percent."""
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    R = 300
    if shape == "burst":
        rng = random.Random(11)
        pts = []
        for i in range(24):
            a = math.tau * i / 24
            r = (R * (0.75 + rng.random() * 0.25)) if i % 2 == 0 else R * 0.28
            pts.append((_c(math.cos(a) * r), _c(math.sin(a) * r)))
        d.polygon(pts, fill=255)
    elif shape == "wave":
        top = [(_c(-R + i * R * 2 / 24), _c(60 - 190 * math.sin(math.pi * i / 24) ** 1.5 + 70 * (i / 24))) for i in range(25)]
        d.polygon(top + [(_c(R), _c(190)), (_c(-R), _c(190))], fill=255)
        d.ellipse([_c(150), _c(-160), _c(290), _c(-20)], fill=0)  # curl hollow
    elif shape == "shards":
        for k in range(-2, 3):
            a = math.radians(-90 + k * 24)
            tip = (_c(math.cos(a) * R * (1 - abs(k) * 0.1)), _c(220 + math.sin(a) * R * 1.4 * (1 - abs(k) * 0.1)))
            w = 36
            nx, ny = -math.sin(a), math.cos(a)
            d.polygon([(_c(nx * w), _c(220 + ny * w)), tip, (_c(-nx * w), _c(220 - ny * w))], fill=255)
    elif shape == "cyclone":
        prev = None
        for i in range(160):
            t = i / 159
            a = t * math.tau * 2.6
            r = 30 + t * (R - 30)
            p = (_c(math.cos(a) * r), _c(math.sin(a) * r))
            if prev:
                d.line([prev, p], fill=255, width=int(14 + 40 * t))
            prev = p
    elif shape == "bolt":
        pts = [(0, -R), (-70, -120), (30, -100), (-110, 60), (10, 40), (-60, R)]
        d.line([(_c(x), _c(y)) for x, y in pts], fill=255, width=46, joint="curve")
        d.line([(_c(10), _c(40)), (_c(120), _c(130)), (_c(150), _c(230))], fill=255, width=26, joint="curve")
    elif shape == "ring":
        d.ellipse([_c(-R), _c(-R), _c(R), _c(R)], fill=255)
        d.ellipse([_c(-R + 70), _c(-R + 70), _c(R - 70), _c(R - 70)], fill=0)
    else:
        raise ValueError(shape)
    return img


def build(outdir, pc_dir=PC_DIR):
    a = load_actions()
    cdir = os.path.join(outdir, "control")
    os.makedirs(cdir, exist_ok=True)
    icon_jobs, fx_jobs = [], []
    for slot, (name, _l, _d) in enumerate(a.TILES):
        icon_control(name).save(os.path.join(cdir, f"icon_{name}.png"))
        icon_jobs.append({"name": f"icon_{name}_cn", "kind": "cn", "prompt": ICON_SUBJECT[name],
                          "control": f"{pc_dir}/icon_{name}.png",
                          "seeds": [41000 + slot * 101 + i for i in range(4)], "scales": [0.5, 0.65]})
    for s in FX_SHAPES:
        fx_control(s).save(os.path.join(cdir, f"fx_{s}.png"))
    for ei, (el, mat) in enumerate(ELEMENTS.items()):
        for si, s in enumerate(FX_SHAPES):
            fx_jobs.append({"name": f"fx_{el}_{s}_cn", "kind": "cn", "prompt": f"{FX_NOUN[s]} of {mat}",
                            "control": f"{pc_dir}/fx_{s}.png",
                            "seeds": [42000 + (ei * 6 + si) * 101 + i for i in range(2)], "scales": [0.6]})
    qs = {"queue-icons-cat-cn.json": (ICON_STYLE, ICON_NEG, icon_jobs), "queue-fx-cn.json": (FX_STYLE, FX_NEG, fx_jobs)}
    for fn, (style, neg, jobs) in qs.items():
        with open(os.path.join(outdir, fn), "w") as f:
            json.dump({"style": style, "neg": neg, "width": SIZE, "height": SIZE, "jobs": jobs}, f, indent=1)
    return qs


def main():
    args = sys.argv[1:]
    pc = PC_DIR
    if "--pc-dir" in args:
        i = args.index("--pc-dir")
        pc = args[i + 1]
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit("usage: cn-controls.py OUTDIR [--pc-dir DIR]")
    qs = build(args[0], pc)
    for fn, (_s, _n, jobs) in qs.items():
        n = sum(len(j["seeds"]) * len(j["scales"]) for j in jobs)
        print(fn, len(jobs), "jobs", n, "images")


if __name__ == "__main__":
    main()
