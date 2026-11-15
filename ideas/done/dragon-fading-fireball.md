---
status: done
added: 2026-11-14
---

# Red dragon (Sindarosa) fireball that widens and fades with distance

Owner remembered a legacy fireball that grows wider, fades and hits softer as it travels. Checked `abilities.js` at tag `legacy-crafty-1.0`:

- **Sonar Blast** (lines 500-555) is that projectile: alpha x0.99, damage x0.98 and height x1.015 (then width) every 10 ms Delay step. It is not red-dragon specific.
- **Fireball** (602-655) does the opposite: starts at alpha 0.25 and a quarter of the damage, then gets more opaque, wider and stronger with distance (a cap typo means it is never capped, see KNOWN-BUGS `fireball-damage-cap-typo`).
- Sindarosa (the red dragon) has Fire Blast and Translucent Flame, no fireball of its own.

Idea: give Sindarosa's Fire Blast the Sonar-style decay (wider, fainter, weaker over range) so it plays as a close-range shotgun and differs from Fiara's growing Fireball. Arcade-only, sim-changing (one sim agent at a time, after hero movement merges); needs a SIM_VERSION bump and a balance check.

Done 2026-11-15 (SIM_VERSION 71): Fire Blast now grows and fades in Arcade, see [FUN-DESIGN 2.27](../../docs/FUN-DESIGN.md) and [BALANCE](../../docs/BALANCE.md). It borrowed the Sonar shape (wider, fainter, weaker) but with a 20-tick full-strength window, so the blast still hits hard up close.
