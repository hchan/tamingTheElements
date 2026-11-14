---
status: idea
added: 2026-11-13
---

# Pax slot 3: Grave Tusks (trap, earth)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** Bone tusks buried in the soil: on touch they burst up for 20 damage and stun 70 ticks, then crumble.
- **Builds on:** Spike. Cooldown 700 ticks, duration 160 ticks after arming.
- **Counterplay:** Guard (reduces it to a stumble); Dash; soil heaves during arming
- **Sim hook:** Spike with a longer stun and cap 1.
- **View:** reuse the Spike painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
