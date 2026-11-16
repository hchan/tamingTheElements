"""Pad a cutout with a transparent margin and fade the outermost pixels so no alpha touches the canvas edge
(roster24 Vortigal wing tips). Usage: pad-fade.py IN OUT [--pad 40] [--fade 12]"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--pad", type=int, default=40); ap.add_argument("--fade", type=int, default=12)
a = ap.parse_args()
im = np.array(Image.open(a.src).convert("RGBA")).astype(np.float32)
h, w = im.shape[:2]
ramp = lambda n: np.clip(np.arange(n) / a.fade, 0, 1)
fx = np.minimum(ramp(w), ramp(w)[::-1]); fy = np.minimum(ramp(h), ramp(h)[::-1])
im[:, :, 3] *= np.minimum(fy[:, None], fx[None, :])
im[:, :, 3][0, :] = 0; im[:, :, 3][-1, :] = 0; im[:, :, 3][:, 0] = 0; im[:, :, 3][:, -1] = 0
out = np.zeros((h + 2 * a.pad, w + 2 * a.pad, 4), np.uint8)
out[a.pad:a.pad + h, a.pad:a.pad + w] = im.astype(np.uint8)
Image.fromarray(out).save(a.out)
al = out[:, :, 3]
print(a.out, out.shape[1], out.shape[0], "edge alpha max L/R/T/B", al[:, 0].max(), al[:, -1].max(), al[0].max(), al[-1].max())
