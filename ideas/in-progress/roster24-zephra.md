---
status: in-progress
added: 2026-11-19
---

# Roster24: Zephra (air, ranged), release #10 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 21, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Zephra alone.

- **Element:** air. **Style:** ranged (`src/core/data/hero-style.ts`). **Hitbox:** size 60 (`src/core/data/size.ts`).
- **Release order:** 10 of 12 (air ranged (M:R after 11:11); art-blocked).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Static Mote: range, 8 dmg, 0.4 s cd, speed 10, max 3: a fast spark.
  - Skitter: buff, 3 s cd, hops 140 px backward (lunge-only cast, no damage).
  - **Super** THUNDERHEAD: vortex, 6 icicles (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Static Mote + Skitter (AI hop rule exists); Arc Pylon tether drawn procedurally (no generated lightning); drop the knockback gust (Bell Pulse and the gust trap push).
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 50.6. Re-measure at the current SIM_VERSION before acting.
- **Art status:** base rejected once; one more round with a soft vortex-body control, then the ladder. Skitter FX slot stuck. Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; art (no approved base); stuck FX slot skitter. Every flip also needs WP-0 and the WP-0c audit gate.

## WP checklist

- [ ] WP-0 prerequisites (release set, audit gate; shared, done once for all heroes)
- [ ] S (sim): kit de-dupe, hit-strength and stun rows, AI rule, 2v2 life retune if out of band; SIM_VERSION bump at merge, golden re-record with reason
- [ ] P1 (art): rig spec, bake, sheets, art-director sheet approval, audit gate
- [ ] P2 (hit FX): burst, hit-spark and named pop per ability in ability-aura-view.ts
- [x] P3 (text): lesson rows in ability-lessons.ts, docs/ABILITY-AUDIT.md, docs/GAME-DESIGN.md
- [ ] P4 (browser): `corepack pnpm e2e:smoke` and `corepack pnpm e2e -- tests/e2e/roster24-shot.spec.ts` via the router
- [ ] R (release flip, coordinator): append to RELEASED_ROSTER24, 1v1 and 2v2 balance in band, `fun:gates`, `balance:record`, `gate:commit` then `gate:push`

## Progress

- 2026-11-19: file created from the one-hero plan; data checked against `src/core/data` (melee/ranged, abilities and super match the plan).
- 2026-11-20: S step (no sim change, SIM_VERSION stays 92). Kit de-dupe checked: no other ability shares kind, box and damage with Static Mote (range 16x16, 8 dmg, speed 10; Abyssal Pull shares only the 8 damage) or Skitter (buff, 140 px backward lunge, no damage). Pinned in `src/core/data/abilities-c.test.ts`. Win rate at SIM_VERSION 92, Arcade, AI level 3, full roster: 1v1 (16 seeds) 0.512; 2v2 (26 seeds, 598 games) 0.527; both in 0.45-0.55, no tuning, no golden re-record. AI rule: hop rule already exists.
- 2026-11-21 (P3 text, done): static-mote and skitter lesson rows in src/ui/screens/ability-lessons.ts (words only, no banned terms); pin test in ability-lessons.test.ts. docs/ABILITY-AUDIT.md and GAME-DESIGN.md Zephra rows already match abilities-c.ts. No src/core change, no art, RELEASED_ROSTER24 still empty.

- 2026-11-23 (P1 art, rig+bake done): keyed matte (tools/assets/roster24-art/r24-key-grade.py, art-director approval in provenance/abyssor-zephra-keyed-approval.json), padded 400x400 rig source, quadruped landmarks tools/assets/portrait-rig/r24/zephra.landmarks.json, tools/assets/portrait-rig/gen-r24.py --promote, template anim (no tune script), procedural KO (tools/assets/portrait-rig/r24-ko-keys.py), bake + sheets + map strip. Real-game screenshot and router e2e roster24-shot passed. Baked-sheet art-director verdict APPROVE 4/5 (2026-11-23; open: faint rim light for Abyssor on dark lava, Zephra +8-10% scale, tail-tip fringe check on dark arena); RELEASED_ROSTER24 not flipped.
