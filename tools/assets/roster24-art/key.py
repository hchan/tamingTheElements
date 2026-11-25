#!/usr/bin/env python3
"""Key and grade generated fx plates into RGBA, run BEFORE prefilter/review. Never edits sources.

Methods (recorded in .scratch/status-fx/approval-8171.json, art-director conditional approvals):
  burn  : radial annulus mask + luminance/saturation key (embers on near-black)
  haste : luminance key as alpha (grey wisps on black) + radial feather
  heal  : radial annulus mask (plate is grey, not black) + hue key on green
  snag  : radial annulus mask, dark centre removed by luminance key
  relluma : radial annulus 0.20-0.47 x luma key relative to the corner median (plates on a grey ground)
  freeze, daze, tide : status-ring plates, relluma with per-slot defaults (freeze/daze/tide, see key-rings.py)
  radial, luma, satlum, hue : the building blocks alone
Usage: ~/claudetmp/venv/bin/python -I key.py <method> <in.png> <out.png> [--rmin 0.25 --rmax 0.5 --feather 0.04]
Radii are fractions of the image side (0.5 = inscribed circle). Needs Pillow + numpy.
"""
import sys, argparse
import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def luminance(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def saturation(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    return np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)


def hue(rgb):
    """Hue in degrees [0,360)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
    return (h * 60.0) % 360.0


def radius_map(shape):
    h, w = shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    return np.hypot((xs + 0.5) / w - 0.5, (ys + 0.5) / h - 0.5)  # 0.5 = edge midpoint


def radial_mask(shape, rmin=0.25, rmax=0.5, feather=0.04):
    """Soft annulus: 1 between rmin and rmax, feathered over `feather` on both edges."""
    r = radius_map(shape)
    inner = smoothstep(rmin - feather, rmin + feather, r) if rmin > 0 else 1.0
    return inner * (1 - smoothstep(rmax - 2 * feather, rmax, r))


def luma_key(rgb, lo=0.06, hi=0.35):
    return smoothstep(lo, hi, luminance(rgb))


def satlum_key(rgb, lo=0.08, hi=0.4, smin=0.25):
    """Bright pixels are kept; dim saturated pixels (embers) are kept; dark grey is dropped."""
    mx = rgb.max(-1)
    bright = smoothstep(lo, hi, luminance(rgb))
    ember = smoothstep(smin * 0.5, smin, saturation(rgb)) * smoothstep(lo, hi, mx)
    return np.maximum(bright, ember)


def hue_key(rgb, center=110.0, width=50.0, feather=25.0, smin=0.2):
    d = np.abs((hue(rgb) - center + 180) % 360 - 180)
    return (1 - smoothstep(width, width + feather, d)) * smoothstep(smin * 0.5, smin, saturation(rgb))


def grade(rgb, sat=1.15, val=1.1):
    mean = rgb.mean(-1, keepdims=True)
    return np.clip((mean + (rgb - mean) * sat) * val, 0, 1)


def compose(rgb, alpha, unmatte=True):
    """RGBA image. unmatte divides colour by alpha so a black-matte key leaves no dark halo."""
    a = np.clip(alpha, 0, 1)
    c = np.clip(rgb / np.maximum(a[..., None], 0.05), 0, 1) if unmatte else rgb
    out = np.dstack([c, a])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def _rad(rgb, k):
    return radial_mask(rgb.shape, k["rmin"], k["rmax"], k["feather"])


def key_radial(rgb, **k):
    return compose(rgb, _rad(rgb, k), unmatte=False)


def key_luma(rgb, **k):
    return compose(rgb, luma_key(rgb))


def key_satlum(rgb, **k):
    return compose(rgb, satlum_key(rgb))


def key_hue(rgb, **k):
    return compose(grade(rgb), hue_key(rgb), unmatte=False)


def key_burn(rgb, **k):
    return compose(grade(rgb), _rad(rgb, k) * satlum_key(rgb), unmatte=False)


def key_haste(rgb, **k):
    a = luma_key(rgb, 0.08, 0.5) * radial_mask(rgb.shape, 0.0, k["rmax"], k["feather"])
    return compose(rgb, a)


def key_heal(rgb, **k):
    # plate is grey, not black: the annulus carries the ring, the green hue key picks the glow
    a = _rad(rgb, k) * np.maximum(hue_key(rgb), 0.35 * luma_key(rgb, 0.1, 0.4))
    return compose(grade(rgb, 1.25, 1.1), a, unmatte=False)


def key_snag(rgb, **k):
    return compose(rgb, _rad(rgb, k) * luma_key(rgb, 0.05, 0.3))


def bg_luma(rgb):
    """Median luminance of the corners (r > 0.5): the plate's own ground level."""
    return float(np.median(luminance(rgb)[radius_map(rgb.shape) > 0.5]))


def relluma_alpha(rgb, rmin=0.20, rmax=0.47, feather=0.035, lo=0.05, hi=0.30):
    """Radial annulus x luma key measured against the corner median (bg+lo .. bg+hi)."""
    bg = bg_luma(rgb)
    return radial_mask(rgb.shape, rmin, rmax, feather) * smoothstep(bg + lo, bg + hi, luminance(rgb))


def key_relluma(rgb, **k):
    # CLI defaults (0.25/0.5/0.04) mean "not given": relluma has its own defaults
    given = (k["rmin"], k["rmax"], k["feather"]) != (0.25, 0.5, 0.04)
    a = relluma_alpha(rgb, *(k["rmin"], k["rmax"], k["feather"])) if given else relluma_alpha(rgb)
    return compose(rgb, a, unmatte=False)


def key_freeze(rgb, **k):
    return key_relluma(rgb, **k)


def key_daze(rgb, **k):
    return key_relluma(rgb, **k)


def key_tide(rgb, **k):
    return key_relluma(rgb, **k)


METHODS = dict(radial=key_radial, luma=key_luma, satlum=key_satlum, hue=key_hue,
               burn=key_burn, haste=key_haste, heal=key_heal, snag=key_snag,
               relluma=key_relluma, freeze=key_freeze, daze=key_daze, tide=key_tide)


def key_array(method, rgb, rmin=0.25, rmax=0.5, feather=0.04):
    return METHODS[method](rgb, rmin=rmin, rmax=rmax, feather=feather)


def key_file(method, src, dst, rmin=0.25, rmax=0.5, feather=0.04):
    img = key_array(method, load(src), rmin, rmax, feather)
    img.save(dst)
    return img


def main(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("method", choices=sorted(METHODS))
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--rmin", type=float, default=0.25)
    p.add_argument("--rmax", type=float, default=0.5)
    p.add_argument("--feather", type=float, default=0.04)
    a = p.parse_args(argv[1:])
    if a.src == a.dst:
        print("refusing to overwrite the source")
        return 2
    key_file(a.method, a.src, a.dst, a.rmin, a.rmax, a.feather)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
