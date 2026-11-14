---
status: done
added: 2026-11-14
---

# Super: portrait still in opaque black box (r26 issue persists)

fiara vs rokcore, setMeter(0,1000), step(1,[1<<13,0]), stepLive 6: the PHOENIX RISE banner portrait sits in an opaque black square with an orange border (super-desk-1-t6.png). On phone it is the same (super-phone-1-t14.png). Use the cut-out sprite with no backing, or a soft vignette. Reproduced twice, deterministic.

## Progress

- 2026-11-14: opaque card replaced by an additive element-colour glow behind the cut-out (src/game/fx/super-view.ts).
