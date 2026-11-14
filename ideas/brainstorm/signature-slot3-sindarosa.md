---
status: idea
added: 2026-11-13
---

# Sindarosa slot 3: Ashen Maw (trap, fire)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A buried maw of ash: on touch it snaps shut (18 damage, root 60 ticks, burning). A bite, not a blast.
- **Builds on:** Spike. Cooldown 550 ticks, duration 160 ticks after arming.
- **Counterplay:** Cleanse removes the root; water douses it; Dash before it closes (arm tell: wisps rise)
- **Sim hook:** Spike with a root instead of a stun (reuse Snag root) and a burn.
- **View:** reuse the Spike painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
