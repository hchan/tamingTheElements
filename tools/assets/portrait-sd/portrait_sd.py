"""Bright medieval-fantasy re-paint of the legacy hero portraits with SDXL-Turbo img2img (offline).

Input : public/assets/img/map/<hero>Large.png (400 px RGBA legacy portraits, never modified).
Output: <out>/<hero>-sd.png (1024x1024 opaque RGB, element-tinted mid-tone backdrop) + <out>/run.json.
Default out: imgWorkArea/portrait-sd/ (masters; NOT shipped under public/).

Method (WP SD0):
  1. prep: alpha-composite on a mid-tone element backdrop, Lanczos to 1024, near-neutral grade (sat 1.03, gamma 1.0) + seeded mottle.
  2. SDXL-Turbo img2img, per-hero strength (0.28-0.42), 8 steps, guidance 0, a sweep of seeds.
  3. chroma re-anchor: keep SD luma (texture), blend Cb/Cr toward the original chroma blurred 12 px inside the feathered alpha
     (weight 0.5, 0.7 for curomo/cyclonius/wispera/echo). This keeps the element colour coding.
  4. eye/glow protection: bright saturated blobs + rig glow points + hand-listed eye points + morblass face box, feathered,
     screen-composited from the upscaled original.
  5. finish: no desaturation, grain sigma 2.
  6. checks inside the alpha: mean luma >= 0.85 x orig, mean saturation >= 0.80 x orig, circular mean hue within +-20 deg.
     The best seed per hero is kept; every hero prints PASS/FAIL, exit code 1 if any fails.
Prompt: hero words first, then palette, then a short style; the word "dark" is never used (it biases shading).

Run (offline; weights in the HF cache, venv with requirements.txt):
  HF_HUB_OFFLINE=1 python tools/assets/portrait-sd/portrait_sd.py [--out DIR] [--seeds 3] [--style a|b] [hero ...]
MPS fp16 reruns differ slightly; the committed masters and run.json are the record. Not part of the build or tests.
"""
import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "../../.."))
SRC = os.path.join(ROOT, "public/assets/img/map")
OUT = os.path.join(ROOT, "imgWorkArea/portrait-sd")
SEED = 20261114
ELEMENT = {  # palette words, backdrop colour
    "fire": ("crimson, ember orange and molten gold palette, warm firelight", (120, 60, 30)),
    "water": ("vivid sapphire, aquamarine and frost white palette, cool light", (40, 90, 130)),
    "earth": ("warm ochre, moss green and amber glow palette, golden light", (90, 75, 45)),
    "air": ("pale sky blue, silver-cyan and white glow palette, bright airy light", (90, 120, 160)),
    "void": ("deep violet, magenta and starlight palette, glowing rim light", (60, 30, 90)),
}
HEROES = {  # hero: (element, description, strength, chroma weight)
    "fiara": ("fire", "a phoenix of bright gold and orange flame, glowing coals, embers rising", 0.42, 0.5),
    "lavax": ("fire", "a beast of obsidian with bright molten gold-orange magma rivers", 0.42, 0.5),
    "sindarosa": ("fire", "a crimson and ember-red fire dragon", 0.40, 0.6),
    "curomo": ("water", "a pale blue-white water serpent dragon with a lavender belly", 0.38, 0.7),
    "ishimi": ("water", "a turquoise slime creature with two yellow-green glowing eyes", 0.40, 0.5),
    "morblass": ("water", "an ice beast with a clear face, blue ice and icicles", 0.30, 0.5),
    "pax": ("earth", "an earth colossus of mossy granite boulders with glowing ember cracks", 0.42, 0.5),
    "rokcore": ("earth", "an earth golem of ancient rock plates and moss, amber core", 0.42, 0.5),
    "treenoc": ("earth", "a gnarled tree beast of living bark, twisted roots and thorned vines", 0.42, 0.5),
    "cyclonius": ("air", "a swirling blue tornado of sky-blue wind and cyan lightning, two glowing red eyes", 0.38, 0.7),
    "echo": ("air", "a pale blue wind spiral with sound-wave rings, two glowing blue eyes", 0.35, 0.7),
    "wispera": ("air", "a small glowing blue wisp of light and mist", 0.28, 0.7),
    "eternalVoid": ("void", "a void entity, a rift of violet energy with magenta tendrils and stars", 0.42, 0.5),
}
STYLES = {
    "a": ", medieval fantasy oil painting, gothic, weathered, painterly brushwork, luminous, rich saturated colour, soft bright light",
    "b": ", illuminated manuscript medieval fantasy painting, gothic, painterly, luminous, rich saturated colour, soft bright light",
}
# Eye / glow points (x, y, radius) in 400 px portrait space: rig glows (portrait-rig/spec/*.json) and hand-listed points read off the originals.
GLOW_PTS = {
    "sindarosa": [(340, 166, 12), (352, 190, 14)],
    "curomo": [(280, 96, 12), (102, 172, 10), (160, 130, 10)],
    "pax": [(353, 76, 10), (362, 126, 12)],
    "echo": [(235, 130, 14), (305, 130, 14)],
    "ishimi": [(197, 90, 16), (308, 85, 14)],
    "cyclonius": [(205, 68, 12), (232, 70, 12)],
    "wispera": [(200, 200, 40)],
}
FACE_BOX = {"morblass": (130, 5, 215, 125)}  # box in 400 px space


