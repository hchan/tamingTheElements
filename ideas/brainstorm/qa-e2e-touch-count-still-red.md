---
status: idea
added: 2026-11-13
---

# QA: e2e touch-button specs still red: 10 buttons, expected 9

Severity: high. QA evaluator pass 2026-11-13 on main 622c6619. Log: ~/claudetmp/qa2-e2e.log

Re-report of qa-e2e-red-on-main-cleanse-count. Stable subset of 8 specs: 78 run, 66 passed, 12 failed. All 12 are responsive.spec.ts:181 and :238 (touch buttons, 9 expected, 10 received, the extra id is arcadeCleanse) plus tour.spec.ts:125. arcade-tag, help-controls and keyboard specs pass.
