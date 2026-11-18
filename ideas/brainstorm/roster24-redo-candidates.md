---
status: idea
added: 2026-11-17
---

# Roster-24 redo: concept candidates, round GPU-1 (2026-11-17)

Gate G0 is still open: nothing here is approved, rigged or released. Candidates only; no src, assets, sim data or RELEASED_CHARACTERS touched. Related: [roster24-art-redo](roster24-art-redo.md), [hero-rigs](hero-rigs.md).

## Method

- RTX 4060 PC (WSL2, existing venv, models already cached from the earlier bake-off). SDXL base 1.0, fp16, model CPU offload, Euler default scheduler, 28 steps, CFG 6.5, 1024x1024, real negative prompt.
- Why SDXL base and not Turbo/Lightning: the earlier bake-off showed base obeys the negative prompt and plain light backgrounds best; Turbo/Lightning are 4 to 8x faster but darker and muddier. The originals (Fiara, Lavax, Curomo, Rokcore...) are bright, saturated, clean illustrations on a flat ground, so the style tail asks for bright colours, visible paint texture, side view facing right, pale grey background.
- 4 candidates per hero, seed = 4000 + n*23 + len(hero), n = 1..4.
- Timings: model load 6.3 s, 48 images, median 18.3 s per image (first 27 s), 908 s total. Scratch stayed on the PC; only the 48 PNGs and meta.json were copied back to the worktree `.scratch/` (gitignored).
- Generator: `.scratch/gen2.py`, sheet builder `.scratch/sheets.py` (scratch only; promote to `tools/assets/roster24-art/` if a pick is ever used).

Shared tail: `, fantasy creature concept art, bright saturated colours, painted with visible texture, clean bold silhouette, full body, side view facing right, plain pale grey background`

Negative: `dark, murky, black background, night, scenery, ground, floor, shadow, splash, puddle, frame, border, text, signature, watermark, cartoon, chibi, cute, 3d render, plastic, human, person, rider, multiple creatures, two heads, extra limbs, cropped, blurry`

## Subject prompts (prepended to the tail)

- kindrel (fire): a small fox made of living flame, fur of orange fire and glowing embers, lava cracks, one big flame tail, four legs, one head
- brazgor (fire): a huge bull-boar made of molten lava and black volcanic rock, glowing magma cracks, flaming horns, two tusks, four thick legs, one head
- ouroth (fire): a coiled fire serpent dragon, body of flame and magma scales, burning eyes, embers, one head
- nykra (water): a horse made of translucent flowing blue water, ice crystals, glowing teal eyes, mane of waves, four legs, one head
- glimmaw (water): an anglerfish made of translucent water and ice, big fanged jaws, glowing blue bioluminescent lure, fins of waves
- abyssor (water): a giant octopus kraken made of translucent deep blue water, wave tentacles, glowing eyes, foam
- quarrak (earth): a stone golem tortoise, shell of cracked grey boulders with glowing amber crystals and moss, four thick rock legs, one head
- durrok (earth): a living stone elephant, hide of cracked boulders and rock plates, glowing green crystals on its back, moss, stone tusks, four pillar legs, trunk
- umbrel (earth): a tall mushroom guardian of earth, stalk of rock and roots with moss, wide cap with glowing green crystals, tall and narrow
- hyalia (air): a floating storm cloud creature, billowing grey cloud bell with lightning inside, long tentacles of wind and rain, glowing cyan
- zephra (air): a spiky beast made of swirling white wind and blue storm cloud, crackling lightning, glowing cyan eyes, translucent misty body, four legs
- vortigal (air): an eagle made of storm cloud and lightning, wings of swirling wind and electricity spread in a V, glowing cyan eyes, hooked beak

Seeds (n=1..4): kindrel 4030/4053/4076/4099, brazgor 4030/... same formula with len(hero): add len(hero) to 4000+n*23 (len: kindrel 7, brazgor 7, ouroth 6, nykra 5, glimmaw 7, abyssor 7, quarrak 7, durrok 6, umbrel 6, hyalia 6, zephra 6, vortigal 8). Exact per-image seeds and times are in meta.json on the scratch copy.

## Sheets (worktree `.scratch/`, absolute paths in the final report)

`sheet-fire.png`, `sheet-water.png`, `sheet-earth.png`, `sheet-air.png` (3 heroes x 4 candidates, element original in the left column at the same row) and `sheet-overview.png` (all 12). The left column is an element original for orientation, not a like-for-like pair; the overlapping small label there is cosmetic.

## Self-assessment (not an owner verdict)

