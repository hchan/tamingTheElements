---
status: in-progress
added: 2026-11-19
---

# Roster24: Quarrak (earth, ranged), release #4 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 16, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Quarrak alone.

- **Element:** earth. **Style:** ranged (`src/core/data/hero-style.ts`). **Hitbox:** size 170 (`src/core/data/size.ts`).
- **Release order:** 4 of 12 (base approved (M:R after 8:8)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Hurl Rock: range, 40 dmg, 0.5 s cd (Arcade 90 ticks), max 2: Quarrak-only (set A def reused).
  - Boulder Roll: range, 26 dmg, 3.5 s cd, speed 4: a slow large ground roller with knockback.
  - **Super** ROCKFALL: quake, 5 icicles (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Hurl Rock (Quarrak-only, characters.test.ts:81) + Boulder Roll + Rubble Wall (solid).
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 55.9 (outside the 0.45-0.55 band). Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base cn_8161 + p3 51111 (base only). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; S4 sim retune (2v2 55.9), AI rule; stale size.ts comment calls Quarrak a crab (art is a tortoise); stuck FX slot hurl_rock (rule 13 ladder). Every flip also needs WP-0 and the WP-0c audit gate.

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
