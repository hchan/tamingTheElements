---
status: idea
added: 2026-11-12
---

# Arcade Curomo is the 87.5% outlier

From docs/ABILITY-AUDIT.md finding 1. Arcade tournament (4 seeds, Normal AI): Curomo 87.5%, 100% against 7 of 11 races; next best is 60%. Ice Shock (240x40 reach, 20 base) plus Snag on 630 HP with damagePm 1560. Options: raise hpPm/damagePm from 6300/1560 (about 7000/1700), or shorten Ice Shock reach. Needs a SIM_VERSION bump, golden re-recording with a stated reason, and design approval. Check with `pnpm sim:match --tournament --ruleset arcade --seeds 4 --json`.