- Better than the scrapped set: bright, painted, distinct silhouettes (fox, boar, dragon, horse, fish, octopus, tortoise, elephant, mushroom, jellyfish, wolf-beast, eagle), clean flat backgrounds that should cut out easily, mostly one head and correct limbs.
- Weak: water heroes (Nykra, Glimmaw, Abyssor) read as coloured animals, not made of water; Quarrak is a real tortoise with orange shell; Kindrel_3 is a pattern sheet of several foxes; Vortigal is a plain feathered eagle, not storm; Hyalia_2/4 drift to octopus/beast. Originals are more elemental and more stylised.
- Follow-ups if the owner wants more: stronger material prompts for water/air, a second round on the weak heroes, img2img from the owner's pick, then cut-out and rig only after G0.

## Round 2 (2026-11-17, weak heroes only; coordinator relayed the owner's delegation)

Method: same pipeline (SDXL base, 28 steps, CFG 6.5, 1024x1024, model CPU offload, same style tail and base negative plus `, collage, pattern, several`), stronger material prompts and a per-hero extra negative. Seeds = 5000 + n*29 + len(hero). 40 images: 8 each for Nykra, Glimmaw, Abyssor, 4 each for Quarrak, Vortigal, Hyalia, Kindrel.

Timing and memory (for the 4060 vs Mac bake-off): load 6.5 s, 40 images in 773 s, median 18.5 s per image (range 18.1 to 24.5), per-image peak torch allocated 5334 MB, peak reserved 7482 MB (8 GB card, offload on). The nvidia-smi sample taken after each image reads 195 MB because offload has parked the weights on the CPU, so use the torch peaks. Round 1 had the same 18.3 s median. No GPU process was left running afterwards.

Subjects (tail as round 1; extra negative after the semicolon):
- nykra: a horse sculpted entirely of flowing transparent water, see-through glass-like body, bubbles and refraction inside, foam mane, glowing teal eyes, four legs; fur, skin, opaque, solid white horse, muscles
- glimmaw: a translucent water anglerfish, see-through jelly body full of bubbles, refracting light, big fanged jaws, glowing blue lure; scales, opaque, orange, red, solid fish skin
- abyssor: a giant octopus made entirely of flowing transparent water, see-through body, bubbles inside, tentacles of curling waves, glowing eyes; skin, suckers, opaque, orange, red, purple
- quarrak: a four-legged rock beast, body of stacked grey boulders and granite slabs, jagged stone back with glowing blue crystals, boulder head, glowing eyes; tortoise, turtle, shell, scales, skin, grass
- vortigal: a bird made of dark storm cloud, body of swirling grey cloud, wings of wind swirls and crackling lightning bolts, glowing cyan eyes, wings spread; feathers, bald eagle, white head, realistic bird
- hyalia: one single jellyfish of billowing storm cloud, dome bell of grey cloud with lightning inside, long wispy wind tentacles hanging down, glowing cyan; octopus, beast, legs, animal, eyes, face
- kindrel: one single fox made entirely of fire, body of orange flame, burning fur, glowing ember eyes, flaming tail, four legs; fur texture, realistic fox, grey, white

Sheets: `sheet2-fire.png`, `sheet2-water.png`, `sheet2-earth.png`, `sheet2-air.png`, `sheet2-best12.png` (best of round 1 and 2 per hero), in the worktree `.scratch/` and copied to `~/claudetmp/roster24-redo-gpu/`.

Best-12 picks and reasons (my pick, not an owner verdict): kindrel r2_3 (one fox, flame fur, no pattern sheet); brazgor r1_3 (lava seams, flaming back); ouroth r1_4 (bold dragon silhouette); nykra r2_8 (glass body, faces right); glimmaw r2_1 (translucent, faces right, but lost the fangs and lure); abyssor r2_1 (translucent teal bell, tentacles still partly orange); quarrak r2_4 (rock beast with crystals, no shell); durrok r1_1 (stone-plated elephant, green crystals); umbrel r1_1 (tall mushroom on roots); hyalia r2_3 (one clean cloud-teal jellyfish, puff at the base to cut off); zephra r1_2 (spiky wind wolf, faces left); vortigal r2_2 (storm-wisp bird, most elemental, faces left, no feet).

Honest read: Nykra, Quarrak, Kindrel and Hyalia are real improvements. Glimmaw and Abyssor are translucent now but colourful (orange, pink) and the anglerfish read is weaker; the negatives for orange were ignored, so a round 3 should name the colour ("deep blue and teal") and use img2img or a LoRA-free colour cue. Vortigal is now storm-bodied but airy and ragged, which will be hard to cut cleanly. Several picks face left (zephra, vortigal, glimmaw tail) and would be flipped at cut time. Still no owner approval: G0 is open.