def backdrop(rgb, size=1024):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / (size - 1)
    r = np.sqrt((x - 0.5) ** 2 + (y - 0.45) ** 2)
    k = np.clip(1.3 - 1.2 * r, 0.6, 1.3)[..., None]
    return Image.fromarray(np.clip(np.array(rgb, np.float32)[None, None] * k, 0, 255).astype(np.uint8))


def load_orig(name):
    return Image.open(os.path.join(SRC, f"{name}Large.png")).convert("RGBA")


def up_rgba(im):
    """Premultiplied Lanczos upscale to 1024 (no dark fringes). Returns rgb (0-255) and alpha (0-1, shape HxWx1)."""
    a = np.asarray(im, np.float32)
    al = a[..., 3:] / 255.0
    pm = np.concatenate([a[..., :3] * al, a[..., 3:]], axis=2)
    pm = np.stack([np.asarray(Image.fromarray(pm[..., i]).resize((1024, 1024), Image.LANCZOS)) for i in range(4)], axis=2)
    alpha = np.clip(pm[..., 3:] / 255.0, 0, 1)
    rgb = np.where(alpha > 1e-3, pm[..., :3] / np.maximum(alpha, 1e-3), 0)
    return np.clip(rgb, 0, 255), alpha


def blur(arr2d, r):
    """Gaussian blur of a 0-1 float image (8-bit quantised, fine for masks)."""
    img = Image.fromarray(np.clip(arr2d * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(img, np.float32) / 255.0


def prep(name, bgc):
    rgb, alpha = up_rgba(load_orig(name))
    g = rgb.mean(axis=2, keepdims=True)
    rgb = g + (rgb - g) * 1.03
    mott = np.random.default_rng(SEED).normal(0, 1, (64, 64)).astype(np.float32)
    mott = np.asarray(Image.fromarray(mott).resize((1024, 1024), Image.BICUBIC))[..., None]
    shaded = rgb * (0.95 + 0.06 * mott)
    bg = np.asarray(backdrop(bgc), np.float32)
    out = shaded * alpha + bg * (1 - alpha)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), rgb, alpha[..., 0]


def glow_mask(name, rgb, alpha):
    """Small bright saturated blobs + hand-listed eye points + face box, feathered. 0-1 float (1024^2)."""
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    v, s = mx / 255.0, (mx - mn) / np.maximum(mx, 1)
    m = ((v > 0.8) & (s > 0.5) & (alpha > 0.5)).astype(np.float32)
    m = m * (blur(m, 14) < 0.35)  # large saturated areas are body colour, not glints
    mm = np.zeros((1024, 1024), np.float32)
    yy, xx = np.mgrid[0:1024, 0:1024].astype(np.float32)
    for (px, py, r) in GLOW_PTS.get(name, []):
        cx, cy, rr = px * 2.56, py * 2.56, r * 2.56
        mm = np.maximum(mm, np.clip(1.5 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / rr, 0, 1))
    if name in FACE_BOX:
        x0, y0, x1, y1 = [int(c * 2.56) for c in FACE_BOX[name]]
        mm[y0:y1, x0:x1] = 1.0
    m = np.maximum(np.clip(blur(m, 3) * 2, 0, 1), mm)
    return np.clip(blur(np.clip(m, 0, 1), 5) * 1.5, 0, 1)


def ycc(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return y, (b - y) * 0.564, (r - y) * 0.713


def rgb_from(y, cb, cr):
    r = y + 1.403 * cr
    b = y + 1.773 * cb
    g = (y - 0.299 * r - 0.114 * b) / 0.587
    return np.stack([r, g, b], axis=2)


def post(sd, orig_rgb, alpha, glow, w, seed):
    a = np.asarray(sd, np.float32)
    y, cb, cr = ycc(a)
    _, ocb, ocr = ycc(orig_rgb)
    den = np.maximum(blur(alpha, 12), 1e-3)
    # alpha-weighted 12 px blur of the original chroma (offset by 128 to survive the 8-bit blur), so transparent areas do not bleed
    bcb = (blur((ocb + 128) / 255 * alpha, 12) / den) * 255 - 128
    bcr = (blur((ocr + 128) / 255 * alpha, 12) / den) * 255 - 128
    f = (np.clip(blur(alpha, 6) * 1.2, 0, 1) * w)
    cb = cb * (1 - f) + bcb * f
    cr = cr * (1 - f) + bcr * f
    out = np.clip(rgb_from(y, cb, cr), 0, 255)
    g = glow[..., None]
    scr = 255 - (255 - out) * (255 - orig_rgb) / 255  # screen the upscaled original over the SD output
    out = out * (1 - g) + scr * g
    out = out + np.random.default_rng(seed).normal(0, 2.0, out.shape[:2])[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def stats(rgb, w):
    """Weighted mean luma (0-1), mean saturation (HSV), circular mean hue (deg, saturation-weighted) over weights w."""
    x = rgb / 255.0
    mx, mn = x.max(axis=2), x.min(axis=2)
    s = (mx - mn) / np.maximum(mx, 1e-3)
    luma = x @ np.array([0.299, 0.587, 0.114], np.float32)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    ww = w * s
    sw = max(float(w.sum()), 1e-6)
    hr = np.deg2rad(h)
    hue = np.rad2deg(np.arctan2((np.sin(hr) * ww).sum(), (np.cos(hr) * ww).sum())) % 360
    return float((luma * w).sum() / sw), float((s * w).sum() / sw), float(hue)


def hue_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


def check(orig_rgb, alpha, out):
    w = (alpha > 0.5).astype(np.float32) * alpha
    ol, osat, oh = stats(orig_rgb, w)
    nl, nsat, nh = stats(np.asarray(out, np.float32), w)
    lr, sr, hd = nl / max(ol, 1e-6), nsat / max(osat, 1e-6), hue_diff(nh, oh)
    ok = bool(lr >= 0.85 and sr >= 0.80 and hd <= 20)
    return ok, dict(luma_ratio=round(lr, 3), sat_ratio=round(sr, 3), hue_orig=round(oh, 1), hue_new=round(nh, 1), hue_diff=round(hd, 1), ok=ok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("heroes", nargs="*")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--style", choices=list(STYLES), default="a")
    ap.add_argument("--strength", type=float, default=None, help="override every hero's strength")
    args = ap.parse_args()
    import diffusers
    import torch
    import transformers
    from diffusers import AutoPipelineForImage2Image

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    dt = torch.float16 if dev == "mps" else torch.float32
    pipe = AutoPipelineForImage2Image.from_pretrained(
        "stabilityai/sdxl-turbo", torch_dtype=dt, local_files_only=True, variant="fp16").to(dev)
    pipe.set_progress_bar_config(disable=True)
    os.makedirs(args.out, exist_ok=True)
    names = args.heroes or list(HEROES)
    run = dict(torch=torch.__version__, diffusers=diffusers.__version__, transformers=transformers.__version__, device=dev,
               model="stabilityai/sdxl-turbo", style=args.style, steps=args.steps, heroes={})
    try:  # HF cache snapshot hash
        from huggingface_hub import snapshot_download
        run["snapshot"] = os.path.basename(snapshot_download("stabilityai/sdxl-turbo", local_files_only=True))
    except Exception:
        pass
    failed = []
    for name in names:
        el, desc, strength, w = HEROES[name]
        if args.strength is not None:
            strength = args.strength
        pal, bgc = ELEMENT[el]
        prompt = f"{desc}, {pal}{STYLES[args.style]}"
        t = time.time()
        src, orig_rgb, alpha = prep(name, bgc)
        glow = glow_mask(name, orig_rgb, alpha)
        best = None
        for k in range(args.seeds):
            seed = SEED + list(HEROES).index(name) * 10 + k
            sd = pipe(prompt=prompt, image=src, strength=strength, num_inference_steps=args.steps, guidance_scale=0.0,
                      generator=torch.Generator("cpu").manual_seed(seed)).images[0]
            out = post(sd, orig_rgb, alpha, glow, w, seed)
            ok, m = check(orig_rgb, alpha, out)
            score = (ok, min(m["luma_ratio"], m["sat_ratio"]) - m["hue_diff"] / 100)
            print(f"  {name} seed {seed}: {m}", flush=True)
            if best is None or score > best[0]:
                best = (score, out, seed, m)
        _, out, seed, m = best
        out.save(os.path.join(args.out, f"{name}-sd.png"))
        run["heroes"][name] = dict(prompt=prompt, strength=strength, chroma_weight=w, seed=seed, checks=m)
        print(f"{name} {'PASS' if m['ok'] else 'FAIL'} seed={seed} {m} {round(time.time() - t, 1)}s", flush=True)
        if not m["ok"]:
            failed.append(name)
    rp = os.path.join(args.out, "run.json")
    if args.heroes and os.path.exists(rp):  # partial reruns merge into the record
        old = json.load(open(rp))
        old["heroes"].update(run["heroes"])
        run["heroes"] = old["heroes"]
    json.dump(run, open(rp, "w"), indent=1, sort_keys=True)
    print("FAILED:", failed or "none")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
