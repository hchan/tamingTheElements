"""roster24 hero concept rolls with SDXL-Turbo (idea exploration; chosen picks are cut out by cut-hero.py).
Run: ~/claudetmp/sd/.venv/bin/python tools/assets/roster24-art/gen-candidates.py [--round R] [hero ...]   (env N = candidates per hero, default 12)
Rounds: d (default) and e/f re-rolls of early picks, g (wide Vortigal canvas), then h..n (round 5 series: the element is the body
material, facing right; i-n re-roll single heroes with stronger prompts). Output: ~/claudetmp/concepts-new12<round>/<hero>_<n>.png
(skips files that exist). See recipes.md. Licence of SDXL-Turbo output: open owner question, docs/ART-REFERENCES.md."""
import os, sys, torch
os.environ["HF_HUB_OFFLINE"] = "1"
from diffusers import AutoPipelineForText2Image
args = sys.argv[1:]; RND = "d"
if "--round" in args: i = args.index("--round"); RND = args[i + 1]; del args[i:i + 2]
OUT = os.path.expanduser("~/claudetmp/concepts-new12" + RND); os.makedirs(OUT, exist_ok=True)
STYLE = ", full body, side view, grimdark medieval fantasy oil painting, rich textured brushwork, plain flat dark grey background, empty background, one single creature, exactly one head, anatomically correct, centered with wide empty margin on all sides, no ground, no text, no signature"
H = {
 "vortigal": "a small eagle seen far away, tiny in the middle of the frame, both wings fully spread and entirely visible with wing tips well inside the image, body of storm wind and brown feathers, hooked beak, sharp talons",
 "nykra": "a kelpie water horse standing on a plain flat dark floor, four legs, body of dark flowing water and ice, mane of drifting kelp, glowing teal eyes, no splash, no puddle, no waves",
 "brazgor": "a hulking forge boar standing in profile, exactly four legs, two tusks, two horns, body of slag and blackened iron, molten lava seams, no fire on the ground",
 "quarrak": "a stocky tortoise-like stone beast in profile, exactly four short thick legs, one single head, one single shell, body of mossy boulders and cracked granite, glowing amber crystal veins",
}
if RND == "e":
    H = {
     "umbrel": "a tall towering fungus guardian, a single tall mushroom creature with a long thick stalk body, a wide glowing toxic green cap on top, two glowing eyes under the cap, small root legs, spores drifting, standing on a perfectly flat empty floor, vertical composition, tall and narrow",
     "kindrel": "a fox made of cooling lava rock and ember glow, standing in profile, exactly four slim legs, one head, one bushy flame tail, solid smooth basalt body with thin glowing orange cracks, no holes, no lattice, standing on a perfectly flat empty floor, no rubble, no fire on the ground",
     "vortigal": "a majestic eagle gliding with wings fully spread in a gentle V, seen from the side, very small in the center of a huge empty frame, entire wingspan visible with large empty space left and right of the wing tips, brown feathers with faint storm cloud wisps",
     "quarrak": "a giant tortoise made of granite, standing in profile on four thick pillar legs, one head, one domed stone shell with amber crystal veins, nothing else, no rocks, no gems, no rubble, standing on a perfectly flat empty floor",
     "durrok": "a mighty purple armoured elephant in profile, four legs, one head, two long ivory tusks, cracked plated hide, standing on a perfectly flat empty dark grey floor, no rocks, no shadow, no signature, no text",
    }
if RND == "f":  # third re-roll: kindrel/quarrak with a bare flat floor so the gaps between legs cut cleanly
    H = {
     "kindrel": "a slender fox made of black basalt with glowing orange crack veins, standing in profile, exactly four thin legs, one head, one tail, standing on a bare flat empty grey floor, plain grey wall behind, no fire, no embers, no rubble",
     "quarrak": "a granite tortoise standing in profile, exactly four thick legs, one head, one domed shell, bare flat empty grey floor, plain grey wall behind, no pebbles, no sand, no rubble",
    }
if RND == "h":  # round 5 (owner: must read as ELEMENTAL, face right): element is the body material, flat backdrop
    # CLIP truncates at 77 tokens, so subject + short style must stay small
    STYLE = ", facing right, side view, full body, oil painting, plain flat dark grey background, one head"
    H = {
     "kindrel": "a fox made of living flame, fur of fire and embers, lava cracks, huge burning flame tail, four legs",
     "brazgor": "a bull made of molten lava and black volcanic rock, glowing magma cracks, flames on horns, four legs",
     "ouroth": "a coiled serpent made of fire, body of flame and magma scales, burning eyes, embers",
     "nykra": "a horse made of translucent flowing water, blue waves and ice crystals, glowing teal, mane of water, four legs",
     "glimmaw": "an anglerfish made of translucent water and ice, glowing bioluminescent lure, ice teeth",
     "abyssor": "a giant octopus made of translucent blue water, wave tentacles, bioluminescent glow, foam",
     "quarrak": "a tortoise made of rock, shell of cracked boulders with moss and green crystals, four thick legs",
     "durrok": "an elephant made of rocky stone hide, boulder skin, moss on back, crystal tusks, four pillar legs, trunk",
     "umbrel": "a tall mushroom guardian of earth, stalk of rock and roots with moss, stone cap with glowing crystals, tall narrow",
     "hyalia": "a jellyfish made of storm cloud and wind, translucent wispy bell, lightning inside, trailing wind tentacles",
     "zephra": "a spiky beast made of wind and storm cloud, translucent wispy body, swirling air, lightning, four legs",
     "vortigal": "an eagle made of storm cloud and lightning, wings of swirling wind and electricity, wings spread in a V, small in wide frame",
    }
    SIZE_BY = {"vortigal": (1536, 768)}
