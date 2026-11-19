"""Builds the spec + anim of a roster24 hero from its landmarks with the body-plan templates (tools/assets/portrait-rig/body_plans).

    python gen-r24.py <hero> [--landmarks FILE] [--out DIR] [--stage] [--overlay] [--promote]

  default   reads r24/<hero>.landmarks.json, writes <DIR>/spec/<hero>.json and <hero>.anim.json (DIR defaults to <worktree>/.scratch/r24/<hero>)
  --stage   also runs prep.py's build() with its folders pointed into DIR (rigs/, prep.lock.json): no write to spec/, imgWorkArea or the lock
            (needs numpy + Pillow); then bake with  tsx tools/assets/bake-staged.ts DIR/rigs DIR/sheets
  --overlay writes DIR/overlay.png: the source with bones, tips and weight polygons drawn on it (for the hero-artist to judge the landmarks)
  --promote copies the spec into spec/ (R4 only, after the owner-approved art): portrait-rig.test.ts then demands baked frames for it
The source png must be exactly canvas-sized (box x res)."""
import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
from body_plans import PlanError, build  # noqa: E402


def write(dir_, hero, spec, anim):
    os.makedirs(dir_, exist_ok=True)
    for name, obj in ((hero + ".json", spec), (hero + ".anim.json", anim)):
        with open(os.path.join(dir_, name), "w") as fh:
            json.dump(obj, fh, indent=1)
            fh.write("\n")


def overlay(spec, png, out):
    from PIL import Image, ImageDraw
    im = Image.open(png).convert("RGBA")
    bg = Image.new("RGBA", im.size, (40, 40, 48, 255))
    bg.alpha_composite(im)
    d = ImageDraw.Draw(bg, "RGBA")
    by = {b["id"]: b for b in spec["bones"]}
    for b in spec["bones"]:
        if "poly" in b and b["id"] != "spine0":
            d.polygon([tuple(p) for p in b["poly"]], outline=(255, 200, 0, 200))
    for b in spec["bones"]:
        h = tuple(b["head"])
        t = tuple(b["tip"]) if "tip" in b else None
        if t:
            d.line([h, t], fill=(0, 255, 255, 255), width=2)
            d.ellipse([t[0] - 3, t[1] - 3, t[0] + 3, t[1] + 3], outline=(255, 0, 255, 255))
        d.ellipse([h[0] - 3, h[1] - 3, h[0] + 3, h[1] + 3], fill=(255, 60, 60, 255))
        if b.get("parent") in by:
            ph = by[b["parent"]]["head"]
            d.line([tuple(ph), h], fill=(80, 255, 80, 140), width=1)
    bg.save(out)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("hero")
    ap.add_argument("--landmarks")
    ap.add_argument("--out")
    ap.add_argument("--stage", action="store_true")
    ap.add_argument("--overlay", action="store_true")
    ap.add_argument("--promote", action="store_true")
    a = ap.parse_args(argv)
    lm_path = a.landmarks or os.path.join(HERE, "r24", a.hero + ".landmarks.json")
    lm = json.load(open(lm_path))
    lm.setdefault("hero", a.hero)
    out = a.out or os.path.join(ROOT, ".scratch", "r24", a.hero)
    try:
        spec, anim = build(lm)
    except PlanError as e:
        sys.exit(f"{a.hero}: {e}")
    write(os.path.join(out, "spec"), a.hero, spec, anim)
    print(f"{a.hero}: spec + anim written to {os.path.join(out, 'spec')}")
    png = os.path.join(ROOT, lm["source"])
    if a.overlay or a.stage:
        from PIL import Image
        w, h = Image.open(png).size
        if [w, h] != lm["canvas"]:
            sys.exit(f"{a.hero}: source is {w}x{h}, landmarks canvas is {lm['canvas']}")
    if a.overlay:
        overlay(spec, png, os.path.join(out, "overlay.png"))
        print(f"overlay: {os.path.join(out, 'overlay.png')}")
    if a.stage:
        s = importlib.util.spec_from_file_location("prep", os.path.join(HERE, "prep.py"))
        prep = importlib.util.module_from_spec(s)
        s.loader.exec_module(prep)
        prep.SPEC_DIR = os.path.join(out, "spec")
        prep.RIGS = os.path.join(out, "rigs")
        prep.LOCK = os.path.join(out, "prep.lock.json")
        prep.DEBUG = os.path.join(out, "no-debug")
        prep.build(a.hero)
        print(f"staged rig: {prep.RIGS}")
    if a.promote:
        write(os.path.join(HERE, "spec"), a.hero, spec, anim)
        print("promoted into spec/; run prep.py and assets:bake next")


if __name__ == "__main__":
    main(sys.argv[1:])
