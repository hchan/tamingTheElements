"""Procedural KO key frames for Kindrel (quadruped: the bone rig tears limbs on a fall). Rotates and squashes the baked idle frame onto
its side and drops it to the ground, writing imgWorkArea/rigs/kindrel/keys/ko/E/00..03.png (the bake takes them in place of its own
render). Run after prep.py and a first bake (it reads the baked idle frame), then bake again. Usage:
~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/kindrel-ko-keys.py"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
DIRS = ["E", "SE", "NE", "S", "N"]
F = 240
MARGIN = 4
# (rotation degrees clockwise about the feet, horizontal scale, vertical scale, dx, dy) per frame; the last frame holds
POSES = [(6, 0.98, 0.94, -3, 0), (22, 0.94, 0.8, -8, 0), (45, 0.88, 0.7, -10, 0), (52, 0.86, 0.66, -10, 0)]

for d in DIRS:
  SRC = os.path.join(ROOT, "imgWorkArea", "sheets", "kindrel", "idle", d, "00.png")
  OUT = os.path.join(ROOT, "imgWorkArea", "rigs", "kindrel", "keys", "ko", d)
  os.makedirs(OUT, exist_ok=True)
  src = Image.open(SRC).convert("RGBA")
  bbox = src.getbbox()
  assert bbox is not None
  pivot = ((bbox[0] + bbox[2]) // 2 + (20 if d == 'E' else 0), bbox[3])  # the feet line, a little right of centre (the body leans to the right)
  H = F // 2
  for i, (rot, sx, sy, dx, dy) in enumerate(POSES):
      img = src.resize((round(F * sx), round(F * sy)), Image.LANCZOS)
      big = Image.new("RGBA", (F * 2, F * 2), (0, 0, 0, 0))
      big.alpha_composite(img, (pivot[0] + H - round(pivot[0] * sx), pivot[1] + H - round(pivot[1] * sy)))
      big = big.rotate(-rot, resample=Image.BICUBIC, center=(pivot[0] + H, pivot[1] + H))
      bb = big.getbbox()
      assert bb is not None
      # crop window: nominal offset, then slid so the whole silhouette sits inside with a margin
      ox = max(min(H - dx, bb[0] - MARGIN), bb[2] + MARGIN - F)
      oy = max(min(H - dy, bb[1] - MARGIN), bb[3] + MARGIN - F)
      out = big.crop((ox, oy, ox + F, oy + F))
      out.save(os.path.join(OUT, f"{i:02d}.png"))
      print(i, out.getbbox())
