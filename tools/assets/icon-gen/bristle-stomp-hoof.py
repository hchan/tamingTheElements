"""Candidate art for the missing Durrok ability icon bristle_stomp: a hoof drawn with CPU code on a clean empty ring.
Round 3 (D-shaped wedges): same arguments with --round3. Round 2: add --round2 as the first argument and pass <ring> <ring> <outdir> <icons dir> (deep lit print, 3 variants, contact sheet).
Run: ~/claudetmp/venv/bin/python -I tools/assets/icon-gen/bristle-stomp-hoof.py <ring.png> <ring.png> <outdir> [<ability-icons-ai dir>]
Deterministic (fixed numpy seeds), needs Pillow + numpy. Writes 4 candidates (512 px, ring keyed onto the icon backdrop with a circular matte as
install-ai-ability-icons.py does for its radial keys) as bristle_stomp_cand{1..4}.png plus 128 px cand*_128.png. With the icons dir it also writes
contact-sheet.png (candidates at 512 and at 128 next to shipped icons for scale). Candidates only: nothing is installed under public/
(that needs an art-director approval.json). Rings: the empty SDXL rings r987 seeds 98700 / 98701 (1024 px).
Earth theme, painted, slightly desaturated, no text, no people.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BACKDROP = (22, 20, 19)
S = 1024
# ring centre / outer radius / dark-disc radius, 1024 px space, measured from the two rings
RINGS = [dict(c=(510, 506), ro=478, ri=395), dict(c=(506, 500), ro=482, ri=392)]
SHIPPED = ["tusk_gore", "boulder_roll", "quake", "forge_gore", "molten_hide", "stoop"]


def blur(a, r):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def noise(rng, scale, amp=1.0):
    n = rng.random((S // scale + 2, S // scale + 2)).astype(np.float32)
    im = Image.fromarray((n * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)
    return (np.asarray(im, dtype=np.float32) / 255 - 0.5) * amp


def mask_of(draw_fn):
    m = Image.new("L", (S, S), 0)
    draw_fn(ImageDraw.Draw(m))
    return np.asarray(m, dtype=np.float32) / 255


def flat(col):
    return np.array(col, np.float32)[None, None] * np.ones((S, S, 3), np.float32)


def shade(mask, base, hi, rng, relief=14, grain=0.10, light=(-0.6, -0.8)):
    """Paints mask with a colour from a blurred-height emboss (light from the top left) plus grain; returns (rgb, alpha)."""
    h = blur(mask, relief)
    gy, gx = np.gradient(h)
    lit = np.clip(0.5 + (gx * light[0] + gy * light[1]) * relief * 1.6 + (h - 0.5) * 0.5, 0, 1)
    lit = np.clip(lit + noise(rng, 4, grain) + noise(rng, 24, grain), 0, 1)
    base, hi = np.array(base, np.float32), np.array(hi, np.float32)
    rgb = base[None, None] + (hi - base)[None, None] * lit[..., None]
    return rgb, blur(mask, 1.2)


def over(dst, rgb, a, k=1.0):
    dst[:] = dst * (1 - a[..., None] * k) + rgb * (a[..., None] * k)


def toe(d, cx, top, bot, w):
    """A rounded wedge toe: narrow at the top (pastern), wide and flared at the bottom."""
    d.polygon([(cx - w * .62, top), (cx + w * .62, top), (cx + w * 1.0, bot - w * .5), (cx + w * .8, bot), (cx - w * .8, bot), (cx - w * 1.0, bot - w * .5)], fill=255)
    d.ellipse((cx - w * .8, bot - w * .55, cx + w * .8, bot + w * .35), fill=255)


def ground(rng, gy_, cracks):
    """Cracked earth slab with dark crack lines and a pale lip; returns (rgb, alpha)."""
    def f(d):
        d.polygon([(0, gy_ + 18), (S * .25, gy_), (S * .5, gy_ + 10), (S * .78, gy_ - 6), (S, gy_ + 14), (S, S), (0, S)], fill=255)
    rgb, a = shade(mask_of(f), (58, 44, 32), (122, 98, 70), rng, relief=18, grain=0.14)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for pts in cracks:
        d.line(pts, fill=(10, 8, 7), width=7, joint="curve")
        d.line([(x + 2, y - 2) for x, y in pts], fill=(150, 118, 84), width=2)
    return np.asarray(img, np.float32), a


def dust(canvas, rng, pts, col=(150, 124, 92), k=0.55):
    for x, y, r in pts:
        m = mask_of(lambda d: d.ellipse((x - r, y - r * .7, x + r, y + r * .7), fill=255))
        m = blur(m, r * .45) * (0.65 + noise(rng, 12, 0.7))
        over(canvas, flat(col), np.clip(m, 0, 1), k)


def hoof_front(rng, cx, ground_y, w=150):
    """Front view: furred leg with bristles and two cloven toes pressed on the ground. Returns (rgb, alpha) layers."""
    top = ground_y - 330
    leg = mask_of(lambda d: d.polygon([(cx - w * .85, top), (cx + w * .85, top), (cx + w * 1.05, ground_y - 175), (cx - w * 1.05, ground_y - 175)], fill=255))
    lrgb, la = shade(leg, (34, 26, 20), (82, 62, 44), rng, relief=22, grain=0.16)
    yy = np.mgrid[0:S, 0:S][0].astype(np.float32)
    layers = [(lrgb, la * np.clip((yy - top) / 90, 0, 1))]  # the leg fades into the dark above
    fur = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fur)
    n = 16
    for i in range(n):  # bristles hanging over the pastern
        x = cx + (i - n / 2) * 11 + int(rng.integers(-4, 5))
        fd.line([(x, ground_y - 190), (x + int(rng.integers(-14, 15)), ground_y - 190 + int(rng.integers(40, 80)))], fill=(30, 22, 17, 255), width=4)
    far = np.asarray(fur, np.float32)
    layers.append((far[..., :3], far[..., 3] / 255))
    for sx in (-1, 1):
        t = mask_of(lambda d, sx=sx: toe(d, cx + sx * w * .52, ground_y - 215, ground_y, w * .56))
        layers.append(shade(t, (26, 21, 18), (112, 94, 74), rng, relief=16, grain=0.10))
    return layers


def hoof_print(cx, cy, w=130):
    """Top-down cloven hoofprint: two bean shapes with inner edges facing. Returns masks."""
    out = []
    for sx in (-1, 1):
        def f(d, sx=sx):
            x = cx + sx * w * .55
            d.polygon([(x - sx * w * .1, cy - w * 1.35), (x + sx * w * .62, cy - w * .2), (x + sx * w * .55, cy + w * .9),
                       (x - sx * w * .15, cy + w * 1.05), (x - sx * w * .5, cy + w * .3), (x - sx * w * .35, cy - w * .6)], fill=255)
        out.append(blur(mask_of(f), 1.2))
    return out


def crack_set(cx, gyb, spread):
    return [[(cx - 50, gyb + 12), (cx - 150 * spread, gyb + 55), (cx - 240 * spread, gyb + 45), (cx - 340 * spread, gyb + 100)],
            [(cx + 50, gyb + 12), (cx + 140 * spread, gyb + 62), (cx + 255 * spread, gyb + 55), (cx + 345 * spread, gyb + 108)],
            [(cx, gyb + 30), (cx - 20, gyb + 90), (cx + 25, gyb + 150), (cx + 5, gyb + 220)],
            [(cx - 150 * spread, gyb + 55), (cx - 190 * spread, gyb + 125), (cx - 270 * spread, gyb + 155)],
            [(cx + 140 * spread, gyb + 62), (cx + 180 * spread, gyb + 132), (cx + 280 * spread, gyb + 172)]]


def candidate(ring_path, g, kind, seed):
    rng = np.random.default_rng(seed)
    canvas = np.asarray(Image.open(ring_path).convert("RGB"), np.float32).copy()
    cx, gyb = g["c"][0], g["c"][1] + 170
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dd = np.hypot(xx - g["c"][0], yy - g["c"][1])
    # clean the dark disc to a flat dark earth glow so the art reads
    glow = np.clip(1 - dd / g["ri"], 0, 1)[..., None]
    bg = np.array((20, 17, 15), np.float32) + glow * np.array((38, 26, 14), np.float32) + noise(rng, 6, 10)[..., None]
    over(canvas, bg, np.clip((g["ri"] - 12 - dd) / 14, 0, 1))
    art = canvas.copy()
    if kind in ("front", "glow"):
        cracks = crack_set(cx, gyb, 1.0)
        over(art, *ground(rng, gyb, cracks))
        if kind == "glow":  # molten-ember light in the fissures
            gl = Image.new("L", (S, S), 0)
            for pts in cracks:
                ImageDraw.Draw(gl).line(pts, fill=255, width=4)
            over(art, flat((214, 138, 54)), np.clip(blur(np.asarray(gl, np.float32) / 255, 7) * 3, 0, 1), 0.5)
        dust(art, rng, [(cx - 250, gyb - 10, 90), (cx + 250, gyb - 14, 100), (cx - 140, gyb - 40, 70), (cx + 150, gyb - 30, 75)], k=0.5)
        for rgb, a in hoof_front(rng, cx, gyb + 6):
            over(art, rgb, a)
        dust(art, rng, [(cx - 90, gyb + 8, 60), (cx + 100, gyb + 10, 64), (cx - 330, gyb - 5, 55), (cx + 330, gyb - 5, 60)], k=0.3 if kind == "glow" else 0.35)
    elif kind == "raised":
        over(art, *ground(rng, gyb, crack_set(cx, gyb, 1.0)))
        shock = mask_of(lambda d: d.ellipse((cx - 330, gyb - 28, cx + 330, gyb + 40), outline=255, width=9))
        over(art, flat((178, 146, 104)), blur(shock, 3), 0.55)  # shock ring on the ground plane
        dust(art, rng, [(cx - 260, gyb - 20, 95), (cx + 270, gyb - 24, 100), (cx, gyb - 10, 80)], k=0.6)
        for rgb, a in hoof_front(rng, cx, gyb - 62):  # hoof lifted just above the slab, mid-stomp
            over(art, rgb, a)
        dust(art, rng, [(cx - 120, gyb + 5, 70), (cx + 125, gyb + 5, 74), (cx - 340, gyb, 60), (cx + 335, gyb, 60)], k=0.45)
    else:  # "print": top-down hoofprint in radially cracked earth
        cy = g["c"][1] - 10
        floor = mask_of(lambda d: d.ellipse((cx - 330, cy - 330, cx + 330, cy + 330), fill=255))
        over(art, *shade(floor, (62, 48, 36), (118, 94, 68), rng, relief=30, grain=0.16))
        imgc = Image.fromarray(np.clip(art, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(imgc)
        for ang in range(0, 360, 36):
            a0 = np.deg2rad(ang + int(rng.integers(-8, 9)))
            pts, r = [(cx + 100 * np.cos(a0), cy + 100 * np.sin(a0))], 110
            while r < 330:
                t = a0 + rng.normal(0, .06)
                pts.append((cx + r * np.cos(t), cy + r * np.sin(t)))
                r += 50
            d.line(pts, fill=(10, 8, 7), width=7, joint="curve")
        art = np.asarray(imgc, np.float32)
        for m in hoof_print(cx, cy):
            over(art, flat((8, 6, 5)), blur(m, 9), 0.55)  # soft pit shadow
            over(art, flat((34, 26, 20)), m, 0.95)
            over(art, flat((164, 132, 94)), np.clip((blur(m, 3) - blur(m, 9)) * 3, 0, 1), 0.5)  # lit rim
        dust(art, rng, [(cx - 250, cy + 250, 70), (cx + 260, cy + 240, 70), (cx, cy + 310, 80)], k=0.4)
    final = canvas.copy()
    over(final, art, np.clip((g["ri"] - 6 - dd) / 8, 0, 1))
    lum = final.mean(axis=2, keepdims=True)
    final = lum + (final - lum) * 0.88  # slightly desaturated
    vig = np.where(dd < g["ri"], 1 - 0.25 * np.clip((dd - g["ri"] * .6) / g["ri"], 0, 1), 1.0)
    final *= vig[..., None]
    img = Image.fromarray(np.clip(final, 0, 255).astype(np.uint8))
    m = Image.new("L", (S, S), 0)  # key the stone ring onto the backdrop with a circular matte around its outer edge
    ImageDraw.Draw(m).ellipse((g["c"][0] - g["ro"], g["c"][1] - g["ro"], g["c"][0] + g["ro"], g["c"][1] + g["ro"]), fill=255)
    out = Image.composite(img, Image.new("RGB", (S, S), BACKDROP), m.filter(ImageFilter.GaussianBlur(3)))
    k = 512 * 0.97  # recentre on the ring, small margin like the other icons
    out = out.transform((S, S), Image.EXTENT, (g["c"][0] - k, g["c"][1] - k, g["c"][0] + k, g["c"][1] + k), Image.BICUBIC, fillcolor=BACKDROP)
    return out.resize((512, 512), Image.LANCZOS)


def contact_sheet(outdir, icons_dir, n, pat="bristle_stomp_cand{}"):
    sheet = Image.new("RGB", (n * 512, 512 + 150), (40, 40, 40))
    for i in range(1, n + 1):
        sheet.paste(Image.open(os.path.join(outdir, pat.format(i) + ".png")), ((i - 1) * 512, 0))
    x = 10
    for i in range(1, n + 1):
        sheet.paste(Image.open(os.path.join(outdir, pat.format(i) + "_128.png")), (x, 522))
        x += 138
    x += 30
    for name in SHIPPED:  # shipped icons at the same 128 px for scale
        sheet.paste(Image.open(os.path.join(icons_dir, f"{name}.png")).convert("RGB"), (x, 522))
        x += 138
    sheet.save(os.path.join(outdir, "contact-sheet.png"))


# ---- round 2: a deep cloven print with real height and shading (heightfield lit from the top left) ----
def lobe_points(cx, cy, w, sx, ang):
    """Pointed teardrop (tip forward/up, rounded heel) for one toe, in a frame rotated by ang radians."""
    pts, wd, ln = [], w * .5, w * 2.3
    for side in (1, -1):
        for k in range(41):
            u = k / 40 if side == 1 else 1 - k / 40
            hw = wd * (u / .45 if u < .45 else np.sqrt(max(0.0, 1 - ((u - .45) / .55) ** 2)))
            x = sx * (w * .74 - w * .26 * (1 - u)) + side * hw
            y = -ln * .55 + ln * u
            pts.append((cx + x * np.cos(ang) - y * np.sin(ang), cy + x * np.sin(ang) + y * np.cos(ang)))
    return pts


def tapered(d, pts, w0, w1):
    n = len(pts) - 1
    for i in range(n):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        for q in range(8):  # dense stamps so the line is continuous
            f = q / 8
            r = w0 + (w1 - w0) * (i + f) / max(1, n)
            x, y = xa + (xb - xa) * f, ya + (yb - ya) * f
            d.ellipse((x - r, y - r, x + r, y + r), fill=255)


def crack_path(rng, x, y, ang, length, step=22):
    pts = [(x, y)]
    for _ in range(int(length / step)):
        ang += rng.normal(0, .28)
        x, y = x + step * np.cos(ang), y + step * np.sin(ang)
        pts.append((x, y))
    return pts


def candidate2(ring_path, g, seed, ang, scale, off, ember_ang, nrubble):
    rng = np.random.default_rng(seed)
    src = np.asarray(Image.open(ring_path).convert("RGB"), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dd = np.hypot(xx - g["c"][0], yy - g["c"][1])
    cx, cy = g["c"][0] + off[0], g["c"][1] + off[1]
    w = 98 * scale
    rad = np.deg2rad(ang)
    pm = mask_of(lambda d: [d.polygon(lobe_points(cx, cy, w, sx, rad), fill=255) for sx in (-1, 1)])
    # cracks: thick at the print edge, tapering outward; the one at ember_ang carries the accent
    cm, em = Image.new("L", (S, S), 0), Image.new("L", (S, S), 0)
    cd, ed = ImageDraw.Draw(cm), ImageDraw.Draw(em)
    for k in range(7):
        a = rad + k * 2 * np.pi / 7 + rng.normal(0, .12) - np.pi / 2
        r0 = 20.0
        while r0 < 400 and pm[int(np.clip(cy + r0 * np.sin(a), 0, S - 1)), int(np.clip(cx + r0 * np.cos(a), 0, S - 1))] > .4:
            r0 += 4
        pts = crack_path(rng, cx + (r0 - 6) * np.cos(a), cy + (r0 - 6) * np.sin(a), a, 150 * scale + rng.integers(90, 230))
        tapered(cd, pts, 13 * scale, 1.5)
        if abs(((np.rad2deg(a) - ember_ang + 180) % 360) - 180) < 20 and ember_ang is not None:
            tapered(ed, pts, 4.5, 1.0)
        for j in range(2, len(pts) - 3, 3):  # side branches, half width
            if rng.random() < .4:
                b = crack_path(rng, *pts[j], a + rng.choice([-1, 1]) * rng.uniform(.5, 1.0), rng.integers(50, 130), 16)
                tapered(cd, b, 5 * scale, .8)
    cmask = np.asarray(cm, np.float32) / 255
    if glyph is not None:
        cmask *= 1 - np.clip(blur(pm, 2) * 1.5, 0, 1)  # keep cracks off the toes
    emask = np.asarray(em, np.float32) / 255
    # heightfield: lumpy earth, heaved mound around the print, deep pit with sloped walls, cracks carved in
    H = noise(rng, 64, .35) + noise(rng, 20, .07) + noise(rng, 5, .02)
    mound = np.clip(blur(pm, 40 * scale), 0, 1) * (1 - blur(pm, 7)) * 1.5
    H += mound + blur(pm, 70 * scale) * .5 - blur(pm, 3) * 1.8 - blur(cmask, 2) * .5
    gy, gx = np.gradient(blur(H, 1.8))
    lit = np.clip(.40 + (gx * -.7 + gy * -.7) * 30, 0, 1)
    ao = np.clip((blur(H, 22) - H) * 2.4, 0, 1)  # inner shadow in the pit, cracks and between lumps
    lit = np.clip(lit * (1 - .65 * ao) + noise(rng, 3, .10), 0, 1)
    dark, mid, high = np.array((14, 11, 10), np.float32), np.array((62, 46, 33), np.float32), np.array((168, 132, 92), np.float32)
    t = lit[..., None]
    field = np.where(t < .5, dark + (mid - dark) * t * 2, mid + (high - mid) * (t - .5) * 2)
    field *= 1 - .55 * blur(cmask, 1.5)[..., None]  # crack floors are near black
    # rubble: small lit stones on the mound and beyond
    rub = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rub)
    for _ in range(nrubble):
        a, r = rng.uniform(0, 2 * np.pi), rng.uniform(240, 370)
        x, y, sz = cx + r * np.cos(a), cy + r * np.sin(a) * .95, rng.uniform(6, 20)
        if np.hypot(x - g["c"][0], y - g["c"][1]) > g["ro"] - 120:
            continue
        poly = [(x + sz * rng.uniform(.6, 1.1) * np.cos(q), y + sz * rng.uniform(.5, .9) * np.sin(q)) for q in np.linspace(0, 2 * np.pi, 7)[:-1]]
        rd.polygon([(px + 5, py + 6) for px, py in poly], fill=(4, 3, 3, 150))
        rd.polygon(poly, fill=(58, 48, 40, 255))
        rd.line(poly[3:6], fill=(128, 106, 82, 255), width=2)  # lit upper-left edge
    rub = np.asarray(rub.filter(ImageFilter.GaussianBlur(.8)), np.float32)
    over(field, rub[..., :3], rub[..., 3] / 255)
    # dust: soft haze at the lower rim of the mound and drifting up the sides
    for dx, dy, r in [(-.9, .75, 120), (.8, .8, 130), (0, 1.15, 150), (-1.2, .1, 90), (1.15, .0, 95), (.4, -1.0, 80)]:
        m = mask_of(lambda d, x=cx + dx * 230 * scale ** .6, y=cy + dy * 230 * scale ** .6, r=r: d.ellipse((x - r, y - r * .6, x + r, y + r * .6), fill=255))
        over(field, flat((120, 98, 74)), np.clip(blur(m, r * .5) * (.6 + noise(rng, 14, .9)), 0, 1), .35)
    # ember accent in one crack
    if ember_ang is not None:
        core = blur(emask, 1.5)
        field = field + np.array((255, 150, 50), np.float32) * np.clip(core * 1.6, 0, 1)[..., None] + np.array((200, 70, 15), np.float32) * (blur(emask, 12) * .9)[..., None]
    lum = field.mean(axis=2, keepdims=True)
    field = lum + (field - lum) * .85  # slightly desaturated
    field *= (1 - .75 * np.clip((dd - 150) / (g["ro"] - 50 - 150), 0, 1) ** 1.6)[..., None]  # strong vignette
    # thin dark ring from the outer edge of the source ring
    rw = 44
    ringc = src * .5
    gl = ringc.mean(axis=2, keepdims=True)
    ringc = gl + (ringc - gl) * .5
    inner = g["ro"] - rw
    ra = np.clip((dd - inner + 3) / 6, 0, 1)
    ringc = ringc * (.6 + .4 * np.clip((dd - inner) / rw, 0, 1))[..., None]
    final = field.copy()
    over(final, ringc, ra)
    final = np.clip(final, 0, 255)
    img = Image.fromarray(final.astype(np.uint8))
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((g["c"][0] - g["ro"], g["c"][1] - g["ro"], g["c"][0] + g["ro"], g["c"][1] + g["ro"]), fill=255)
    out = Image.composite(img, Image.new("RGB", (S, S), BACKDROP), m.filter(ImageFilter.GaussianBlur(3)))
    k = 512 * 0.97
    out = out.transform((S, S), Image.EXTENT, (g["c"][0] - k, g["c"][1] - k, g["c"][0] + k, g["c"][1] + k), Image.BICUBIC, fillcolor=BACKDROP)
    return out.resize((512, 512), Image.LANCZOS)


def round2(r0, r1, outdir, icons_dir):
    os.makedirs(outdir, exist_ok=True)
    plan = [(r0, RINGS[0], 11, 0, 1.0, (0, -5), 40, 26), (r1, RINGS[1], 12, -16, 1.12, (-10, 5), 130, 34), (r0, RINGS[0], 13, 12, 0.92, (8, 10), 250, 20)]
    for i, (path, g, seed, ang, sc, off, em, nr) in enumerate(plan, 1):
        im = candidate2(path, g, seed, ang, sc, off, em, nr)
        im.save(os.path.join(outdir, f"bristle_stomp_r2_{i}.png"))
        im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, f"bristle_stomp_r2_{i}_128.png"))
        print(f"r2 cand{i}")
    contact_sheet(outdir, icons_dir, len(plan), "bristle_stomp_r2_{}")


# ---- round 3: two mirrored D-shaped wedges, fewer tapering cracks, lit lip / dark crescent, ember through the gap ----
def wedge_points(cx, cy, L, W, gap, sx, tilt, tip=False):
    """One D-shaped toe: straight inner edge at x = sx*gap/2, rounded outer edge, slight heel pinch, tipped outward by tilt (radians)."""
    pts = []
    for k in range(61):
        u = k / 60
        hw = W * max(0.0, 1 - (2 * u - 1) ** 2) ** .5 * (1 - .12 * max(0.0, (u - .72) / .28) ** 1.5 * 1.5)
        if tip and u < .5:
            hw = W * (u / .5) ** 1.15
        pts.append((sx * (gap / 2 + hw), -L / 2 + L * u))
    pts += [(sx * gap / 2, L / 2), (sx * gap / 2, -L / 2)]
    c, sn = np.cos(-sx * tilt), np.sin(-sx * tilt)
    return [(cx + x * c - y * sn, cy + x * sn + y * c) for x, y in pts]


def candidate3(ring_path, g, seed, ang, scale, off, up_angles, dn_extra, nrubble, tip=False, size=512, glyph=None, r6=False, r7=False):
    r6 = r6 or r7
    rng = np.random.default_rng(seed)
    src = np.asarray(Image.open(ring_path).convert("RGB"), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dd = np.hypot(xx - g["c"][0], yy - g["c"][1])
    cx, cy = g["c"][0] + off[0], g["c"][1] + off[1]
    rad = np.deg2rad(ang)
    L, W, gap = 300 * scale, 112 * scale, 28

    def rot(pts):  # rotate the print frame by ang around (cx, cy)
        c, sn = np.cos(rad), np.sin(rad)
        return [(cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c) for x, y in pts]
    pm = mask_of(lambda d: [d.polygon(rot(wedge_points(cx, cy, L, W, gap, sx, np.deg2rad(7), tip)), fill=255) for sx in (-1, 1)])
    if glyph is not None:
        pm = glyph_mask(glyph, cx, cy, 540 * scale)
        tip = True  # thin dark rim
        L = 430 * scale
    cm, em = Image.new("L", (S, S), 0), Image.new("L", (S, S), 0)
    cd, ed = ImageDraw.Draw(cm), ImageDraw.Draw(em)

    def leave(a):  # radius where the ray from the print centre leaves the print
        r0 = 20.0
        while r0 < 420 and pm[int(np.clip(cy + r0 * np.sin(a), 0, S - 1)), int(np.clip(cx + r0 * np.cos(a), 0, S - 1))] > .4:
            r0 += 4
        return r0
    # 4 cracks fanning forward (up) and 1 down-side crack, thick at the print edge, tapering to a point; none off the sides
    for deg in list(up_angles) + [dn_extra]:
        a = rad - np.pi / 2 + np.deg2rad(deg)
        r0 = leave(a)
        pts = crack_path(rng, cx + (r0 - 8) * np.cos(a), cy + (r0 - 8) * np.sin(a), a, 220 * scale + rng.integers(40, 160), 18)
        tapered(cd, pts, 15 * scale, .4)
    # ember crack: runs through the gap between the lobes, then on past the heel as a tapering fissure
    ax, ay = np.sin(rad) * -1, np.cos(rad)  # print "down" direction after rotation
    x0, y0 = cx - ax * (L / 2 * .8), cy - ay * (L / 2 * .8)
    gap_pts = [(x0 + ax * t, y0 + ay * t) for t in np.linspace(0, L * .8, 12)]
    if r6:  # jagged, wider crack that follows the cleft
        nx, ny = -ay, ax
        jit = np.cumsum(rng.uniform(-9, 9, 36)) * .6 + rng.uniform(-9, 9, 36)
        jit[0] = jit[-1] = 0
        gap_pts = [(x0 + ax * t * L * .8 + nx * j, y0 + ay * t * L * .8 + ny * j) for t, j in zip(np.linspace(0, 1, 36), jit)]
    tail = crack_path(rng, *gap_pts[-1], np.arctan2(ay, ax), 190 * scale, 18)
    path = gap_pts + tail[1:]
    if r6:
        tapered(ed, gap_pts, 7, 5)
        tapered(ed, tail, 6.5, .8)
    else:
        tapered(ed, gap_pts, 3.2, 3.2)
        tapered(ed, tail, 3.2, .6)
    tapered(cd, tail, 12 * scale, .5)
    cmask = np.asarray(cm, np.float32) / 255
    emask = np.asarray(em, np.float32) / 255
    hm = Image.new("L", (S, S), 0)
    if r6:  # hairline cracks of the plate's own earth inside the toes
        hd, inside = ImageDraw.Draw(hm), np.argwhere(pm > .9)
        for _ in range(9):
            y, x = inside[rng.integers(len(inside))]
            tapered(hd, crack_path(rng, x, y, rng.uniform(0, 2 * np.pi), rng.integers(60, 120), 14), 5, .6)
    hmask = np.asarray(hm, np.float32) / 255
    H = noise(rng, 64, .30) + noise(rng, 20, .06) + noise(rng, 5, .02)
    moundf = np.clip(blur(pm, 30 * scale), 0, 1) * (1 - blur(pm, 5)) * 2.0
    H += moundf + blur(pm, 80 * scale) * .5 - blur(pm, 3) * 1.8 - blur(cmask, 2) * .5
    gy, gx = np.gradient(blur(H, 1.8))
    lit = np.clip(.46 + (gx * -.7 + gy * -.7) * 30, 0, 1)
    ao = np.clip((blur(H, 22) - H) * 2.0, 0, 1)
    lit = np.clip(lit * (1 - .55 * ao) + noise(rng, 3, .08), 0, 1)
    dark, mid, high = np.array((16, 13, 12), np.float32), np.array((98, 74, 52), np.float32), np.array((214, 172, 120), np.float32)
    t = lit[..., None]
    field = np.where(t < .5, dark + (mid - dark) * t * 2, mid + (high - mid) * (t - .5) * 2)
    # weight: bright lip on the upper left of the heaved earth, dark crescent on the lower right
    my, mx = np.gradient(blur(moundf, 4))
    dm = mx * -.7 + my * -.7
    field = field + np.array((120, 92, 58), np.float32) * (np.clip(dm * 55, 0, 1) * (.12 if r7 else 1))[..., None]
    field *= (1 - .6 * np.clip(-dm * 55, 0, 1))[..., None]
    pit = blur(pm, 1.2)  # print floor: cool charcoal so the print separates from the ground
    dome = np.clip(.55 + (gx * -.7 + gy * -.7) * 14 + blur(pm, 26) * .5 - .25, 0, 1.2)[..., None]
    if r7:  # earth texture multiplied into dark brown toes (not black), lighter centre pad
        tex_ = field / np.maximum(field.mean(axis=(0, 1), keepdims=True), 1)
        toe_ = np.array((88, 64, 46), np.float32) * (.4 + .6 * np.clip(tex_.mean(axis=2, keepdims=True), 0, 2))
        toe_ = .6 * toe_ + .4 * field * .55
        padm = np.clip((blur(pm, 26) - .45) * 2.2, 0, 1)
        toe_ = toe_ * (1 + .55 * padm ** 1.5)[..., None]
        over(field, toe_, pit, 1.0)
        inner_sh = np.clip(pit - np.roll(blur(pm, 6), (16, 16), (0, 1)), 0, 1)
        lip = np.clip(pit - np.roll(blur(pm, 3), (-7, -7), (0, 1)), 0, 1)
        field *= (1 - .45 * inner_sh)[..., None]
        field += np.array((170, 134, 96), np.float32) * (lip * .26)[..., None]
    elif r6:  # toes filled with the plate's own cracked earth, darker than the surround
        over(field, field * .52 + np.array((5, 4, 5), np.float32), pit, 1.0)
        inner_sh = np.clip(pit - np.roll(blur(pm, 6), (16, 16), (0, 1)), 0, 1)  # top and left
        lip = np.clip(pit - np.roll(blur(pm, 3), (-7, -7), (0, 1)), 0, 1)  # bottom and right
        field *= (1 - .6 * inner_sh)[..., None]
        field += np.array((150, 118, 84), np.float32) * (lip * .16)[..., None]
    else:
        over(field, np.array((52, 44, 42), np.float32) + np.array((66, 52, 40), np.float32) * dome, pit, .95)
    # re-light the pit walls so the print keeps a lit rim top-left
    rim = np.clip((gx * -.7 + gy * -.7) * 60, 0, 1) * np.clip(blur(pm, 5) * (1 - blur(pm, 5)) * 4, 0, 1)
    if r7:  # cream rim light: blurred, 40 percent, bottom-right edge only, none on the top-left
        gpy, gpx = np.gradient(blur(pm, 4))
        nn = np.hypot(gpx, gpy) + 1e-6
        wdir = np.clip((-gpx * .7 - gpy * .7) / nn, 0, 1) ** 1.5 * np.clip(nn * 40, 0, 1)
        edge7 = blur(np.clip(blur(pm, 2.5) * (1 - blur(pm, 2.5)) * 4, 0, 1), 2.5)
        field += np.array((205, 172, 130), np.float32) * (edge7 * blur(wdir, 3) * .4)[..., None]
        field *= (1 - .5 * hmask * pit)[..., None]
    elif r6:  # soft rim light instead of the cream outline
        soft = blur(np.clip(blur(pm, 2.5) * (1 - blur(pm, 2.5)) * 4, 0, 1), 2)
        field += np.array((120, 96, 70), np.float32) * (soft * .12)[..., None]
        field *= (1 - .5 * hmask * pit)[..., None]
    elif tip:  # round 4: thin dark rim instead of a bright one
        edge = np.clip(blur(pm, 2.2) * (1 - blur(pm, 2.2)) * 4, 0, 1)
        field *= (1 - .75 * edge)[..., None]
    else:
        field += np.array((150, 118, 82), np.float32) * rim[..., None] * .8
    field *= 1 - .6 * blur(cmask, 1.5)[..., None]
    rub = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rub)
    shs = []
    for _ in range(nrubble):
        a, r = rng.uniform(0, 2 * np.pi), rng.uniform(250, 370)
        x, y, sz = cx + r * np.cos(a), cy + r * np.sin(a) * .95, (rng.choice([4, 7, 11, 17, 24]) * rng.uniform(.8, 1.2) if r7 else rng.uniform(6, 20))
        if np.hypot(x - g["c"][0], y - g["c"][1]) > g["ro"] - 110:
            continue
        poly = [(x + sz * rng.uniform(.6, 1.1) * np.cos(q), y + sz * rng.uniform(.5, .9) * np.sin(q)) for q in np.linspace(0, 2 * np.pi, 7)[:-1]]
        if r7:
            sh = Image.new("L", (S, S), 0)
            ImageDraw.Draw(sh).polygon([(px + 4, py + 5) for px, py in poly], fill=int(255 * .35))
            shs.append(sh)
            rd.polygon(poly, fill=(104, 80, 58, 255))
            rd.line(poly[3:6], fill=(150, 120, 88, 255), width=2)
            continue
        rd.polygon([(px + 5, py + 6) for px, py in poly], fill=(4, 3, 3, 150))
        rd.polygon(poly, fill=(92, 78, 64, 255))
        rd.line(poly[3:6], fill=(206, 182, 146, 255), width=3)
    if r7:
        for sh in shs:
            field *= (1 - np.asarray(sh.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255 * .35)[..., None] / 1.0
    rub = np.asarray(rub.filter(ImageFilter.GaussianBlur(.8)), np.float32)
    over(field, rub[..., :3], rub[..., 3] / 255)
    for dx, dy, r in [(-.9, .75, 120), (.8, .8, 130), (0, 1.15, 150), (.4, -1.0, 80)]:
        m = mask_of(lambda d, x=cx + dx * 250, y=cy + dy * 250, r=r: d.ellipse((x - r, y - r * .6, x + r, y + r * .6), fill=255))
        over(field, flat((140, 114, 86)), np.clip(blur(m, r * .5) * (.6 + noise(rng, 14, .9)), 0, 1), .32)
    if r6:
        sm = Image.new("L", (S, S), 0)
        sd = ImageDraw.Draw(sm)
        for k_, rr in zip(rng.choice(len(path), 3, replace=False), (4.5, 3.2, 2.4)):
            ang_ = rng.uniform(0, 2 * np.pi)
            sx_, sy_ = path[k_][0] + np.cos(ang_) * rng.uniform(26, 60), path[k_][1] + np.sin(ang_) * rng.uniform(26, 60)
            sd.ellipse((sx_ - rr, sy_ - rr, sx_ + rr, sy_ + rr), fill=255)
        spark = np.asarray(sm, np.float32) / 255
        hot = np.clip(emask + spark, 0, 1)
        core = blur(hot, 1.3)
        bloom = np.clip(blur(hot, 16) * 2.2, 0, 1) * .85 + np.clip(blur(hot, 6) * 1.2, 0, 1) * .35
        field = 255 - (255 - field) * (1 - np.array((255, 120, 32), np.float32) / 255 * np.clip(bloom, 0, 1)[..., None])  # screen
        field = field + np.array((255, 176, 70), np.float32) * np.clip(core * 1.7, 0, 1)[..., None]
        field = field + np.array((255, 225, 150), np.float32) * (np.clip(core, 0, 1) ** 4)[..., None] * .8
    else:
        core = blur(emask, 1.2)
        field = field + np.array((255, 160, 55), np.float32) * np.clip(core * 1.8, 0, 1)[..., None] + np.array((210, 80, 18), np.float32) * (blur(emask, 10) * .8)[..., None]
    lum = field.mean(axis=2, keepdims=True)
    field = lum + (field - lum) * .88
    field *= (1 - .65 * np.clip((dd - 200) / (g["ro"] - 50 - 200), 0, 1) ** 1.6)[..., None]
    rw = 44
    ringc = src * .5
    gl = ringc.mean(axis=2, keepdims=True)
    ringc = gl + (ringc - gl) * .5
    inner = g["ro"] - rw
    ringc = ringc * (.6 + .4 * np.clip((dd - inner) / rw, 0, 1))[..., None]
    final = field.copy()
    if r7:
        carved_ring7(final, g, xx, yy)
        return finish(final, g, size)
    over(final, ringc, np.clip((dd - inner + 3) / 6, 0, 1))
    return finish(final, g, size)


def finish(final, g, size):
    """Circular matte over BACKDROP, recentre on the ring (EXTENT, 0.97) and resize."""
    img = Image.fromarray(np.clip(final, 0, 255).astype(np.uint8))
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((g["c"][0] - g["ro"], g["c"][1] - g["ro"], g["c"][0] + g["ro"], g["c"][1] + g["ro"]), fill=255)
    out = Image.composite(img, Image.new("RGB", (S, S), BACKDROP), m.filter(ImageFilter.GaussianBlur(3)))
    k = 512 * 0.97
    out = out.transform((S, S), Image.EXTENT, (g["c"][0] - k, g["c"][1] - k, g["c"][0] + k, g["c"][1] + k), Image.BICUBIC, fillcolor=BACKDROP)
    return out.resize((size, size), Image.LANCZOS)


def carved_ring(field, g, xx, yy, rw=74):
    """Round 6: bevelled stone rim (about 7% of the diameter) in the tusk-gore plate style: highlight upper left,
    shadow lower right, four carved diamond studs at N, E, S, W. Draws into `field` in place."""
    rng = np.random.default_rng(118214)
    c0, c1 = g["c"]
    dx, dy = xx - c0, yy - c1
    dd = np.hypot(dx, dy) + 1e-3
    ro, inner = g["ro"], g["ro"] - rw

    def prof(d):
        return np.sin(np.pi * np.clip((d - inner) / rw, 0, 1)) ** .55 * 22
    dh = (prof(dd + 1) - prof(dd - 1)) / 2
    shade = np.clip(-dh * ((dx / dd) * -.7 + (dy / dd) * -.7), -1.2, 1.2)
    t = np.clip((dd - inner) / rw, 0, 1)
    tex = noise(rng, 5, .10) + noise(rng, 22, .12) + noise(rng, 2, .05)
    col = np.array((146, 124, 96), np.float32) * (1 + tex + .62 * shade)[..., None]
    col *= (.5 + .5 * np.sin(np.pi * t) ** .5)[..., None]
    col *= (1 - .55 * np.clip((dd - (ro - 5)) / 5, 0, 1))[..., None]
    sh = np.clip(1 - (inner - dd) / 30, 0, 1) * (dd < inner)  # ring shadow on the plate
    field *= (1 - .5 * sh ** 2)[..., None]
    rm, a, b = inner + rw / 2, 40, rw * .46
    studs = np.zeros_like(dd)
    parts = []
    for sx, sy, hor in [(c0, c1 - rm, True), (c0 + rm, c1, False), (c0, c1 + rm, True), (c0 - rm, c1, False)]:
        u, v = (xx - sx, yy - sy) if hor else (yy - sy, xx - sx)
        d = np.abs(u) / a + np.abs(v) / b
        m = np.clip((1 - d) * 18, 0, 1)
        h = np.clip(1 - d, 0, 1) * 20
        gy, gx = np.gradient(h)
        lit = np.clip(.5 + .7 * (gx + gy) * 1.4, 0, 1)
        sc = np.array((30, 22, 18), np.float32) + (np.array((190, 158, 120), np.float32) - np.array((30, 22, 18), np.float32)) * lit[..., None]
        sc *= (1 - .6 * np.exp(-((d - .5) / .05) ** 2) - .6 * np.clip((d - .85) / .15, 0, 1))[..., None]
        sc *= (1 + noise(rng, 3, .08))[..., None]
        studs = np.maximum(studs, m)
        parts.append((m, sc))
    cast = np.roll(blur(studs, 5), (7, 6), (0, 1)) * (1 - studs)
    col *= (1 - .5 * cast)[..., None]
    ra = np.clip((dd - inner + 1.5) / 3, 0, 1)
    over(field, col, ra)
    for m, sc in parts:
        over(field, sc, m)


STONE = dict(shadow=(66, 54, 42), mid=(150, 128, 98), light=(196, 172, 136))  # sampled from the tusk_gore 118214 plate


def carved_ring7(field, g, xx, yy, rw=76):
    """Round 7: flat-topped bevelled stone rim (7-8 percent of the diameter), highlight upper left, shadow lower
    right, smooth outer edge, four diamond studs (about 10 percent of the diameter) at N, E, S, W."""
    rng = np.random.default_rng(118214)
    c0, c1 = g["c"]
    dx, dy = xx - c0, yy - c1
    dd = np.hypot(dx, dy) + 1e-3
    ro = g["ro"] - 1
    inner = ro - rw
    t = np.clip((dd - inner) / rw, 0, 1)
    bev = .22
    h = np.minimum(np.minimum(t / bev, (1 - t) / bev), 1) * 14
    hp = np.where(t < bev, 14 / (bev * rw), np.where(t > 1 - bev, -14 / (bev * rw), 0))
    rl = (dx / dd) * -.7 + (dy / dd) * -.7  # radial direction against the light
    b = np.clip(.5 - 2.4 * hp * rl * rw / 14 * bev * 1.0, 0, 1)
    sh_, mi_, li_ = (np.array(STONE[k], np.float32) for k in ("shadow", "mid", "light"))
    bb = b[..., None]
    col = np.where(bb < .5, sh_ + (mi_ - sh_) * bb * 2, mi_ + (li_ - mi_) * (bb - .5) * 2)
    col = col * (1 + noise(rng, 4, .07) + noise(rng, 18, .07))[..., None]
    inner_sh = np.clip(1 - (inner - dd) / 26, 0, 1) * (dd < inner)
    field *= (1 - .45 * inner_sh ** 2)[..., None]
    rm = inner + rw / 2
    studs = np.zeros_like(dd)
    parts = []
    for sx, sy, ax, ay in [(c0, c1 - rm, 52, 42), (c0 + rm, c1, 42, 52), (c0, c1 + rm, 52, 42), (c0 - rm, c1, 42, 52)]:
        u, v = xx - sx, yy - sy
        d = np.abs(u) / ax + np.abs(v) / ay
        m = np.clip((1 - d) * 14, 0, 1)
        nx, ny = np.sign(u) / ax, np.sign(v) / ay
        lb = np.clip(.5 - 1.6 * (nx * .7 + ny * .7) / np.hypot(nx, ny) * .5 * 1.0, 0, 1)
        lb = np.where(np.abs(u) / ax + np.abs(v) / ay < .08, .62, lb)
        lbb = lb[..., None]
        sc = np.where(lbb < .5, sh_ * .8 + (mi_ - sh_ * .8) * lbb * 2, mi_ + (li_ - mi_) * (lbb - .5) * 2)
        sc = sc * (1 - .5 * np.exp(-((d - .97) / .05) ** 2))[..., None]
        studs = np.maximum(studs, m)
        parts.append((m, sc))
    cast = np.roll(blur(studs, 5), (6, 6), (0, 1)) * (1 - studs)
    col = col * (1 - .45 * cast)[..., None]
    outer = np.clip((ro - dd) / 2.5, 0, 1)  # smooth outer edge
    over(field, col, np.clip((dd - inner + 1.5) / 3, 0, 1) * outer)
    for m, sc in parts:
        over(field, sc, m * outer)


def round3(r0, r1, outdir, icons_dir):
    os.makedirs(outdir, exist_ok=True)
    plan = [(r0, RINGS[0], 21, 0, 1.0, (0, 0), (-38, -12, 14, 40), 150, 24),
            (r1, RINGS[1], 22, -8, 1.08, (-6, 4), (-42, -16, 10, 36), 210, 30),
            (r0, RINGS[0], 23, 7, .95, (6, 6), (-34, -8, 18, 44), 155, 20)]
    for i, (path, g, seed, ang, sc, off, ups, dn, nr) in enumerate(plan, 1):
        im = candidate3(path, g, seed, ang, sc, off, ups, dn, nr)
        im.save(os.path.join(outdir, f"bristle_stomp_r3_{i}.png"))
        im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, f"bristle_stomp_r3_{i}_128.png"))
        print(f"r3 cand{i}")
    contact_sheet(outdir, icons_dir, len(plan), "bristle_stomp_r3_{}")


def round4(r0, outdir):
    """r3_1 only: both lobes taper to a point at the top, thin dark rim; 1024 px and 128 px."""
    os.makedirs(outdir, exist_ok=True)
    im = candidate3(r0, RINGS[0], 21, 0, 1.0, (0, 0), (-38, -12, 14, 40), 150, 24, tip=True, size=1024)
    im.save(os.path.join(outdir, "bristle_stomp_r4_1.png"))
    im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, "bristle_stomp_r4_1_128.png"))


def glyph_mask(png, cx, cy, height):
    """Round 5: one print from the game-icons.net 'deer-track' glyph (white on black, delapouite, CC BY 3.0),
    cropped to the lower-left print, rotated upright, scaled to `height` px and centred on (cx, cy) in S space."""
    a = Image.open(png).convert("L").crop((0, 380, 480, 1000))
    a = a.rotate(24, resample=Image.BICUBIC, expand=True)
    a = a.crop(a.point(lambda v: 255 if v > 128 else 0).getbbox())
    k = height / a.height
    a = a.resize((max(1, round(a.width * k)), round(height)), Image.LANCZOS)
    m = Image.new("L", (S, S), 0)
    m.paste(a, (round(cx - a.width / 2) + 12, round(cy - a.height / 2)))
    return np.asarray(m, dtype=np.float32) / 255


def round5(ring, glyph_png, outdir):
    """Glyph mode: earth plate around a CC BY 3.0 cloven-hoof glyph; 1024 px and 128 px."""
    os.makedirs(outdir, exist_ok=True)
    im = candidate3(ring, RINGS[0], 21, 0, 1.0, (0, 0), (-38, -12, 14, 40), 150, 24, size=1024, glyph=glyph_png)
    im.save(os.path.join(outdir, "bristle_stomp_r5_1.png"))
    im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, "bristle_stomp_r5_1_128.png"))


def round6(ring, glyph_png, outdir):
    """Finish pass on the glyph: toes in the plate's cracked earth, jagged ember with bloom and sparks, carved rim."""
    os.makedirs(outdir, exist_ok=True)
    im = candidate3(ring, RINGS[0], 21, 0, 1.0, (0, 0), (-38, -12, 14, 40), 150, 24, size=1024, glyph=glyph_png, r6=True)
    im.save(os.path.join(outdir, "bristle_stomp_r6_1.png"))
    im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, "bristle_stomp_r6_1_128.png"))


