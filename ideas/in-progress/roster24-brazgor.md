---
status: in-progress
added: 2026-11-19
---

# Roster24: Brazgor (fire, melee), release #2 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 18, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Brazgor alone.

- **Element:** fire. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 160 (`src/core/data/size.ts`).
- **Release order:** 2 of 12 (base approved, AI rule exists (M:R after 7:7)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Forge Gore: melee, 25 dmg, 1.5 s cd, 90x60: a slow heavy gore (heavy hit strength).
  - Molten Hide: buff, 3 s, -50% damage taken, thorns 4 per melee hit on the bearer, 12 s cd.
  - **Super** FORGE STAMPEDE: beam, size 220, 80 ticks of armour (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Forge Gore + Molten Hide (AI rule exists); Pyre Totem becomes an ally no-flinch zone (StatusId.superArmour), not a 30% damage cut (Molten Hide and Rock Armour own that).
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 48.1. Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base cn_8110 (director note: flank glow needs a fix). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; flank-glow fix on the base art. Every flip also needs WP-0 and the WP-0c audit gate.

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
