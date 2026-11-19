#!/usr/bin/env python3
"""Per-hero Canny-style control images for the 12 roster24 heroes (generalised from make-glimmaw-control.py).

White 4 px lines on black. One head, facing right, legs apart, tail and wings clear of the body, no ground
line, at least 6% margin on every side. Canvas sizes are native SDXL buckets (aspect follows
ideas/brainstorm/hero-silhouette-proportions.md). Shapes are in unit coordinates (0..1 of the canvas).

  python3 make-control.py OUTDIR [hero ...]       writes OUTDIR/<hero>_control.png
  python3 make-control.py --list                  hero, size
  python3 make-control.py --queue QUEUE.json [CONTROL_DIR]
        non-bulk gpu-queue.py ControlNet queue (kind cn, 2 seeds x scales 0.5 and 0.6 per hero = 4 images);
        CONTROL_DIR (default "controls") is where the PNGs sit on the machine that runs the queue.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

T = 4
MARGIN = 0.06

def quad_legs(xs, top, bot, w=0.035):
    return [[(x - w, top), (x - w * 0.8, bot), (x + w * 0.8, bot), (x + w, top)] for x in xs]

# Each hero: size, list of (kind, pts) and the single head ellipse box (unit coords).
# kinds: "e" ellipse box, "p" closed polygon, "l" open polyline.
def kindrel():  # ember fox
    legs = quad_legs([0.34, 0.42, 0.60, 0.68], 0.60, 0.88)
    shapes = [("e", (0.30, 0.38, 0.72, 0.66)), ("p", [(0.30, 0.50), (0.12, 0.30), (0.08, 0.14), (0.24, 0.22), (0.34, 0.40)]),
              ("e", (0.68, 0.28, 0.86, 0.46)), ("p", [(0.74, 0.28), (0.76, 0.14), (0.82, 0.26)]), ("p", [(0.82, 0.30), (0.88, 0.16), (0.90, 0.32)]),
              ("p", [(0.92, 0.45), (0.86, 0.40), (0.86, 0.50)]), ("l", [(0.60, 0.40), (0.64, 0.30)])] + [("p", p) for p in legs]
    return (1024, 1024), shapes, (0.66, 0.26, 0.88, 0.48)

def brazgor():  # forge boar
    legs = quad_legs([0.26, 0.36, 0.60, 0.70], 0.60, 0.90, 0.045)
    shapes = [("e", (0.18, 0.28, 0.72, 0.70)), ("p", [(0.70, 0.40), (0.84, 0.34), (0.92, 0.50), (0.86, 0.62), (0.70, 0.62)]),
              ("l", [(0.88, 0.58), (0.91, 0.46), (0.88, 0.40)]), ("p", [(0.74, 0.36), (0.76, 0.26), (0.82, 0.34)]),
              ("l", [(0.20, 0.40), (0.10, 0.50)]), ("e", (0.40, 0.42, 0.56, 0.58))] + [("p", p) for p in legs]
    return (1152, 896), shapes, (0.66, 0.32, 0.92, 0.64)

def ouroth():  # coiled wyrm, wide
    body = [(0.08, 0.80), (0.20, 0.62), (0.36, 0.78), (0.50, 0.56), (0.64, 0.74), (0.74, 0.46), (0.80, 0.30)]
    shapes = [("l", body), ("l", [(x, y - 0.07) for x, y in body]), ("p", [(0.78, 0.22), (0.90, 0.18), (0.91, 0.34), (0.80, 0.38)]),
              ("e", (0.84, 0.24, 0.87, 0.28)), ("p", [(0.80, 0.22), (0.84, 0.10), (0.88, 0.20)])]
    return (1344, 768), shapes, (0.78, 0.16, 0.91, 0.38)

def nykra():  # kelpie
    legs = quad_legs([0.28, 0.36, 0.56, 0.64], 0.58, 0.90, 0.03)
    shapes = [("e", (0.22, 0.34, 0.68, 0.66)), ("p", [(0.62, 0.42), (0.72, 0.18), (0.88, 0.22), (0.92, 0.34), (0.82, 0.44), (0.72, 0.52)]),
              ("l", [(0.66, 0.24), (0.60, 0.12), (0.50, 0.22), (0.44, 0.14), (0.36, 0.28)]), ("p", [(0.76, 0.18), (0.78, 0.08), (0.82, 0.18)]),
              ("l", [(0.22, 0.46), (0.10, 0.54), (0.12, 0.70), (0.08, 0.80)])] + [("p", p) for p in legs]
    return (1152, 896), shapes, (0.70, 0.18, 0.92, 0.44)

def glimmaw():  # anglerfish, lure on stalk
    shapes = [("e", (0.32, 0.42, 0.76, 0.78)), ("p", [(0.34, 0.56), (0.12, 0.46), (0.18, 0.62), (0.12, 0.76), (0.36, 0.68)]),
              ("p", [(0.46, 0.44), (0.52, 0.30), (0.62, 0.30), (0.64, 0.44)]), ("p", [(0.50, 0.78), (0.46, 0.90), (0.62, 0.86), (0.64, 0.78)]),
              ("l", [(0.76, 0.60), (0.90, 0.54)]), ("l", [(0.76, 0.66), (0.88, 0.74)]), ("e", (0.62, 0.48, 0.70, 0.56)),
              ("l", [(0.60, 0.43), (0.62, 0.22), (0.72, 0.12), (0.80, 0.14)]), ("e", (0.78, 0.10, 0.88, 0.22))]
    return (1152, 896), shapes, (0.58, 0.40, 0.92, 0.80)

def abyssor():  # kraken: mantle left, head right, tentacles fanned apart
    shapes = [("e", (0.10, 0.14, 0.50, 0.50)), ("e", (0.40, 0.30, 0.72, 0.58)), ("e", (0.56, 0.38, 0.62, 0.44)), ("e", (0.64, 0.38, 0.70, 0.44))]
    for i, y in enumerate([0.60, 0.68, 0.76, 0.84, 0.90]):
        shapes.append(("l", [(0.46 + i * 0.05, 0.56), (0.40 + i * 0.07, y), (0.20 + i * 0.12, min(y + 0.04, 0.92))]))
    shapes.append(("l", [(0.72, 0.46), (0.86, 0.50), (0.92, 0.40)]))
    return (1024, 1024), shapes, (0.40, 0.30, 0.72, 0.58)

def quarrak():  # tortoise-boulder
    legs = quad_legs([0.24, 0.34, 0.58, 0.68], 0.62, 0.88, 0.05)
    shapes = [("e", (0.14, 0.22, 0.74, 0.70)), ("l", [(0.30, 0.30), (0.44, 0.40), (0.60, 0.28)]), ("l", [(0.44, 0.40), (0.44, 0.62)]),
              ("p", [(0.72, 0.44), (0.82, 0.38), (0.92, 0.46), (0.90, 0.58), (0.74, 0.62)]), ("l", [(0.14, 0.60), (0.08, 0.66)])] + [("p", p) for p in legs]
    return (1152, 896), shapes, (0.72, 0.38, 0.92, 0.62)

def durrok():  # tusker, plated
    legs = quad_legs([0.24, 0.34, 0.52, 0.62], 0.58, 0.90, 0.05)
    shapes = [("e", (0.14, 0.22, 0.66, 0.66)), ("e", (0.60, 0.26, 0.82, 0.54)), ("p", [(0.78, 0.46), (0.88, 0.60), (0.90, 0.78), (0.84, 0.80), (0.84, 0.62)]),
              ("l", [(0.80, 0.50), (0.90, 0.52), (0.91, 0.40)]), ("p", [(0.60, 0.30), (0.52, 0.34), (0.54, 0.50), (0.62, 0.44)]),
              ("l", [(0.14, 0.40), (0.08, 0.56)])] + [("p", p) for p in legs]
    return (1152, 896), shapes, (0.60, 0.26, 0.82, 0.54)

def umbrel():  # mushroom: cap, face stem, root legs; tall
    shapes = [("p", [(0.14, 0.40), (0.20, 0.22), (0.50, 0.08), (0.80, 0.22), (0.86, 0.40)]), ("l", [(0.14, 0.40), (0.50, 0.46), (0.86, 0.40)]),
              ("p", [(0.40, 0.46), (0.36, 0.70), (0.64, 0.70), (0.60, 0.46)]), ("e", (0.54, 0.50, 0.64, 0.60)),
              ("l", [(0.40, 0.70), (0.30, 0.82), (0.24, 0.90)]), ("l", [(0.60, 0.70), (0.70, 0.82), (0.78, 0.90)]),
              ("l", [(0.50, 0.70), (0.50, 0.88)])]
    return (896, 1152), shapes, (0.44, 0.44, 0.66, 0.70)

def hyalia():  # jellyfish: bell with the face to the right, filaments apart
    shapes = [("p", [(0.14, 0.42), (0.20, 0.20), (0.50, 0.08), (0.80, 0.20), (0.88, 0.42), (0.50, 0.38)]), ("e", (0.58, 0.22, 0.66, 0.30))]
    for i, x in enumerate([0.22, 0.34, 0.46, 0.58, 0.70, 0.80]):
        shapes.append(("l", [(x, 0.40), (x - 0.04, 0.58), (x + 0.04, 0.72), (x - 0.02, 0.92)]))
    return (896, 1152), shapes, (0.50, 0.08, 0.88, 0.42)

def zephra():  # storm wisp: cloud body, one lobe is the head, lightning
    shapes = [("e", (0.22, 0.38, 0.62, 0.66)), ("e", (0.50, 0.30, 0.74, 0.54)), ("e", (0.36, 0.28, 0.56, 0.46)), ("e", (0.72, 0.36, 0.88, 0.52)),
              ("e", (0.78, 0.40, 0.82, 0.44)), ("l", [(0.30, 0.66), (0.24, 0.78), (0.32, 0.80), (0.22, 0.92)]),
              ("l", [(0.50, 0.66), (0.46, 0.76), (0.54, 0.78), (0.48, 0.90)]), ("l", [(0.22, 0.50), (0.12, 0.46), (0.08, 0.56)])]
    return (1024, 1024), shapes, (0.72, 0.36, 0.88, 0.52)

def vortigal():  # hawk, wings spread up and down clear of the body
    shapes = [("e", (0.34, 0.40, 0.70, 0.60)), ("p", [(0.46, 0.42), (0.30, 0.20), (0.14, 0.10), (0.32, 0.30), (0.50, 0.40)]),
              ("p", [(0.46, 0.58), (0.30, 0.78), (0.14, 0.90), (0.34, 0.70), (0.50, 0.60)]), ("p", [(0.36, 0.46), (0.10, 0.50), (0.08, 0.58), (0.36, 0.56)]),
              ("p", [(0.74, 0.38), (0.84, 0.36), (0.94, 0.46), (0.82, 0.50), (0.74, 0.54)]), ("l", [(0.58, 0.60), (0.58, 0.74), (0.52, 0.78)]),
              ("l", [(0.64, 0.60), (0.66, 0.74), (0.72, 0.78)])]
    return (1344, 768), shapes, (0.70, 0.36, 0.94, 0.54)

HEROES = {f.__name__: f for f in (kindrel, brazgor, ouroth, nykra, glimmaw, abyssor, quarrak, durrok, umbrel, hyalia, zephra, vortigal)}

def render(name):
    (w, h), shapes, head = HEROES[name]()
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    pt = lambda p: (p[0] * w, p[1] * h)
    for kind, g in shapes:
        if kind == "e":
            d.ellipse((g[0] * w, g[1] * h, g[2] * w, g[3] * h), outline=255, width=T)
        elif kind == "p":
            d.polygon([pt(p) for p in g], outline=255, width=T)
        else:
            d.line([pt(p) for p in g], fill=255, width=T, joint="curve")
    return im, head

PROMPTS = {
    "kindrel": "a small fox made of living embers, charred coal body with glowing lava veins, tail of trailing fire and cinders",
    "brazgor": "a hulking forge boar with tusks, body of slag and blackened iron, molten lava seams, glowing furnace chest",
    "ouroth": "a coiled fire wyrm serpent, long legless body of molten lava and black scales, breathing a stream of flame",
    "nykra": "a kelpie water horse, body of dark flowing water and ice, mane of drifting kelp, glowing teal eyes",
    "glimmaw": "a deep blue and teal translucent water anglerfish, glassy body with bubbles, fangs, glowing yellow lure on a stalk",
    "abyssor": "a giant kraken of dark ocean water, long tentacles, glowing teal eyes, foam and barnacled skin",
    "quarrak": "a huge slow stone tortoise, body of mossy boulders and cracked granite, glowing amber crystal veins",
    "durrok": "an armoured tusker beast, long curved tusks, body of living rock plates and earth, glowing violet crystals",
    "umbrel": "a walking fungus creature, mushroom cap body, stubby legs of roots and moss, glowing green spore clouds",
    "hyalia": "a drifting jellyfish of translucent storm mist, glowing bell, long trailing filaments of wind and lightning",
    "zephra": "a small storm wisp, swirling thundercloud creature with crackling lightning and a glowing white-blue core",
    "vortigal": "a raptor hawk made of wind and storm cloud, spread wings of swirling mist and lightning, sharp talons",
}
STYLE = ", one head, full body, floating, no base, no plinth, no ground, plain flat grey background, dark fantasy oil painting"
NEG = ("sculpture, statue, plinth, pedestal, base, ground, floor, frame, text, watermark, cartoon, chibi, cute, 3d render, "
       "human, person, human face, human hands, humanoid, multiple creatures, two heads, collage, blurry, facing left, toy")

def queue(control_dir):
    jobs = []
    for i, (n, f) in enumerate(HEROES.items()):
        (w, h) = f()[0]
        jobs.append({"name": n + "_cn", "kind": "cn", "prompt": PROMPTS[n], "control": f"{control_dir}/{n}_control.png",
                     "seeds": [8100 + i * 10, 8101 + i * 10], "scales": [0.5, 0.6], "cfg": 6.5, "width": w, "height": h})
    return {"style": STYLE, "neg": NEG, "jobs": jobs}

def main(argv):
    if argv and argv[0] == "--queue" and len(argv) in (2, 3):
        Path(argv[1]).write_text(json.dumps(queue(argv[2] if len(argv) == 3 else "controls"), indent=1))
        print("wrote", argv[1])
        return 0
    if argv and argv[0] == "--list":
        for n, f in HEROES.items():
            print(n, "x".join(map(str, f()[0])))
        return 0
    if not argv:
        print(__doc__)
        return 64
    out = Path(argv[0])
    out.mkdir(parents=True, exist_ok=True)
    for n in argv[1:] or HEROES:
        im, _ = render(n)
        im.save(out / f"{n}_control.png")
        print("wrote", out / f"{n}_control.png", im.size)
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
