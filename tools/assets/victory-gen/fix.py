# Round-2 cleanup: the wave-B mattes are opaque on flat #808080, so hairlines are backdrop residue, not alpha.
# Build a subject mask (|rgb-128| > 14), open away thin detail (k px), grow it g px, set everything outside to flat 128.
# Subject pixels are untouched. Usage (from .scratch/victory-warp): python -I waveB/fix.py brazgor [k] [g]
import sys
import numpy as np
from PIL import Image, ImageFilter
def clean(path, k=9, g=9, thr=14):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    diff = np.abs(a - 128).max(axis=2) > thr
    m = Image.fromarray((diff * 255).astype(np.uint8))
    o = m.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MaxFilter(g))
    keep = np.asarray(o) > 0
    out = a.copy(); out[~keep] = 128
    Image.fromarray(out.astype(np.uint8)).save(path); return int((~keep & (np.abs(a - 128).max(axis=2) > 0)).sum())
if __name__ == '__main__':
    n = sys.argv[1]; k = int(sys.argv[2]) if len(sys.argv) > 2 else 9; g = int(sys.argv[3]) if len(sys.argv) > 3 else 9
    print(n, 'pixels reset to flat grey:', clean(f'waveB/{n}_win.png', k, g))
