---
status: idea
added: 2026-11-13
---

# Treenoc slot 3: Gnarlroot (minion, earth)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A rooted thorn sapling that does not move: whips foes within 140 px (8 damage, light knockback every 50 ticks) and roots a foe that lingers.
- **Builds on:** Spike (turret). Cooldown 700 ticks, duration 300 ticks after arming.
- **Counterplay:** Fire burns it in 40 ticks; keep range; Cleanse frees the root
- **Sim hook:** Trap that stays armed and repeats its hit every 50 ticks instead of triggering once; cap 2.
- **View:** reuse the Spike painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
