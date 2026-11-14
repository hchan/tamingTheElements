---
status: idea
added: 2026-11-13
---

# Fiara slot 3: Ember Moth (minion, fire)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A glowing moth flutters at the foe and bursts on contact (20 damage, 56 px blast) or after 200 ticks.
- **Builds on:** Fire Bomb (mobile). Cooldown 500 ticks, duration 200 ticks after arming.
- **Counterplay:** Any hit pops it early (half blast); water extinguishes; Guard
- **Sim hook:** Fire Bomb with a `chase` flag and the blast radius cut from 112 to 56; 5 hp tithe.
- **View:** reuse the Fire painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