def round7(ring, glyph_png, outdir):
    """Round 7: dark-brown textured toes with a centre pad, rim light on the bottom-right only, 7-8 percent stone
    rim with diamond studs, brown softened debris. Same ember, bloom and layout as round 6."""
    os.makedirs(outdir, exist_ok=True)
    im = candidate3(ring, RINGS[0], 21, 0, 1.0, (0, 0), (-38, -12, 14, 40), 150, 24, size=1024, glyph=glyph_png, r7=True)
    im.save(os.path.join(outdir, "bristle_stomp_r7_1.png"))
    im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, "bristle_stomp_r7_1_128.png"))


def main():
    if sys.argv[1:2] == ["--round7"]:
        return round7(*sys.argv[2:5])
    if sys.argv[1:2] == ["--round6"]:
        return round6(*sys.argv[2:5])
    if sys.argv[1:2] == ["--glyph"]:
        return round5(*sys.argv[2:5])
    if sys.argv[1:2] == ["--round4"]:
        return round4(*sys.argv[2:4])
    if sys.argv[1:2] == ["--round3"]:
        return round3(*sys.argv[2:6])
    if sys.argv[1:2] == ["--round2"]:
        return round2(*sys.argv[2:6])
    if len(sys.argv) not in (4, 5):
        raise SystemExit(__doc__)
    r0, r1, outdir = sys.argv[1:4]
    os.makedirs(outdir, exist_ok=True)
    plan = [(r0, RINGS[0], "front", 1), (r1, RINGS[1], "raised", 2), (r0, RINGS[0], "print", 3), (r1, RINGS[1], "glow", 4)]
    for i, (path, g, kind, seed) in enumerate(plan, 1):
        im = candidate(path, g, kind, seed)
        im.save(os.path.join(outdir, f"bristle_stomp_cand{i}.png"))
        im.resize((128, 128), Image.LANCZOS).save(os.path.join(outdir, f"bristle_stomp_cand{i}_128.png"))
        print(f"cand{i}: {kind}")
    if len(sys.argv) == 5:
        contact_sheet(outdir, sys.argv[4], len(plan))


if __name__ == "__main__":
    main()
