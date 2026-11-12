---
status: in-progress
added: 2026-11-12
---

# Accessibility pass

Re-run the a11y-ux-reviewer over the HUD and menus after the name label, avatar and vignette changes; screen-reader labels for menus, remappable everything, colour-blind safe element cues, reduced-motion check for new effects.

Status 2026-11-12: partly covered already (labelled controls and focus-moved headings, keyboard-activated touch buttons with label-in-name, colour-blind element marks, reduce-motion/high-contrast settings, CSS animations all gated by `data-reduce-motion`). The touch-button size/side override landed separately. Still to do: re-run the a11y-ux-reviewer on the HUD (name label, avatar, vignette), reduced-motion check of Phaser-side effects (vignette and any new fx), and a remap-coverage audit ("remappable everything": gamepad and menu keys).
