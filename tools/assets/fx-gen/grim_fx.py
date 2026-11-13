"""Shared grim painterly grade for the fx-gen sprites (owner: recent art too cartoony; ideas/brainstorm/effect-sprite-style-pass.md).
Used by batches A-D, G and ice-shock.py at save time (batches E/F carry their own, slightly heavier grim() in batch-e-map.py).
grade(img, name): desaturate toward grey, tone down pure highlights (no flat white pops) but keep a pale core so sprites still read
on the dark Fire/Void floors, mottle the colour with value noise, add film grain, and soften/erode the alpha edge with noise so the
silhouette is not a flat hard-edged shape. Deterministic: the noise seed is a CRC of the sprite name, so regenerating is byte-stable.
Needs Pillow + numpy.
"""
import zlib
import numpy as np
from PIL import Image, ImageFilter


def _fbm(rng, h, w):
    acc = np.zeros((h, w), np.float32)
    for cells, amp in ((3, 0.5), (8, 0.3), (20, 0.2)):
        g = Image.fromarray((rng.rand(cells, cells) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
    return acc


def grade(img, name, sat=0.55, gamma=1.15, edge=0.1):
    img = img.convert("RGBA")
    rng = np.random.RandomState(zlib.crc32(name.encode()) & 0x7FFFFFFF)
    a = np.asarray(img, np.float32)
    h, w = a.shape[:2]
    rgb, al = a[..., :3], a[..., 3] / 255
    al_img = Image.fromarray((al * 255).astype(np.uint8))
    soft = np.asarray(al_img.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    core = np.asarray(al_img.filter(ImageFilter.GaussianBlur(2.5)), np.float32) / 255
    mott = _fbm(rng, h, w)
    al2 = np.where(al > 0, np.clip((soft - edge) / (1 - edge) * (0.86 + 0.28 * mott), 0, 1), np.clip(soft * 0.6, 0, 1) * (mott > 0.5))
    grey = (rgb * np.array([0.3, 0.59, 0.11], np.float32)).sum(-1, keepdims=True)
    rgb = grey + (rgb - grey) * sat
    rgb = 255 * (rgb / 255) ** gamma
    rgb = rgb * (0.8 + 0.16 * core[..., None]) * (0.8 + 0.34 * mott[..., None])
    rgb = rgb + rng.normal(0, 7, (h, w, 1)).astype(np.float32)
    out = np.dstack([np.clip(rgb, 0, 255), al2 * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")
