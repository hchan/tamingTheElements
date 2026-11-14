---
status: idea
added: 2026-11-13
---

# Curomo slot 3: Brine Leech (minion, water)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A pale eel-leech slides along the floor toward the foe at 70% hero speed and latches on contact for 150 ticks: slow 30%, 1 hp per 10 ticks. Dies on any hit or at 12 hp.
- **Builds on:** Puddle (mobile). Cooldown 600 ticks, duration 250 ticks after arming.
- **Counterplay:** Cleanse or Dash breaks the latch; any hit kills it; fire evaporates it; Guard blocks the latch
- **Sim hook:** Trap entity gets a `chase` flag: each tick it steps toward the foe; on overlap it applies the Puddle slow plus a drip tick. 5 hp tithe on cast.
- **View:** reuse the Puddle painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
