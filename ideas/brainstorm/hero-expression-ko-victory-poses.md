---
status: idea
added: 2026-11-16
---

# Hero expression, KO and victory pose art

Goal: per-hero hurt, angry and smug expression variants for portraits, plus a KO pose and a victory pose for all 24 heroes, usable in the HUD, round-end card and win splash.

Why: heroes currently only show a neutral portrait; KO and win moments lack character (see [sf-win-quotes](../in-progress/sf-win-quotes.md), [round-result-banner](../in-progress/round-result-banner.md)).

- Size: L (24 heroes, 2-3 images each).
- Dependencies: final portraits and rigs ([hero-rigs](hero-rigs.md), [roster24-art-redo](roster24-art-redo.md)); feeds [splash-and-montage-art](splash-and-montage-art.md).
- GPU-suitable: yes (image generation plus cleanup), consistency checked against the originals.
- Owner-gated: yes (art look; show a sheet first).

## Progress note 2026-11-19 (gpu-job-server)
KO rounds 3 and 4 (jobs c53f, 10ca) failed for fiara_ko and glimmaw_ko: r3 art-director REVISE (knot, upright fish); r4 contact sheets (`.scratch/ko-victory/sheets-r4/`) show fiara tiny and scribbled, glimmaw still upright and roaring. Rule 13 applies (two failed rounds): change method. Next: rig-only KO frames (rotate/squash/tint of the baked sprite, as the plan's fallback for released heroes) instead of i2i repaints. Approved victory stills (fiara 46311_d0.5, glimmaw 46353_d0.55) stay held in `.scratch/ko-victory/`. Cyclonius still needs its own method.

## Progress note 2026-11-19 (cut-in backdrops)
Art-director approved 10/12 cut-in backdrops (.scratch/cutin-backdrops-out/approval.json). echo and wispera REVISE: queued 9cac (my variant) and the director's exact prompts (seeds 49054-57, 49044-47), fallback hue-regrade of 49052/49040.

## Progress note 2026-11-19 (cut-in r4)
Art-director approved echo 49060 and wispera 49073 (my variants; its own prompts rejected: focal point mid-frame). All 12 cut-ins approved (`.scratch/regen-r4-approval.json`, sheet `.scratch/cutin-final-sheet.png`). Earth plate r4 failed again (riveted metal): r5 queued as g-20261119130251-fa2f (basalt prompt, neg rivets/metal, seeds 45200-03); rule 13 fallback is a CC0 basalt texture.
