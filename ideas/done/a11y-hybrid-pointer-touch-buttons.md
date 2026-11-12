---
status: done
added: 2026-11-12
---

# Touch buttons on hybrid devices

Compact vs large layout keys off the primary pointer (`pointer: fine`), so touch laptops get the compact 84x58 row and mouse users on tablets get 48 px buttons. Consider `any-pointer: coarse` and a Settings override for button size and side (left-handed play).

Done 2026-11-12: layout now keys off `html[data-touch-size]` (large|compact) and `data-touch-side` (right|left), set by `src/game/platform/a11y/touch-layout.ts`. Auto = large when `any-pointer: coarse` (touch laptops), compact otherwise, re-evaluated live; Settings > On-screen buttons overrides size and side. Stored device-locally in localStorage `tte.touchLayout` (not the save: no src/core change). Not done: the local two-player key hints sit bottom-left and can overlap left-side buttons; no Playwright screenshot of the left layout yet.
