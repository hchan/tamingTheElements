"""Install the art-director-approved Glimmaw victory still as a transparent full-body PNG.

Usage: python -I tools/assets/victory-gen/victory-key.py [outdir]   (default public/assets/img/victory)
Reads tools/assets/victory-gen/provenance/r971-glimmaw-vic_60160_d0.35.png (1024x1024 flat grey background, facing right, approval in
provenance/approval.json, sha256 pinned in tests/repo/victory-frames.test.ts), writes <outdir>/glimmaw_victory.png.
Steps: flood-fill the grey background from the four corners (tolerance 14), erode the matte 1 px and feather it 1 px, crop to the
body plus a 12 px margin, scale to fit the 320x314 map-portrait box (same scale class as map/glimmawLarge.png and the KO frame).
No flip: the approved still and the baked Glimmaw sheet both face right. Install-only: nothing in src/ draws it yet (the hero stays behind ?ff=roster24).
Pillow only.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "tools/assets/victory-gen/provenance/r971-glimmaw-vic_60160_d0.35.png"
TOL, MARGIN, BOX = 14, 12, (320, 314)
KEY = (255, 0, 255)


def key(src: Image.Image) -> Image.Image:
    rgb = src.convert("RGB")
    flood = rgb.copy()
    for xy in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)):
        ImageDraw.floodfill(flood, xy, KEY, thresh=TOL)
    # flooded background equals KEY (difference 0); everything else is body
    matte = ImageChops.difference(flood, Image.new("RGB", rgb.size, KEY)).convert("L").point(lambda v: 0 if v == 0 else 255)
    matte = matte.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = rgb.convert("RGBA")
    out.putalpha(matte)
    return out


def main(argv: list[str]) -> None:
    out_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "public/assets/img/victory"
    out_dir.mkdir(parents=True, exist_ok=True)
    im = key(Image.open(SRC))
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        raise SystemExit("empty matte")
    im = im.crop((max(box[0] - MARGIN, 0), max(box[1] - MARGIN, 0), min(box[2] + MARGIN, im.width), min(box[3] + MARGIN, im.height)))
    s = min(BOX[0] / im.width, BOX[1] / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(out_dir / "glimmaw_victory.png", optimize=True)
    print(f"wrote {out_dir / 'glimmaw_victory.png'} {im.size}")


if __name__ == "__main__":
    main(sys.argv)
