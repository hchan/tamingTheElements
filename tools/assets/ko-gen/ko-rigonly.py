"""Rig-only KO frame generator (option A, ko-rigonly-plan r5).

Usage: python -I tools/assets/ko-gen/ko-rigonly.py <outdir> [hero ...]
Reads public/assets/img/map/<hero>Large.png (read-only), writes
<outdir>/<hero>_ko.png and <outdir>/sheet.png (before/after contact sheet).
Per-hero KO (art-director verdict 2026-11-20): fiara = flame-collapse (y 0.35,
ember red, faded tongues, sparks, scorch decal); treenoc = topple about the root
base (-80 deg then +4 settle, no squash); pax = same rotate, dropped to touch the
shadow; glimmaw unchanged. Every hero anchors at floor contact.
Base recipe: rotate -78 deg, y-squash 0.9, desaturate 25%, darken 15%,
soft ground shadow. Output canvas is padded so the whole body keeps a margin.
"""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "public/assets/img/map"
HEROES = ["glimmaw", "treenoc", "pax", "brazgor", "kindrel", "durrok", "hyalia", "zephra"]  # shipped set; fiara, umbrel, nykra, abyssor are parked and must be named explicitly
ANGLE, SQUASH, DESAT, DARK, MARGIN = -78, 0.9, 0.25, 0.15, 24
# Roster24 stills start from the rig's own source painting (the map/*Large.png of some of them is an older design): hero -> mode.
PORTRAIT_SRC = ROOT / "imgWorkArea/portrait-src"
# umbrel is parked (art-director 2026-11-23: its cutout has a torn cap rim and gill holes; needs a cleaned source, not a warp).
R24_MODE = {"brazgor": "flip", "kindrel": "side", "durrok": "flip", "hyalia": "flip", "nykra": "tip", "zephra": "tip", "abyssor": "tip"}


