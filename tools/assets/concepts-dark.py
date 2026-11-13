"""Dark-fantasy hero concept batch with SDXL-Turbo (idea exploration only; shipped sprites come from the rig/bake pipeline).

Same roster as concepts.py, but the style words ask for a grim, smooth, painterly, powerful elemental look instead of
"bold outline, flat shading" (the old prefix, which produced the cartoony concepts). SDXL-Turbo ignores negative prompts
(guidance 0), so everything is said positively. Generates at 512 and upscales 2x with Lanczos for smooth edges.

Run: ~/claudetmp/sd/.venv/bin/python tools/assets/concepts-dark.py [hero ...]  (outputs to ~/claudetmp/concepts-elemental/, never the repo)
"""
import os, sys, time, torch
from PIL import Image, ImageDraw
from diffusers import AutoPipelineForText2Image

OUT = os.path.expanduser(os.environ.get("CONCEPT_OUT", "~/claudetmp/concepts-elemental"))
SEEDS = [1, 2, 3, 4]
# CLIP reads only 77 tokens: the hero description goes FIRST and the style suffix stays short, or the hero is cut off.
STYLE = ", full body dark fantasy concept art, not a human, smooth painterly, muted desaturated, dramatic dark lighting, misty dark background"
# Three heroes per element (src/core/data/characters.ts): one palette per element so each trio reads as a family.
ELEMENT = {"water": "deep teal and glacial blue palette", "air": "dark storm cloud grey and cold white palette",
           "fire": "charcoal black and ember orange palette", "earth": "dark ochre stone brown and dull olive palette"}
KIND = {"curomo": "water", "ishimi": "water", "morblass": "water", "cyclonius": "air", "echo": "air", "wispera": "air",
        "fiara": "fire", "lavax": "fire", "sindarosa": "fire", "pax": "earth", "rokcore": "earth", "treenoc": "earth"}
HEROES = {
 "curomo": "water elemental, a serpentine torrent of dark water and ice shards, crest of frozen spikes, two cold glowing eyes, no limbs",
 "ishimi": "water elemental, hunched mass of dripping murky slime and tendrils, many glowing eyes sunk in the liquid",
 "morblass": "water elemental, towering glacier beast of jagged blue ice and icicles, frost mist, eyes frozen inside the ice",
 "cyclonius": "air elemental monster, a giant tornado made only of black storm cloud and lightning, a funnel of wind, two blazing white eyes, no person, no body",
 "echo": "air elemental monster, a hollow spinning cyclone of translucent wind rings and sound ripples, empty inside, faint glowing core, no person, no face",
 "wispera": "air elemental monster, a drifting cloud of pale mist and glowing motes with tattered vapour tails, one cold glow, no person, no clothes",
 "fiara": "fire elemental, hulking body of living flame and glowing coals, cracked black crust over molten fire, embers rising",
 "lavax": "fire elemental, towering beast of black obsidian with rivers of molten magma in the cracks, smoke rising",
 "sindarosa": "fire elemental, horned creature of charred black rock and roaring flame, crown of fire, ash swirling",
 "pax": "earth elemental colossus, enormous body of dark granite boulders, ember cracks and glowing ember eyes, terrifying",
 "rokcore": "earth elemental golem, body of ancient rock plates and moss, glowing amber core in the chest, massive",
 "treenoc": "earth elemental, gnarled ancient tree beast of living bark and twisted roots, thorned vines, hollow green glow",
}

def main():
    names = sys.argv[1:] or list(HEROES)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16").to(dev)
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for name in names:
        row = []
        for s in SEEDS:
            t = time.time()
            im = pipe(HEROES[name] + ", " + ELEMENT[KIND[name]] + STYLE, num_inference_steps=4, guidance_scale=0.0, height=512, width=512,
                      generator=torch.Generator("cpu").manual_seed(s)).images[0]
            im = im.resize((1024, 1024), Image.LANCZOS)
            im.save(f"{OUT}/{name}_{s}.png")
            row.append(im.resize((256, 256), Image.LANCZOS))
            print(name, s, round(time.time() - t, 1), flush=True)
        rows.append((name, row))
    sheet = Image.new("RGB", (4 * 256 + 110, len(rows) * 256), "black")
    d = ImageDraw.Draw(sheet)
    for r, (name, row) in enumerate(rows):
        d.text((6, r * 256 + 120), name, fill="white")
        for c, im in enumerate(row):
            sheet.paste(im, (110 + c * 256, r * 256))
    sheet.save(f"{OUT}/heroes-sheet.png")
    print("done")

main()
