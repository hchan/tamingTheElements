---
status: done
added: 2026-11-15
---

# Tour card vs fight consistency (QA r67)

QA r67 reported the Tour map card (Opponent Fiara/Echo/Treenoc, Location Fire) disagreeing with the splash and fight (Pax, Earth arena).

Done 2026-11-15: not a bug. The two screens came from two separate browser launches, and each launch rolls a fresh Tour seed. Within one run the card, splash and fight all read `currentStage(run)`. `src/game/app/tour-fight.test.ts` now pins it: for 3 teams, 4 seeds, all 9 stages and all continue counts, the real sim's round-1 arena element, hero team and opponents equal what the card shows (and a continue changes the match seed, never the stage). QA process: compare in one page or pin `?seed=`.
