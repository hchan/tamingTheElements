"""Installs the art-director-approved AI-generated ability icons into public/assets/img/hud/ability-icons-ai/.
Run: python3 -I tools/assets/icon-gen/install-ai-ability-icons.py <approval.json> [<approval.json> ...] [--check]
Each approval.json maps slot (hyphens or underscores; slots not in SLOTS are skipped) -> {approved: <png path relative to that json>, reviewer, date, beats_shipped} (the SDXL batch fetch layout).
Fails closed: reviewer must be art-director, beats_shipped true, source a 512x512 or 1024x1024 PNG (1024 is halved first). Resizes to 128x128 (Lanczos) with Pillow,
writes <slot>.png, index.json (sha256 per file), CREDITS.txt, and merges the approvals into tools/assets/icon-gen/provenance/ai-approval.json.
Slots not named in a run keep their installed icon (incremental). Slots in KEYS are keyed onto the dark backdrop first (radial mask / border-colour key).
--check is a dry run (prints the plan). Own AI-generated work (SDXL on the project GPU box), no third-party licence.
"""
import hashlib, io, json, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "public", "assets", "img", "hud", "ability-icons-ai")
APPROVAL_REL = "tools/assets/icon-gen/provenance/ai-approval.json"
SLOTS = ["ember_bite", "gale_talon", "tide_surge", "hurl_rock", "lure_orb",
         "mycelium_mend", "stinging_filament", "stoop", "forge_gore", "tusk_gore", "boulder_roll",
         "kelp_lash", "molten_hide", "whirlpool", "bell_pulse", "heal_spring", "scorch_breath", "wyrm_coil", "spore_burst",
         "cinder_spray", "static_mote", "quake", "mist_veil", "kelp_whip", "gust", "bristle_stomp",
         "wind_wall", "talon_rake", "skitter", "abyssal_pull"]
# Slots whose art carries a third-party credit (written to CREDITS.txt and the icon's index entry).
THIRD_PARTY = {
    "talon_rake": "Talon Rake: glyph \"Triple scratches\" by Lorc (game-icons.net), CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), "
                  "rasterised, tinted and embossed on a procedural medallion.",
    "bristle_stomp": "Bristle Stomp: glyph \"Deer Track\" by Delapouite (game-icons.net), CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), "
                     "rasterised, regraded and lit on a procedural earth plate (tools/assets/icon-gen/bristle-stomp-hoof.py).",
}
SIDE = 128
BACKDROP = (22, 20, 19)  # the dark ground the earlier icons sit on
# Slots whose source has a light studio/paper background get keyed onto BACKDROP before resizing:
#   radial: superellipse mask (radius r, exponent p, feather f; fractions of the side) around the centre
#   bgkey: soft colour key against the median border colour (tolerance t, softness s), then the radial mask
# bell_pulse: hand-traced silhouette (512 px source coordinates); the bell's dark shoulder is too close to the studio grey for a colour key
BELL_POLY = [(240, 72), (272, 72), (284, 90), (283, 125), (330, 138), (365, 175), (385, 230), (400, 290), (425, 318), (455, 345),
             (458, 385), (440, 415), (390, 432), (256, 436), (130, 432), (75, 415), (55, 385), (55, 350), (88, 318), (112, 290),
             (125, 230), (146, 175), (180, 138), (228, 125), (228, 90)]
