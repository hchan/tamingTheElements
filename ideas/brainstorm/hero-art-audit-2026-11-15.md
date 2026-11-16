---
status: idea
added: 2026-11-15
---

# Roster-24 hero art audit (12 unreleased heroes), 2026-11-15

Method: each `public/assets/img/map/<id>Large.png` (400x400; `<id>.png` is a 320x80 4-frame strip) viewed at full size next to
Fiara's. No in-game Playwright screenshots were taken (no node_modules in this worktree); this is a static-asset audit.

Common to all 12: the Large PNGs are visibly soft (low-res source upscaled), carry a speckle of stray "dust" dots around the
body, and have a flat watercolour wash with no rim light or luminous glow beyond a single eye. They are not yet at Fiara's baked,
rigged, high-contrast painterly bar. Verdicts below are relative: PASS = recognisable creature, acceptable; REDO = not.

| Hero | Verdict | Evidence | What a redo needs |
|---|---|---|---|
| kindrel | PASS (weak) | Dark cracked-lava quadruped with flame mane/tail, glowing eye; reads as a fire pony/fox. Stick legs, blurry. | Cleaner outline; make silhouette differ from Nykra (see below). |
| nykra | REDO | Teal pony with green mane; same side-on four-legged pose as Kindrel, generic, flat wash. | Water-horse silhouette: arched neck, finned/kelp tail, hooves with ripple; not a Kindrel recolour. |
| quarrak | REDO | Grey rock tortoise with glowing studs; near-duplicate of Durrok and Brazgor. | Distinct earth silhouette (upright golem / boulder-roller / armadillo-ball), tall not low-slung. |
| hyalia | PASS | Purple jellyfish bell with cyan eye, trailing tendrils; clear and the most painterly of the set. | Only polish (sharpness, glow). Keep, but differ from Zephra. |
| brazgor | REDO | Dark lava-seamed boar/bull blob, shapeless; near-duplicate of Quarrak/Durrok mass and Kindrel palette. | Forge-boar silhouette: tusks, hunched shoulders, anvil/forge glow, molten hide plates. |
| glimmaw | PASS | Anglerfish with glowing lure, teal body; instantly readable. | Polish only. |
| durrok | REDO | Brown stegosaur/tortoise lump with green patch; near-duplicate of Quarrak. | Tusked boar silhouette with bristle spines (tusk-gore, bristle-stomp), not a shell. |
| zephra | REDO | Grey rock head over yellow tendrils with big yellow eye; near-duplicate of Hyalia (jellyfish with eye). | Fast, small, skittering static-charged creature (insect/spider/lizard), angular legs and crackle, not a jellyfish. |
| ouroth | REDO | Body and head are disconnected pieces (head floats right of the body), no wyrm shape; flame on left looks pasted. | A continuous coiled serpent/wyrm body with a head, horns and breath glow; one connected silhouette. |
| abyssor | PASS (weak) | Blue cracked shell with big luminous eye and tentacle legs; reads as a deep-sea beast. | Add more tentacle mass; separate from Glimmaw/Hyalia by silhouette. |
| vortigal | PASS | Slate rock-feathered bird with yellow beak/legs, glowing eye; clear raptor-ish read (stoop, talon-rake). | Wings spread / dive pose would sell "stoop"; polish. |
| umbrel | PASS | Red-capped mushroom with green gill glow and arms; unmistakable and distinct. | Polish only. |

Counts: PASS 6 (kindrel, hyalia, glimmaw, abyssor, vortigal, umbrel), REDO 6 (nykra, quarrak, brazgor, durrok, zephra, ouroth).

## Near-duplicate silhouettes

- Quarrak / Durrok / Brazgor: three low, dark, shell-like earth/fire masses with orange or green patches. Biggest overlap; redo at least two.
- Kindrel / Nykra: identical side-on quadruped pose with mane and tail.
- Hyalia / Zephra / (Glimmaw, Abyssor to a lesser degree): bell or blob body with one glowing eye and tendrils.
- Whole set: every hero is "blob with a glowing eye"; vary posture (upright, coiled, winged, many-legged) across elements.

## Suggested order

1. Ouroth (broken silhouette), 2. Brazgor/Durrok/Quarrak as a set (three distinct silhouettes), 3. Zephra, 4. Nykra, then a
sharpening/glow pass on the PASS heroes.
