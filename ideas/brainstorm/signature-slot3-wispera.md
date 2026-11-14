---
status: idea
added: 2026-11-13
---

# Wispera slot 3: Mote Swarm (minion, air)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A cloud of pale gnat-lights orbits the foe, stealing 1 hp per 12 ticks and healing Wispera (capped at 10 hp total).
- **Builds on:** Gust (mobile). Cooldown 650 ticks, duration 150 ticks after arming.
- **Counterplay:** Cleanse disperses it; area attacks (tornado, wind-cone, hurricane) kill it; Dash does not shake it
- **Sim hook:** `chase` flag plus orbit radius 24 px; steal and heal through the existing steal-health path.
- **View:** reuse the Gust painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
