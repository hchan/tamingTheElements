---
status: epic
added: 2026-11-16
---

# Epic: Abilities, AI and balance follow-ups

Open AI behaviour bugs, ability mechanics and balance outliers not covered by the main balance-and-ai epic.

- Suggested order: AI stalemate/overlap bugs first (they affect every sim run), then balance outliers (2v2, 3v3, Pax speed), then ability mechanics and support abilities.
- Size: L overall; mostly S to M.
- Dependencies: Run balance:compare after each. Complements [balance-and-ai](balance-and-ai.md).
- Owner-gated: A stated reason is required for any balance:record or golden re-record.

Member ideas, in suggested priority order (work them as separate small work packages):

- [ai-stunned-overlap-open-field](../brainstorm/ai-stunned-overlap-open-field.md): AI leaves a stunned foe overlapped in open field. Hard AI no longer leaves a stunned foe alone at the wall (WALL-3b), but in the open field it still stands inside a stunned foe.
- [ai-step-apart-normal](../brainstorm/ai-step-apart-normal.md): Never stand inside the foe, at Normal too. WALL-2 limits the "step apart when boxes overlap" AI rule to Hard.
- [ai-toward-half-sum](../brainstorm/ai-toward-half-sum.md): AI "toward" uses a half-sum of centres. The AI direction towards the foe is built from a half-sum of box centres, which loses a pixel on odd widths and differs from the sim centre-distance.
- [ai-phantom-double-tap-dash](../brainstorm/ai-phantom-double-tap-dash.md): Phantom double-tap dash in the AI. The scripted AI can emit a dash command that the sim reads as a double tap while the hero is pinned at a wall.
- [ai-fire-blast-growth-prediction](../brainstorm/ai-fire-blast-growth-prediction.md): ai-fire-blast-growth-prediction. Teach the Arcade AI that Fire Blast grows (75 x 15 to 115 x 55) so it dodges and aims using the grown box.
- [cc-ai-observation-and-retune](../brainstorm/cc-ai-observation-and-retune.md): Crowd control: AI reads CC, then retune before default-on. CB0-CB5 are merged with withCrowdControl off by default (?ff=cc turns it on in dev).
- [qa-r20-ai-hazard-dodge-not-observed](../brainstorm/qa-r20-ai-hazard-dodge-not-observed.md): QA r20: AI hazard dodging not observed in real-time play. Real-time play (no manual=1), seed 7, Pax as AI, hero vs Pax on each stage, weather super fired once per stage.
- [classic-ai-personality-axis](../in-progress/classic-ai-personality-axis.md) (in progress): Classic AI personality axis. docs/ABILITY-AUDIT.md finding 9: Classic scripted results are identical at 2 and 6 seeds, so Classic usage numbers (ability:usage --ruleset classic) a
- [arcade-ai-combo-chaining](../in-progress/arcade-ai-combo-chaining.md) (in progress): Arcade AI combo chaining (fun-gate: median combo hits 1, target 2). SIM_VERSION 43, Arcade AI only (src/core/agents/scripted-ai/arcade.ts).
- [2v2-time-over-regression](../in-progress/2v2-time-over-regression.md) (in progress): 2v2 time-over rate regression. After giant heroes slice 2 (SIM_VERSION 45) the Arcade 2v2 time-over rate was 0.101 against about 0.02 earlier.
- [arcade-balance-after-cleanse](../in-progress/arcade-balance-after-cleanse.md) (in progress): Arcade balance after Cleanse and the 2v2 time-over fix. Measured at SIM_VERSION 48: Arcade 1v1 tournament (16 seeds) is 43.8-53.4 percent (Cyclonius lowest, inside 40-60), so no 1v1 change.
- [balance-2v2-echo-pax-r37](../brainstorm/balance-2v2-echo-pax-r37.md): Arcade 2v2: do the Echo / Pax outliers survive random partners? (r37). Follow-up to balance-outliers.md. Analysis only:
- [pax-treenoc-team-step](../brainstorm/pax-treenoc-team-step.md): Pax and Treenoc team step. After v86 pax is 55.4% in 2v2 and treenoc 44.7%.
- [void-boss-retune](../brainstorm/void-boss-retune.md): Void boss retune. Hero win rates against the Void on Normal and with partners are too low.
- [3v3-balance-and-round-length](../brainstorm/3v3-balance-and-round-length.md): 3v3 balance and round length. At SIM_VERSION 77 (measured by the FG-RL planner, legacy 12, 4 seeds, 264 matches, report only) Arcade 3v3 race win rates span 0.114-0.750, the round 
- [pax-speed-10-vs-5](../brainstorm/pax-speed-10-vs-5.md): Pax speed 10 versus 5. data/characters.ts line 27 gives Pax speed 10 while other docs and the legacy data say 5.
- [dash-parry-weather-usage](../brainstorm/dash-parry-weather-usage.md): Dash, Parry, Weather and Charge usage metrics. ability:usage covers the two ability slots only.
- [weather-secondary-effects](../brainstorm/weather-secondary-effects.md): Weather secondary effects: Sandstorm and Gale. Split from dead-ability-cleanup: Sandstorm slows projectiles, Gale pushes knockback further (sim change, SIM_VERSION bump).
- [wispera-fearful-lightning](../brainstorm/wispera-fearful-lightning.md): Wispera: more fearful, with lightning. Owner, 2026-11-15: "wispera can be modified to be more fearful with lightning".
- [backline-support-abilities](../brainstorm/backline-support-abilities.md): Support abilities for the backline (heal, boost, cleanse). Owner idea (2026-11-14): abilities that heal, boost or cleanse the backline (the benched tag partner in 2v2).
- [elemental-ability](../in-progress/elemental-ability.md) (in progress): Always-available elemental ability (a WoW-racial style button). Every hero gets one extra button, chosen by the hero's element, on its own cooldown.
- [elemental-cleanse](../in-progress/elemental-cleanse.md) (in progress): Cleanse for every elemental (HIGH PRIORITY). Owner request (2026-11-13): all elementals should have a cleanse, one per element, each with its own animation, a sound when it is activated, and a co
- [hot-dot-abilities](../in-progress/hot-dot-abilities.md) (in progress): New abilities: heal over time (HoT) and damage over time (DoT). Owner idea (2026-11-14): create new abilities, including HoT (heal over time) and DoT (damage over time).

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [run-away-run-towards](../brainstorm/run-away-run-towards.md): Run Away / Run Towards (auto-run ability, Tab)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### AB-1 AI overlap and stand-off fixes

