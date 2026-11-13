"""Dark-fantasy hero concept batch with SDXL-Turbo (idea exploration only; shipped sprites come from the rig/bake pipeline).

Same roster as concepts.py, but the style words ask for a grim, smooth, painterly, powerful elemental look instead of
"bold outline, flat shading" (the old prefix, which produced the cartoony concepts). SDXL-Turbo ignores negative prompts
(guidance 0), so everything is said positively. Generates at 512 and upscales 2x with Lanczos for smooth edges.

Run: ~/claudetmp/sd/.venv/bin/python tools/assets/concepts-dark.py [hero ...]  (outputs to ~/claudetmp/concepts-elemental/, never the repo)
"""
import os, sys, time, torch
from PIL import Image, ImageDraw
from diffusers import AutoPipelineForText2Image

OUT = os.path.expanduser("~/claudetmp/concepts-elemental")
SEEDS = [1, 2, 3, 4]
# CLIP reads only 77 tokens: the hero description goes FIRST and the style suffix stays short, or the hero is cut off.
STYLE = ", full body dark fantasy concept art, not a human, smooth painterly, muted desaturated, dramatic dark lighting, misty dark background"
HEROES = {
 "curomo": "water elemental, body of living ice and flowing dark water, frozen crystal shards for limbs, glowing cold blue core, sea mist swirling around it",
 "cyclonius": "storm elemental, body of churning thunderclouds and violent wind, crackling violet lightning for veins, a vortex where the legs would be, glowing white eyes",
 "echo": "air elemental, translucent body of shimmering air and rippling sound waves, faint silver outline, a swirl of wind, ghostly and weightless",
 "fiara": "fire elemental, humanoid body of living flame and glowing coals, charred cracked black crust over molten orange fire, embers streaming upward, burning hair of flames",
 "ishimi": "water elemental, body of murky dark teal liquid, gelatinous and dripping, eerie glowing eyes inside a rippling translucent form",
 "lavax": "lava elemental, hulking body of cooling black obsidian with rivers of molten crimson magma in the cracks, smoke rising, towering and heavy",
 "morblass": "ice elemental, towering body of glacial blue ice and jagged icicles, frost mist pouring off it, cold glowing eyes frozen inside the ice",
 "pax": "earth elemental colossus, enormous body of dark purple granite boulders, ember-orange cracks and glowing ember eyes, brooding, terrifying, ancient",
 "rokcore": "earth elemental golem, body of ancient rock plates and moss, glowing amber core in the chest, immovable and massive",
 "sindarosa": "fire elemental, slender body of black charred rock and roaring flame, a crown of fire, embers and ash swirling, menacing and graceful",
 "treenoc": "nature elemental, body of gnarled living bark and twisted roots, thorned vines for arms, hollow glowing green eyes, ancient",
 "wispera": "air elemental, ethereal body of pale mist and cold light, no real legs, trailing wisps of wind and glowing motes, sorrowful and eerie",
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
            im = pipe(HEROES[name] + STYLE, num_inference_steps=4, guidance_scale=0.0, height=512, width=512,
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
