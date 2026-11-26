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

## Update (art-director verdicts, 2026-11-26): seven approved composites

1344x768 composites in the art worktree `.claude/worktrees/gpu-job-server/.scratch/originals-cutin/`, approval `.scratch/originals-cutin/approval.json` (reviewer art-director, 2026-11-26). APPROVED 4: lavax `comp_lavax_B.png` (seed B), sindarosa `comp_sindarosa.png` (A), curomo `comp_curomo.png`, ishimi `comp_ishimi.png`, pax `comp_pax.png` (A), rokcore `comp_rokcore.png` (A), morblass `comp_morblass_B.png` (B). A = backdrop seed from `.scratch/cutin-final`, B = later batch-r8 `approval-cutin-wm.json` pick. Generator `.scratch/originals-cutin/comp_originals.py` + `cfg_originals.json` (untracked; copy to `tools/assets/` for provenance).
CYCLONIUS: REJECT (thin sprite, fist-like hands): skip, keep the generic band, no regeneration. REVISE, art session redoing the composites: fiara (pasted-on vector sprite; skipped if still flat), treenoc (use B, darken the backdrop behind, drop-shadow, rim light), echo (scale 1.5x, dim backdrop), wispera (scale 1.8x, cyan glow); they join in a second pass.
First builder (a): installer + pins + approval copy for the seven; (b) cutin-gate rule for originals (listing only approved heroes, not cyclonius/fiara/treenoc/echo/wispera until approved) and test updates; (c) size-budget raise. Split into small builders; (b) and (c) touch shared files (cutin-gate.ts, size-budget.json): one agent each at a time.

## Update 2 (art-director round 2, 2026-11-26): nine approved, two skipped, echo pending

Approval `.claude/worktrees/gpu-job-server/.scratch/originals-cutin/approval-v2.json` (round 2) plus `approval.json` (round 1). APPROVE 4 in round 2: treenoc `comp_treenoc_v2.png` (B backdrop), wispera `comp_wispera_v2.png` (1344x768). FIARA: REJECT 2 (flat vector fill pasted on a painterly backdrop): skip, keep the generic band. ECHO: REVISE 3 (flat cut across the top of the funnel; eyes read as a face): one more fix pass in progress.
Final set so far (9): lavax B, sindarosa A, curomo, ishimi, pax A, rokcore A, morblass B, treenoc v2, wispera v2. Skipped: cyclonius, fiara. Echo joins when approved.

## Progress note (2026-11-26, builder (a)+(c))

(a) done on branch worktree-agent-abcaa4dfa03181ab4: nine composites installed to `public/assets/img/cutin/<hero>.png` (lavax, sindarosa, curomo, ishimi, pax, rokcore, morblass, treenoc, wispera) by `tools/assets/originals-cutin/install-cutins.py` (refuses unless the approval entry approves exactly the file; sha256 + byte pins; both approval files and the generator copied; `tests/repo/originals-cutin.test.ts`). File names match `cutinUrl` (`<hero>.png`). Not drawn yet: (b) `cutin-gate.ts` is another builder's. Echo still pending (add to SOURCES + `--pin` when approved).
(c): `tools/ci/size-budget.json` only budgets gzip chunks and `assets/img/sheets/*.png`; cut-in PNGs are in neither, so no raise was needed (bundle cap is `pc-snapshot.ts` 600 MB; public/ is about 246 MB now). File left unchanged.

## Progress note (2026-11-26, builder b)

(b) done on branch worktree-agent-a212c59d7eaf3dcb6: `ORIGINAL_CUTIN_HEROES` (lavax, sindarosa, curomo, ishimi, pax, rokcore, morblass, treenoc, wispera) in `src/game/fx/cutin-gate.ts`, shown with no flag; `CUTIN_HEROES` stays roster24 only (tests/repo pins it). Echo = add one string once approved. Cut-in URL is `assets/img/cutin/<sprite>.png`, the same naming as roster24, so the installer must write `<hero>.png`. `tests/e2e/cutin.spec.ts` filters requests by hero and has a lavax case that passes only after the PNGs land in `public/assets/img/cutin/`. Still open: (a) installer, (c) size-budget.