- Members: [ai-stunned-overlap-open-field](../brainstorm/ai-stunned-overlap-open-field.md), [ai-step-apart-normal](../brainstorm/ai-step-apart-normal.md), [ai-toward-half-sum](../brainstorm/ai-toward-half-sum.md), [ai-phantom-double-tap-dash](../brainstorm/ai-phantom-double-tap-dash.md), [qa-r20-ai-hazard-dodge-not-observed](../brainstorm/qa-r20-ai-hazard-dodge-not-observed.md)
- Size: M
- Shared files: src/core/agents/*, AI tests
- Flags: SIM, PC (tournament balance runs)
- Parallel: Serial with AB-2, BA-2 (same agent files) and any other SIM bundle; parallel with HUD, FX, art and tools bundles.

### AB-2 AI observation and personality

- Members: [ai-fire-blast-growth-prediction](../brainstorm/ai-fire-blast-growth-prediction.md), [cc-ai-observation-and-retune](../brainstorm/cc-ai-observation-and-retune.md), [classic-ai-personality-axis](../in-progress/classic-ai-personality-axis.md), [arcade-ai-combo-chaining](../in-progress/arcade-ai-combo-chaining.md)
- Size: M
- Shared files: src/core/agents/*
- Flags: SIM, PC. Check in-progress members first
- Parallel: Serial after AB-1.

### AB-3 Team and speed balance outliers

- Members: [balance-2v2-echo-pax-r37](../brainstorm/balance-2v2-echo-pax-r37.md), [pax-treenoc-team-step](../brainstorm/pax-treenoc-team-step.md), [pax-speed-10-vs-5](../brainstorm/pax-speed-10-vs-5.md), [2v2-time-over-regression](../in-progress/2v2-time-over-regression.md)
- Size: M
- Shared files: src/core/sim/*, src/core/data/*, goldens, tests/fixtures/balance/baseline.json
- Flags: SIM, PC (balance:compare)
- Parallel: Serial with every SIM bundle.

### AB-4 Round length and boss retune

- Members: [3v3-balance-and-round-length](../brainstorm/3v3-balance-and-round-length.md), [void-boss-retune](../brainstorm/void-boss-retune.md), [arcade-balance-after-cleanse](../in-progress/arcade-balance-after-cleanse.md)
- Size: M
- Shared files: src/core/sim/*, src/core/data/*, goldens, tests/fixtures/balance/baseline.json
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle; run after AB-3 (same baseline).

### AB-5 Weather, parry and support abilities

- Members: [dash-parry-weather-usage](../brainstorm/dash-parry-weather-usage.md), [weather-secondary-effects](../brainstorm/weather-secondary-effects.md), [wispera-fearful-lightning](../brainstorm/wispera-fearful-lightning.md), [backline-support-abilities](../brainstorm/backline-support-abilities.md), [run-away-run-towards](../brainstorm/run-away-run-towards.md)
- Size: L
- Shared files: src/core/data/abilities*, src/core/sim/*, ability docs
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle.

### AB-6 Finish in-progress ability work

- Members: [elemental-ability](../in-progress/elemental-ability.md), [elemental-cleanse](../in-progress/elemental-cleanse.md), [hot-dot-abilities](../in-progress/hot-dot-abilities.md)
- Size: S
- Shared files: src/core/data/*
- Flags: Check status first; may already be shipped and only need moving to done/. SIM if code remains
- Parallel: Serial with SIM bundles.
