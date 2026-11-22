"""Installs the art-director-approved title splash and the four element arena backdrops into public/assets/img/arena-art/.
Run: python3 -I tools/assets/arena-gen/install-arena-art.py <dir with the approved source PNGs> [--check]
Sources (SDXL base on the project GPU box, 1344x768 PNG, seeds in the file names) are listed in SOURCES; the art-director records are in
provenance/approval.json (copied from the approval jsons of the GPU batches). Fails closed: a missing file, wrong size, or a record that is not
reviewer art-director + beats_shipped + date for that exact source file stops the run.
The earth source has dark letterbox bars (about 11 px top, 15 px bottom), so every arena is cropped to the same 1344x741 window
(earth rows 12..753, the rest rows 13..754; fire, water and air have no bars). The splash is kept whole (1344x768).
Output: <name>.webp (Pillow, quality 88, method 6), index.json (size and sha256 per file) and CREDITS.txt; the approvals are written to
tools/assets/arena-gen/provenance/approval.json. Own AI-generated work, no third-party art. Nothing in src/ loads these files yet.
"""
import hashlib, io, json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "public", "assets", "img", "arena-art")
PROV = os.path.join(HERE, "provenance", "approval.json")
ARENA_H = 741
# name -> (source file, crop box or None, approval date); the art-director record itself is provenance/approval.json (read, never written)
SOURCES = {
    "splash": ("r951-splash_119752_1344x768.png", None, "2026-11-22"),
    "arena-earth": ("r946-env-earth_119703_1344x768.png", (0, 12, 1344, 12 + ARENA_H), "2026-11-22"),
    "arena-fire": ("arena_bg_fire_r1_7801_1344x768.png", (0, 13, 1344, 13 + ARENA_H), "2026-11-19"),
    "arena-water": ("arena_bg_water_r1_7822_1344x768.png", (0, 13, 1344, 13 + ARENA_H), "2026-11-19"),
    "arena-air": ("arena_bg_air_r1_7831_1344x768.png", (0, 13, 1344, 13 + ARENA_H), "2026-11-19"),
}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    src_dir = args[0]
    index = {}
    prov = json.load(open(PROV))
    for name, (fname, box, date) in SOURCES.items():
        im = Image.open(os.path.join(src_dir, fname))
        if im.format != "PNG" or im.size != (1344, 768):
            raise SystemExit(f"{name}: {fname} is not a 1344x768 PNG")
        im = im.convert("RGB")
        if box:
            im = im.crop(box)
        rec = prov.get(name, {})
        if rec.get("approved") != fname or rec.get("reviewer") != "art-director" or rec.get("beats_shipped") is not True or rec.get("date") != date:
            raise SystemExit(f"{name}: no art-director approval record for {fname} in {PROV}")
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=88, method=6)
        data = buf.getvalue()
        if "--check" not in sys.argv:
            os.makedirs(OUT, exist_ok=True)
            open(os.path.join(OUT, f"{name}.webp"), "wb").write(data)
        index[name] = {"url": f"img/arena-art/{name}.webp", "w": im.size[0], "h": im.size[1],
                       "sha256": hashlib.sha256(data).hexdigest(), "source": fname, "approval": {**rec, "file": "tools/assets/arena-gen/provenance/approval.json"}}
    if "--check" in sys.argv:
        print(json.dumps(index, indent=2))
        return
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"licence": "own work (AI-generated, SDXL on the project GPU box)", "images": index}, f, indent=2)
        f.write("\n")
    with open(os.path.join(OUT, "CREDITS.txt"), "w") as f:
        f.write("Title splash and element arena backdrops: AI-generated (SDXL base 1.0, own work, no third-party art), cropped and converted to WebP\n"
                "by tools/assets/arena-gen/install-arena-art.py. Approved by the art-director agent, see tools/assets/arena-gen/provenance/approval.json.\n"
                "No attribution required. SDXL base is under the CreativeML Open RAIL++-M licence; its terms for shipping generated images are an open\n"
                "owner question, as for the other SDXL art (see tools/assets/splash-gen/license.txt).\n")
    print(f"installed {len(index)} images to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
