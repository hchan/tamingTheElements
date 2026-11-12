"""Procedural map-effect sprites, batch F of the art-consistency work (original art, no legacy pixels).
Run: ~/claudetmp/v/bin/python tools/assets/fx-gen/batch-f-map.py [outdir]   (default public/assets/img/fx; needs Pillow)
Writes dummyTarget, eternalVoid, paxAdrenaline, rokcoreRockArmour: 320x80 strips of four 80x80 frames, same layout and look as
batch-e-map.py (whose Frame/strip helpers are reused): dark element-coloured outline, nested ramp bands, bright core/highlights.
"""
import importlib.util, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("batch_e_map", os.path.join(HERE, "batch-e-map.py"))
E = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(E)
if len(sys.argv) > 1:
    E.OUT = sys.argv[1]
Frame, strip, palette, N = E.Frame, E.strip, E.palette, E.N
FIRE, EARTH, VOID = (palette.element_ramp(n) for n in ("fire", "earth", "void"))


def dummy_target():
    """Training dummy: wooden torso with red/white bullseye rings, crossbar arms, stick legs; sways and the rings pulse."""
    wood = [(58, 36, 20), (120, 78, 42), (186, 132, 76), (236, 196, 128)]
    red, white = (214, 52, 40), (250, 240, 222)
    out = (30, 18, 12)
    frames = []
    for k in range(N):
        f = Frame()
        sw = 2.0 * math.sin(k * math.pi / 2)
        f.poly([(40 + sw, 52), (32 - sw, 76), (36 - sw, 77), (42 + sw * 0.5, 56)], wood[1])  # legs
        f.poly([(40 + sw, 52), (48 - sw, 76), (52 - sw, 75), (44 + sw, 52)], wood[1])
        f.poly([(40 + sw, 52), (28 + sw, 70), (30 + sw, 72), (42 + sw, 54)], wood[0])
        f.poly([(6 + sw, 25), (74 + sw, 22), (74 + sw, 28), (6 + sw, 30)], wood[1])  # crossbar arms
        f.poly([(6 + sw, 25), (74 + sw, 22), (74 + sw, 24.5), (6 + sw, 27)], wood[2])
        f.ell(40 + sw, 41, 17, 20, wood[1])  # torso
        f.ell(39 + sw, 40, 15, 18, wood[2])
        f.ell(36 + sw, 33, 6, 8, wood[3], 170)
        f.ell(40 + sw, 12, 8, 9, wood[1])  # head
        f.ell(39 + sw, 11, 6.5, 7.5, wood[2])
        f.ell(40 + sw, 41, 12, 14, red)  # bullseye
        f.ell(40 + sw, 41, 8.5 + 0.6 * (k % 2), 10.2, white)
        f.ell(40 + sw, 41, 5.2, 6.2, red)
        f.ell(40 + sw, 41, 2.2, 2.6, white)
        f.arc(40 + sw, 41, 12, 14, 200, 280, 1.4, (255, 150, 130))
        f.outlined(1.6, out)
        frames.append(f)
    strip(frames, "dummyTarget")


def eternal_void():
    """Void vortex: dark purple spiral arms around a near-black eye with a pale rim, rotating through the loop; bright rim reads on dark floors."""
    out = (6, 4, 14)
    frames = []
    for k in range(N):
        f = Frame()
        rot = k * math.pi / 8  # 4 arms, symmetric so a quarter-arm step per frame would loop; 1/8 turn keeps it smooth
        f.ell(40, 40, 36, 36, VOID[1])
        f.ell(40, 40, 30, 30, VOID[0])
        for arm in range(4):
            a0 = rot + arm * math.pi / 2
            pts_o, pts_i = [], []
            for i in range(21):
                t = i / 20
                ang = a0 + t * 3.2
                r = 4 + 31 * t
                w = 0.5 * (1 - t) + 0.12
                pts_o.append((40 + r * math.cos(ang + w), 40 + r * math.sin(ang + w)))
                pts_i.append((40 + r * math.cos(ang - w), 40 + r * math.sin(ang - w)))
            f.poly(pts_o + pts_i[::-1], VOID[2])
            for dx, dy, col in ((0, 0, VOID[3]),):
                f.d.line([((40 + (4 + 31 * (i / 20)) * math.cos(a0 + (i / 20) * 3.2)) * E.SS, (40 + (4 + 31 * (i / 20)) * math.sin(a0 + (i / 20) * 3.2)) * E.SS) for i in range(2, 19)], fill=col + (255,), width=int(1.6 * E.SS))
        f.ell(40, 40, 9, 9, VOID[3])
        f.ell(40, 40, 7, 7, (4, 2, 10))
        f.arc(40, 40, 8, 8, 200 + k * 20, 300 + k * 20, 1.4, VOID[4])
        for x, y in [(10, 14 + k), (70, 18 - k), (68, 66 + k % 2), (12, 64 - k)]:
            f.ell(x, y, 1.8, 1.8, VOID[4])
        f.outlined(1.6, out)
        frames.append(f)
    strip(frames, "eternalVoid")


