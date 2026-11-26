---
status: done
added: 2026-11-26
---

# 24-hero roster is the default

All 12 roster24 heroes are in RELEASED_ROSTER24, so `ARCADE_RACES` (menu Versus, Online, World Tour pickers) already lists 24 heroes with no
`?ff=arcade` or `?ff=roster24`; the menu's Versus entry is always enabled. The flags remain in dev/test builds but change nothing.
No code change was needed. Added pins: unit test in `src/game/app/arcade-pick.test.ts` and the long-gate e2e
a test in `tests/e2e/arcade.spec.ts` (long gate; 24 heroes plus Empty in the picker, no flags). Screenshot: `.scratch/versus-picker-24.png`.
No sim, golden or SIM_VERSION change.
