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

## Round 3 (2026-11-17, Glimmaw, Abyssor, Vortigal, plus 4 Nykra; coordinator relayed the owner's delegation)

Method: same pipeline (SDXL base, 28 steps, CFG 6.5, 1024x1024, model CPU offload, same style tail and base negative). Colours are now named in the subject, not excluded by negative, and "facing right" is in the subject as well as the tail. Seeds = 6000 + n*31 + len(hero). 28 images: 8 each for Glimmaw, Abyssor, Vortigal, 4 for Nykra. A GPU temperature check ran before each image with a stop at 83C.

Timing and memory (bake-off numbers): load 4.6 s, 28 images in 611 s, median 18.95 s per image (min 18.3, one outlier 59.4 s, probably a stall), peak torch allocated 5334 MB, reserved 7482 MB, GPU temperature at most 50C. No gen process left running (checked with ps).

Subjects (extra negative after the semicolon):
- glimmaw: a deep blue and teal translucent water anglerfish facing right, see-through glassy blue body with bubbles, open mouth with sharp white fangs, a glowing yellow lure on a stalk, fins; orange, red, pink, scales, opaque fish skin, facing left
- abyssor: a giant octopus facing right, body of deep blue and teal translucent flowing water, see-through glassy head with bubbles inside, eight thick curling tentacles of water waves, glowing white eyes; orange, red, pink, purple, skin, suckers, opaque, facing left
- vortigal: a solid grey and white storm-cloud eagle facing right, body of puffy cumulus cloud with feather-shaped cloud wings, yellow lightning along the wings, strong yellow talons and feet, sharp beak, glowing cyan eyes; wispy, ragged, transparent, no feet, facing left, realistic bird, bald eagle
- nykra: a horse facing right in profile, entire body of deep blue and teal flowing transparent water, glass-like see-through, bubbles inside, white foam mane, glowing teal eyes, four legs; fur, skin, opaque, white horse, muscles, facing left

Sheets: `sheet3-water.png` (Nykra, Glimmaw, Abyssor), `sheet3-air.png` (Vortigal), `sheet3-best12.png` (best of all rounds), in `.scratch/` and copied to `~/claudetmp/roster24-redo-gpu/`.

New picks (mine, not an owner verdict): nykra r3_1 (rearing, right-facing, glassy teal; mane wisps and ground mist need cleaning), glimmaw r3_2 (right-facing, blue-teal translucent, fangs; the lure is missing and it reads as a fish, not an anglerfish), abyssor r3_4 (symmetric teal octopus, clean silhouette, no orange; looks skin-like more than water), vortigal r3_4 (solid right-facing eagle with feet and talons, cuts cleanly, but reads as a white eagle rather than cloud).

Honest read: colour naming worked, since orange and pink are gone for all three. It did not fix the material: Abyssor and Glimmaw are blue animals, not bodies of water, and Vortigal is a normal eagle with a cyan and yellow accent. Naming the animal and naming the material pull against each other; a real elemental look probably needs img2img from a pick or a LoRA. Glimmaw never produced a lure. Still no owner approval: G0 is open.

## Round 4 (2026-11-17, water and storm heroes, img2img; concept art only, G0 still open)

Method: SDXL base img2img (`StableDiffusionXLImg2ImgPipeline`), 28 steps, CFG 6.5, 1024x1024, model CPU offload, from the round-3 best12 pick of each hero. Preflight was clean (no sd-bench or e2e, WSL free RAM 20 GB, GPU 35 C, 0 MiB used). 24 images: per hero 4 seeds (7000 + n*37 + len(hero)), each with its own strength 0.45 / 0.52 / 0.58 / 0.65 for n = 1..4. Style tail: grim textured fantasy concept art, painted, bold clean silhouette, full body, side view facing right, plain pale grey background. Subjects name the material, not just the animal (WATER = flowing water body with foam and currents, see-through rippling water, white foam crests, bubbles; STORM = wisps of storm cloud and lightning forming the body, churning grey cloud, crackling lightning bolts). Extra negatives after the semicolon. Sources: nykra redo4 nykra_1, glimmaw redo4 glimmaw_2, abyssor redo4 abyssor_4, hyalia redo3 hyalia_3, zephra redo2 zephra_2, vortigal redo4 vortigal_4 (PC `~/tte-gpu`; directories are numbered one above the round: redo4 = round 3).

Subjects:
- nykra: a horse shaped from a rushing wave, WATER, flowing water mane; fur, skin, opaque, solid, glossy, plastic
- glimmaw: an anglerfish made of churning sea water, WATER, fangs of foam, glowing lure on a stalk; fish scales, opaque skin, solid, plastic
- abyssor: a giant octopus whose body and tentacles are swirling ocean water, WATER; skin, suckers, opaque, solid, plastic
- hyalia: a jellyfish formed of dark storm cloud, STORM, cloud tentacles trailing rain; glossy, solid, plastic, smooth dome
- zephra: a spiky wolf beast formed of storm cloud and wind, STORM; fur, solid, opaque, realistic wolf, skin
- vortigal: an eagle formed of storm cloud, STORM, cloud feathers, lightning talons; feathers, realistic bird, bald eagle, solid, white eagle

Timing and memory (bake-off numbers): load 12.9 s, 24 images in 338 s total, 10.6 to 21.4 s per image (first image 21.4 s, most 11 to 15 s; img2img runs only strength x 28 steps), peak torch allocated 5495 MB, GPU at most 49 C. No gen process left running, GPU back to 0 MiB. Script `.scratch/gen5.py` (PC copy `~/tte-gpu/gen5.py`), sheet `~/claudetmp/roster24-redo-gpu/sheet4-water-storm.png` (round-3 best beside the four round-4 images per hero).

Verdict (mine, not an owner verdict): strength up to 0.65 keeps the init image's composition and surface almost unchanged, so the material words do not take over. Same finding as rounds 2 and 3: the animal in the init image wins.
- nykra: no real change; a hint of water spray and a looser foam mane at 0.58/0.65, body still glossy teal horse. No better than r3_1.
- glimmaw: no change; still a blue fish with a scale-less skin, no lure, no water body. Only a few drips at 0.65.
- abyssor: no change; still a skinned octopus with suckers, slightly more translucent at 0.65. No better than r3_4.
- hyalia: no change; the glossy teal dome stays, ground mist slightly more cloud-like. Reads as a jellyfish, not a storm cloud.
- zephra: slightly more cloud-like fur and a bit more lightning at 0.58/0.65, still a grey wolf with blue spines. Marginal gain.
- vortigal: no change; still a white eagle with cyan feather tips, a few yellow streaks at 0.65. Not cloud.
Next ideas if the owner wants this pursued: strength 0.75 to 0.9 (composition will drift, so pick for silhouette), a masked or ControlNet-edge img2img to keep only the outline, a LoRA or IP-Adapter from a water/cloud reference, or accept stylised, simplified designs painted by hand/vector over the pick instead of photographic diffusion.
