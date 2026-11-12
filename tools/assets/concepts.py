"""Concept-art batch with SDXL-Turbo (idea exploration only; shipped sprites come from the rig/bake pipeline).

Run: ~/claudetmp/sd/.venv/bin/python tools/assets/concepts.py  (outputs to ~/claudetmp/concepts/, never the repo)
"""
import os, time, torch
from PIL import Image, ImageDraw
from diffusers import AutoPipelineForText2Image

OUT = os.path.expanduser("~/claudetmp/concepts")
SEEDS = [1, 2, 3, 4]
HERO = "full body character concept, single character, front three-quarter view, game art, bold outline, flat shading, plain light background, "
ICON = "game ability icon, single centered symbol, bold shapes, glowing, dark plain background, "
ARENA = "game arena background, top-down three-quarter view, no characters, painterly, "

HEROES = {
 "curomo": "water elemental ice mage, blue robes, frost staff",
 "cyclonius": "evil air sorcerer, storm cloak, swirling wind, purple and grey",
 "echo": "neutral air trickster, translucent cloak, sound waves, silver",
 "fiara": "good fire mage girl, red hat and scarf, torch staff",
 "ishimi": "water slime circus performer, slimy teal, juggling blobs",
 "lavax": "neutral lava brute, molten rock skin, crimson cracks",
 "morblass": "good water knight, icicle armour, frosty blue",
 "pax": "evil earth giant, heavy stone armour, brooding, brown and black",
 "rokcore": "good earth golem, rock plates, mossy, gentle eyes",
 "sindarosa": "evil fire sorceress, black and orange dress, flame wisps",
 "treenoc": "neutral tree spirit, bark body, vines, leaf crown",
 "wispera": "good air wisp healer, pale ghostly dress, floating light",
 # new hero ideas (one per gap in the roster)
 "NEW-voltik": "new hero, lightning duelist, yellow and navy, crackling electric whip, fast",
 "NEW-sandra": "new hero, desert sand witch, tan veils, swirling sandstorm, earth and air",
 "NEW-tidebreaker": "new hero, heavy water bruiser, barnacle shell armour, anchor hammer",
 "NEW-emberfox": "new hero, small fire fox spirit, nine flame tails, agile",
 "NEW-glacivor": "new hero, ice wolf beast, frost fur, glowing blue eyes",
 "NEW-mossling": "new hero, tiny moss healer, mushroom hat, soft green and pink",
}
ABILITIES = {
 "snag": "glowing rope net thrown, twisted vine rope loop",
 "fireball": "blazing fireball with a tail",
 "ice-shards": "cluster of sharp ice shards",
 "tornado": "small swirling tornado",
 "rock-armour": "stone plate shield wrapping a body",
 "heal": "green glowing cross of light with leaves",
 "dash": "speed streak slash, motion lines",
 "guard-parry": "round shield with a spark flash",
 "super-burst": "starburst explosion with gold rays",
 "NEW-chain-lightning": "chain of lightning arcs between orbs",
 "NEW-sand-trap": "swirling sand pit with spikes",
 "NEW-mirror-image": "two overlapping ghost silhouettes",
 "NEW-geyser": "water geyser erupting from cracked ground",
 "NEW-spore-cloud": "toxic purple spore cloud with mushrooms",
}
ARENAS = {
 "forest": "mossy forest clearing, stone ring, grass",
 "volcano": "volcanic crater floor, lava cracks, ash",
 "glacier": "frozen lake arena, ice cracks, snow",
 "sky-temple": "floating temple platform among clouds, wind",
 "desert-ruins": "desert ruins arena, sand, broken pillars",
 "swamp": "misty swamp boardwalk arena, glowing mushrooms",
}

def main():
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16").to(dev)
    for cat, prefix, table in (("heroes", HERO, HEROES), ("abilities", ICON, ABILITIES), ("arenas", ARENA, ARENAS)):
        os.makedirs(f"{OUT}/{cat}", exist_ok=True)
        thumbs = []
        for name, desc in table.items():
            row = []
            for s in SEEDS:
                t = time.time()
                im = pipe(prefix + desc, num_inference_steps=4, guidance_scale=0.0, height=512, width=512,
                          generator=torch.Generator("cpu").manual_seed(s)).images[0]
                im.save(f"{OUT}/{cat}/{name}_{s}.png")
                row.append(im.resize((192, 192)))
                print(cat, name, s, round(time.time() - t, 1), flush=True)
            thumbs.append((name, row))
        sheet = Image.new("RGB", (4 * 192 + 150, len(thumbs) * 192), "white")
        d = ImageDraw.Draw(sheet)
        for r, (name, row) in enumerate(thumbs):
            d.text((6, r * 192 + 90), name, fill="black")
            for c, im in enumerate(row):
                sheet.paste(im, (150 + c * 192, r * 192))
        sheet.save(f"{OUT}/{cat}-sheet.png")

main()
