---
status: idea
added: 2026-11-12
---

# A DOM test environment for the menu screens

All unit tests run in the node environment, so the DOM-only screens (tour, garrison, settings form, key-bindings screen, help, tester panel, arcade versus, flow, online versus, replay viewer) are covered only by Playwright e2e. Add happy-dom or jsdom as a vitest project scoped to `src/ui/**` so form logic, focus handling and screen wiring get fast unit tests. Until then the tests use small hand-made fakes (see `src/ui/menu-keys.test.ts`, `src/game/app/notice-banner.test.ts`).

Related gaps found in the 2026-11-12 coverage audit:
- Coverage config only includes `src/core/**`; add `src/ui` and `src/game` (non-Phaser) with their own, lower floors so regressions show up.
- `createPauseDialog` focus trap and Escape behaviour (uses the global `document`, only `nextFocusIndex` is unit tested).
- `core/sim/view.ts` branches (about 41%), `event-fx.ts` (about 54%), `swap-notice.ts` (about 58%), `net/peer.ts` (about 21%).
- Phaser scenes hold logic that could be extracted into pure helpers and tested in node.
