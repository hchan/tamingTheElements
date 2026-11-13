"""Procedural map-effect sprites, batch E of the art-consistency work (original art, no legacy pixels).
Run: ~/claudetmp/v/bin/python tools/assets/fx-gen/batch-e-map.py [outdir]   (default public/assets/img/fx; needs Pillow)
Writes tornado, fireCone, translucentFlame, echoFade, circusOfSlime: each a 320x80 strip of four 80x80 animation frames (the layout of
the legacy img/map strips; the projectile view shows frame 0, so frame 0 is the readable hero pose, frames 1-3 are the loop).
Look: the same family as the rig-gen heroes and fx-gen batches A-D: grim pass (owner: too cartoony): a soft shadow rim instead of an outline, nested
element ramp bands, then grim() desaturates, darkens, mottles and grains the frame so it reads painterly, not flat.
Hero tie-ins: echoFade uses Echo's graphite and white rings (rig-gen/echo.py), circusOfSlime Ishimi's dark teal gel with cyan sheen.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig-gen"))
import palette

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "assets", "img", "fx")
SS, F, N = 4, 80, 4
AIR, FIRE = (palette.element_ramp(n) for n in ("air", "fire"))


class Frame:
    def __init__(self):
        self.img = Image.new("RGBA", (F * SS, F * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def ell(self, cx, cy, rx, ry, col, a=255):
        self.d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=tuple(col) + (a,))

    def poly(self, pts, col, a=255):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=tuple(col) + (a,))

    def arc(self, cx, cy, rx, ry, a0, a1, w, col, a=255):
        self.d.arc([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], a0, a1, fill=tuple(col) + (a,), width=max(1, int(w * SS)))

    def tongue(self, x, y, w, h, lean, col, a=255):
        """Teardrop flame, base centre (x, y), height h, tip leaning by lean px."""
        def half(t):
            return w * (math.sin(math.pi * min(1.0, t * 0.9 + 0.1)) ** 0.8) * (1 - t) ** 0.35
        ts = [i / 20 for i in range(21)]
        left = [(x - half(t) + lean * t * t, y - h * t) for t in ts]
        right = [(x + half(t) + lean * t * t, y - h * t) for t in reversed(ts)]
        self.poly(left + right, col, a)

    def outlined(self, grow, col):
        """Dark outline: dilate the alpha by `grow` px and put the colour under the art."""
        al = self.img.getchannel("A").filter(ImageFilter.MaxFilter(int(grow * SS) * 2 + 1))
        base = Image.new("RGBA", self.img.size, tuple(col) + (0,))
        base.putalpha(al.point(lambda v: int(v * 0.62)))  # a soft shadow rim, not a bold outline (grim pass)
        base.alpha_composite(self.img)
        self.img = base

    def final(self):
        return grim(self.img.resize((F, F), Image.LANCZOS))


_RNG = np.random.RandomState(7)  # fixed seed: regenerating gives the same grain every run


def _fbm(h, w):
    """Cheap value noise 0..1: three smooth octaves, for ragged edges and mottled paint."""
    acc = np.zeros((h, w), np.float32)
    for cells, amp in ((4, 0.5), (10, 0.3), (24, 0.2)):
        g = Image.fromarray((_RNG.rand(cells, cells) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((w, h), Image.BICUBIC), np.float32) / 255 * amp
    return acc


def grim(img):
    """Grim painterly grade (owner: the new art looked too cartoony): desaturate and darken, mottle and grain the colour, shade
    the rim darker so the core reads brighter, and soften/erode the silhouette with noise (no hard flat-shape edges)."""
    a = np.asarray(img, np.float32)
    h, w = a.shape[:2]
    rgb, al = a[..., :3], a[..., 3] / 255
    al_img = Image.fromarray((al * 255).astype(np.uint8))
    soft = np.asarray(al_img.filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255
    core = np.asarray(al_img.filter(ImageFilter.GaussianBlur(3.2)), np.float32) / 255
    mott = _fbm(h, w)
    al2 = np.clip((soft - 0.1) / 0.9 * (0.78 + 0.35 * mott), 0, 1)
    grey = (rgb * np.array([0.3, 0.59, 0.11], np.float32)).sum(-1, keepdims=True)
    rgb = grey + (rgb - grey) * 0.42
    rgb = 255 * (rgb / 255) ** 1.25  # compress highlights: no bright cartoon pops
    rgb = rgb * (0.62 + 0.3 * core[..., None]) * (0.74 + 0.4 * mott[..., None]) * 0.92
    rgb = rgb + _RNG.normal(0, 9, (h, w, 1)).astype(np.float32)
    out = np.dstack([np.clip(rgb, 0, 255), al2 * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def strip(frames, name):
    sheet = Image.new("RGBA", (F * N, F), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr.final(), (i * F, 0))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".png")
    sheet.save(path, optimize=True)
    print(path, sheet.size)


def tornado():
    """Air funnel: wide swirling top, narrow tip at the bottom; mid-blue body, white-blue wind bands that rotate through the loop."""
    out = palette.hue_shift(AIR[0], 0, 1.0, 0.8)
    frames = []
    for k in range(N):
        f = Frame()
        ph = k * math.pi / 2
        for i in range(17):
            t = i / 16
            y = 8 + i * 4.2
            f.ell(40 + 4 * math.sin(t * 5 - k * 0.5) * (1 - t * 0.4), y, 34 - 29 * t ** 0.85, 5.5 - 2.5 * t, AIR[1])
        for i in range(17):
            t = i / 16
            y = 8 + i * 4.2
            rx = 34 - 29 * t ** 0.85
            cx = 40 + 4 * math.sin(t * 5 - k * 0.5) * (1 - t * 0.4)
            s = math.sin(t * 9 - ph)
            f.arc(cx, y, rx * 0.92, 5.0 - 2.4 * t, 20 + s * 40, 160 + s * 40, 2.4 - 1.0 * t, AIR[3])
            if i % 2 == k % 2:
                f.arc(cx, y, rx * 0.7, 4.0 - 2.0 * t, 200, 340, 1.6, AIR[4])
        for x, y in [(8, 12 + 3 * k), (72, 20 - k * 2), (14, 40 + k * 2), (66, 44 - k)]:
            f.ell(x, y, 2.2, 1.2, AIR[4])
        f.outlined(1.6, out)
        frames.append(f)
    strip(frames, "tornado")


def fire_cone():
    """Fiara's cone of flame, east-facing: hot apex at the left, widening to the right, nested flame layers and swirl rings."""
    ramp = [palette.hue_shift(FIRE[1], -8, 1.05, 1.1), FIRE[2], FIRE[3], (255, 226, 130), (255, 248, 210)]
    out = palette.hue_shift(FIRE[0], -6, 1.0, 0.85)
    us = [i / 16 for i in range(17)]
    frames = []
    for k in range(N):
        f = Frame()
        wob = 2.5 * math.sin(k * math.pi / 2)
        for col, s in zip(ramp, (1.0, 0.78, 0.58, 0.38, 0.2)):
            top = [(6 + 68 * u, 40 - (3 + 33 * u ** 0.95) * s + wob * math.sin(u * 7 + k) * u) for u in us]
            bot = [(6 + 68 * u, 40 + (3 + 33 * u ** 0.95) * s + wob * math.cos(u * 7 + k) * u) for u in reversed(us)]
            f.poly(top + bot, col)
        for j, u in enumerate([0.3, 0.5, 0.7, 0.88]):
            x = 6 + 68 * u + 2 * ((k + j) % 2)
            hh = 3 + 33 * u ** 0.95
            f.arc(x, 40, 5 + 4 * u, hh * 0.9, 250, 110, 2.2, ramp[1] if j % 2 else ramp[0])
            f.arc(x - 1, 40, 4 + 3 * u, hh * 0.62, 260, 100, 1.6, ramp[4], 220)
        for x, y in [(70 - k * 3, 6 + k), (74 - k * 2, 72 - k), (58, 4 + 2 * k), (60, 76 - k)]:
            f.ell(x, y, 1.6, 1.6, ramp[3])
        f.outlined(1.6, out)
        frames.append(f)
    strip(frames, "fireCone")


