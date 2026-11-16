"""roster24 hero concept re-rolls with SDXL-Turbo (idea exploration; chosen picks are cut out by cut-hero.py).
Run: ~/claudetmp/sd/.venv/bin/python tools/assets/roster24-art/gen-candidates.py [--round e] [hero ...]
Round d (default, 2026-11-16) -> ~/claudetmp/concepts-new12d/<hero>_<n>.png; round e (--round e) is the second re-roll for
quarrak/vortigal/durrok with stricter prompts (no rubble, wings small inside frame, no signature) -> concepts-new12e."""
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
SIZE = (1024, 1024)
if RND == "g":  # wide 1536x768 canvas so a full wingspan fits with margin (Vortigal)
    SIZE = (1536, 768)
    H = {"vortigal": "a majestic bald eagle gliding with wings fully spread, seen from the front and slightly below, wingspan small relative to the wide canvas, large empty sky on the left and right of the wing tips, brown feathers"}
    STYLE = STYLE.replace("centered with wide empty margin on all sides", "centered with very wide empty margin left and right").replace("plain flat dark grey background", "plain flat pale grey sky background, no frame, no border")
NEG = "cartoon, chibi, cute, anime, 3d render, human, person, text, watermark, signature, border, cropped, cut off, multiple creatures, two heads, extra legs, water splash, fire on ground, rocks, rubble, blurry"
pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16").to("mps")
for h, p in H.items():
    if args and h not in args: continue
    for i in range(1, 13):
        im = pipe(p + STYLE, negative_prompt=NEG, num_inference_steps=4, guidance_scale=0.0, height=SIZE[1], width=SIZE[0],
                  generator=torch.Generator("cpu").manual_seed(({"e": 9000, "f": 12000}.get(RND, 7000)) + i * ({"e": 37, "f": 41}.get(RND, 31)) + len(h))).images[0]
        im.save(f"{OUT}/{h}_{i}.png"); print(h, i, flush=True)
