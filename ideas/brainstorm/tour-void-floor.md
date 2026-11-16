---
status: idea
added: 2026-11-15
---

# Tour Void stage has no void floor

The last Tour stage says "Void" on the card and "The Eternal Void" on the splash, but the fight floor is a random element: `matchSeed` returns the base seed for `terrain: 'void'` and the sim has no void floor kind. Decide what the Void arena should look like and make it a render-only floor (no sim change) or a deliberate sim kind. Also unify the card wording with the splash ("The Eternal Void"). `tour-fight.test.ts` currently pins the floor as 1..4; update that assertion on purpose when this lands.
