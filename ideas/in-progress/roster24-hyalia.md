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
- **Art status:** matte hyalia-96433 approved by the art-director 2026-11-20 (provenance/hyalia-approval.json); baked-sheet verdict still open (that file says NOT YET REVIEWED; hyalia-bake-approval.json holds a rig approval of contact.png with no overall score); box is non-square 100x160. Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; baked-sheet verdict with an overall score. Every flip also needs WP-0 and the WP-0c audit gate.

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
- 2026-11-20: S step (`SIM_VERSION` 93). Kit de-dupe checked: no other ability shares kind, box and damage with Stinging Filament (range 110x10 scaled, 10 dmg, speed 12) or Bell Pulse (omni 24x24 scaled, 6 dmg, speed 5), so no kit change. Pinned in `src/core/data/abilities-c.test.ts`. Balance at SIM_VERSION 92 (Arcade, AI level 3, full roster; 1v1 16 seeds, 2v2 26 seeds): max health 95 gave 1v1 0.421 (out of band). Life retune, 3 rounds: 105 gave 1v1 0.554; 102 gave 1v1 0.541 but 2v2 0.574; 99 gave 1v1 0.492 and 2v2 0.531 (both in 0.45-0.55, shipped). Goldens re-recorded (Classic and Arcade): a recorded Arcade match with Hyalia changes, the rest only the simVersion header. AI rule: omni rule for Bell Pulse already exists.
- 2026-11-21 (P3 text, done): stinging-filament and bell-pulse lesson rows in src/ui/screens/ability-lessons.ts (words only, no banned terms); pin test in ability-lessons.test.ts. docs/ABILITY-AUDIT.md and GAME-DESIGN.md Hyalia rows already match abilities-c.ts. No src/core change, no art, RELEASED_ROSTER24 still empty.
- 2026-11-23 (P1 art, rig+bake done): matte hyalia-96433 (approved 2026-11-20, provenance/hyalia-approval.json), key-flat-bg.py + clear-grey-pockets.py (new, 3 enclosed grey pockets) + make-rig-source.py (400x400 canvas, no longer 250x400 for the wide wyvern), r24/hyalia.landmarks.json (quadruped, east-facing, crest and head plume as ears), gen-r24.py --promote, template anim, procedural KO, bake, sheets, map strip. In-game shot checked. Art-director sheet verdict pending; RELEASED_ROSTER24 not flipped.
