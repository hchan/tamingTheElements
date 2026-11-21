---
status: idea
added: 2026-11-17
triaged: c (items 6-9 are desktop/landscape match-end polish that needs a browser screenshot to confirm; 1 fixed, 2/3/5/10/11 and 4 are phone/portrait so obsolete)
---

# QA r107 findings

Test build, headless Chromium. Viewports: P = portrait 390x844, L = landscape 844x390, L2 = landscape 667x375, D = desktop 1920x1080.

## P1

None found.

## P2

### 1. Strike circle label can disagree with the bar (Snag heroes)
- Viewport: L, L2 (also P).
- Repro: `?manual=1&seed=7&hero=echo&foe=pax` (also `hero=curomo`, `hero=treenoc`), step 100 ticks. Echo: the bar slot 1 reads "Snag" (key `1 C`), but the Strike 1 circle reads "Vines". Curomo strike 2 and Treenoc strike 1 show the same.
- Why it matters: Snag is the player-facing name (Snag replaces Capture), and the circle shows a different word for the same button.
- Suggested fix: derive the circle label from the same ability display name the bar uses, not the underlying data id.

### 2. Portrait arena is tiny and the bar loses slots 1 and 2
- Viewport: P, after "Play anyway".
- Repro: `?hero=fiara&foe=pax`, step 100, tap "Play anyway". The fighters are about 60 px tall in the lower third with a large empty sky above; the bar starts at slot 5 (1 and 2 live on the circles), which is fine, but the large dead area could be used.
- Suggested fix: crop or scale the arena camera for portrait so fighters are about twice the size, or put the HUD banner closer to the action.

### 3. Rotate prompt covers the whole portrait fight
- Viewport: P.
- Repro: same URL as above without tapping. The "Rotate your device to landscape" overlay hides the arena; the HUD is only visible dimmed behind it. A first-time portrait player sees no game until they find "Play anyway".
- Suggested fix: make the overlay a dismissible banner, or remember "Play anyway" per session.

## P3

### 4. Inconsistent "Life" prefix in the HUD
- Viewport: L, L2, D.
- Repro: any fight. The player side reads `ROKCORE 321/321` while the foe side reads `PAX ■ Life 690/690`. Desktop shows `FIARA ▲ Life 547/547` on both sides. Landscape drops the word on the left only.
- Suggested fix: use the same format on both sides at every viewport.

### 5. Portrait HUD shows current life only
- Viewport: P (after Play anyway).
- Repro: `FIARA ▲ 547` and `PAX ■ 690`, no max and no "Life". Landscape and desktop show current/max.
- Suggested fix: show current/max if it fits (the bar is at 390 px, so the text is small); otherwise keep it but document the difference.

### 6. Match-end card has redundant ribbon plus word
- Viewport: L, L2, D.
- Repro: reach Victory or Defeat. The card shows both a ribbon and the `.matchEndWord`, which repeat the same outcome. In landscape that costs vertical space.
- Suggested fix: drop one of the two, or let the ribbon carry the word.

### 7. Desktop match-end card panel has a visible hard edge
- Viewport: D.
- Repro: Defeat at 1920x1080. The card panel edge is crisp against the arena behind it, with no feather or shadow, unlike the rest of the UI.
- Suggested fix: add a soft shadow or a dimmed full-screen backdrop.

### 8. Desktop Draw tiles are staggered
- Viewport: D.
- Repro: reach Draw at 1920x1080 (set all fighters to 0 HP for the rounds). The two result tiles sit at different heights.
- Suggested fix: align the tiles to a common baseline (use `align-items: start`).

### 9. Button text wraps on the 667x375 card
- Viewport: L2.
- Repro: Defeat at 667x375. At least one button label wraps to two lines (Rematch or Change). Still fully inside the viewport.
- Suggested fix: allow `white-space: nowrap` with a smaller font at max-height 400px, or shorten the labels.

### 10. Tour pick screen in landscape: Back is taller than Start tour and misaligned
- Viewport: L.
- Repro: `/?manual=1&seed=7&ff=arcade#tour`. In the footer, "Start tour" is a short button and "Back" is a taller underlined link-styled button with its text at the top. Only the first row (Water) of the hero picker is visible; the detail panel for Sindarosa is cut off by the footer and the "More below" chip.
- Suggested fix: give both footer controls the same height and alignment, and let the picker scroll area use the space (the intro paragraph can collapse in landscape).

### 11. Tour intro paragraph is long on a phone
- Viewport: P.
- Repro: the same URL. Seven lines of intro text push the hero picker below the fold (Fire and Earth are under "More below").
- Suggested fix: shorten the text or collapse it behind a "How it works" toggle.

## Triage 2026-11-21

- 1 fixed: `src/game/hud/action-bar.ts:360-361` returns `['Snag', 'Snag']` for the Snag sprite, so the circle matches the bar (epic note: merged 2026-11-17).
- 2, 3, 5, 10, 11 obsolete: portrait/phone work was dropped 2026-11-18 (rotate card still in `src/game/boot/presentation.ts:93`).
- 4 by design on phones: `src/game/scenes/Hud.ts:698-741` (`fitSlimLabel`) drops "Life" per side only when the text would not fit beside the SUPER label; desktop uses `lifeReadout` (`src/game/hud/bars.ts:279`) on both sides. Obsolete unless a desktop mismatch is shown.
- 6 still present but intended: `src/ui/screens/arcade-versus.ts:946-956` renders both the ribbon ("Winner"/"You lost", shape + text) and `h1.matchEndWord`; pinned by `arcade-versus.dom.test.ts:425-428` and `tests/e2e/match-end.spec.ts:89`. Design call, low value.
- 7, 8, 9 not confirmed from code: `src/ui/styles/match-end.css` has tone glows but no panel shadow rule seen; draw cards both use `matchEndMain` (line 941) with `align-items: flex-end` (line 15); buttons nowrap only on the ribbon (line 247). Plan: one Sonnet builder takes a desktop 1920x1080 and 667x375 screenshot of Defeat and Draw; fix only what the shots show (css only, `match-end.css`), then close this file.