KEYS = {
    # abyssal_pull: own procedural work (tools/assets/ability-icons-procedural/gen.py abyssal_pull), RGBA on transparent; composited onto BACKDROP by its alpha
    "abyssal_pull": {"alpha": True},
    "kelp_lash": {"bgkey": (28, 30), "radial": (0.48, 4, 0.08)},
    "molten_hide": {"radial": (0.305, 12, 0.02)},
    "whirlpool": {"radial": (0.50, 2, 0.06)},
    "bell_pulse": {"poly": BELL_POLY, "ripple": True},
    "heal_spring": {"crop": (0.10, 0.05, 0.90, 0.85), "hue": 95, "bgkey": (10, 14), "rowbg": True, "radial": (0.46, 2, 0.012), "drops": True},
    "wyrm_coil": {"greykey": (0.20, 0.45, 0.1), "alphacut": 200, "scale": 0.90, "radial": (0.44, 4, 0.05)},
    "spore_burst": {"radial": (0.425, 2, 0.012)},
    "scorch_breath": {"crop": (0.05, 0.03, 0.97, 0.735), "bgkey": (22, 26), "radial": (0.5, 4, 0.08)},
}
#   alpha: use the source PNG alpha as the matte (procedural RGBA icons);
#   tint: map luminance to a deep teal/blue ramp; rim: darken the edge (strength); erode: shrink the matte N px (despill);
#   rowbg: bgkey against a per-row border colour (gradient backdrop); contrast: autocontrast before tint;
#   greykey: key out the low-saturation light backdrop (min value, max saturation, softness; all 0..1);
#   alphacut: zero alpha below this (0..255); scale: shrink the keyed subject (fraction) for margin;
#   poly: hand-traced silhouette (source pixel coords) used as the matte instead of a key;
#   ripple: teal ellipse rings under the subject (air/water cue); drops: blue-green droplet arc over the top right
# crop: (x0, y0, x1, y1) fractions of the source, padded to a square with the median border colour (drops floor bands)
# hue: degrees to rotate the hue (heal_spring green to teal for the water element)


def radial_mask(n, r, p, f):
    m = Image.new("L", (n, n))
    px = m.load()
    for y in range(n):
        for x in range(n):
            d = (abs((x + .5) / n - .5) ** p + abs((y + .5) / n - .5) ** p) ** (1 / p)
            px[x, y] = round(255 * min(1.0, max(0.0, (r - d) / f)))
    return m.filter(ImageFilter.GaussianBlur(2))


TEAL_RAMP = [(0.0, (4, 14, 24)), (0.45, (16, 78, 102)), (0.8, (70, 170, 188)), (1.0, (200, 238, 240))]


def teal_tint(im):
    lut = [[], [], []]
    for v in range(256):
        t = v / 255
        for (t0, c0), (t1, c1) in zip(TEAL_RAMP, TEAL_RAMP[1:]):
            if t <= t1:
                f = (t - t0) / (t1 - t0)
                for k in range(3):
                    lut[k].append(round(c0[k] + (c1[k] - c0[k]) * f))
                break
    g = im.convert("L")
    return Image.merge("RGB", [g.point(lut[k]) for k in range(3)])


