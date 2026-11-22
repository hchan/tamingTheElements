---
status: done
added: 2026-11-16
done: 2026-11-16
---

# QA r79 items 1 and 2: 568x320 hit counter and WINS gap

Source: [qa-r79-findings](../done/qa-r79-findings.md) (item 3, the portrait layout, was parked there (portrait is dropped)).

- Hit counter under the fullscreen toggle: on phones the toggle sits under the HUD band (top 52, right 70), where the right-hand counter is. `Hud.pauseLeft()` now also treats the toggle as chrome to stay clear of when it reaches down to the counter's row (the right counter pulls left of both buttons).
- WINS captions: `PIP_LABEL_GAP` in `src/game/hud/round-view.ts` 14 to 30 logical px (about 13 screen px at 568x320, was 6).
- Tests: `tests/e2e/hud-polish-r77.spec.ts` (WINS gap at least 10 screen px at all four sizes; a touch 568x320 Versus test that the counter does not overlap the toggle). Both fail on main.
