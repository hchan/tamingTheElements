---
status: done
added: 2026-11-19
---

# Start a combo in view

Keep the foe in view when a combo starts so the anchored counter rarely needs the wall clamp. Follow-up to [combo-counter-anchoring](../done/combo-counter-anchoring.md).

## Progress

2026-11-26: done, render only. `keepInView` in `src/game/fx/arena-camera.ts` shifts the eased camera centre so both fighters stay at least 48 world px inside the view while the ease lags a launched victim (no src/core change, no SIM_VERSION bump). Test in `arena-camera.test.ts`.
