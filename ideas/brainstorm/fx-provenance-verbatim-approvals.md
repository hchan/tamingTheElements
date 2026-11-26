---
status: idea
added: 2026-11-26
---

# Replace the edited fx approval copies with the art session's verbatim files

The seven-fx merge (ac9da9e1) added `reviewer`/`date` and a `_note` to our provenance copies of `fx-r3/approval.json` (glimmaw abyssFlash, durrok bristleStomp) and pinned `bellPulseLoop` to the `hyalia_bellPulse` entry via `approves: 'bellPulse_a.png'`, because the art session's files lacked those fields. The art session has now fixed its files (2026-11-26): `.claude/worktrees/gpu-job-server/.scratch/fx-r3/approval.json` has reviewer art-director and date 2026-11-26 on all entries (abyssFlash, bristleStomp, hoofCrash); `.scratch/proc-fx2/approval.json` has its own `hyalia_bellPulseLoop` entry (APPROVE 4, approved bellPulseLoop.png).

Work (small, no src change): copy both files verbatim over the provenance copies under `tools/assets/fx-gen/provenance/{glimmaw,durrok,hyalia,ouroth}-fx/` (check which dirs hold which), drop the `_note`/added fields and the `approves:` workaround in `tools/assets/integrate-roster24-fx-art.ts` so bellPulseLoop uses its own entry, re-pin shas in the fx-art tests if the approval copies are sha-pinned, `--check` all heroes, gate:fast. Do together with the original-hero victory/KO stills builder only if they touch different files; otherwise sequentially (shared installer file is not touched by the stills work).
