"""Procedural KO key frames for Ouroth (serpent: the bone rig tears the coil on a fall). Buckles the coil, then slumps and flattens the baked idle
frame onto the ground, always resting on the floor line, with a flat floor shadow that widens as the body drops (the shadow is kept out
of the rotated layer) and the eye and molten glow dimming. Writes imgWorkArea/rigs/ouroth/keys/ko/<dir>/00..03.png (the bake takes
them in place of its own render). Run after prep.py and a first bake (it reads the baked idle frame), then bake again. Usage:
~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/ouroth-ko-keys.py"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
DIRS = ["E", "SE", "NE", "S", "N"]
F = 240
MARGIN = 4
# (rotation degrees clockwise about the lowest contact, horizontal scale, vertical scale (negative = flipped onto its back), dx, glow keep,
# shadow width scale) per frame: buckle, slump, sink, flat on the floor (the last frame holds)
POSES = [(2, 1.0, 0.94, -3, 1.0, 1.0), (4, 1.03, 0.82, -5, 0.8, 1.1), (6, 1.06, 0.72, -6, 0.65, 1.2), (8, 1.08, 0.66, -6, 0.5, 1.3)]


def tight_bbox(img, thr=60):
  return img.getchannel("A").point(lambda v: 255 if v >= thr else 0).getbbox()


def dim_glow(img, keep):
  if keep >= 1.0:
    return img
  px = img.load()
  for y in range(img.size[1]):
    for x in range(img.size[0]):
      r, g, b, a = px[x, y]
      if a and r > 190 and 50 < g < 200 and b < 110 and r - b > 110:  # eye and molten cracks
        px[x, y] = (round(r * keep), round(g * keep), round(b * keep), a)
  return img


for d in DIRS:
  SRC = os.path.join(ROOT, "imgWorkArea", "sheets", "ouroth", "idle", d, "00.png")
  OUT = os.path.join(ROOT, "imgWorkArea", "rigs", "ouroth", "keys", "ko", d)
  os.makedirs(OUT, exist_ok=True)
  full = Image.open(SRC).convert("RGBA")
  a = full.getchannel("A")
  rows = [y for y in range(F) if a.crop((0, y, F, y + 1)).getextrema()[1] >= 200]
  floor = max(rows)  # feet line: the faint idle shadow below it is dropped and redrawn flat
  src = full.copy()
  src.paste((0, 0, 0, 0), (0, floor + 1, F, F))
  sa = src.getchannel("A").point(lambda v: v if v >= 60 else 0)  # faint shadow remnants under the feet
  src.putalpha(sa)
  bbox = tight_bbox(src)
  assert bbox is not None
  cx = (bbox[0] + bbox[2]) // 2
  H = F // 2
  for i, (rot, sx, sy, dx, keep, srx) in enumerate(POSES):
      img = dim_glow(src.copy(), keep)
      flip = sy < 0
      if flip:
        img = img.transpose(Image.FLIP_TOP_BOTTOM)  # belly up: the feet line becomes the top; drop it back below
      ay = abs(sy)
      img = img.resize((round(F * sx), round(F * ay)), Image.LANCZOS)
      big = Image.new("RGBA", (F * 2, F * 2), (0, 0, 0, 0))
      fy = (F - 1 - floor) if flip else floor  # contact row inside the (possibly flipped) image
      fy = fy * ay
      px0, py0 = cx + H - round(cx * sx), floor + H - round(fy)
      big.alpha_composite(img, (px0, py0))
      big = big.rotate(-rot, resample=Image.BICUBIC, center=(cx + H, floor + H))
      bb = tight_bbox(big)
      assert bb is not None
      # drop onto the floor line: lowest silhouette pixel sits at `floor`; x slid so the silhouette fits with a margin
      ox = max(min(H - dx, bb[0] - MARGIN), bb[2] + MARGIN - F)
      oy = bb[3] - 1 - floor  # last silhouette row (bb[3] is exclusive) lands on the floor row
      oy = min(oy, bb[1] - MARGIN)
      out = big.crop((ox, oy, ox + F, oy + F))
      # flat floor shadow under the silhouette, wider as the body drops
      ob = tight_bbox(out)
      scx = (ob[0] + ob[2]) // 2
      rx = round((ob[2] - ob[0]) * 0.5 * 0.9 * srx / 1.2)
      sh = Image.new("RGBA", (F, F), (0, 0, 0, 0))
      ImageDraw.Draw(sh).ellipse((scx - rx, floor - 8, scx + rx, floor + 5), fill=(0, 0, 0, 70))
      sh = sh.filter(ImageFilter.GaussianBlur(2))
      res = Image.alpha_composite(sh, out)
      res.save(os.path.join(OUT, f"{i:02d}.png"))
      print(d, i, res.getbbox())
