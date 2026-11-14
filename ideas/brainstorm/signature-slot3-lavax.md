---
status: idea
added: 2026-11-13
---

# Lavax slot 3: Magma Vent (trap, fire)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A hairline crack arms for 30 ticks, then erupts a lava column (22 damage, burning, 112 px) and leaves a lava pool for 100 ticks (1 damage per 10 ticks).
- **Builds on:** Fire Bomb + Puddle. Cooldown 600 ticks, duration 120 ticks after arming.
- **Counterplay:** Dash out; water or ice hardens it; Guard
- **Sim hook:** Fire Bomb that on trigger leaves a damaging Puddle; cap 1.
- **View:** reuse the Fire painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
