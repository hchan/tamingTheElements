---
status: idea
added: 2026-11-13
---

# Ishimi slot 3: Bloat Slime (trap, water)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A slime sac swells during arming, bursts on touch into three globs: foe slowed 50% for 120 ticks and the floor stays sticky for 60 ticks.
- **Builds on:** Puddle. Cooldown 500 ticks, duration 250 ticks after arming.
- **Counterplay:** Dash through; Cleanse; burning the sac early (it pops for no damage)
- **Sim hook:** Puddle with a longer linger and a splash radius; no new state.
- **View:** reuse the Puddle painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
