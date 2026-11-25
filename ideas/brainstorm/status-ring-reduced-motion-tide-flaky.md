---
status: idea
added: 2026-11-24
---

# status-ring reduced-motion tide ring flaky

Nightly full e2e at 45fc58f: `status rings draw, stack and clear (reduced motion)` failed with the tide-motion pixel diff
(16196 px vs bound noise+600). Repeat runs on the PC: short lane 2 passes, full lane 1 fail (after its retries).
The diff looks like a render-timing race (a frame drawn mid-ripple after `arena.step`), not a regression.
Follow-up: wait for a settled frame (or compare two consecutive identical shots) before measuring the diff.
