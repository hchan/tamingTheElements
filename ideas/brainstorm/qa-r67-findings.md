---
status: idea
added: 2026-11-15
---

# QA r67 findings (HEAD 286938fc)

## r66 items

- Left-wall pin: persists. Hard AI vs an idle player: player x 435 -> 210 -> 2 -> 0, Sindarosa half off the left edge (`vs-idle-8.png`). The new Hard rock look-ahead did not change this. Clamp the player's visible position or have the AI back off at the wall.
- Equal-length life bars: persists (228 and 455 HP both fill the full bar).
- Round pips: still small (about 16 px) and hard to read at a glance.
- Tag key text: unchanged.
- Tour map Controls: still a 7-line bold wall of text; YOUR TEAM is clipped at the right edge and the stage strip is pushed to the bottom. **Fixed (WP T2).**
- Wispera portrait blur on the splash: persists. **Fixed (WP T2).**
- Phone picker fade: persists at 390x844 and on desktop; "More below" sits over the hero cards (desktop: over the Fight bar). Landscape 812x375 is fine.

## New

- Tour map card disagrees with the splash: the map says Opponent Fiara/Echo/Treenoc, Location Fire; the splash and fight show Pax in an Earth arena. Confusing for a new player.
- TAG! banner overlaps the damage number and combo text; after a swap the life-bar header shows a stray outline box.
- Life-bar chip drain is slow (a long yellow chip remained at 1 HP / 321 HP).
- A faint ghost of the player appears in the crowd area.
- ROUND 2 overlay has low contrast against the stage.
- Portrait phone fight shows a "Rotate your device" overlay with "Play anyway" (works well, no issue).
- Good: K.O. sequence, collapsible Help with jump bar, clean menu, super banner at x=640 (not re-tested at x=300 where r66 saw a crop).

## Process

- Tour FIGHT button was not clickable through Playwright's locator; pressing Enter on the splash worked.
- "Hard" via getByRole or getByText matches a hidden option element; use a button locator with text.
- A real-time K.O. is easiest to capture with `__TTE__.arena.setHp(foe.id, 1)` and attacking.
