# roster24 hero recipes (2026-11-16 element redo)

Pipeline per hero: `gen-candidates.py --round R HERO` (SDXL-Turbo, 4 steps, guidance 0, MPS; `N=6 nice -n 10 ~/claudetmp/sd/.venv/bin/python`),
candidates land in `~/claudetmp/concepts-new12R/HERO_i.png`; seed = `base + i*mult + len(hero)` (bases/mults are in the script; round n uses the default 7000/31).
Cut: `~/claudetmp/venv-cut/bin/python tools/assets/roster24-art/cut-hero.py SRC OUT [flags]`; then
`make-large.py HERO CUT public/assets/img/map/HEROLarge.png` (long side from its LONG_SIDE table). Vortigal also goes through `pad-fade.py`.
Paths: R = round letter. sha256 is the first 16 hex of the committed Large.png. Seeds marked ~ are recomputed from the formula, not logged.

| hero | pick | seed | cut flags | Large.png size | sha256 |
|---|---|---|---|---|---|
| kindrel | h_6 | 15265 | (none; picked over h_8 whose legs were lost) | 300x285 | eb86e1db5a85249c |
| nykra | h_2 | ~15091 | (none; hooves slightly clipped) | 360x338 | 0f480f9e5b5f3c26 |
| quarrak | n_2 | 7069 | --ycut 0.93 | 412x368 | 2f29f853a6ae2483 |
| hyalia | n_4 | 7130 | --ycut 0.9 --lo 45 --hi 95 | 290x236 | 47691129d798d3b2 |
| brazgor | h_9 | 15394 | (none; hooves trimmed to flame) | 400x370 | 023479f76b57885e |
| glimmaw | h_5 | 15222 | (none) | 320x314 | b478b188bf137410 |
| durrok | i_3 | ~21147 | --ycut 0.955 (no --flip; seeds already face right) | 420x377 | 3e57751f0158d86f |
| zephra | j_1 | ~27059 | --lo 38 --hi 80 --hole 4000 (some haze remains) | 340x314 | 0d84b393694e12d1 |
| ouroth | h_6 | 15264 | (none) | 355x370 | a640cedd1e71a9e4 |
| abyssor | h_6 | 15265 | --flip (head faced left) | 410x399 | bade412f618c72e2 |
| vortigal | k_3 | 33185 | --fade 0, then pad-fade.py (1536x768 canvas) | 400x225 | 2f395f678feb775d |
| umbrel | h_6 | 15264 | --ycut 0.9 | 309x360 | 23b8f16e8ad88201 |

Round letters for nykra, durrok and zephra were taken from the working notes; re-run the round to confirm before relying on the seed.
`fix-brazgor.py IN OUT` is only for the old round-d Brazgor and is not used by this table.
