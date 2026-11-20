---
status: idea
added: 2026-11-20
---

# Touch/phone src code left after the phone e2e deletion (follow-up WP; verify each before removing)
Note: the Arcade touch buttons are also exercised by desktop e2e flows (arcade-charge/defence/trap/weather/tag "touch X button"); confirm with the owner whether touch UI goes entirely.

## TS
- src/game/boot/portrait-play.ts (portrait rotate hint / portrait play)
- src/game/app/touch-controls.ts (+ .test.ts, .dom.test.ts), touch-stick.ts (+ .test.ts), touch-strike.ts (+ .dom.test.ts)
- src/game/hud/touch-overlay.ts (+ .test.ts, .dom.test.ts)
- src/game/platform/a11y/touch-layout.ts (+ .dom.test.ts)
- Coarse/orientation branches: src/game/scenes/Hud.ts, src/game/app/main.ts, src/game/app/first-run-hint.ts (+ .dom.test.ts)

## CSS
- src/ui/styles/portrait-play.css, touch-strike-gutter.css
- src/ui/styles/main/12-phone-landscape.css, 13-touch-stick.css, 18-phone-targets.css, 20-picker-small-phone.css, 21-touch-strikes.css (tools/ci/split-main-css.ts references the main/ split)
- coarse/portrait/hover:none media branches in: picker-compact.css, guide.css, help.css, main/01-base, 02-menu-controls, 08-picker-dnd, 09-help-first-run, 19-tour-stage, 22-online-live; match-end.css

## Repo tests that pin the above
- tests/repo/portrait-play-css.test.ts, touch-css.test.ts, touch-strike-gutter-css.test.ts

Done so far: touch-stick and touch-strike removed (47d73bc1). Remaining items above still imported; rework viewport first.

Update 2026-11-20 (phone-removal WP): removed portrait-play.css (+ its test, import) and main/20-picker-small-phone.css. NOT removed, entangled:
- src/game/boot/portrait-play.ts is imported by 10 files (presentation, viewport, arena-pan, super-view, action-bar-view, round-view, tag-view, Hud, tall-fills, first-run-hint) and holds the tall-view layout maths (deckFor, isPortraitPlay); needs viewport rework first. Portrait mode still sets html[data-portrait-play] but now has no CSS.
- main/12-phone-landscape.css opens with a desktop 720p block (max-height 800px), so it is mixed; main/18-phone-targets.css has pointer:coarse rules that may serve the desktop touch-button overlay. Split by block before deleting; update tools/ci/split-main-css.ts, tests/repo/main-css-partials.test.ts (line 75 anchors on 18-phone-targets), the REPO-MAP partial count.
