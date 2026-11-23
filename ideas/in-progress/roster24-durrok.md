---
status: in-progress
added: 2026-11-19
---

# Roster24: Durrok (earth, melee), release #9 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 20, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Durrok alone.

- **Element:** earth. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 120 (`src/core/data/size.ts`).
- **Release order:** 9 of 12 (completes earth 3M+3R (M:R after 11:10); art-blocked).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Tusk Gore: melee, 22 dmg, 3 s cd, 80x50, lunges 180 px.
  - Bristle Stomp: melee, 15 dmg, 0.8 s cd, max 2, 70x40: a short stomp.
  - **Super** TUSKQUAKE: quake, scale 1150 pm, +2 speed for 120 ticks (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Tusk Gore keeps the ground lunge + Bristle Stomp; Mudslick (slide) later.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 50.3. Re-measure at the current SIM_VERSION before acting.
- **Art status:** base rejected twice by the art-director (rule 13 ladder: free asset + regrade, then i2i/ControlNet, then procedural; no more t2i seeds). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; art ladder (no approved base); AI rule (none). Every flip also needs WP-0 and the WP-0c audit gate.

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
- 2026-11-20: S step (no sim change, SIM_VERSION stays 92). Kit de-dupe checked: no other ability shares kind, box and damage with Tusk Gore (melee 80x50, 22) or Bristle Stomp (melee 70x40, 15); Hoof Crash is 70x50, 20. Pinned in `src/core/data/abilities-c.test.ts`. Win rate at SIM_VERSION 92, Arcade, AI level 3, full roster: 1v1 (16 seeds, 368 games) 0.535; 2v2 (26 seeds, 598 games) 0.478; both in 0.45-0.55, no tuning, no golden re-record. AI rule still open (none).
- 2026-11-21 (P3 text, done): tusk-gore and bristle-stomp lesson rows in src/ui/screens/ability-lessons.ts (words only, no banned terms); pin test in ability-lessons.test.ts. docs/ABILITY-AUDIT.md and GAME-DESIGN.md Durrok rows already match abilities-c.ts (22 dmg, 3 s, lunge 180; 15 dmg, 0.8 s). No src/core change, no art, RELEASED_ROSTER24 still empty.
- 2026-11-22 (2v2 life retune, SIM_VERSION 102): ARCADE_2V2_LIFE_PM changed from the v101 full-roster tournament (pair mean before .364-.677, after .473-.540 per docs/BALANCE.md 'Arcade 2v2 hidden-hero life retune'); this hero's new value and its pair rates are in that table. Refit again with --roster released at release.
