---
status: idea
added: 2026-11-13
---

# Rokcore slot 3: Stone Husk (minion, earth)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A hunched rock-crab walks in front of Rokcore and blocks shots; it does not attack. Shell of 40 hp.
- **Builds on:** Spike (static blocker). Cooldown 650 ticks, duration 300 ticks after arming.
- **Counterplay:** Fire and air go around; the shell breaks at 40 damage; Charge shoves it
- **Sim hook:** Trap entity with `follow owner` and a projectile-block test (reuse `shotBlocked` terrain rule); no damage.
- **View:** reuse the Spike painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