def stage(body: Image.Image, sink: int = 2, scorch: bool = False) -> Image.Image:
    """Put body on a canvas with a floor shadow; body bottom sinks `sink` px below floor line."""
    w, h = body.size
    cw, ch = w + 2 * MARGIN + 40, h + 2 * MARGIN + 20
    floor = ch - MARGIN - 6
    canvas = Image.new("RGBA", (cw, ch))
    if scorch:
        sc = Image.new("RGBA", (cw, ch))
        ImageDraw.Draw(sc).ellipse([MARGIN - 8, floor - 14, cw - MARGIN + 8, floor + 12], fill=(12, 6, 4, 235))
        canvas = Image.alpha_composite(canvas, sc.filter(ImageFilter.GaussianBlur(7)))
    sh = Image.new("RGBA", (cw, ch))
    ImageDraw.Draw(sh).ellipse([(cw - w) // 2 - 6, floor - h * 0.08, (cw + w) // 2 + 6, floor + 10], fill=(0, 0, 0, 150))
    canvas = Image.alpha_composite(canvas, sh.filter(ImageFilter.GaussianBlur(8)))
    canvas.alpha_composite(body, ((cw - w) // 2, floor + sink - h))
    return canvas


def tint(im: Image.Image, desat: float, dark: float) -> Image.Image:
    a = im.getchannel("A")
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(im.convert("RGB")).enhance(1 - desat)).enhance(1 - dark)
    out = rgb.convert("RGBA")
    out.putalpha(a)
    return out


def ko_fiara(src: Image.Image) -> Image.Image:
    """Fiara KO v3: rigid -80 deg rotation onto her side (no squash/warp), holes backed with flat colour."""
    im = src.convert("RGBA")
    px = im.load()
    for y in range(im.height):  # trim stray fragment hugging the right edge
        for x in range(388, im.width):
            px[x, y] = (0, 0, 0, 0)
    pad = Image.new("RGBA", (im.width + 80, im.height + 80))
    pad.paste(im, (40, 40))
    rot = pad.rotate(-80, resample=Image.BICUBIC, expand=True)
    rot = rot.crop(rot.getbbox())
    rot = rot.resize((rot.width, round(rot.height * 0.9)), Image.LANCZOS)
    a = rot.getchannel("A")
    # flat colour backing: closed silhouette (fills holes behind wings), dark ember red
    dil = a.filter(ImageFilter.GaussianBlur(12)).point(lambda v: 255 if v > 10 else 0)
    closed = dil.filter(ImageFilter.GaussianBlur(12)).point(lambda v: 255 if v > 252 else 0).filter(ImageFilter.GaussianBlur(1.5))
    back = Image.new("RGBA", rot.size, (150, 38, 18, 255))
    back.putalpha(closed)
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(rot.convert("RGB")).enhance(0.9)).enhance(0.9)
    body = rgb.convert("RGBA")
    body.putalpha(a)
    back.alpha_composite(body)
    body = back
    pad = 50
    b2 = Image.new("RGBA", (body.width, body.height + pad))
    b2.alpha_composite(body, (0, pad))
    d = ImageDraw.Draw(b2)
    for i in range(6):  # few dim embers
        cx = int(body.width * (0.15 + 0.7 * (((i * 53) % 97) / 97)))
        cy = int(6 + (pad - 14) * (((i * 29) % 41) / 41))
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(230, 120, 50, 140))
    return stage(b2, sink=2)


def ko_treenoc(src: Image.Image, angle: int = -80) -> Image.Image:
    im = src.convert("RGBA")
    box = im.getbbox()
    big = Image.new("RGBA", (1400, 1400))
    ox, oy = 500, 500
    big.paste(im, (ox, oy))
    pivot = (ox + (box[0] + box[2]) / 2, oy + box[3] - 6)  # root base, bottom centre
    rot = big.rotate(angle + 4, resample=Image.BICUBIC, center=pivot)  # topple, small settle back
    rot = tint(rot.crop(rot.getbbox()), 0.20, 0.12)
    return stage(rot, sink=2)


def ko_flip(src: Image.Image) -> Image.Image:
    """Quadruped KO: rolled onto its back, legs in the air (a vertical flip about the floor line, small lean, y-squash), tinted."""
    im = src.convert("RGBA")
    im = im.crop(im.getbbox())
    flipped = im.transpose(Image.FLIP_TOP_BOTTOM)
    pad = Image.new("RGBA", (flipped.width + 120, flipped.height + 120))
    pad.paste(flipped, (60, 60))
    rot = pad.rotate(-7, resample=Image.BICUBIC, expand=True)
    rot = rot.crop(rot.getbbox())
    rot = rot.resize((rot.width, round(rot.height * 0.82)), Image.LANCZOS)
    return stage(tint(rot, 0.22, 0.14), sink=2)


def ko_side(src: Image.Image) -> Image.Image:
    """Quadruped KO, low variant for tall poses (kindrel): flipped, small lean, flattened to y 0.6 so the head rests on the floor."""
    im = src.convert("RGBA")
    im = im.crop(im.getbbox())
    im = im.transpose(Image.FLIP_TOP_BOTTOM)  # on its side/back: legs up and out, flattened low so the head rests on the floor
    pad = Image.new("RGBA", (im.width + 160, im.height + 160))
    pad.paste(im, (80, 80))
    rot = pad.rotate(-3, resample=Image.BICUBIC, expand=True)
    rot = rot.crop(rot.getbbox())
    rot = rot.resize((round(rot.width * 1.05), round(rot.height * 0.6)), Image.LANCZOS)
    return stage(tint(rot, 0.22, 0.14), sink=2)


def ko_tip(src: Image.Image, angle: int = -75, sy: float = 0.85) -> Image.Image:
    """Tipped over onto its side (rotate, no flip) so the head stays visible; wings/limbs droop to the floor."""
    im = src.convert("RGBA")
    im = im.crop(im.getbbox())
    pad = Image.new("RGBA", (im.width + 160, im.height + 160))
    pad.paste(im, (80, 80))
    rot = pad.rotate(angle, resample=Image.BICUBIC, expand=True)
    rot = rot.crop(rot.getbbox())
    rot = rot.resize((rot.width, round(rot.height * sy)), Image.LANCZOS)
    return stage(tint(rot, 0.22, 0.14), sink=2)


def ko_frame(src: Image.Image, hero: str = "") -> Image.Image:
    if R24_MODE.get(hero) == "flip":
        return ko_flip(src)
    if R24_MODE.get(hero) == "tip":
        return ko_tip(src)
    if R24_MODE.get(hero) == "side":
        return ko_side(src)
    if hero == "fiara":
        return ko_fiara(src)
    if hero == "treenoc":
        return ko_treenoc(src)
    im = src.convert("RGBA")
    pad = Image.new("RGBA", (im.width + 2 * MARGIN, im.height + 2 * MARGIN))
    pad.paste(im, (MARGIN, MARGIN))
    rot = pad.rotate(ANGLE, resample=Image.BICUBIC, expand=True)
    rot = rot.crop(rot.getbbox())
    rot = rot.resize((rot.width, max(1, round(rot.height * SQUASH))), Image.LANCZOS)
    a = rot.getchannel("A")
    rgb = ImageEnhance.Color(rot.convert("RGB")).enhance(1 - DESAT)
    rgb = ImageEnhance.Brightness(rgb).enhance(1 - DARK)
    body = rgb.convert("RGBA")
    body.putalpha(a)
    w, h = body.size
    cw, ch = w + 2 * MARGIN + 40, h + 2 * MARGIN + 20
    canvas = Image.new("RGBA", (cw, ch))
    bx, by = (cw - w) // 2, ch - MARGIN - h
    # soft ground shadow: ellipse under the body, blurred
    sh = Image.new("RGBA", (cw, ch))
    ImageDraw.Draw(sh).ellipse(
        [bx - 6, ch - MARGIN - h * 0.10, bx + w + 6, ch - MARGIN + h * 0.06],
        fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    canvas = Image.alpha_composite(canvas, sh)
    canvas.alpha_composite(body, (bx, by + (8 if hero == "pax" else 0)))
    return canvas


def main() -> None:
    out = Path(sys.argv[1])
    heroes = sys.argv[2:] or HEROES
    out.mkdir(parents=True, exist_ok=True)
    cell, rows = 460, []
    sheet = Image.new("RGBA", (cell * 2, cell * len(heroes)), (58, 62, 70, 255))
    d = ImageDraw.Draw(sheet)
    for i, h in enumerate(heroes):
        src = Image.open(PORTRAIT_SRC / f"{h}.png" if h in R24_MODE else SRC / f"{h}Large.png")
        ko = ko_frame(src, h)
        ko.save(out / f"{h}_ko.png")
        for j, im in enumerate((src.convert("RGBA"), ko)):
            s = min(1.0, (cell - 40) / max(im.size))
            t = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            sheet.alpha_composite(t, (j * cell + (cell - t.width) // 2, i * cell + cell - 10 - t.height))
        d.text((8, i * cell + 6), f"{h} before", fill="white")
        d.text((cell + 8, i * cell + 6), f"{h} KO rig-only", fill="white")
    sheet.convert("RGB").save(out.parent / "ko-sheet.png")


if __name__ == "__main__":
    main()
