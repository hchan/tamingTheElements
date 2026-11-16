---
status: done
added: 2026-11-16
---

# First-run card waits for a live super band or tag call (HINT-CUT-1)

QA r74/r75: on phones the "First blood" card sat on the super band and the portrait (844, 667, 640, 600, 568 px). Cause: the reveal
(`afterArenaCreate`) never looked at a live cut or tag call, and the cut/tag listeners were attached only after the reveal.

Fix (`src/game/app/first-run-hint.ts`): the reveal is gated by `arenaBusy` (registry `tte.cut` / `tte.tagCall`) plus a 3 s hold after a
`tte:super-cut` or `tte:tag-call` event (the cut chunk loads lazily); it re-checks every 100 ms and gives up after 12 s. A round end while
waiting drops the card for that battle. Game destroy clears every timer and listener (a quit no longer marks the card seen). Once
shown, a cut that starts removes it. Tests: `first-run-hint.dom.test.ts`, `tests/e2e/first-run-hint.spec.ts` (3 viewports).
