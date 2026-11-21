---
status: in-progress
added: 2026-11-19
---

# Roster24: Umbrel (earth, ranged), release #5 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 25, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Umbrel alone.

- **Element:** earth. **Style:** ranged (`src/core/data/hero-style.ts`). **Hitbox:** size 110 (`src/core/data/size.ts`).
- **Release order:** 5 of 12 (base approved (M:R after 8:9)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Spore Burst: range, 6 dmg, 1.4 s cd, speed 5: a spore cloud that leaves a wound (4 dmg per 30 ticks for 90 ticks).
  - Mycelium Mend: heal 8, 30 s cd (withOverTime: half now, then Mend, breakable).
  - **Super** BLOOM OF ROT: quake, 40 pm drain (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Spore Burst keeps the wound status + Mycelium Mend; Sporeling (follow + cast echo) later, a new system so Opus builds; drop the spore-cloud idea (puddle traps already deny ground).
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 51.6. Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base cn_8180 (base only). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; AI rule. Every flip also needs WP-0 and the WP-0c audit gate.

## WP checklist

- [ ] WP-0 prerequisites (release set, audit gate; shared, done once for all heroes)
- [ ] S (sim): kit de-dupe, hit-strength and stun rows, AI rule, 2v2 life retune if out of band; SIM_VERSION bump at merge, golden re-record with reason
- [x] P1 (art): rig spec, bake, sheets, art-director sheet approval (APPROVE 4.0, 2026-11-20; polish notes: cap colour, KO collapse, idle vs walk), audit gate (hidden, RELEASED_ROSTER24 empty). Scripts: tools/assets/portrait-rig/tune-umbrel-anim.py, umbrel-ko-keys.py
- [ ] P2 (hit FX): burst, hit-spark and named pop per ability in ability-aura-view.ts
- [x] P3 (text): lesson rows in ability-lessons.ts, docs/ABILITY-AUDIT.md, docs/GAME-DESIGN.md
- [ ] P4 (browser): `corepack pnpm e2e:smoke` and `corepack pnpm e2e -- tests/e2e/roster24-shot.spec.ts` via the router
- [ ] R (release flip, coordinator): append to RELEASED_ROSTER24, 1v1 and 2v2 balance in band, `fun:gates`, `balance:record`, `gate:commit` then `gate:push`

## Progress

- 2026-11-19: file created from the one-hero plan; data checked against `src/core/data` (melee/ranged, abilities and super match the plan).
- 2026-11-20 step S (no SIM_VERSION bump, no sim change): re-measured at SIM_VERSION 92 (full roster, arcade, ai-level 3; 1v1 16 seeds, 2v2 26 seeds): Umbrel 1v1 53.5, 2v2 52.8, both in band 0.45-0.55, so no life retune and no tuning rounds. The kit already has no duplicate footprint: Spore Burst (range, 40x40, 6 dmg, speed 5, 70 ticks, wound) matches no other ranged ability; it only shares damage and speed with Bell Pulse (omni, 24x24). Mycelium Mend (heal 8, 1500 ticks) differs from Fire Heal (heal 10, 2000 ticks). All tick values are exact multiples of 20 ms. Kit pinned in src/core/data/abilities-c.test.ts.
  Not done: AI rule, hit strength rows.
- 2026-11-21 (P3 text, done): spore-burst and mycelium-mend lesson rows in src/ui/screens/ability-lessons.ts (words only, no banned terms); pin test in ability-lessons.test.ts. docs/ABILITY-AUDIT.md and GAME-DESIGN.md Umbrel rows already matched abilities-c.ts. No src/core change, no art, RELEASED_ROSTER24 still empty.