if RND == "i":  # round 5b: stronger rock body for the elephant (round h read as a plain grey elephant)
    STYLE = ", facing right, side view, full body, oil painting, plain flat dark grey background"
    H = {"durrok": "a living stone elephant golem, body of cracked grey granite boulders and rock plates, glowing green crystals growing from its back, moss, two stone tusks, four thick legs, one head and trunk"}
    SIZE_BY = {}
if RND == "j":  # round 5c: stronger element bodies where round h still read as a plain animal
    STYLE = ", facing right, side view, full body, oil painting, plain flat dark background"
    H = {
     "zephra": "a spiky beast made of swirling white wind and blue storm cloud, crackling lightning bolts, glowing cyan eyes, translucent misty body, four legs",
     "quarrak": "a stone golem tortoise, body of cracked grey granite boulders, glowing amber crystals growing from the shell, moss, four thick stone legs, one head",
    }
    SIZE_BY = {}
if RND == "k":  # round 5d: air heroes that round h drew as plain animals (no wind/lightning)
    STYLE = ", facing right, side view, oil painting, plain flat dark blue-grey background"
    H = {
     "hyalia": "a glowing cyan electric jellyfish made of swirling white wind and storm cloud, lightning bolts crackling inside the bell, wispy translucent wind tentacles",
     "vortigal": "an eagle made of storm cloud, wings of swirling white wind and bright lightning bolts, glowing cyan eyes, wings spread in a V, small in wide frame",
    }
    SIZE_BY = {"vortigal": (1536, 768)}
if RND == "l":  # round 5e: quarrak with a mountain-of-rock shell (round h/j still read as a real tortoise)
    STYLE = ", facing right, side view, oil painting, plain flat dark grey background, no grass"
    H = {
     "quarrak": "a colossal turtle monster, its shell a jagged mountain of grey rock slabs with a cluster of glowing blue crystals on top, skin of rough cracked stone, rock legs, glowing eyes",
    }
    SIZE_BY = {}
if RND == "m":  # round 5f: hyalia as a literal storm cloud (round k gave a plain cyan jellyfish)
    STYLE = ", facing right, side view, oil painting, plain flat dark purple-grey background"
    H = {
     "hyalia": "a floating storm cloud shaped like a jellyfish, the bell is a billowing grey cumulonimbus cloud with white lightning flashing inside, tentacles are long wisps of wind and rain streaks, no animal skin",
    }
    SIZE_BY = {}
if RND == "n":  # round 5g: no animal word for hyalia (storm cloud only); quarrak as living rock (seeds use the default formula)
    STYLE = ", facing right, side view, oil painting, plain flat dark grey background"
    H = {
     "hyalia": "a drifting cumulonimbus storm cloud with white lightning inside and long hanging wisps of wind and rain, grey and cyan",
     "quarrak": "a huge stone beast with a boulder shell of grey rock and glowing blue crystals, four thick legs of cracked granite, small head",
    }
    SIZE_BY = {}
SIZE = (1024, 1024)
if RND == "g":  # wide 1536x768 canvas so a full wingspan fits with margin (Vortigal)
    SIZE = (1536, 768)
    H = {"vortigal": "a majestic bald eagle gliding with wings fully spread, seen from the front and slightly below, wingspan small relative to the wide canvas, large empty sky on the left and right of the wing tips, brown feathers"}
    STYLE = STYLE.replace("centered with wide empty margin on all sides", "centered with very wide empty margin left and right").replace("plain flat dark grey background", "plain flat pale grey sky background, no frame, no border")
NEG = "cartoon, chibi, cute, anime, 3d render, human, person, text, watermark, signature, border, cropped, cut off, multiple creatures, two heads, extra legs, water splash, fire on ground, rocks, rubble, blurry"
if RND in ("h", "i", "j", "k", "l", "m"): NEG = NEG.replace(", water splash, fire on ground, rocks, rubble", ", fire on the ground, ground, floor")
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16").to("mps")
ORDER = ["durrok", "quarrak", "brazgor", "zephra", "kindrel", "nykra", "hyalia", "ouroth", "glimmaw", "abyssor", "vortigal", "umbrel"]
for h, p in sorted(H.items(), key=lambda kv: ORDER.index(kv[0]) if RND in ("h", "i", "j", "k", "l", "m") else 0):
    if args and h not in args: continue
    for i in range(1, int(os.environ.get("N", 12)) + 1):
        if os.path.exists(f"{OUT}/{h}_{i}.png"): continue
        im = pipe(p + STYLE, negative_prompt=NEG, num_inference_steps=4, guidance_scale=0.0, height=(SIZE_BY.get(h, SIZE)[1] if RND in ("h", "i", "j", "k", "l", "m") else SIZE[1]), width=(SIZE_BY.get(h, SIZE)[0] if RND in ("h", "i", "j", "k", "l", "m") else SIZE[0]),
                  generator=torch.Generator("cpu").manual_seed(({"e": 9000, "f": 12000, "h": 15000, "i": 21000, "j": 27000, "k": 33000, "l": 39000, "m": 45000}.get(RND, 7000)) + i * ({"e": 37, "f": 41, "h": 43, "i": 47, "j": 53, "k": 59, "l": 61, "m": 67}.get(RND, 31)) + len(h))).images[0]
        im.save(f"{OUT}/{h}_{i}.png"); print(h, i, flush=True)