def draw_ripples(im):
    d = ImageDraw.Draw(im, "RGBA")
    n = im.size[0]
    for i, (rx, a) in enumerate([(0.46, 150), (0.38, 190), (0.30, 230)]):
        cx, cy, ry = n / 2, n * 0.86, rx * 0.22 * n
        d.ellipse((cx - rx * n, cy - ry, cx + rx * n, cy + ry), outline=(90, 200, 210, a), width=max(2, n // 80))
    return im


def draw_drops(im):
    d = ImageDraw.Draw(im, "RGBA")
    n = im.size[0]
    for i, (x, y, r) in enumerate([(0.74, 0.12, 0.030), (0.84, 0.22, 0.036), (0.90, 0.35, 0.026), (0.60, 0.07, 0.022)]):
        cx, cy, rr = x * n, y * n, r * n
        d.polygon([(cx, cy - rr * 1.9), (cx - rr, cy), (cx + rr, cy)], fill=(110, 210, 225, 235))
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(110, 210, 225, 235))
        d.ellipse((cx - rr * .5, cy - rr * .6, cx - rr * .05, cy - rr * .1), fill=(235, 252, 252, 220))
    return im


def keep_border_connected(alpha):
    """Alpha stays 255 everywhere except background-like pixels (alpha < 128) connected to the image border."""
    n, m = alpha.size
    px = alpha.load()
    seen = bytearray(n * m)
    stack = [(x, y) for x in range(n) for y in (0, m - 1)] + [(x, y) for y in range(m) for x in (0, n - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= n or y >= m or seen[y * n + x] or px[x, y] >= 128:
            continue
        seen[y * n + x] = 1
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    out = Image.new("L", alpha.size, 255)
    op = out.load()
    for y in range(m):
        for x in range(n):
            if seen[y * n + x]:
                op[x, y] = px[x, y]
    return out


def key_onto_backdrop(im, cfg):
    """Composites im over BACKDROP through the slot's keys (see KEYS)."""
    mask = im.getchannel("A") if cfg.get("alpha") and "A" in im.getbands() else None
    im = im.convert("RGB")
    if "crop" in cfg:
        w, h = im.size
        x0, y0, x1, y1 = cfg["crop"]
        im = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
        cw, ch = im.size
        edge = [im.getpixel(q) for q in [(1, 1), (cw - 2, 1), (1, ch // 2), (cw - 2, ch // 2), (cw // 2, 1)]]
        fill = tuple(sorted(c[k] for c in edge)[len(edge) // 2] for k in range(3))
        side = max(cw, ch)
        sq = Image.new("RGB", (side, side), fill)
        sq.paste(im, ((side - cw) // 2, (side - ch) // 2))
        im = sq.resize((w, w), Image.LANCZOS)
    if "hue" in cfg:
        hh, ss, vv = im.convert("HSV").split()
        hh = hh.point(lambda v: (v + round(cfg["hue"] * 255 / 360)) % 256)
        im = Image.merge("HSV", (hh, ss, vv)).convert("RGB")
    if cfg.get("tint"):
        im = teal_tint(ImageOps.autocontrast(im.convert("L"), cutoff=2) if cfg.get("contrast") else im)
    n = im.size[0]
    alpha = mask if mask is not None else Image.new("L", im.size, 255)
    if "poly" in cfg:
        alpha = Image.new("L", im.size, 0)
        ImageDraw.Draw(alpha).polygon([(x * n / 512, y * n / 512) for x, y in cfg["poly"]], fill=255)
        alpha = alpha.filter(ImageFilter.GaussianBlur(1.5))
    if "greykey" in cfg:
        vmin, smax, soft = cfg["greykey"]
        _, ss, vv = im.convert("HSV").split()
        grey = ImageChops.multiply(
            ss.point(lambda v: round(255 * min(1.0, max(0.0, (smax - v / 255) / soft)))),
            vv.point(lambda v: round(255 * min(1.0, max(0.0, (v / 255 - vmin) / soft)))))
        alpha = grey.point(lambda v: 255 - v).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
        if cfg.get("alphacut"):  # drop the faint remains of the backdrop vignette
            alpha = alpha.point(lambda v: 0 if v < cfg["alphacut"] else v)
    if "bgkey" in cfg:
        tol, soft = cfg["bgkey"]
        if cfg.get("rowbg"):  # studio gradient: per-row background = median of the left and right 14 px of that row
            rows = []
            for y in range(n):
                b = [im.getpixel((x, y)) for x in list(range(14)) + list(range(n - 14, n))]
                rows.append(tuple(sorted(c[k] for c in b)[len(b) // 2] for k in range(3)))
            bgim = Image.new("RGB", im.size)
            bgim.putdata([rows[y] for y in range(n) for _ in range(n)])
        else:
            b = [im.getpixel(q) for q in [(i, j) for i in (2, n // 2, n - 3) for j in (2, n - 3)] + [(2, n // 2), (n - 3, n // 2)]]
            bg = tuple(sorted(c[k] for c in b)[len(b) // 2] for k in range(3))
            bgim = Image.new("RGB", im.size, bg)
        d = [ImageChops.difference(im.getchannel(k), bgim.getchannel(k)).point(lambda v: v // 3) for k in range(3)]
        dist = ImageChops.add(ImageChops.add(d[0], d[1]), d[2])  # mean absolute channel difference (v/3 each, summed)
        alpha = dist.point(lambda v: round(255 * min(1.0, max(0.0, (v - tol) / soft))))
        alpha = keep_border_connected(alpha)  # only background reachable from the border is keyed; the subject keeps interior pixels
        for _ in range(cfg.get("erode", 0)):
            alpha = alpha.filter(ImageFilter.MinFilter(3))
        alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    if "radial" in cfg:
        alpha = ImageChops.multiply(alpha, radial_mask(n, *cfg["radial"]))
    out = Image.composite(im, Image.new("RGB", im.size, BACKDROP), alpha)
    if cfg.get("scale"):  # shrink the subject so it clears the edges
        k = round(n * cfg["scale"])
        small = out.resize((k, k), Image.LANCZOS)
        out = Image.new("RGB", out.size, BACKDROP)
        out.paste(small, ((n - k) // 2, (n - k) // 2))
    if cfg.get("rim"):  # darken toward the edge
        rim = radial_mask(n, 0.5, 2, 0.25).point(lambda v: round(255 - (255 - v) * cfg["rim"]))
        out = ImageChops.multiply(out, Image.merge("RGB", [rim] * 3))
    if cfg.get("ripple"):
        out = draw_ripples(out)
    if cfg.get("drops"):
        out = draw_drops(out)
    return out


def load(paths):
    approvals, jobs = {}, []
    for p in paths:
        base = os.path.dirname(os.path.abspath(p))
        for name, a in json.load(open(p)).items():
            slot = name.replace("-", "_")  # approvals name abilities with hyphens
            if slot not in SLOTS:
                print(f"skip {name}: not an installable slot (no ability icon wired)", file=sys.stderr)
                continue
            if slot in approvals:
                raise SystemExit(f"{slot}: approved twice")
            if not a.get("approved"):
                raise SystemExit(f"{slot}: approval has no approved file")
            if a.get("reviewer") != "art-director" or a.get("beats_shipped") is not True or not a.get("date"):
                raise SystemExit(f"{slot}: not approved by the art-director (reviewer/beats_shipped/date)")
            src = os.path.normpath(os.path.join(a.get("dir") or base, a["approved"]))  # optional "dir" (absolute) as in the batch fetch layout
            im = Image.open(src)
            if im.format != "PNG" or im.size not in ((512, 512), (1024, 1024)):
                raise SystemExit(f"{slot}: {src} is not a 512x512 or 1024x1024 PNG")
            if im.size != (512, 512):
                im = im.convert("RGB").resize((512, 512), Image.LANCZOS)  # KEYS coordinates are in 512 px space
            buf = io.BytesIO()
            if slot in KEYS:
                im = key_onto_backdrop(im, KEYS[slot])
            im.convert("RGBA").resize((SIDE, SIDE), Image.LANCZOS).save(buf, "PNG", optimize=True)
            approvals[slot] = {"approved": os.path.basename(src), "reviewer": a["reviewer"], "date": a["date"], "beats_shipped": True}
            jobs.append((slot, buf.getvalue()))
    return approvals, sorted(jobs)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if not args or any(x.startswith("--") and x != "--check" for x in sys.argv[1:]):
        raise SystemExit(__doc__)
    approvals, jobs = load(args)
    # Incremental: slots not in this run keep their installed icon, provenance and index entry.
    prov_path = os.path.join(HERE, "provenance", "ai-approval.json")
    old_prov = json.load(open(prov_path)) if os.path.exists(prov_path) else {}
    old_index = json.load(open(os.path.join(OUT, "index.json")))["icons"] if os.path.exists(os.path.join(OUT, "index.json")) else {}
    kept = [s for s in SLOTS if s not in approvals]
    missing = [s for s in kept if s not in old_prov or s not in old_index]
    if missing:
        raise SystemExit(f"missing approvals for {missing}")
    approvals.update({s: old_prov[s] for s in kept})
    index = {slot: {"url": f"img/hud/ability-icons-ai/{slot}.png", "w": SIDE, "h": SIDE, "sha256": hashlib.sha256(data).hexdigest(),
                    "source": approvals[slot]["approved"], "approval": {**approvals[slot], "file": APPROVAL_REL},
                    **({"credit": THIRD_PARTY[slot]} if slot in THIRD_PARTY else {})} for slot, data in jobs}
    index.update({s: old_index[s] for s in kept})
    index = {s: index[s] for s in SLOTS}
    if "--check" in sys.argv:
        print(json.dumps(index, indent=2))
        return
    os.makedirs(OUT, exist_ok=True)
    for slot, data in jobs:
        open(os.path.join(OUT, f"{slot}.png"), "wb").write(data)
    os.makedirs(os.path.join(HERE, "provenance"), exist_ok=True)
    with open(prov_path, "w") as f:
        json.dump({s: approvals[s] for s in SLOTS}, f, indent=2)
        f.write("\n")
    open(os.path.join(OUT, "index.json"), "w").write(json.dumps({"licence": "own work (AI-generated, SDXL on the project GPU box), except icons with a credit field", "icons": index}, indent=2) + "\n")
    open(os.path.join(OUT, "CREDITS.txt"), "w").write(
        "Ability icons: own work (AI-generated SDXL or procedural), except where credited below; resized to 128 px by tools/assets/icon-gen/install-ai-ability-icons.py.\n"
        "Approved by the art-director agent, see tools/assets/icon-gen/provenance/ai-approval.json. No attribution required, except:\n"
        + "".join(f"  {c}\n" for c in THIRD_PARTY.values()))
    print(f"installed {len(jobs)} icons to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
