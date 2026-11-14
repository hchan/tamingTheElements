---
status: done
added: 2026-11-14
---

# First Blood hint box covers the lower middle of the arena (r18)

On a fresh Play fight the "First Blood" tip is a wide panel (about 580x110 px at 1280x720; about 430x50 on phone) sitting over the floor between the fighters and the ability bar, with a Got it button. It stays up while the round clock runs (90 shown), hiding traps and the approach lane at the moment the player is deciding. Idea: hold the round intro until Got it, or dock the tip into the top band under the HUD, or fade it after the first move. Check: no first-run text over the floor once the timer runs.

Done (2026-11-14): at 501-800 px tall windows the card is a slim strip (lines left, Got it right, 85 px not 113 px) and fades after 2.5 s instead of 4 s. Test: tests/e2e/first-run-hint.spec.ts.
