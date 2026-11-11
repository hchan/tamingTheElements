#!/usr/bin/env python3
"""Rig cut-assist (offline, not shipped, outside the gate): cut a sprite into non-overlapping rig parts.

Writes <out>/parts/<id>.png (transparent background, extended 'underlap' pixels beneath neighbours) and a rig.json skeleton
(parent tree, suggested pivots, `at` offsets) in the format of tools/assets/bake-rig.ts. See README.md.
Pure numpy + pillow, except SAM mode, which imports torch and sam2 lazily.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def polygon_mask(poly, h: int, w: int) -> np.ndarray:
    """Even-odd fill of a polygon [[x, y], ...] sampled at pixel centres."""
    ys, xs = np.mgrid[0:h, 0:w]
    px, py = xs + 0.5, ys + 0.5
    inside = np.zeros((h, w), bool)
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if y0 == y1:
            continue
        crosses = (y0 <= py) != (y1 <= py)
        xcross = x0 + (py - y0) * (x1 - x0) / (y1 - y0)
        inside ^= crosses & (px < xcross)
    return inside


def sam_masks(rgba: np.ndarray, spec: dict, checkpoint: str, config: str, upscale: int, device: str) -> dict:
    """One SAM 2 mask per part from include/exclude clicks (image upscaled nearest-neighbour, masks sampled back)."""
    import torch  # noqa: PLC0415
    from sam2.build_sam import build_sam2  # noqa: PLC0415
    from sam2.sam2_image_predictor import SAM2ImagePredictor  # noqa: PLC0415

    h, w = rgba.shape[:2]
    flat = Image.alpha_composite(Image.new("RGBA", (w, h), (128, 128, 128, 255)), Image.fromarray(rgba, "RGBA")).convert("RGB")
    big = np.asarray(flat.resize((w * upscale, h * upscale), Image.NEAREST))
    predictor = SAM2ImagePredictor(build_sam2(config, checkpoint, device=device))
    out = {}
    with torch.inference_mode():
        predictor.set_image(big)
        for pid, p in spec.items():
            inc, exc = p.get("include", []), p.get("exclude", [])
            if not inc:
                raise SystemExit(f"part {pid}: needs at least one include point")
            pts = np.array([[(x + 0.5) * upscale, (y + 0.5) * upscale] for x, y in inc + exc], np.float32)
            labels = np.array([1] * len(inc) + [0] * len(exc), np.int32)
            m, _, _ = predictor.predict(point_coords=pts, point_labels=labels, multimask_output=False)
            half = upscale // 2
            out[pid] = np.asarray(m[0], bool)[half::upscale, half::upscale][:h, :w]
    return out


def make_disjoint(masks: dict, order: list, alpha: np.ndarray) -> dict:
    """Earlier parts win overlaps; masks are clipped to opaque pixels."""
    taken = np.zeros(alpha.shape, bool)
    out = {}
    for pid in order:
        m = masks[pid] & (alpha > 0) & ~taken
        out[pid] = m
        taken |= m
    return out


def shift(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    out[max(dy, 0) : h + min(dy, 0), max(dx, 0) : w + min(dx, 0)] = a[max(-dy, 0) : h + min(-dy, 0), max(-dx, 0) : w + min(-dx, 0)]
    return out


def underlap(rgb: np.ndarray, own: np.ndarray, allowed: np.ndarray, steps: int):
    """Grow `own` by `steps` px (4-neighbour) into `allowed`, copying the nearest own colour (edge-extend, no diffusion)."""
    cur, col = own.copy(), np.where(own[..., None], rgb, 0).astype(np.uint8)
    for _ in range(steps):
        new, ncol = np.zeros_like(cur), col.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):  # fixed order: deterministic
            take = shift(cur, dy, dx) & ~cur & ~new & allowed
            ncol[take] = shift(col, dy, dx)[take]
            new |= take
        if not new.any():
            break
        cur, col = cur | new, ncol
    return cur, col


def centroid(m: np.ndarray):
    ys, xs = np.nonzero(m)
    return float(xs.mean()) + 0.5, float(ys.mean()) + 0.5


def cut(rgba: np.ndarray, spec: dict, masks: dict, out_dir: Path, steps: int, dirs=("E",)) -> dict:
    order = list(spec)
    alpha = rgba[..., 3]
    own = make_disjoint(masks, order, alpha)
    for pid in order:
        if not own[pid].any():
            raise SystemExit(f"part {pid}: empty mask")
    z = {pid: spec[pid].get("z", len(order) - i) for i, pid in enumerate(order)}  # first listed = on top
    parents = {pid: spec[pid].get("parent") for pid in order}
    for pid, par in parents.items():
        if par is not None and par not in spec:
            raise SystemExit(f"part {pid}: unknown parent {par}")
    leftover = int(((alpha > 0) & ~np.any([own[p] for p in order], axis=0)).sum())
    if leftover:
        print(f"warning: {leftover} opaque px belong to no part", file=sys.stderr)
    (out_dir / "parts").mkdir(parents=True, exist_ok=True)
    info, rgb = {}, rgba[..., :3]
    for pid in order:
        # Only extend beneath parts drawn above this one (higher z); that is where the hidden pixels are.
        above = np.any([own[q] for q in order if z[q] > z[pid]] or [np.zeros_like(alpha, bool)], axis=0)
        grown, col = underlap(rgb, own[pid], above, steps)
        ys, xs = np.nonzero(grown)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        img = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        sub = grown[y0:y1, x0:x1]
        img[sub, :3] = col[y0:y1, x0:x1][sub]
        img[sub, 3] = np.where(own[pid][y0:y1, x0:x1][sub], alpha[y0:y1, x0:x1][sub], 255)
        Image.fromarray(img, "RGBA").save(out_dir / "parts" / f"{pid}.png")
        par = parents[pid]
        contact = None
        if par:
            p = own[par]
            contact = own[pid] & (shift(p, 0, 1) | shift(p, 0, -1) | shift(p, 1, 0) | shift(p, -1, 0))
            if not contact.any():
                print(f"warning: part {pid} does not touch its parent {par}; pivot is its centroid", file=sys.stderr)
        cx, cy = centroid(contact if contact is not None and contact.any() else own[pid])
        info[pid] = {"origin": (int(x0), int(y0)), "pivot_world": (int(round(cx)), int(round(cy)))}
    parts = []
    for pid in order:
        o, pw = info[pid]["origin"], info[pid]["pivot_world"]
        par = parents[pid]
        at = list(pw) if par is None else [pw[0] - info[par]["pivot_world"][0], pw[1] - info[par]["pivot_world"][1]]
        part = {"id": pid}
        if par:
            part["parent"] = par
        part.update({"png": f"{pid}.png", "pivot": [pw[0] - o[0], pw[1] - o[1]], "at": at, "z": z[pid]})
        parts.append(part)
    rig = {"dirs": list(dirs), "parts": parts, "actions": {"idle": {"frames": 4, "curves": {}}}}
    (out_dir / "rig.json").write_text(json.dumps(rig, indent=2) + "\n")
    return rig


def load_spec(path: Path) -> dict:
    spec = json.loads(path.read_text())
    if not isinstance(spec, dict) or not spec:
        raise SystemExit("points.json: expected a non-empty object {part: {include, exclude}}")
    for pid in spec:
        if not ID_RE.match(pid):
            raise SystemExit(f"points.json: bad part id {pid!r} (letters, digits, _ and - only)")
    return spec


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("image", type=Path, help="source sprite PNG (e.g. public/assets/img/map/NAME.png)")
    ap.add_argument("points", type=Path, help="points.json")
    ap.add_argument("out", type=Path, help="rig directory to write (imgWorkArea/rigs/<sprite>)")
    ap.add_argument("--crop", help="x,y,w,h of one frame inside the image (default: whole image)")
    ap.add_argument("--underlap", type=int, default=10, help="px to extend under neighbours (8 to 12 suggested)")
    ap.add_argument("--no-sam", action="store_true", help="use hand-drawn polygons from points.json instead of SAM 2")
    ap.add_argument("--checkpoint", help="SAM 2 checkpoint .pt (you download it; never committed)")
    ap.add_argument("--config", default="configs/sam2.1/sam2.1_hiera_l.yaml")
    ap.add_argument("--upscale", type=int, default=8)
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args(argv)
    if not 0 <= a.underlap <= 32:
        raise SystemExit("--underlap must be 0..32")
    img = Image.open(a.image).convert("RGBA")
    if a.crop:
        x, y, w, h = (int(v) for v in a.crop.split(","))
        img = img.crop((x, y, x + w, y + h))
    rgba = np.asarray(img).copy()
    spec = load_spec(a.points)
    h, w = rgba.shape[:2]
    if a.no_sam:
        masks = {}
        for pid, p in spec.items():
            if "polygon" not in p:
                raise SystemExit(f"part {pid}: --no-sam needs a 'polygon' [[x, y], ...]")
            masks[pid] = polygon_mask(p["polygon"], h, w)
    else:
        if not a.checkpoint:
            raise SystemExit("SAM mode needs --checkpoint (or use --no-sam with polygons)")
        masks = sam_masks(rgba, spec, a.checkpoint, a.config, a.upscale, a.device)
    cut(rgba, spec, masks, a.out, a.underlap)
    print(f"wrote {len(spec)} parts and rig.json to {a.out}")


if __name__ == "__main__":
    main()
