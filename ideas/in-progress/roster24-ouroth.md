---
status: in-progress
added: 2026-11-19
---

# Roster24: Ouroth (fire, melee), release #3 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 22, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Ouroth alone.

- **Element:** fire. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 100 (`src/core/data/size.ts`).
- **Release order:** 3 of 12 (completes fire 3M+3R (M:R after 8:7)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Wyrm Coil: melee grab, 22 dmg, 2.5 s cd, 90x60: beats Guard and Parry, holds then throws the foe 160 px.
  - Scorch Breath: melee, 14 dmg, 1.8 s cd, 130x50: a long jet of flame (Burn with flag withOverTime).
  - **Super** WYRM'S COIL: beam, size 180, 40 ticks of root (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Wyrm Coil stays the only grab-throw + Scorch Breath (burning); Brimstone Coil is a dash lock that never stacks with the Snag root.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 41.4 (outside the 0.45-0.55 band, outside 0.40-0.60 soft band). Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base cn_8120 + p1 51000; later p2 batch ouroth-p2-all (director notes: tail margin); box is non-square 200x90. Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; S4 sim retune (2v2 41.4), AI rule; tail margin on the base. Every flip also needs WP-0 and the WP-0c audit gate.

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
