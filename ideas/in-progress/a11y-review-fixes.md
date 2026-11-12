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
Follow-up: run axe-core and `tests/e2e/responsive.spec.ts`.
