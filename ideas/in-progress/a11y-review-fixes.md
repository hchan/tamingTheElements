---
status: in-progress
added: 2026-11-12
---

# A11y review fixes (from the 2026-11-12 reviewer pass)

Findings (code reading only; axe-core not yet run):
- Major: HUD shows hero element by frame colour only (`src/game/scenes/Hud.ts` ~203, 214, 233, 399); add a text/glyph cue, keep it in high contrast.
- Major: fine-pointer action buttons are 12 px text (`src/game/app/touch-controls.ts:97`); raise to 14-16 px, move inline styles to classes.
- Major: action buttons have `tabIndex=-1`, unreachable by switch/voice/screen readers; make focusable with Enter/Space sending the same keydown/keyup.
- Minor: `.versionStamp` and `.rosterElement` below 16 px; `--color-water` contrast; `#fullscreenToggle` opacity .6; touch buttons opacity .85 and no high-contrast style.
- Check: hit flash under reduced motion stays below 3 Hz.
- Nit: pin which routes own Escape; `aria-hidden` on the hidden hero selects.
Done 2026-11-12 (uncommitted): HUD element glyph+word line (`elementCue` in hud/bars.ts, ▲ fire, ≈ air, ■ earth, ● water, ◆ void); touch buttons restyled in main.css (14 px, `--touch-row`, high-contrast); action buttons focusable, Enter/Space hold the key like a finger; `.versionStamp`/`.rosterElement` 16 px, opacity .75/.8. Still open: `--color-water` contrast, bench-portrait element cue, hit-flash Hz check, Escape routes, aria-hidden hero selects.
Done 2026-11-12 (second pass, committed): `--color-water` contrast already pinned by tests/repo/ui-contrast.test.ts (>= 4.5:1 on both menu backgrounds), nothing to change; bench lines now carry the hero's element glyph (`BENCH Pax ■ 100%`, `benchLabel`, short on purpose so it fits beside the round pips); hit flash is capped at 3 per second per target by `FlashGate` (flash-gate.test.ts, used by event-fx for both Classic and Arcade hits); Escape owners pinned by `escapeOwner` in src/ui/keyboard.ts (router / self / none) with a test; hidden hero selects wrapped in `aria-hidden` (dom test). Axe e2e (a11y.spec.ts), keyboard, responsive, arcade-tag and arcade-local specs pass. All items closed except the axe full-matrix rerun on other viewports.
Follow-up: run axe-core and `tests/e2e/responsive.spec.ts`.
