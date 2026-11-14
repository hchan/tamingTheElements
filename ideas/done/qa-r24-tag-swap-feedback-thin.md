---
status: done
added: 2026-11-14
---

# QA r24: 3v3 tag works but swap feedback is subtle

Verified: the bench shows 3 portraits per side with TAG READY and cooldown timers, Digit3 swaps, a KO shows a red X on the portrait and the next hero arrives under a big "SINDAROSA IN!" banner (tg-05-ko0).

Gaps: the action-bar Tag slots show tiny thumbnails labelled only "Tag", so which hero is which is unclear (add a name or HP pip); the swap-in has no entrance effect on the arena (a flash or drop-in, as in Marvel vs Capcom assists); the banner dims the whole arena heavily.

Done 2026-11-14: HUD bar flash on the incoming hero (tag-view.ts; reduced motion drops the growth). The arena flash and TAG! call already existed. Action-bar Tag slot names not added.
