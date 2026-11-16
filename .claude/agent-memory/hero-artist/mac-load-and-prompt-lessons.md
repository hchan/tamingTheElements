---
name: mac-load-and-prompt-lessons
description: Owner's Mac load rules for SDXL work and prompt lessons learned in the 2026-11-16 roster24 element redo
metadata:
  type: feedback
---

Owner (2026-11-16, direct): "you can do it, but just try not to kill my Mac". Run exactly ONE heavy job at a time (generation OR cutting), `nice -n 10`, batches of 8 images or fewer, headless only; if `uptime` 1-min load is above 10, stop and report instead of starting jobs.

**Why:** I once ran 3-4 SDXL processes in parallel and pushed the 5-min load to about 22.
**How to apply:** check `uptime` before every job. The load can be high from other processes (node, Edge, java); that still means wait and report.

Prompt lessons (SDXL-Turbo):
- CLIP truncates at 77 tokens: long subject text silently drops the style tail. Keep subject and style short.
- Fire, water and wind/lightning bodies work when the prompt names the material (lava, translucent teal water, cyan bolts).
- Earth and air animals stay plain animals if the prompt uses the animal word alone; name materials and colours (crystals, storm cloud). A tortoise with crystals reads as earth but still as a tortoise; a jellyfish stays pink and reads weakly as air.
- Raising cut-hero.py --lo/--hi removes glow haze but eats thin legs.