def pax_adrenaline():
    """Pax's adrenaline surge: a ring of jagged red-orange spikes flaring around the caster (hollow centre), pulsing outward and a hot core ring."""
    ramp = [FIRE[1], palette.hue_shift(FIRE[2], -10, 1.0, 0.95), FIRE[3], (255, 226, 130)]
    out = palette.hue_shift(FIRE[0], -6, 1.0, 0.85)
    frames = []
    for k in range(N):
        f = Frame()
        n = 14
        for layer, (col, s) in enumerate(zip(ramp, (1.0, 0.78, 0.55, 0.3))):
            pts = []
            for i in range(n * 2):
                ang = i * math.pi / n + (0.12 * k if i % 2 else 0)
                spike = i % 2 == 0
                r = (31 + 5 * math.sin(k * 1.7 + i * 0.9) + (4 if i % 4 == 0 else 0)) if spike else 22
                r = 14 + (r - 14) * s if spike else 14 + (r - 14) * min(1.0, s + 0.15)
                pts.append((40 + r * math.cos(ang), 40 + r * math.sin(ang)))
            f.poly(pts, col, 235)
        f.arc(40, 40, 16 + (k % 2), 16 + (k % 2), 0, 360, 1.6, ramp[3])
        f.ell(40, 40, 11, 11, (0, 0, 0), 0)  # clear centre so the hero shows through
        f.outlined(1.5, out)
        frames.append(f)
    strip(frames, "paxAdrenaline")


def rokcore_rock_armour():
    """Rock Armour: a ring of angular stone plates orbiting the caster, earth ramp with lit top edges and moss; the plates rotate slowly."""
    stone = [(40, 34, 30), (96, 86, 74), (150, 138, 118), (206, 196, 172)]
    moss = (110, 164, 70)
    out = (24, 18, 14)
    frames = []
    for k in range(N):
        f = Frame()
        n = 8
        for i in range(n):
            ang = i * 2 * math.pi / n + k * math.pi / 16
            cx, cy = 40 + 25 * math.cos(ang), 40 + 25 * math.sin(ang)
            sz = 9.5 + 1.2 * math.sin(i * 2.3 + k)
            tilt = ang + 0.5 * math.sin(i * 1.7)

            def pt(dx, dy):
                return (cx + dx * math.cos(tilt) - dy * math.sin(tilt), cy + dx * math.sin(tilt) + dy * math.cos(tilt))
            shape = [(-1.0, -0.6), (0.1, -1.0), (1.0, -0.4), (0.8, 0.7), (-0.3, 1.0), (-1.0, 0.5)]
            f.poly([pt(x * sz, y * sz * 0.85) for x, y in shape], stone[1])
            f.poly([pt(x * sz * 0.8, y * sz * 0.65) for x, y in shape], stone[2])
            f.poly([pt(-1.0 * sz * .8, -0.6 * sz * .65), pt(0.1 * sz * .8, -1.0 * sz * .65), pt(0.2 * sz, -0.1 * sz)], stone[3])
            f.poly([pt(0.8 * sz, 0.7 * sz * .85), pt(-0.3 * sz, 1.0 * sz * .85), pt(0.0, 0.3 * sz)], stone[0], 200)
            if i % 3 == 0:
                f.ell(*pt(-0.5 * sz, -0.7 * sz * .8), 2.6, 1.6, moss)
        f.arc(40, 40, 25, 25, 0, 360, 2.0, stone[1], 200)  # binding ring under the plates' gaps
        f.outlined(1.6, out)
        frames.append(f)
    strip(frames, "rokcoreRockArmour")


if __name__ == "__main__":
    dummy_target()
    eternal_void()
    pax_adrenaline()
    rokcore_rock_armour()
