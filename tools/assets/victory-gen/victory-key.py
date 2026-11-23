"""Install the art-director-approved roster24 victory stills (glimmaw, brazgor, kindrel, vortigal, zephra, nykra, hyalia, ouroth, umbrel, abyssor) as transparent full-body PNGs.

Usage: python -I tools/assets/victory-gen/victory-key.py [outdir]   (default public/assets/img/victory)
Reads each source named in HEROES from tools/assets/victory-gen/provenance/ (approval and facing in provenance/approval.json, sha256 pinned in
tests/repo/victory-frames.test.ts), writes <outdir>/<hero>_victory.png. Sources are 1024x1024 on flat grey, except kindrel's, which is already a
transparent cut-out (only cropped and scaled). brazgor/nykra/hyalia come from the wave-B warps (wb.py, then fix.py cleaned backdrop residue; both
kept here as the record, they need the private warp workspace and are not rerun by the installer).
Steps: flood-fill the grey background from the four corners (tolerance 14), erode the matte 1 px and feather it 1 px, crop to the
body plus a 12 px margin, scale to fit the 320x314 map-portrait box (same scale class as map/glimmawLarge.png and the KO frame).
No flip (facings are in approval.json). Drawn only behind ?ff=roster24 (src/game/fx/victory-still.ts).
Pillow only.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
PROV = ROOT / "tools/assets/victory-gen/provenance"
HEROES = {
    "glimmaw": "r971-glimmaw-vic_60160_d0.35.png",
    "brazgor": "brazgor_win.png",
    "kindrel": "kindrel_win.png",
    "vortigal": "r979-vortigal-win_97903_d0.35.png",
    "zephra": "r978-zephra-win2_97810_d0.2.png",
    "nykra": "nykra_win.png",
    "hyalia": "hyalia_win.png",
    "ouroth": "r821-ouroth-vic_59822_d0.45.png",
    "umbrel": "r805-umbrel-victory_58210_d0.5.png",
    "abyssor": "r842-abyssor-vic_61100_d0.4.png",
}
TOL, MARGIN, BOX = 14, 12, (320, 314)
KEY = (255, 0, 255)
POCKETS = True
# per-hero flatness tolerance for the enclosed-pocket seeds (default 3): hazy pockets (soft fog behind a coil) need more
POCKET_TOL = {"ouroth": 12, "umbrel": 12, "abyssor": 12}


def key(src: Image.Image, pocket_tol: int = 3) -> Image.Image:
    rgb = src.convert("RGB")
    flood = rgb.copy()
    for xy in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)):
        ImageDraw.floodfill(flood, xy, KEY, thresh=TOL)
    # enclosed pockets (between legs, inside a tail loop) are unreachable from the corners: seed from perfectly flat patches
    # of the corner colour (painted subject areas are never that flat) on a coarse grid
    bg = rgb.getpixel((0, 0))
    if POCKETS:
        for y in range(4, rgb.height - 4, 6):
            for x in range(4, rgb.width - 4, 6):
                if flood.getpixel((x, y)) != KEY and all(max(abs(a - b) for a, b in zip(rgb.getpixel((x + dx, y + dy)), bg)) <= pocket_tol for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (0, 0))):
                    ImageDraw.floodfill(flood, (x, y), KEY, thresh=TOL)
    # flooded background equals KEY (difference 0); everything else is body
    matte = ImageChops.difference(flood, Image.new("RGB", rgb.size, KEY)).convert("L").point(lambda v: 0 if v == 0 else 255)
    matte = matte.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = rgb.convert("RGBA")
    out.putalpha(matte)
    return out


def install(hero: str, out_dir: Path) -> None:
    src = Image.open(PROV / HEROES[hero])
    im = src.convert("RGBA") if "A" in src.getbands() else key(src, POCKET_TOL.get(hero, 3))
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        raise SystemExit(f"{hero}: empty matte")
    im = im.crop((max(box[0] - MARGIN, 0), max(box[1] - MARGIN, 0), min(box[2] + MARGIN, im.width), min(box[3] + MARGIN, im.height)))
    s = min(BOX[0] / im.width, BOX[1] / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    path = out_dir / f"{hero}_victory.png"
    im.save(path, optimize=True)
    print(f"wrote {path} {im.size}")


def main(argv: list[str]) -> None:
    out_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "public/assets/img/victory"
    out_dir.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        install(hero, out_dir)


if __name__ == "__main__":
    main(sys.argv)
