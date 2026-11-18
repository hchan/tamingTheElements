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
