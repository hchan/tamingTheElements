---
status: idea
added: 2026-11-15
---

# QA r59 findings (HEAD fcfda4be)

Screenshots under `~/claudetmp/qa-r59/s/`. Headless Chromium SwiftShader against the dev server (port 7963); no page errors in any scripted run. Roster24 heroes were not re-reported (hidden, owner dislikes the art).

## r58 findings: fixed or still open

- Phone portrait black top half: NOT fixed. In a 390x844 fight the arena is still a ~100px strip in the middle of a black screen (`pp-anyway-super.png`). What is new is a "Rotate your device to landscape ... Play anyway" overlay covering the fight on entry (`pp-hit.png`); it softens the first impression but "Play anyway" leads to the same black layout, and the FIRST BLOOD card is huge (about a quarter of the screen).
- Phone landscape menu title overlapping the Echo art: NOT fixed (`pl-menu.png`, "Elements" runs into the ice figure).
- Hero picker at 667x375: NOT fixed. The sticky Fight!/Back bar covers the lower third; the grid shows one partial row (`pl-picker.png`). The controls above it are now compact and readable, but the desktop picker now has a "More heroes below" scroll cue (`picker-water.png`) but the phone one does not.
- Hero size inconsistency (Zephra/Brazgor): not re-shot (roster24 hidden); treat as open.
- CC on-body marker: not re-checked this round (no CC applied in the scripted fights); treat as open.
- FIRST BLOOD card covers the bottom of the arena until dismissed: still true on desktop (`fire-1v1-hit.png`), and on phone landscape the hint card overlaps the upper left arena (`pl-hit.png`). Dismissal is easy ("Got it").
- Nothing addressed from r58; the only merge since is roster Batch 3 (hidden).

## New or newly noted

- Hero scale mismatch in the default fight: Sindarosa (a dragon, the default Versus hero) draws at about 150px while Fiara is about 200px but shows as a rough fire blob with jagged/dithered edges and the cone/triangle aura markers look like debug art (`fire-1v1-hit.png`, `air-1v1-hit.png`).
- The "WEATHER 0%" charge box sits in the middle of the arena top edge and overlaps the back wall, right where the fighters stand when they are near the top (`air-1v1-hit.png`). Move it to the HUD rail.
- Stage identity is strong: Fire lava cracks, Water blue flagstones, Earth moss and rocks, Air pale cloud floor; the Earth floor is the busiest and Air the flattest (`earth-1v1-hit.png`, `air-1v1-hit.png`). Terrain chips ("FIRE x2", "WATER +HP", "AIR x2") read well.
- Super: the HELLFIRE LANCE band with dim and cut-in is strong and readable on every stage (`water-1v1-super.png`, `air-1v1-super.png`); the band covers the bottom third of the arena so the target is hidden for the whole freeze.
- 2v2: TAG! call with the swirl and chevrons and the team cards is clear (`2v2-tag-a.png`); the bench cards under the top bar show "TAG" and HP but the Tag action-bar slot changes its portrait between teammates, which is hard to parse. The partner Pax portrait at top left is a small low-res tile.
- Tour: Stage card is scannable (Location / Opponent / Difficulty / Continues, nine stage tabs) but opponent portraits (Wispera, Cyclonius) are low-res and sit on a flat purple tile (`tour-stage.png`). In-fight Tour shows 3v3 team strips at the top clear and legible (`tour-fight2.png`).
- Help: readable serif text with a jump bar; very long page (`help.png`).
- Menu at 1280x720 is clean and has strong hero art (`menu-desk.png`); phone landscape menu has the title overlap noted above.

## Test notes

- My scripted attacks did not land on Fiara (no damage in the captured frames), so hit sparks were judged only from the super and tag moments, not from rallies. This is a script limitation, not a game bug.
- Machine was loaded by other agents' Playwright runs; the E2E subset ran slowly.

## Coverage

Menu at 1280x720 / 667x375 / 390x844; Versus picker (desktop and 667x375); 1v1 on Fire, Water, Earth, Air (intro, close, hit attempt, super, after-super); 2v2 on Water with a tag swap; Tour pick, stage card and in-fight; Help; phone landscape and portrait fight with super; E2E subset (see scorecard).