def translucent_flame():
    """Pale aura flame around a caster (buff): a row of tongues, hollowed in the middle so the hero stays visible inside."""
    ramp = [FIRE[1], FIRE[2], FIRE[3], (255, 226, 130)]
    out = palette.hue_shift(FIRE[0], -6, 1.0, 0.85)
    frames = []
    for k in range(N):
        f = Frame()
        for i in range(7):
            bx = 10 + 60 * i / 6
            by = 72 - 6 * math.sin(math.pi * i / 6)
            h = 40 - abs(i - 3) * 4 + 5 * math.sin(k * 1.6 + i * 1.3)
            lean = (i - 3) * 1.5 + 3 * math.sin(k * 1.6 + i)
            for col, s in zip(ramp, (1.0, 0.76, 0.52, 0.28)):
                f.tongue(bx, by, 7.5 * s + 1.5, h * s + 3, lean * s, col, 240)
        hole = Image.new("L", f.img.size, 255)
        ImageDraw.Draw(hole).ellipse([22 * SS, 36 * SS, 58 * SS, 68 * SS], fill=120)
        f.img.putalpha(ImageChops.multiply(f.img.getchannel("A"), hole))
        f.outlined(1.5, out)
        frames.append(f)
    strip(frames, "translucentFlame")


def echo_fade():
    """Echo's fade: expanding graphite-and-white sound-wave rings that thin as they grow, around a solid pulse."""
    out = (20, 22, 30)
    gr = (62, 66, 82)
    white = (246, 248, 255)
    frames = []
    for k in range(N):
        f = Frame()
        radii = sorted(9 + ((k * 8 + j * 14) % 30) * 0.95 for j in range(3))
        for r in reversed(radii):  # outermost first so inner rings carve their own hollow
            fade = 1.0 - (r - 9) / 30
            w = 2 + 3.5 * fade
            a = int(255 * (0.6 + 0.4 * fade))
            f.ell(40, 40, r + w, (r + w) * 0.55, gr, a)
            f.ell(40, 40, r - w, (r - w) * 0.55, (0, 0, 0), 0)  # RGBA fill with alpha 0 (replace, not blend)
            f.arc(40, 40, r, r * 0.55, 0, 360, max(1.0, w * 0.5), white, a)
        f.ell(40, 40, 6, 4.2, (236, 238, 248))
        f.ell(40, 40, 3, 2.1, (150, 156, 180))
        f.outlined(1.4, out)
        frames.append(f)
    strip(frames, "echoFade")


