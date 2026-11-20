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
- [ ] P3 (text): lesson rows in ability-lessons.ts, docs/ABILITY-AUDIT.md, docs/GAME-DESIGN.md
- [ ] P4 (browser): `corepack pnpm e2e:smoke` and `corepack pnpm e2e -- tests/e2e/roster24-shot.spec.ts` via the router
- [ ] R (release flip, coordinator): append to RELEASED_ROSTER24, 1v1 and 2v2 balance in band, `fun:gates`, `balance:record`, `gate:commit` then `gate:push`

## Progress

- 2026-11-19: file created from the one-hero plan; data checked against `src/core/data` (melee/ranged, abilities and super match the plan).
