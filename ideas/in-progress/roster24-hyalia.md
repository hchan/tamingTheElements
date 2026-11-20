---
status: in-progress
added: 2026-11-19
---

# Roster24: Hyalia (air, ranged), release #11 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 17, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Hyalia alone.

- **Element:** air. **Style:** ranged (`src/core/data/hero-style.ts`). **Hitbox:** size 100 (`src/core/data/size.ts`).
- **Release order:** 11 of 12 (air ranged (M:R after 11:12); art-blocked).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Stinging Filament: range, 10 dmg, 0.9 s cd, speed 12, max 2: a thin fast filament that stuns (Venom with flag withOverTime).
  - Bell Pulse: omni, 6 dmg, 5 s cd, speed 5: a push ring that keeps melee foes off.
  - **Super** STORM BLOOM: vortex, 25 ticks of root (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Stinging Filament (venom) + Bell Pulse (AI omni rule exists); Drifting Polyp (silence) later. Kit steps 1-5 of the plan can run now although art is blocked.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 50.1. Re-measure at the current SIM_VERSION before acting.
- **Art status:** base rejected twice by the art-director (rule 13 ladder); box is non-square 100x160. Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; art ladder (no approved base). Every flip also needs WP-0 and the WP-0c audit gate.

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
