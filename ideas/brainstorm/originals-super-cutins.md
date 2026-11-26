---
status: idea
added: 2026-11-26
---

# Super cut-ins for the 12 original heroes

Art session (2026-11-26) Opus plan: `.claude/worktrees/gpu-job-server/.scratch/plans/originals-cutin-plan.md`. All 12 originals already have director-approved backdrops (`.scratch/cutin-final/`, 11-19; a later `.scratch/batch-r8/approval-cutin-wm.json` picks different seeds for 7 heroes and omits fiara, cyclonius, wispera), so no GPU is needed. Nothing ships for originals today because `src/game/fx/cutin-gate.ts` lists only the 12 roster24 heroes (originals get the generic band). The art session builds CPU composites (hero Large.png over backdrop, A/B for the 7 disputed seeds) and sends them to the art-director; our side starts only after approval.

Our side (after approval, split small):
- (a) `install-cutins.py` + `provenance/pins.json` + approval file for the new composites (art-director approval.json is the gate).
- (b) `src/game/fx/cutin-gate.ts` needs its own rule for originals (`isReleased` only covers roster24); `cutin-gate.test.ts` two cases change; `tests/e2e/cutin.spec.ts` goes red (the AI opponent is fiara and it expects exactly one cut-in request): filter requests by hero. Display only, no sim change.
- (c) `tools/ci/size-budget.json` (shared file, one agent): about 19 MB extra PNG; the owner said bundle size is irrelevant, raise the budget.
Order: fiara, treenoc, cyclonius, lavax, sindarosa, curomo, ishimi, pax, rokcore, morblass, echo, wispera. Risk: Cyclonius's approved prompt contains "lightning" (art rule: no lightning); the director may reject.
