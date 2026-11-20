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
