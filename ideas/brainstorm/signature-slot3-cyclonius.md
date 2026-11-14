---
status: idea
added: 2026-11-13
---

# Cyclonius slot 3: Dust Devil (minion, air)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A small whirl of grit drifts at the foe on a slight curve, shoving (light knockback every 40 ticks, no damage); pushes foes toward walls and traps.
- **Builds on:** Gust (mobile). Cooldown 650 ticks, duration 200 ticks after arming.
- **Counterplay:** Guard; Dash sideways; 10 hp of damage kills it
- **Sim hook:** Gust with a `chase` flag and a repeating shove instead of a single one; curve from a deterministic offset by tick.
- **View:** reuse the Gust painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
