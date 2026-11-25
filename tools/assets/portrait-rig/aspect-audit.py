"""Silhouette aspect audit (read only): bounding-box width/height of every baked hero sheet, released and roster24.
    ~/claudetmp/venv/bin/python -I tools/assets/portrait-rig/aspect-audit.py [--json] [--alpha N]

For each packed sheet in src/game/assets/sheets.generated.json it measures the idle/E frame 0 (what the arena and hero select show):
bbox w x h, w/h, world px (160 px visual box, giants 200), spill past the box, and the tightest frame-edge headroom (L/R/T) over the
E rows and over all rows. Flags: near-square (w/h 0.85-1.18), crop risk (headroom < 4 px), spill (a map strip cut to the box would crop).
Never writes anything; --json prints the rows for tests."""
import json
import os
import sys

from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
RELEASED = {"fiara", "treenoc", "pax", "rokcore", "curomo", "cyclonius", "echo", "ishimi", "lavax", "morblass", "sindarosa", "wispera"}
ROSTER24 = {"kindrel", "nykra", "quarrak", "hyalia", "brazgor", "glimmaw", "durrok", "zephra", "ouroth", "abyssor", "vortigal", "umbrel"}
VISUAL = {"rokcore": 200, "ishimi": 200}  # giants draw into a 200 px visual box, everyone else 160
SQUARE = (0.85, 1.18)
MIN_HEADROOM = 4


def group(name):
    return "released" if name in RELEASED else "roster24" if name in ROSTER24 else "other"


def audit(alpha=32):
    manifest = json.load(open(os.path.join(ROOT, "src/game/assets/sheets.generated.json")))
    default_frame = manifest["spec"]["frame"]
    lut = [255 if v >= alpha else 0 for v in range(256)]
    rows_out = []
    for e in manifest["sheets"]:
        path = os.path.join(ROOT, "public/assets", e.get("url") or "")
        if not e.get("url") or not os.path.isfile(path):
            continue
        frame = e.get("frame", default_frame)
        box = e.get("box") or [0, 0, frame, frame]
        mask = Image.open(path).convert("RGBA").getchannel("A").point(lut)
        rows = {r["key"]: r["frames"] for r in e["rows"]}
        key = "idle/E" if "idle/E" in rows else next(iter(rows))
        x, y = rows[key][0]
        b = mask.crop((x, y, x + frame, y + frame)).getbbox()
        if not b:
            continue

        def headroom(keys):
            left = right = top = frame
            for k in keys:
                for fx, fy in rows[k]:
                    bb = mask.crop((fx, fy, fx + frame, fy + frame)).getbbox()
                    if bb:
                        left, right, top = min(left, bb[0]), min(right, frame - bb[2]), min(top, bb[1])
            return [left, right, top]

        w, h = b[2] - b[0], b[3] - b[1]
        k = VISUAL.get(e["sprite"], 160) / box[2]
        spill = [max(0, box[0] - b[0]), max(0, b[2] - box[0] - box[2])]
        head_e = headroom([r for r in rows if r.endswith("/E")])
        head_all = headroom(list(rows))
        flags = []
        if SQUARE[0] <= w / h <= SQUARE[1]:
            flags.append("near-square")
        if min(head_all) < MIN_HEADROOM:
            flags.append("crop-risk")
        if any(spill):
            flags.append("spill")
        rows_out.append({"group": group(e["sprite"]), "sprite": e["sprite"], "frame": frame, "box": box, "w": w, "h": h,
                         "ratio": round(w / h, 3), "world": [round(w * k), round(h * k)], "spill": spill,
                         "headroomE": head_e, "headroomAll": head_all, "flags": flags})
    return sorted(rows_out, key=lambda r: (r["group"], r["ratio"]))


def main(argv):
    alpha = int(argv[argv.index("--alpha") + 1]) if "--alpha" in argv else 32
    data = audit(alpha)
    if "--json" in argv:
        print(json.dumps(data, indent=1))
        return
    print("%-9s %-10s %5s %-17s %-8s %5s %-9s %-7s %-10s %-10s %s" % ("group", "sprite", "frame", "box", "bbox", "w/h", "world", "spill", "head E", "head all", "flags"))
    for r in data:
        print("%-9s %-10s %5d %-17s %-8s %5.2f %-9s %-7s %-10s %-10s %s" % (
            r["group"], r["sprite"], r["frame"], r["box"], "%dx%d" % (r["w"], r["h"]), r["ratio"], "%dx%d" % tuple(r["world"]),
            "%d/%d" % tuple(r["spill"]), "/".join(map(str, r["headroomE"])), "/".join(map(str, r["headroomAll"])), ",".join(r["flags"])))
    print("\nnear-square (w/h %.2f-%.2f): %d of %d sheets" % (SQUARE[0], SQUARE[1], sum("near-square" in r["flags"] for r in data), len(data)))


if __name__ == "__main__":
    main(sys.argv[1:])