def circus_of_slime():
    """Ishimi's slime splat: dark teal gel blobs with a cyan sheen, bubbles and drips; the blobs wobble over the loop."""
    gel = [(8, 38, 48), (14, 78, 92), (26, 128, 142), (92, 214, 226), (214, 252, 255)]
    out = (4, 20, 28)
    spots = [(40, 40, 22, 17), (22, 30, 11, 9), (60, 28, 10, 9), (58, 56, 11, 9), (22, 56, 10, 8)]
    drops = [(8, 40, 3), (72, 42, 3), (40, 8, 3), (40, 73, 3), (14, 14, 2.5), (68, 66, 2.5)]
    frames = []
    for k in range(N):
        f = Frame()
        w = math.sin(k * math.pi / 2)
        for i, (x, y, rx, ry) in enumerate(spots):
            ph = k * 1.5 + i
            rxx, ryy = rx + 1.2 * math.sin(ph), ry + 1.2 * math.cos(ph)
            f.ell(x, y, rxx, ryy, gel[1])
            f.ell(x + 0.5, y - 0.8, rxx * 0.78, ryy * 0.74, gel[2])
        for x, y, r in drops:
            f.ell(x + w, y - w * 0.6, r, r, gel[1])
        for x, y, rx, ry in spots:
            f.arc(x - 1, y - 1, rx * 0.6, ry * 0.6, 200, 290, 1.8, gel[3])
            f.ell(x - rx * 0.28, y - ry * 0.35, 1.6, 1.2, gel[4])
        for x, y, r in drops:
            f.ell(x - r * 0.3 + w, y - r * 0.3 - w * 0.6, r * 0.35, r * 0.35, gel[4])
        f.outlined(1.8, out)
        frames.append(f)
    strip(frames, "circusOfSlime")


if __name__ == "__main__":
    tornado()
    fire_cone()
    translucent_flame()
    echo_fade()
    circus_of_slime()
