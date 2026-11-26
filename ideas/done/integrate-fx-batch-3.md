---
status: done
added: 2026-11-26
---

# Integrate approved cast fx, batch 3 (collects approvals after batch 2)

Same installer table and rules as batch 2 (`tools/assets/integrate-roster24-fx-art.ts`; only after the batch-2 builder merges: one agent on that file at a time). Art-director APPROVE 4, beats shipped (2026-11-26):
- Quarrak `boulderRoll`: `.claude/worktrees/gpu-job-server/.scratch/rock-fx/k/boulderRoll.png` 80x80 RGBA -> `public/assets/img/fx/boulderRoll.png`; approval `.scratch/rock-fx/k/approval.json` (reviewer art-director, 2026-11-26).
Pending at the art session (append here when approved): Quarrak `hurlRock` (keyed REVISE 3: halo ring, muddy trail; re-keying), Abyssor `abyssalPull`, Glimmaw `lureOrb`, Umbrel `sporeBurst`, Vortigal `stoop`, Hyalia none left, Ouroth done, Zephra done. Collect several approvals before launching the builder.

## Update (art-director, 2026-11-26): lureOrb and tuskGore approved; hurlRock and stoop parked

Approval `.claude/worktrees/gpu-job-server/.scratch/fx-inits3/k/approval.json` (reviewer art-director, 2026-11-26), keyed 80px RGBA, APPROVE 4, beats shipped:
- Glimmaw `lureOrb`: `.scratch/fx-inits3/k/lureOrb.png` 80x80 -> `public/assets/img/fx/lureOrb.png` (plate seed 68004 d0.5; optional: thread could be 1px thicker, not required).
- Durrok `tuskGore`: `.scratch/fx-inits3/k/tuskGore.png` 80x60 -> `public/assets/img/fx/tuskGore.png` (plate seed 68012 d0.6).
Batch 3 is now: Quarrak boulderRoll, Glimmaw lureOrb, Durrok tuskGore. PARKED, shipped stays (rule 13): Vortigal stoop (procedural dive REVISE 2: no wings or tail fan read), Quarrak hurlRock. Still in work at the art session: Umbrel sporeBurst (i2i from the shipped cloud), Glimmaw abyssalPull (CPU composite idea). Remaining roster24 fx without an approved replacement: Glimmaw abyssalPull, Vortigal stoop (plus Umbrel sporeBurst while in work).

## Progress note (2026-11-26)

Batch 3 integrated: Quarrak `boulderRoll` (new `tools/assets/fx-gen/provenance/quarrak-fx/`), Glimmaw `lureOrb` and Durrok `tuskGore` (approval copied verbatim as `approval-fx3.json` in each provenance dir), via the installer table with full sha256 pins; tests: new `tests/repo/quarrak-fx-art.test.ts`, extended glimmaw/durrok tests. No generator scripts were named in the approvals, so none were copied. Still pending at the art session (idea stays here): Quarrak `hurlRock` (REVISE 3), Abyssor `abyssalPull`, Umbrel `sporeBurst`, Vortigal `stoop` (parked).

## Final note (2026-11-26)

Abyssor `abyssalPull` integrated (art-director APPROVE 4, `approval-fx6.json` verbatim in `provenance/abyssor-fx/`; one shared file, only the `abyssal-pull` ability loads it; pinned by `tests/repo/abyssor-fx-art.test.ts`). All roster24 fx slots are now approved and installed, or parked with the shipped sprite kept: Vortigal `stoop`, Quarrak `hurlRock`, Umbrel `sporeBurst`. Moved to ideas/done.
