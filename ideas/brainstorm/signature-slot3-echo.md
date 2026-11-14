---
status: idea
added: 2026-11-13
---

# Echo slot 3: Resonance Chime (trap, air)

Part of [action-bar-rethink-hero-kits](action-bar-rethink-hero-kits.md); design row in [docs/design/signature-traps.md](../../docs/design/signature-traps.md).
Sim implementation, after the Charge/Dash sim work lands. Needs a SIM_VERSION bump, re-recorded goldens and baselines with a stated reason.

- **Behaviour:** A hanging bone chime: stepped near, it rings and deals 14, then rings again 50 ticks later in a bigger radius (14 more). The second ring shows a ripple first.
- **Builds on:** Gust (two-stage). Cooldown 500 ticks, duration 150 ticks after arming.
- **Counterplay:** Leave the radius in the ripple window; Guard the second ring
- **Sim hook:** Fire Bomb style fuse run twice: a `stage` counter on the trap, second radius 1.5x.
- **View:** reuse the Gust painter in `src/game/fx/trap-paint.ts`, then a dedicated painter with cast, idle, trigger, death and a reduced-motion static pose; one Web Audio synth cue.
- **Done when:** data row, sim rules plus tests, AI usage rule and an ability-usage coverage test, Help/Guide text, balance pass.
