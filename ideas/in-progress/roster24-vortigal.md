---
status: in-progress
added: 2026-11-19
---

# Roster24: Vortigal (air, melee), release #12 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 24, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Vortigal alone.

- **Element:** air. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 150 (`src/core/data/size.ts`).
- **Release order:** 12 of 12 (completes air 3M+3R (M:R after 12:12); last, art-blocked).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Stoop: melee, 22 dmg, 3.5 s cd, 90x60, lunges 200 px: a diving strike.
  - Talon Rake: melee, 12 dmg, 0.9 s cd, max 2, 60x40: leaves a wound (3 dmg per 30 ticks for 90 ticks).
  - **Super** TEMPEST DIVE: vortex, +3 speed for 120 ticks (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Stoop becomes an airborne dive (translucent in flight, hits on landing, passes over traps) so it stops repeating Tusk Gore; Talon Rake drops the wound (Umbrel keeps it) for an effect no hero owns (not venom, burn, wound, stun, pull or push); Thermal keeps the Stoop refund.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 44.6 (outside the 0.45-0.55 band). Re-measure at the current SIM_VERSION before acting.
- **Art status:** base rejected twice by the art-director (rule 13 ladder); stuck FX slot talon_rake. Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; S1 airborne dive rework, S4 sim retune (2v2 44.6); art ladder; AI rule (none). Every flip also needs WP-0 and the WP-0c audit gate.

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
