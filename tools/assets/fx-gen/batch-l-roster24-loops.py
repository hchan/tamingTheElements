"""Placeholder looping projectile strips for the eight roster24 projectile abilities (WP A0).

Each strip is 8 frames at twice the static sprite's size (frame 2w x 2h, strip 16w x 2h),
written to public/assets/img/fx/loop/<name>Loop.png. The frames are the static upscaled 2x
with a gentle deterministic pulse (scale and brightness), so nothing looks worse than the
static it replaces. Real painted loops (A-FIRE/WATER/EARTH/AIR) overwrite these files.

Run: ~/claudetmp/venv-rig/bin/python -I tools/assets/fx-gen/batch-l-roster24-loops.py
"""
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[3]
FX = ROOT / 'public/assets/img/fx'
NAMES = ['cinderSpray', 'lureOrb', 'abyssalPull', 'boulderRoll', 'sporeBurst', 'stingingFilament', 'bellPulse', 'staticMote']
# Fixed pulse table (no trig): scale percent and brightness percent per frame, one smooth cycle.
SCALE = [96, 98, 100, 101, 100, 98, 96, 95]
BRIGHT = [96, 100, 104, 106, 104, 100, 96, 94]

for name in NAMES:
    src = Image.open(FX / f'{name}.png').convert('RGBA')
    w, h = src.size
    fw, fh = w * 2, h * 2
    base = src.resize((fw, fh), Image.LANCZOS)
    strip = Image.new('RGBA', (fw * 8, fh), (0, 0, 0, 0))
    for i in range(8):
        sw, sh = max(1, fw * SCALE[i] // 100), max(1, fh * SCALE[i] // 100)
        f = base.resize((sw, sh), Image.LANCZOS)
        r, g, b, a = f.split()
        rgb = ImageEnhance.Brightness(Image.merge('RGB', (r, g, b))).enhance(BRIGHT[i] / 100)
        f = Image.merge('RGBA', (*rgb.split(), a))
        strip.alpha_composite(f, (i * fw + (fw - sw) // 2, (fh - sh) // 2))
    out = FX / 'loop' / f'{name}Loop.png'
    strip.save(out, optimize=True)
    print(out.relative_to(ROOT), strip.size)
