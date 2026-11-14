---
status: done
added: 2026-11-13
---

# QA: top HUD is verbose and has empty boxes

Severity: medium. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/hit-2.png, 2v2-0.png

Flat green life bar, a '100% OK / Life 272/272' text stack, an empty green outline box under each name (status slot, empty most of the time), '0' hyper bars beside the clock, the fullscreen button overlapping the P2 portrait corner. In 2v2 the BENCH / TAG READY text is tiny and the bench bar repeats the main bar. DUPLICATE of the in-progress HUD work; kept as a checklist.


Resolved 2026-11-14 (re-checked with headless 1v1, 2v2 and phone screenshots on main): the textured life bar, the one-line name and Life readout, no empty status box, no hyper bars and the fullscreen button clear of the portrait were already fixed by the recent HUD work. What remained was the duplicated ROUNDS caption under the clock; it is now written once, centred under the pips. The bench TAG caption stays small on purpose (it is the cooldown label; the portrait carries the information).
