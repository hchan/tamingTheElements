"""400x400 Large portraits (public/assets/img/map/<hero>Large.png) for the procedural-rig heroes that have no legacy Large art:
the baked idle/E frame of imgWorkArea/sheets/<hero>, Lanczos-upscaled 5x onto a transparent 400x400 canvas, bottom-centred.
Run: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/large-portraits.py HERO...   (hero names are required; needs Pillow)
There is no default list, and the roster24 ids are refused: their Large.png is the painted portrait the rig is built FROM
(tools/assets/roster24-art), so this script must never overwrite it.
"""
import sys
from PIL import Image

ROSTER24 = {"kindrel", "nykra", "quarrak", "hyalia", "brazgor", "glimmaw", "durrok", "zephra", "ouroth", "abyssor", "vortigal", "umbrel"}

heroes = sys.argv[1:]
if not heroes:
    sys.exit("usage: large-portraits.py HERO... (no default list)")
bad = sorted(set(heroes) & ROSTER24)
if bad:
    sys.exit("refusing to overwrite the painted Large.png of roster24 heroes: " + ", ".join(bad))
for h in heroes:
    fr = Image.open(f"imgWorkArea/sheets/{h}/idle/E/00.png").convert("RGBA")
    box = fr.getbbox()
    fr = fr.crop(box)
    k = min(380 / fr.width, 380 / fr.height)
    big = fr.resize((round(fr.width * k), round(fr.height * k)), Image.LANCZOS)
    out = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    out.alpha_composite(big, ((400 - big.width) // 2, 400 - 10 - big.height))
    out.save(f"public/assets/img/map/{h}Large.png", optimize=True)
    print("ok", h, big.size)
