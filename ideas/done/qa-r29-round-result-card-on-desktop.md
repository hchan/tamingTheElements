---
status: done
added: 2026-11-14
---

# Desktop result card sits over the fighters with the K.O. banner still visible

Phone is fixed, desktop is not: the K.O. banner stays above the ROUND 1 WON card and both cover the fighters (shots/res-desk-1-after-20.png). Hide the banner when the card shows, as on phone.

ROUND 2 banner capture and desktop Help/Settings were not verified this round.

## Progress

- 2026-11-14: done. ResultState.compact now means the card is up (every size), so the banner steps aside (round-result-view.ts only; banner-lanes and round-view untouched). The card still sits over the middle floor (SLAB_Y 392).
