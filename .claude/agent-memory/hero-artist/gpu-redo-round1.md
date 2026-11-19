---
name: gpu-redo-round1
description: HISTORICAL (2026-11-17, art scrapped): durable prompt lessons from the SDXL redo of the roster24 concepts
metadata:
  type: project
---

Historical: the roster24 art from these rounds was scrapped by the owner. Do not follow any old PC or transfer recipe; reach the GPU PC only through `pnpm gpu:*` (rules/gpu-pc.md). Durable prompt lessons (SDXL base, 28 steps, CFG 6-8, about 18 s per image):

- Material words work only when they are the subject ("transparent glass water sculpture of <animal>", "storm spirit in the shape of a wolf, body of dark storm cloud with glowing blue lightning veins"); the animal word otherwise wins and yields skin, fur or feathers.
- Name wanted colours in the subject; extra negatives for colours are ignored at CFG 6.5.
- Use "creature/spirit", add "floating, no base, no plinth" and put sculpture, pedestal and desk in the negative (the word "sculpture" alone adds plinths and a photo look).
- "facing right" in the subject mostly gives right-facing results.
- img2img from earlier picks (strength 0.75 to 0.9) only adds splash or mist; it does not change identity.
- Still unsolved: Vortigal stays a plain eagle and Glimmaw's lure rarely appears; options are ControlNet, a LoRA, or compositing a texture over a cut silhouette (each needs an owner go-ahead for weights).
- Extract each generated round into its own directory so a later round does not overwrite an earlier one.
