---
status: done
added: 2026-11-14
---

# Hero down is announced twice (r14)

When the active hero is knocked out in 2v2 the polite region says "Your elemental was defeated." and the assertive region says "Lavax is down. Rokcore steps in. Fight!". A screen reader reads both, and the trailing Fight! sticks on the assertive region for the whole match.

Fix: announce only the "Lavax is down" line and clear the assertive region after it is read.
