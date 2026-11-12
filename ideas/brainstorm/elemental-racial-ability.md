---
status: idea
added: 2026-11-12
---
# Always-available elemental ability (a WoW-racial style button)

Every hero gets one extra button, chosen by the hero's element, on its own cooldown. It is always there (no meter, no charge needed), like a
WoW racial: a short self-buff with a long cooldown, so it adds a decision (when to burn it) without a new resource.

| Element | Effect (first numbers, to tune) |
| --- | --- |
| Fire | attack +25% for 5 s |
| Water | cleanse: remove every debuff (root from Snag, Puddle slow, burn, freeze, ...) |
| Air | speed +30% for 5 s |
| Earth | armor +30% (damage taken) for 5 s |

Open design questions:
- Cooldown about 30 to 40 s (a match is about 60 to 90 s, so 1 to 2 uses). Water cleanse might get a shorter one since it is situational.
- Overlap with existing systems: Super meter, Guard, Dash, Weather, Charge, Trap, Snag. Check it does not make Weather's element boost redundant (a
  fire hero in Sunshine already gets a damage buff; decide whether they stack).
- Void and any non-four element heroes need an effect (or none).
- Water cleanse needs a list of what counts as a debuff in `src/core` (Snag root, Puddle slow, burn, stun?). Should it grant brief immunity?
- Does it break the low-race balance work (Lavax, Cyclonius, Rokcore)? An element buff favours some kits more: re-run the 24-seed matrix.
- Button/key: next free digit (all of 0 to 9 are used by the numbered action row; see TOUCH_DIGIT in touch-controls.ts), touch button, HUD cooldown read-out,
  announcer line, a11y status words, AI usage (Normal AI should use it on a rule: fire when a hit is about to land, water when debuffed, ...).
- Sim change: needs SIM_VERSION bump and an Arcade re-record; goldens/baselines with a stated reason.
- Player-facing name: avoid the word "racial"; call it by the element ("Ember", "Cleanse", "Gale", "Stoneskin" are placeholders).
