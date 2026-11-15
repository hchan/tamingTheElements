"""400x400 Large portraits (public/assets/img/map/<hero>Large.png) for the procedural-rig heroes that have no legacy Large art:
the baked idle/E frame of imgWorkArea/sheets/<hero>, Lanczos-upscaled 5x onto a transparent 400x400 canvas, bottom-centred.
Run: ~/claudetmp/venv-rig/bin/python tools/assets/portrait-rig/large-portraits.py [hero...]   (default: kindrel nykra quarrak hyalia brazgor glimmaw durrok zephra; needs Pillow)
"""
import sys
from PIL import Image

heroes = sys.argv[1:] or ["kindrel", "nykra", "quarrak", "hyalia", "brazgor", "glimmaw", "durrok", "zephra"]
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
