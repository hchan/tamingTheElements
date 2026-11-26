# Mattes the Abyssor KO redo (r7 seed 121010, flat grey 128 background) to RGBA -> tools/assets/ko-gen/approved/abyssor_ko.png.
#   ~/claudetmp/venv/bin/python -I tools/assets/ko-gen/matte-abyssor-r7.py
# Same colour key as ko-warp-r24.py (distance from grey 128, ramp 7..33, grey decontaminated out of edge pixels). Deterministic.
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "tools/assets/ko-gen/sources/abyssor_ko_r7_121010.png"
OUT = ROOT / "tools/assets/ko-gen/approved/abyssor_ko.png"

rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
d = np.sqrt(((rgb - 128) ** 2).sum(-1))
a = np.clip((d - 7) / 26, 0, 1)
c = (rgb - 128 * (1 - a[..., None])) / np.maximum(a[..., None], 1e-3)
out = np.dstack([np.clip(c, 0, 255), a * 255]).round().astype(np.uint8)
Image.fromarray(out, "RGBA").save(OUT, optimize=True)
print(OUT, out.shape)
