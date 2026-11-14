---
status: done
added: 2026-11-14
---

# Super: damage lands late and no super sfx cue

Measured twice (desktop and phone, identical): Rokcore (321 HP) takes 0 damage through the first 30 ticks after Fiara supers, and 83.5 (26%) after 90 ticks. The r26 note (28 of 321 in 30 ticks) is the same effect seen earlier in the animation. For SF/MvC feel the hit should land within about 15 ticks with a screen flash. Also __TTE__.sfxLog after the super shows only click, hit, cast and hit cues, with no super-specific cue. Add a super cast sound and check it in sfx-wiring.

## Progress

- 2026-11-14: super sfx done (cue "super" in arcade-cues.ts, mapped to superStarted). Damage timing deliberately NOT changed (sim); the late-damage half stays open, so this file stays in brainstorm.
- 2026-11-14 (SIM_VERSION 58): late damage fixed in the sim. Super freeze 40 -> 16 ticks; the first super hit is a heavy opener
  (full super hit-stop), and follow-ups take a 4-tick stop (SUPER_FOLLOW_STOP_TICKS) instead of 10. Beam: opener 90 then 20s
  (25 ticks, every 5). Vortex: opener 64 then 18s (30 ticks). Quake: opener 90 then 32, rings every 6 ticks (was 60 every 10),
  and a giant caster's rings grow by its extra width (Rokcore's first ring now reaches an adjacent foe). Tide: 20 px a tick.
  Titan Slam: opener 92 then 37. Measured with `tools/sim/super-timing.ts` (adjacent foe, every race pair): the first damage
  lands on frame 17 after the press for every race (was 41). Totals as % of max HP, every hit landing: Curomo 31.7, vortex
  races 27.9, beam races 32.4, Ishimi 33.6, Pax 34.0, Rokcore 35.4, Treenoc 31.6, Morblass 36.3 (the Hailstorm icicles push it
  slightly over 35). Super hits already pulse the screen (event-fx superHit flash). Pinned by
  `src/core/sim/systems/arcade/super-timing.test.ts`. Both halves are done, so the file moves to ideas/done.
