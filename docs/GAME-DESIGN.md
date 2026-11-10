# Game design

Taming the Elements is a top-down elemental arena game. Tables between `<!-- gen:NAME -->` markers are generated from
`src/core/data` by `pnpm docs:gen` (`tools/gen/gen-design-tables.ts`); `tests/repo/docs-tables.test.ts` fails when they
are stale. Edit data, not the tables.

## Core loop

Pick an elemental, fight an opponent in a 1280x720 arena, win XP, capture weakened opponents (from chapter 2) into your
garrison, and swap garrison members in battle. Each chapter has an XP cap and objectives; chapter 4 ends with the Eternal
Void boss (uncapturable), and chapter 5 is post-game.

## Elements

Advantage multiplies the attacker's damage by 1.25; disadvantage divides it by 1.25; void is neutral both ways. Read
along the attacker's row. 0.8 means x/1.25 exactly: the code divides by 1.25 rather than multiplying by 0.8, which
matters for exact parity.

<!-- gen:elements -->
| Attacker \ Defender | fire | air | earth | water | void |
| --- | --- | --- | --- | --- | --- |
| fire | 1 | 1.25 | 1 | 0.8 | 1 |
| air | 0.8 | 1 | 1.25 | 1 | 1 |
| earth | 1 | 0.8 | 1 | 1.25 | 1 |
| water | 1.25 | 1 | 0.8 | 1 | 1 |
| void | 1 | 1 | 1 | 1 | 1 |
<!-- /gen:elements -->

## Characters

14 entries: 12 playable races (one per element x alignment, though Morblass and Curomo are both water/good and legacy
has no water/evil race, kept for parity), the Eternal Void boss (uncapturable) and the Dummy (practice, unselectable).
Speed is px/tick at 50 Hz; HP is at level 0.

<!-- gen:characters -->
| Race | Element | Alignment | Speed | HP | Abilities |
| --- | --- | --- | --- | --- | --- |
| Curomo | water | good | 6 | 100 | Ice Shock, Shards of Ice |
| Cyclonius | air | evil | 7 | 100 | Tornado, Wind Cone |
| Dummy | void | neutral | 0.2 | 100 | Stick |
| Echo | air | neutral | 6 | 100 | Fade, Hurricane |
| Eternal Void | void | evil | 8 | 1000 | Chaos Bolt, Chaos Orb |
| Fiara | fire | good | 7 | 130 | Fire Heal, Fireball |
| Ishimi | water | neutral | 7 | 100 | Circus of Slime, Slime Blast |
| Lavax | fire | neutral | 6 | 100 | Crimson Fire, Fire Dance |
| Morblass | water | good | 7 | 100 | Ice Blast, Icicles |
| Pax | earth | evil | 5 | 150 | Adrenaline, Ground Shock |
| Rokcore | earth | good | 7 | 120 | Rock Armour, Rock Pellet |
| Sindarosa | fire | evil | 7 | 100 | Fire Blast, Translucent Flame |
| Treenoc | earth | neutral | 6 | 90 | Entangling Vines, Strangling Branches |
| Wispera | air | good | 5 | 100 | Sonar Blast, Steal Health |
<!-- /gen:characters -->

## Abilities

Times are in ms (ticks = ms/20). `Max` is the number of simultaneous instances; speed is px/tick. Capture damage is
`Number.MAX_VALUE` (shown as inf) and bypasses multipliers. Hurl Rock and Elemental Advantage: Fire cone are unused
legacy data, kept as-is.

<!-- gen:abilities -->
| Ability | Kind | Dmg/Heal | Cooldown ms | Dur ms | Max | Speed | Used by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Capture | capture | inf | 5000 | - | 1 | 8 | all players from chapter 2 |
| Wind Cone | range | 13 | 400 | - | 4 | 8 | Cyclonius |
| Tornado | range | 0 | 6000 | 3000 | 1 | 8 | Cyclonius |
| Stick | range | 10 | 2000 | - | 1 | 8 | Dummy |
| Fire Blast | range | 40 | 600 | - | 2 | 8 | Sindarosa |
| Icicles | range | 10 | 300 | - | 3 | 10 | Morblass |
| Hurl Rock | range | 40 | 500 | - | 2 | 8 | unused |
| Sonar Blast | range | 40 | 600 | - | 2 | 8 | Wispera |
| Fireball | range | 15 | 600 | - | 2 | 8 | Fiara |
| Crimson Fire | range | 13 | 400 | - | 2 | 10 | Lavax |
| Rock Pellet | range | 20 | 400 | - | 3 | 9 | Rokcore |
| Slime Blast | range | 10 | 1500 | - | 3 | 8 | Ishimi |
| Shards of Ice | omni | 20 | 10000 | - | 8 | 10 | Curomo |
| Circus of Slime | omni | 16 | 10000 | - | 4 | 5 | Ishimi |
| Chaos Bolt | range | 40 | 600 | - | 3 | 10 | Eternal Void |
| Chaos Orb | range | 140 | 5000 | - | 1 | 2 | Eternal Void |
| Elemental Advantage : Fire cone | range | 80 | 1000 | 3000 | 3 | 8 | unused |
| Ground Shock | melee | 25 | 3000 | - | 1 | - | Pax |
| Adrenaline | buff | - | 15000 | 3000 | 100 | - | Pax |
| Translucent Flame | buff | - | 6000 | 1500 | 100 | - | Sindarosa |
| Ice Blast | debuff | 15 | 6000 | 3000 | 100 | 8 | Morblass |
| Steal Health | melee | 10 | 1000 | - | 2 | - | Wispera |
| Fire Heal | heal | 10 | 40000 | - | 100 | - | Fiara |
| Ice Shock | melee | 20 | 1000 | - | 2 | - | Curomo |
| Rock Armour | buff | - | 15000 | 3000 | 100 | - | Rokcore |
| Hurricane | melee | 13 | 6000 | 3000 | 100 | - | Echo |
| Fade | buff | - | 10000 | 3000 | 100 | - | Echo |
| Fire Dance | buff | - | 16000 | 5000 | 100 | - | Lavax |
| Strangling Branches | melee | 20 | 1000 | - | 2 | - | Treenoc |
| Entangling Vines | melee | 0 | 5000 | 3000 | 2 | - | Treenoc |
<!-- /gen:abilities -->

## Progression

Level multiplier m(L) = 1.1^L applies to max health (floored), damage and heal; exact doubles are in
`src/core/math/lut.generated.ts` (L5 1.61051, L10 2.59374, L15 4.17725, L20 6.72750).

<!-- gen:chapters -->
| Chapter | XP cap | XP/win | Objective |
| --- | --- | --- | --- |
| 1 | 5 | 1 | first elemental reaches level 5 |
| 2 | 20 | 1-2 | garrison >= 3 and 3 elementals at level 10 |
| 3 | 50 | 1-3 | 3 elementals at level 15 |
| 4 | 100 | 1-4 | defeat the Eternal Void |
| 5 | - | 0 | - |
<!-- /gen:chapters -->

Chapter 2 unlocks the Capture ability; chapter 4 completes the game.

## Settings and constants

Difficulty divides the player's HP, damage and heal (enemies are unaffected): Easy 0.25, Casual 0.66 (default), Normal
0.85, Hard 1.12, WTF 1.5. Display scale: 1, 1.1, 1.25 (default), 1.4, 1.6. Garrison sort: 1 = XP, Name, Type (default);
2 = Name, XP, Type; 3 = Type, XP, Name. Swap cooldown 5000 ms (250 ticks); capturable at <=25% HP; bench rest heals 0.5%
max HP per second; character 80x80.
