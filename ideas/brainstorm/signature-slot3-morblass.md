---
status: idea
added: 2026-11-13
---

# Morblass slot 3: Rime Urchin (trap, water)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A frozen urchin mine: spines extend when armed; touch freezes (stun 40 ticks) and deals 12.
- **Builds on:** Spike. Cooldown 550 ticks, duration 160 ticks after arming.
- **Counterplay:** Guard stops the freeze; Cleanse after; fire melts it in 20 ticks
- **Sim hook:** Spike with shorter stun, a lower hit and a `freeze` status tag for the view.
- **View:** reuse the Spike painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
