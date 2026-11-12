---
status: in-progress
added: 2026-11-12
---

# Show the danger zone of big abilities

Follow-up from ability-audit (static graphics pass, docs/ABILITY-AUDIT.md). Ground Shock and Hurricane hit a 240x240 box but draw 80x80 art; Entangling Vines and Steal Health reach 360 and 240 px from 80 px art; Crimson Fire's box (80x40) is larger than its see-through sprite. Add a faint telegraph (ring or line at the true box, during the 250 ms delay) and make dark sprites (Chaos Orb, Crimson Fire, Adrenaline, Strangling Branches) brighter. View only, no sim change; verify with real-game screenshots on each floor.

## Progress

- Slice 1 (done, renderer only): `src/game/fx/danger-view.ts` + `danger-zone.ts` outline every live melee box at its true hit size (dashed black and white pair with corner brackets, so never colour alone; a short pulse at the cast, steady under reduced motion). The sim hits one tick after a cast, so this marks the zone while it is live, not before it. Tests: `danger-zone.test.ts`, `tests/e2e/danger-zone.spec.ts`.
- Open: a true wind-up before the hit needs a sim delay (SIM_VERSION bump); brighter dark sprites (Chaos Orb, Crimson Fire, Adrenaline, Strangling Branches); projectile-size cues for Crimson Fire; screenshots on each floor.
