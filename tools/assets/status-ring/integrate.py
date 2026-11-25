#!/usr/bin/env python3
"""Build the shippable status-ring PNGs (128x128 RGBA, premultiplied resize) from the regraded keys.

Reads .scratch/status-fx/keyed-rings/regrade/ (made by key-rings.py) and writes
<out>/<slot>.png plus <out>/approval.json. Default out is .scratch/status-ring/staged
(never public/); the coordinator copies to public/assets/img/fx/status/ after the gate.
Only slots with an art-director APPROVE in .scratch/status-ring/approval.json ship.
Usage: ~/claudetmp/venv/bin/python -I tools/assets/status-ring/integrate.py [out_dir]   (repo root)
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.getcwd()
SRC = os.path.join(ROOT, ".scratch/status-fx/keyed-rings/regrade")
SLOTS = {"freeze": "fx_status_freeze_r4_45801.png", "daze": "fx_status_daze_r5_45901.png"}
SIZE = 128


def resize_premul(im, size):
    a = np.array(im.convert("RGBA")).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:]
    ch = [np.array(Image.fromarray(a[..., i]).resize((size, size), Image.LANCZOS)) for i in range(4)]
    o = np.clip(np.stack(ch, 2), 0, 1)
    al = o[..., 3:]
    o[..., :3] = np.where(al > 1e-4, o[..., :3] / np.maximum(al, 1e-4), 0)
    return Image.fromarray((np.clip(o, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def main(argv):
    out = argv[1] if len(argv) > 1 else os.path.join(ROOT, ".scratch/status-ring/staged")
    os.makedirs(out, exist_ok=True)
    verdict = json.load(open(os.path.join(ROOT, ".scratch/status-ring/approval.json")))
    meta = {}
    for slot, fn in SLOTS.items():
        im = resize_premul(Image.open(os.path.join(SRC, fn)), SIZE)
        a = np.array(im)[..., 3]
        corners = [a[:8, :8], a[:8, -8:], a[-8:, :8], a[-8:, -8:]]
        assert all(int(c.max()) == 0 for c in corners), f"{slot}: corner alpha not 0"
        im.save(os.path.join(out, slot + ".png"), optimize=True)
        meta[slot] = {"source": fn, "size": SIZE, "regrade": "key-rings.py REGRADE"}
        print("wrote", slot, im.size)
    json.dump({"verdict": "art-director approve (regrade condition), see .scratch/status-ring/approval.json", "slots": meta},
              open(os.path.join(out, "approval.json"), "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
