---
status: in-progress
added: 2026-11-19
---

# Roster24: Nykra (water, melee), release #6 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 15, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Nykra alone.

- **Element:** water. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 110 (`src/core/data/size.ts`).
- **Release order:** 6 of 12 (base approved (M:R after 9:9)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Hoof Crash: melee, 20 dmg, 1 s cd, 70x50: a heavy stomp with knockback.
  - Kelp Lash: melee, 14 dmg, 2.5 s cd, 130x30: a long whip.
  - **Super** KELPIE SURGE: tide, +2 speed for 100 ticks (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Hoof Crash + Kelp Lash; Riptide (flow) later.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 53.7. Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base nykra_cn2_8630 (base only). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; AI rule (none today); stuck FX slot hoof_crash (rule 13 ladder). Every flip also needs WP-0 and the WP-0c audit gate.

## WP checklist

- [ ] WP-0 prerequisites (release set, audit gate; shared, done once for all heroes)
- [ ] S (sim): kit de-dupe, hit-strength and stun rows, AI rule, 2v2 life retune if out of band; SIM_VERSION bump at merge, golden re-record with reason
- [ ] P1 (art): rig spec, bake, sheets, art-director sheet approval, audit gate
- [ ] P2 (hit FX): burst, hit-spark and named pop per ability in ability-aura-view.ts
- [x] P3 (text): lesson rows in ability-lessons.ts, docs/ABILITY-AUDIT.md, docs/GAME-DESIGN.md (lesson rows done 2026-11-21; audit and design doc rows not touched)
- [ ] P4 (browser): `corepack pnpm e2e:smoke` and `corepack pnpm e2e -- tests/e2e/roster24-shot.spec.ts` via the router
- [ ] R (release flip, coordinator): append to RELEASED_ROSTER24, 1v1 and 2v2 balance in band, `fun:gates`, `balance:record`, `gate:commit` then `gate:push`

## Progress

- 2026-11-19: file created from the one-hero plan; data checked against `src/core/data` (melee/ranged, abilities and super match the plan).
- 2026-11-20 step S (no SIM_VERSION bump, no sim change): re-measured at SIM_VERSION 92 (full roster, arcade, ai-level 3; 1v1 16 seeds, 2v2 26 seeds, --seed default): Nykra 1v1 52.4, 2v2 59.7 (confirmed out of band). The kit already has no duplicate footprint (Hoof Crash 70x50, Kelp Lash 130x30; no other ability shares a box), tick values are exact multiples of 20 ms (Hoof Crash 50 ticks, Kelp Lash 125).
  Three tuning rounds on Nykra's own abilities only (1v1 / 2v2): Hoof Crash 20 -> 17: 42.1 / 52.7 (1v1 out); Hoof Crash 18: 48.4 / 55.5 (2v2 out by 0.5); Hoof Crash 18 + Kelp Lash 13: 44.3 / 54.0 (1v1 out by 0.7). The damage lever is steep (about 3.4 pp per damage point in 1v1, about 2.3 in 2v2) and the 1v1 and 2v2 bands do not overlap with damage alone. All reverted; kit pinned in src/core/data/abilities-c.test.ts. Best tried: Hoof Crash 18 / Kelp Lash 14 (48.4 / 55.5) and 18 / 13 (44.3 / 54.0).
  Untried ideas for the next S (needs a lever that hits 2v2 harder than 1v1): Hoof Crash maxActive 2 -> 1, a longer Kelp Lash cooldown, hit strength or stun rows, or an AI rule (Nykra has none; ability usage not measured). Other out-of-band heroes in the 2v2 run (not touched): cyclonius 66.9, echo 57.0, vortigal 42.3, rokcore 39.5, treenoc 42.5.
  Not done: AI rule, hit strength rows.
- 2026-11-21 P3 (words only, no src/core change): lesson rows for Hoof Crash and Kelp Lash in ability-lessons.ts with a pin test in ability-lessons.test.ts.
- 2026-11-22 (2v2 life retune, SIM_VERSION 102): ARCADE_2V2_LIFE_PM changed from the v101 full-roster tournament (pair mean before .364-.677, after .473-.540 per docs/BALANCE.md 'Arcade 2v2 hidden-hero life retune'); this hero's new value and its pair rates are in that table. Refit again with --roster released at release.
