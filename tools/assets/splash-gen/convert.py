"""Convert one approved splash backdrop PNG to WebP. Usage: python3 -I convert.py <src.png> <dst.webp> <width> <height>
Lanczos-resizes only when the size differs (the approved picks are already 1344x768 or 1536x640). Needs Pillow."""
import sys
from PIL import Image

src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB')
if im.size != (w, h):
    im = im.resize((w, h), Image.LANCZOS)
im.save(dst, 'WEBP', quality=88, method=6)
