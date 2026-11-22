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
- [x] P3 (text): lesson rows in ability-lessons.ts, docs/ABILITY-AUDIT.md, docs/GAME-DESIGN.md (lesson rows done 2026-11-21; audit and design doc rows not touched)
- [ ] P4 (browser): `corepack pnpm e2e:smoke` and `corepack pnpm e2e -- tests/e2e/roster24-shot.spec.ts` via the router
- [ ] R (release flip, coordinator): append to RELEASED_ROSTER24, 1v1 and 2v2 balance in band, `fun:gates`, `balance:record`, `gate:commit` then `gate:push`

## Progress

- 2026-11-19: file created from the one-hero plan; data checked against `src/core/data` (melee/ranged, abilities and super match the plan).
- 2026-11-20 step S (no SIM_VERSION bump, no sim change): re-measured at SIM_VERSION 92 (full roster, arcade, ai-level 3; 1v1 16 seeds, 2v2 26 seeds): Quarrak 1v1 45.7, 2v2 53.2, both in band 0.45-0.55, so no life retune. The kit already has no duplicate footprint: Hurl Rock 35x35 at 25 ticks (90 in Arcade), Boulder Roll 64x48 at 175 ticks, speed 4 (unique); Hurl Rock only shares damage 40 and speed 8 with Sonar Blast (20x20, 30 ticks).
  Three tuning rounds tried to separate it (Hurl Rock speed 8 -> 7): speed 7 / 40 dmg: 1v1 44.3 (out); speed 7 / 44 dmg: 1v1 45.9, 2v2 56.2 (out); speed 7 / 42 dmg: 1v1 46.7, 2v2 56.4 (out). All reverted. Kit stays as is; tick pins for the Quarrak kit added in src/core/data/abilities-c.test.ts. Hurl Rock stays 40 / speed 8.
  Win rates at the unchanged kit (1v1 / 2v2): Quarrak 45.7 / 53.2; others unchanged by this step. Out of band, not touched: 1v1 abyssor 56.7, hyalia 42.1, and legacy heroes; 2v2 nykra 59.7, vortigal 42.3 (also cyclonius 66.9, echo 57.0, ishimi 43.6, rokcore 39.5, sindarosa 44.6, treenoc 42.5).
  Not done: AI rule (Hurl Rock and Boulder Roll usage not measured), hit strength rows (Boulder Roll is already heavy).
- 2026-11-20 (P1 art, done): rig source = approved quarrak-96214.png keyed with key-flat-bg.py + make-rig-source.py; quadruped landmarks tools/assets/portrait-rig/r24/quarrak.landmarks.json (swing 12, lift 6), gen-r24.py --promote, then tune-quarrak-anim.py (livelier idle/walk, reversed walkBack with head tucked, rear-up cast with held lunge, rear-up victory, 2-frame recoil hurt). KO is procedural (quarrak-ko-keys.py: shell retract-and-drop with ground shadow, no rotation, no limb tearing). Art-director four rounds: 3.4 (KO hard reject, cast 2), 3.7, 3.8, then APPROVE 4.0 (provenance/quarrak-approval.json). Follow-up (non-blocking): idle is subtle at 80 px. RELEASED_ROSTER24 not flipped.
- 2026-11-21 P3 (words only, no src/core change): lesson rows for Hurl Rock and Boulder Roll in ability-lessons.ts with a pin test in ability-lessons.test.ts.
