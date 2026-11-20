"""Crop the 12 art-director-approved roster24 super cut-in backdrops to 1344x168 bands.

Run: ~/claudetmp/venv/bin/python -I tools/assets/cutin-gen/crop-cutins.py <art-scratch-dir> [out-dir]

<art-scratch-dir> is the art session's `.scratch` (holds fetch-4be9, fetch-8e3c, fetch-de9c, fetch-649e).
Inputs are 1344x768 SDXL-Turbo stills; each band is the 1344x168 strip at the y offset below, then (for Ouroth, art-director
note) darkened by 30%. The approvals are in provenance/approval.json. Install-only: nothing in src/ draws these yet.
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

W, H = 1344, 168
# hero: (source path under the scratch dir without the _1344x768.png tail, band top y, brightness)
SOURCES = {
    "abyssor": ("fetch-4be9/out/cutin_r24_abyssor_50093", 300, 1.0),
    "brazgor": ("fetch-8e3c/out/cutin_r24_brazgor_53010", 300, 1.0),
    "durrok": ("fetch-4be9/out/cutin_r24_durrok_50060", 300, 1.0),
    "glimmaw": ("fetch-4be9/out/cutin_r24_glimmaw_50053", 300, 1.0),
    "hyalia": ("fetch-8e3c/out/cutin_r24_hyalia_53030", 300, 1.0),
    "kindrel": ("fetch-4be9/out/cutin_r24_kindrel_50003", 300, 1.0),
    "nykra": ("fetch-de9c/out/cutin_r24_nykra_53072", 300, 1.0),
    "ouroth": ("fetch-649e/out/cutin_r28_ouroth_50172", 300, 0.7),
    "quarrak": ("fetch-4be9/out/cutin_r24_quarrak_50022", 300, 1.0),
    "umbrel": ("fetch-4be9/out/cutin_r24_umbrel_50112", 300, 1.0),
    "vortigal": ("fetch-4be9/out/cutin_r24_vortigal_50101", 300, 1.0),
    "zephra": ("fetch-4be9/out/cutin_r24_zephra_50072", 300, 1.0),
}


def band(src: Path, top: int, brightness: float) -> Image.Image:
    im = Image.open(src).convert("RGB")
    if im.size != (1344, 768):
        raise SystemExit(f"{src}: expected 1344x768, got {im.size}")
    out = im.crop((0, top, W, top + H))
    return out if brightness == 1.0 else ImageEnhance.Brightness(out).enhance(brightness)


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        raise SystemExit(__doc__)
    scratch = Path(argv[1])
    out_dir = Path(argv[2]) if len(argv) > 2 else Path("public/assets/img/cutin")
    out_dir.mkdir(parents=True, exist_ok=True)
    for hero, (stem, top, brightness) in sorted(SOURCES.items()):
        src = scratch / f"{stem}_1344x768.png"
        if not src.is_file():
            raise SystemExit(f"missing source: {src}")
        band(src, top, brightness).save(out_dir / f"{hero}.png", optimize=True)
        print(f"{hero}: {src.name} y={top} x{brightness}")


if __name__ == "__main__":
    main(sys.argv)
