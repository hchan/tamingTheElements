---
status: done
added: 2026-11-13
done: 2026-11-13
---

# QA r6: floor labels read as debug text, unlabeled HUD pips (done part of qa-r6-floor-label-clutter-and-hud-pips)

- Floor pad words ("FIRE x2", "WATER +HP", "AIR x2") now show only for 4 s (fading over the last second) the first time each stage appears;
  the glow ring, pad art and the HUD badge carry it after (src/game/fx/terrain-view.ts, `labelHintAlpha`).
- Trap words ("P1 Fire Bomb") show only while the trap arms, so they no longer sit on the sprite once armed (src/game/fx/trap-view.ts).
- The round pips have a small "ROUNDS" caption under each pair (src/game/hud/round-view.ts) and the segments read "SUPER n" (src/game/scenes/Hud.ts).

Left in the original idea: element-tinted life bars with a chip trail and low-health flash, and the crowd lighting.
