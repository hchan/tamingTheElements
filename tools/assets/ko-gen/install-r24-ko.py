# Installs the art-director-approved roster24 KO stills (Umbrel, Abyssor, Nykra) into public/assets/img/ko/.
#   ~/claudetmp/venv/bin/python -I tools/assets/ko-gen/install-r24-ko.py
# Sources: tools/assets/ko-gen/approved/<hero>_ko.png (verdicts in approved/approval.json). Umbrel and Abyssor are 1024 px squares with
# the body in the lower half, so each is cropped to its alpha bbox (alpha > 8) plus MARGIN px, which anchors the still on the body
# when the result card scales it. Nykra is already a tight crop (bbox margin 30 px) and is copied unchanged. Deterministic output.
import hashlib, shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "tools/assets/ko-gen/approved"
OUT = ROOT / "public/assets/img/ko"
MARGIN = 12
CROP = ("umbrel", "abyssor")
COPY = ("nykra",)


def crop(im: Image.Image) -> Image.Image:
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    assert box, "empty alpha"
    l, t, r, b = box
    return im.crop((max(0, l - MARGIN), max(0, t - MARGIN), min(im.width, r + MARGIN), min(im.height, b + MARGIN)))


def main() -> None:
    for h in CROP:
        crop(Image.open(SRC / f"{h}_ko.png").convert("RGBA")).save(OUT / f"{h}_ko.png", optimize=True)
    for h in COPY:
        shutil.copyfile(SRC / f"{h}_ko.png", OUT / f"{h}_ko.png")
    for h in CROP + COPY:
        p = OUT / f"{h}_ko.png"
        print(h, Image.open(p).size, hashlib.sha256(p.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
