"""Regenerates the legacy-layout Pax map sprite (public/assets/img/map/pax.png, 320x80: four 80x80 frames) from the baked sheet's idle/E
frames, so the HUD portrait, the Versus pick tiles and the garrison avatars match the rigged Pax (the legacy art was cartoony; 2026-11-12).
Run after `pnpm assets:bake && pnpm assets:sheets`: python3 tools/assets/rig-gen/pax-portrait.py   (needs Pillow)"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
sheet = Image.open(os.path.join(ROOT, "public/assets/img/sheets/pax.png")).convert("RGBA")
out = Image.new("RGBA", (320, 80), (0, 0, 0, 0))
for i in range(4):  # idle/E frames sit at (0,0), (80,0), (160,0), (240,0) in the sheet (the same cells the legacy file used)
    out.paste(sheet.crop((i * 80, 0, i * 80 + 80, 80)), (i * 80, 0))
out.save(os.path.join(ROOT, "public/assets/img/map/pax.png"), optimize=True)
print("ok")
