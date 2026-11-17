---
status: idea
added: 2026-11-16
---

# QA r87 findings

Round r87 on main 0dd24edd. Headless Chromium, seed 7, shots in `.scratch/r87/` (gitignored). No code changed. Covered 390x844, 360x640, 844x390 and 1280x720: menu, Help, Versus picker, Play fights with a melee (Curomo) and a ranged (Sindarosa) hero, 3v3 (portraits and 390/360 only for the 3v3 bar numbers).

## r86 fixes verified

- P1 (Help vs Charge tile): Help now says "Ranged heroes have no charge, so the button is dimmed", matching the dimmed Melee tile at all sizes.
- P5 (Help chips): at 390 the Jump to row is one scrolling line.
- P2/P3 (portrait bar): ranged hero at 390 and 360 shows 8 tiles in one row (48px at 390, 45px at 360), Blast and Flame hidden. No empty row.

## Ranked findings

### P1. The one-row portrait bar only holds for ranged heroes
A melee hero has an extra Charge tile, and a hero with a Snag tile adds another. Curomo (Snag, Charge, Weather, Dash, Guard, Super, Puddle, Tidecall, Cleanse) is 9 tiles, so the bar drops back to two rows of 48px with Cleanse alone on the top row (the r86 P2 empty strip again). 3v3 has 10 tiles: two rows, two orphan tiles above.
Shots: `.scratch/r87/p390-4-fight-melee.png`, `.scratch/r87/p390-6-3v3.png`.
Fix: shrink tiles to about 40px for nine or ten in a row if the 44px rule allows an exception, or fill row 1 evenly (move the overflow tiles in pairs), or scroll sideways. Also add a test with a melee hero at 390.

### P2. Sky void above the crowd at 390x844
The top 35-40% of the canvas under the HUD is a flat gradient, in melee and ranged fights (blue-grey for Curomo, brown for Sindarosa). Fighters sit in the lower half at about 55px wide. 360x640 does not have it. Carries r85 P6 and r86 P4.
Shots: `.scratch/r87/p390-4-fight-ranged.png`.
Fix: scale the arena up to fill the tall canvas or give the sky a backdrop layer.

### P3. Help buttons stack five rows below the chips
At 390 the links Key Bindings, Guide, Wiki, Watch the story, About stack in five rows about 300px tall, so "How to fight" starts at 60% down the screen. The chip row also gives no scroll cue ("Ways t" is clipped, which helps a little).
Shot: `.scratch/r87/p390-2-help.png`.
Fix: lay the links out two per row, or place them under the sections.

### P4. Benched Tag tiles read "STUN" in 3v3
At 390 the Tag tiles on keys 3 and 4 are labelled STUN for the benched heroes at tick 200, which reads as a status, not a "swap in" action. Possibly the label is the real state, but it was the opening seconds of the round. Needs a check in a long fight.
Shot: `.scratch/r87/p390-6-3v3.png`.

### P5. 360 tiles are 45px, short of 48
The one-row bar at 360x640 is 45px per tile (above the 44 floor, below the 48 used at 390). Fine, noted.

### P6. Not checked this round
Tap-to-fire on tiles, Super cut-in, Tour, no e2e run, portrait 3v3 at 360 (bar numbers only, no shot read). Landscape bar for a melee hero.

## Passed

- Menu exactly Play, Versus, Online, Settings, Help at all four sizes; no mode words anywhere read.
- Landscape 844x390: bar single row, Strike circles and Pause to the right of the canvas, none overlapping.
- Desktop: bar one row of 10 tiles, hazard chips readable, Melee tile dimmed for ranged hero.
- Versus picker clean at 390.
