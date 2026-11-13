---
status: in-progress
added: 2026-11-12
---

# Accessibility pass

Re-run the a11y-ux-reviewer over the HUD and menus after the name label, avatar and vignette changes; screen-reader labels for menus, remappable everything, colour-blind safe element cues, reduced-motion check for new effects.

Status 2026-11-12: partly covered already (labelled controls and focus-moved headings, keyboard-activated touch buttons with label-in-name, colour-blind element marks, reduce-motion/high-contrast settings, CSS animations all gated by `data-reduce-motion`). The touch-button size/side override landed separately. Still to do: re-run the a11y-ux-reviewer on the HUD (name label, avatar, vignette), reduced-motion check of Phaser-side effects (vignette and any new fx), and a remap-coverage audit ("remappable everything": gamepad and menu keys).

Update 2026-11-12: Phaser-side flash is rate-capped (FlashGate, 3 per second), bench element glyph, Escape owners pinned, hero selects aria-hidden (see a11y-review-fixes.md). Still open: remap-coverage audit (gamepad and menu keys), and the vignette reduced-motion check.

Update 2026-11-12 (later): remap-coverage audit done (`src/ui/screens/remap-coverage.dom.test.ts` fails if a game action, pad row or pad-table button is missing from the Key Bindings screen; Capture is the one pinned exemption, and the fixed shell/menu keys are asserted listed and unbindable). Vignette reduced-motion done: `LowLifeVignette` takes a live `reduceMotion` reader and holds a steady strength (no ramp with falling life) when it is on (`low-life-filter.test.ts`). The remaining open item is only the a11y-ux-reviewer re-run over the HUD.

Update 2026-11-12 (HUD review): a11y-ux-reviewer re-run over the HUD done. Fixed: objectives notice and chapter-2 text said "Capture" to players (now Snag; PARITY V25 cite updated), tag-view line and regen text 16 px, mirrored action bar 14 px, saved display size now applied on the menu path (`initAccessibility`), safe-area no longer double-counted in the short-screen touch layout (`tests/repo/hud-text-floor.test.ts`). Still open (concrete findings, not fixed here):
- Short phone (640x360) at Medium display size: `#game` is ~281 px tall so the Trap and Weather touch buttons are clipped about 35 px; base the short-screen query on the `#game` height and extend `tests/e2e/responsive.spec.ts` to check against the `#game` rect at Medium.
- Touch buttons are added after the fullscreen button and cover it (Weather over fullscreen at Medium): keep the top-right corner free.
- Status chips (`Hud.ts` 221, `status-icons.ts`) are a fixed 12 px (about 6 CSS px on phones) and overdraw the boosted hero label (`CHIP_Y = 102`): use `16 * phoneBoost`, place below the label's measured bottom.
- Touch buttons stay at 12 px text: 14 px overflows the 48 px button (responsive e2e fails), needs a layout change.
- Action-bar trap/element notes collide ("Trap 0/Ember"), unstyled slot text is black without a stroke, Trap glyph duplicates Fire's triangle.
