---
status: in-progress
added: 2026-11-20
---

# Roster24 hero 3: Ouroth (fire, melee)

Plan: .scratch/plans/roster24-one-hero.md (section 3, rank 3). Release set stays empty until the audit gate passes.

## Progress

- 2026-11-20 step S (SIM_VERSION 92): Wyrm Coil stays the only grab-throw, box 90x60 -> 80x70 (no longer the Stoop footprint). Scorch Breath box
  130x50 -> 110x70 (a short tall gout, no longer a third wide sweep next to Kelp Lash 130 and Tentacle Lash 160); damage 14 and cooldown 1800 ms unchanged.
  A first try with damage 16 and cooldown 1600 ms put Ouroth at 60.9 percent 1v1, so those numbers were reverted.
- Same bump: Abyss Flash recovery 250 -> 240 ms (12 ticks). 250->240 ms not shipped: moved Durrok out of band (Bristle Stomp 240 ms gave Durrok 55.7 percent 1v1);
  Hoof Crash and Kelp Lash stay 250 ms too. Brazgor review notes done: Ember Bite 150 -> 160 ms is tick-neutral (8 ticks either way) in version.ts, CHANGELOG and the Brazgor idea;
  tick pins for Forge Gore (100 cooldown, 30 recovery ticks) and Ember Bite (8) in src/core/data/abilities-c.test.ts.
- Win rates (full roster, arcade, ai-level 3, final config; 1v1 16 seeds from seed 1, 2v2 26 seeds from seed 1):
  1v1: Ouroth 50.1, Durrok 53.5, Nykra 52.4, Glimmaw 48.0, Brazgor 45.9, Kindrel 45.9.
  2v2: Ouroth 45.3, Durrok 47.8, Nykra 59.7, Glimmaw 54.6, Brazgor 46.8, Kindrel 48.3.
  Ouroth is in band 0.45-0.55 in both, so no life retune. Nykra 2v2 59.7 is out of band but its kit is unchanged in this bump (it was 56.2 to 59.7 across runs); flagged for a later look.
- Still to do: tail margin art fix, rig spec/audit gate (P1), AI rule, hit FX (P2), lesson rows (P3), Brimstone Coil slot 3 (later), release flip (R).
- 2026-11-20 P1 art and rig (art-director APPROVE 4.0 after 1 REVISE round; provenance/ouroth-approval.json): source ouroth.png rebuilt on a 340x320 canvas
  (make-rig-source.py SIZES ouroth 400x180 -> 340x320; clear-enclosed-grey.py removes enclosed backdrop pockets, key-grey-box.py keys the leaked grey spot in the left loop).
  New body plan body_plans/serpent.py (chain of capsule bones along the S, travelling slither wave) with r24/ouroth.landmarks.json; tune-ouroth-anim.py adds walkBack (E only);
  ouroth-ko-keys.py writes the procedural KO (off-by-one fixed: oy = bb[3] - 1 - floor, rot capped at 8 deg). Round 1 REVISE (3.5): grey spot, walk/idle too alike, weak dash/cast, flat KO.
  Follow-ups: KO is subtle (sink and shrink); walk reads as sway, not stride; check SE/NE in play. Still to do: AI rule, hit FX (P2), lesson rows (P3), release flip (R).
  Review follow-ups (2026-11-20): scripts live in tools/assets/roster24-art/ (make-rig-source.py, clear-enclosed-grey.py, key-grey-box.py) and tools/assets/portrait-rig/
  (body_plans/serpent.py, r24/ouroth.landmarks.json, tune-ouroth-anim.py, ouroth-ko-keys.py). Keying step used on the source: key-grey-box.py with box 65 135 115 185 (defaults lum 105, sat 0.2).
  Art box is now 170x160 (squarish coil) but the sim body is still ouroth [200, 90] in src/core/data/size.ts: check the hurtbox in a real-game screenshot and retune the size (sim change, not part of P1).
  brazgor-ko-keys.py still has the old off-by-one (oy = bb[3] - floor), so Brazgor KO frames sit 1 px high: fix on a Brazgor re-bake. docs/REPO-MAP.md and portrait-rig/README.md rows for serpent/r24/new scripts left for the REPO-MAP owner (shared file).
