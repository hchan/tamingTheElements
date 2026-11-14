---
status: done
added: 2026-11-13
---

# UI polish: bright hero faces, compact Play intro, per-device first-run hint

Owner wants bright, luminous, mystic menus.

Done 2026-11-13:
- `.heroFace` (src/ui/styles/main.css) no longer dims (was saturate 0.55, brightness 0.8): now a slight saturate and brightness lift with a faint violet glow, so the painted portraits show true colour. Disabled or `aria-disabled` tiles get a softer grade that stays readable.
- The Play intro paragraph (`.tourIntro`, src/ui/screens/tour.ts) is small print on all screens, and about 10 px, clamped to three lines, on short landscape phones (844x390).
- The first-run hint (src/game/app/first-run-hint.ts) is per input device: touch-first (`pointer: coarse`) reads stick, eight directions and on-screen buttons; keyboards name the live bindings (Up/W ...) plus the eight-way aim. No Classic, Arcade, ruleset or Capture wording.
