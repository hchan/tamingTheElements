"""Key a flat #808080 matte (RGB, from tools/assets/matte/matte.py or an approved regrade) to an RGBA cutout.
Usage: grey-key.py IN OUT [--flip] [--tol 6] [--soft 60] [--band 3] [--min-hole 300]
Background = pixels within --tol of (128,128,128) that are connected to the border (PIL floodfill, no scipy needed), plus,
when scipy is importable, enclosed grey holes of at least --min-hole px (gaps between limbs). Grey INSIDE the creature that
touches no background is kept, so light/silver heroes survive. Pixels within --band px of the background get a soft alpha
(distance from grey over --soft) and the grey is unmixed from their colour (C = a*F + (1-a)*G), removing the grey halo.
Only the largest alpha component is kept when scipy is present. --flip mirrors left->right (heroes face right).
Pure functions: key_rgb(arr) -> RGBA uint8 array. Run with ~/claudetmp/venv/bin/python -I (add scipy for holes/components:
~/claudetmp/rembg-venv/bin/python -I)."""
import argparse
import numpy as np
from PIL import Image, ImageDraw

GREY = 128

try:
    from scipy import ndimage
except ImportError:  # pragma: no cover
    ndimage = None


def _dist(a):
    return np.abs(a.astype(np.int16) - GREY).max(axis=2)


def border_bg(near):
    h, w = near.shape
    # pad with a 'near' ring so one seed reaches every border-connected near pixel
    p = np.ones((h + 2, w + 2), np.uint8)
    p[1:-1, 1:-1] = near.astype(np.uint8)
    im = Image.fromarray(p * 255).copy()  # copy: fromarray buffer is read-only
    ImageDraw.floodfill(im, (0, 0), 128)
    return (np.asarray(im) == 128)[1:-1, 1:-1]


def _dilate(mask, n):
    out = mask.copy()
    for _ in range(n):
        p = np.pad(out, 1)
        out = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def key_rgb(a, tol=6, soft=60, band=3, min_hole=300):
    d = _dist(a)
    near = d <= tol
    bg = border_bg(near)
    if ndimage is not None:
        lab, n = ndimage.label(near)
        if n:
            sizes = ndimage.sum(near, lab, range(1, n + 1))
            for i in np.nonzero(sizes >= min_hole)[0]:
                bg |= lab == (i + 1)
    edge = _dilate(bg, band) & ~bg
    alpha = np.ones(d.shape, np.float32)
    alpha[bg] = 0
    ramp = np.clip((d - tol) / float(soft), 0, 1)
    alpha[edge] = ramp[edge]
    f = a.astype(np.float32)
    al = np.maximum(alpha, 1e-3)[..., None]
    unmixed = np.clip((f - (1 - alpha)[..., None] * GREY) / al, 0, 255)
    f = np.where(edge[..., None], unmixed, f)
    out = np.dstack([f, alpha * 255]).round().astype(np.uint8)
    if ndimage is not None:
        lab, n = ndimage.label(out[..., 3] > 16)
        if n > 1:
            sizes = ndimage.sum(out[..., 3] > 16, lab, range(1, n + 1))
            out[..., 3] = np.where(lab == 1 + int(np.argmax(sizes)), out[..., 3], 0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--flip", action="store_true")
    ap.add_argument("--tol", type=int, default=6); ap.add_argument("--soft", type=int, default=60)
    ap.add_argument("--band", type=int, default=3); ap.add_argument("--min-hole", type=int, default=300)
    a = ap.parse_args()
    im = Image.open(a.src).convert("RGB")
    if a.flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    out = Image.fromarray(key_rgb(np.asarray(im), a.tol, a.soft, a.band, a.min_hole), "RGBA")
    out.save(a.out)
    print(a.out, out.size, "bbox", out.getchannel("A").getbbox())


if __name__ == "__main__":
    main()
