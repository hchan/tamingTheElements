# Installs the art-director-approved KO stills of the original heroes Sindarosa and Curomo into public/assets/img/ko/.
#   ~/claudetmp/venv/bin/python -I tools/assets/ko-gen/install-original-ko.py
# Sources: tools/assets/ko-gen/approved/originals/<hero>_ko.png, rigged from the game's own map portraits (ko-originals-rig.py is the
# record of the round-2 rig; the private art workspace is not needed to install). The script refuses a source without an art-director
# APPROVE entry in approved/originals/approval.json. Curomo is nudged NUDGE px down onto its shadow (director note; the canvas has the
# room, size unchanged); Sindarosa is copied unchanged. Prints the sha256 pinned in tests/repo/ko-frames.test.ts.
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "tools/assets/ko-gen/approved/originals"
OUT = ROOT / "public/assets/img/ko"
NUDGE = {"curomo": 6, "sindarosa": 0}


def main() -> None:
    ap = json.loads((SRC / "approval.json").read_text())
    for h, dy in NUDGE.items():
        a = ap[f"{h}_ko.png"]
        assert a["reviewer"] == "art-director" and a["verdict"] == "APPROVE", h
        im = Image.open(SRC / f"{h}_ko.png").convert("RGBA")
        if dy:
            box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
            assert box and box[3] + dy <= im.height, h
            moved = Image.new("RGBA", im.size, (0, 0, 0, 0))
            moved.paste(im, (0, dy))
            im = moved
        p = OUT / f"{h}_ko.png"
        im.save(p, optimize=True)
        print(h, im.size, hashlib.sha256(p.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
