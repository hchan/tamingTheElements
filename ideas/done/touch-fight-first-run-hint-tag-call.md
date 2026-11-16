---
status: done
added: 2026-11-15
---

# touch-fight-layout: tag call does not fade the first-run card

`tests/e2e/touch-fight-layout.spec.ts:267` ("a tag call hides the first-run card") fails on main before and after roster Batch 1: `#firstRunHint` never gets the `firstRunFade` class after `tte:tag-call`. Pre-existing; find whether the test or the hint logic is stale. Related: the first-run card covering the arena (QA r54/r55).

Resolved: fixed by d9480199 and merged in 3d0280c7 (the tag call fades the card on the spot); confirmed stale by the HINT-CUT-1 plan.
