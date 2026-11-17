---
status: idea
added: 2026-11-17
---

# Weather secondary effects: Sandstorm and Gale

Split from dead-ability-cleanup (2026-11-17). FUN-DESIGN 2.14 planned one side effect per weather. The `WEATHER_EFFECTS`
rows in src/core/data/arcade.ts are still read by no system (`WEATHER_EFFECTS_ON = false`; only
src/core/sim/systems/arcade/weather.test.ts reads them, as a pin).

Already built in other systems (nothing to do here):
- The Sun cast frees every Snag rope (snag.ts `freeAllRoots`, called from weather.ts).
- With flag withCrowdControl, no hero can be Iced under Sun and the Sun thaws Iced (cc.ts), in place of the planned
  faster melt.
- With flag withOverTime, the Rain cast puts out burning (over-time.ts `douseAllBurn`).

To build (gameplay change: needs the owner's design approval first):
- Sandstorm: an Arcade projectile spawned while Sandstorm is up moves at 900/1000 of its speed.
- Gale: knockback started while Gale is up is 1100/1000 as fast (`setKnockback` in
  src/core/sim/systems/arcade/knockback.ts).
- Integer maths only (sim-core rules). Arcade only: Classic hashes must not move.
- Then drop the unread Sun and Rain rows and `WEATHER_EFFECTS_ON`, and update the weather.test.ts pin.
- Sim change: bump SIM_VERSION with the reason in src/core/version.ts; re-record goldens (`golden:record`) and the
  Arcade balance baselines (`balance:record`) with that stated reason. One sim-changing agent at a time.
- Player text: the Guide `WEATHER_EXTRA` (src/ui/screens/guide-data.ts) and the Help weather line
  (src/ui/screens/help-guide.ts), without the words Classic, Arcade, ruleset or Capture. Docs: FUN-DESIGN 2.14 and the
  Weather row of docs/ABILITY-AUDIT.md.
- Any view cue (sand haze on shots, longer knockback streak) touches event-fx.ts or Arena.ts: coordinate with work in
  flight there.
