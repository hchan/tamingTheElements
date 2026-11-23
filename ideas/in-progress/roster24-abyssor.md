---
status: in-progress
added: 2026-11-19
---

# Roster24: Abyssor (water, melee), release #7 of 12

Part of [roster-24-heroes](roster-24-heroes.md). Plan: `.scratch/plans/roster24-one-hero.md` (release order, per-hero WPs). The hero is already in the sim (character index 23, hashed and append-only) behind `?ff=roster24`; this file tracks what is left to release Abyssor alone.

- **Element:** water. **Style:** melee (`src/core/data/hero-style.ts`). **Hitbox:** size 170 (`src/core/data/size.ts`).
- **Release order:** 7 of 12 (base approved (M:R after 10:9)).
- **Abilities** (`src/core/data/characters.ts`, `abilities-c.ts`):
  - Tentacle Lash: melee, 18 dmg, 1.2 s cd, max 2, 160x30: a long lash.
  - Abyssal Pull: range, 8 dmg, 6 s cd, speed 14, stops at 280 px and drags the foe 120 px in.
  - **Super** MAELSTROM: tide, size 200, 60 ticks of armour (`src/core/data/arcade-supers.ts`).
- **Kit line (plan):** Abyssal Pull keeps the only body pull; Tentacle Lash trades width 160 for reach so it stops being a third wide sweep (Kelp Lash 130, Scorch Breath 130); Ink Cloud (cooldown slow) later.
- **2v2 win rate** (docs/BALANCE.md:307, SIM_VERSION 78): 48.2. Re-measure at the current SIM_VERSION before acting.
- **Art status:** approved base cn_8150 (director note: pad the bottom margin). Art comes from session tte-art-gpu-server; the art-director `approval.json` is the gate (`.claude/rules/art-autonomy.md`). `public/assets` holds the 2026-11-16 art (sheet, map strips; scrapped by the owner, still in the manifest); no sheet-level approval exists for any roster24 hero, and the WP-0c audit gate is not defined yet.
- **Release blockers:** WP-0; AI rule; bottom margin on the base. Every flip also needs WP-0 and the WP-0c audit gate.

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
- 2026-11-20 step S (no SIM_VERSION bump, no sim change): re-measured at SIM_VERSION 92 (full roster, arcade, ai-level 3, default seeds): Abyssor 1v1 47.8, 2v2 52.2, both in band 0.45-0.55, so no tuning. The kit already has no duplicate footprint (Tentacle Lash 160x30 is the only 160 box, Kelp Lash is 130x30; Abyssal Pull is the only body pull), tick values are exact multiples of 20 ms (Lash cd 60 ticks, delay 15; Pull cd 300). Kit pinned in src/core/data/abilities-c.test.ts.
  Not done: AI rule, hit strength rows.
- 2026-11-20: valid re-measure at SIM_VERSION 92 (`--roster full`, arcade, AI 3): 1v1 (16 seeds, 4416 matches) 56.7 (slightly above the 0.45-0.55 band, within 16-seed noise of about 2.5 points); 2v2 (26 seeds, 7176 matches) 47.5 (in band). No kit change shipped; pin test added. Revisit the 1v1 number with 32 seeds before the release flip (Ink Cloud / lash reach are the untried levers).
- 2026-11-21 P3 (words only, no src/core change): lesson rows for Tentacle Lash and Abyssal Pull in ability-lessons.ts with a pin test in ability-lessons.test.ts.
- 2026-11-22 (2v2 life retune, SIM_VERSION 102): ARCADE_2V2_LIFE_PM changed from the v101 full-roster tournament (pair mean before .364-.677, after .473-.540 per docs/BALANCE.md 'Arcade 2v2 hidden-hero life retune'); this hero's new value and its pair rates are in that table. Refit again with --roster released at release.

- 2026-11-23 (P1 art, rig+bake done): keyed matte (tools/assets/roster24-art/r24-key-grade.py, art-director approval in provenance/abyssor-zephra-keyed-approval.json), padded 400x400 rig source, quadruped landmarks tools/assets/portrait-rig/r24/abyssor.landmarks.json, tools/assets/portrait-rig/gen-r24.py --promote, template anim (no tune script), procedural KO (tools/assets/portrait-rig/r24-ko-keys.py), bake + sheets + map strip. Real-game screenshot and router e2e roster24-shot passed. Baked-sheet art-director verdict APPROVE 4/5 (2026-11-23; open: faint rim light for Abyssor on dark lava, Zephra +8-10% scale, tail-tip fringe check on dark arena); RELEASED_ROSTER24 not flipped.
- 2026-11-23 (P2 tweak re-bake): re-baked from the art-director tweaked matte abyssor-82145-rim2 (4 px teal rim; script tools/assets/roster24-art/r24-tweak.py, approvals provenance/abyssor-tweak-approval.json). Round 1 REVISE 3/5: flat grey pockets in tentacle loops (key-flat-bg keeps enclosed grey); fixed with clear-enclosed-grey.py --tol 22 --min 300 --feather 2 before make-rig-source (--pad 24 --margin 12). Round 2 APPROVE 4/5 on a lava-floor in-game screenshot; rim bleed invisible on lava. Verdicts in provenance/abyssor-approval.json. RELEASED_ROSTER24 not flipped.
