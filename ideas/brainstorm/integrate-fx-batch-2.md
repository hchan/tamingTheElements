---
status: idea
added: 2026-11-26
---

# Integrate approved cast fx, batch 2 (installer table, tools/assets/integrate-roster24-fx-art.ts)

Art-director APPROVE 4, beats shipped (2026-11-26). Keyed 80px RGBA in the art worktree `.claude/worktrees/gpu-job-server`; approval for the keyed files `.scratch/proc-fx-i2i/k/approval.json` (reviewer art-director), plate-level approval `.scratch/proc-fx-i2i/approval.json`:
- Vortigal `talonRake`: `.scratch/proc-fx-i2i/k/talonRake.png` 80x60 -> `public/assets/img/fx/talonRake.png`.
- Abyssor `tentacleLash`: `.scratch/proc-fx-i2i/k/tentacleLash.png` 80x60 -> `public/assets/img/fx/tentacleLash.png`.
Pattern: new vortigal and abyssor entries in the table (merged pattern: nykra/glimmaw/durrok/hyalia, commit ac9da9e1), full sha256 pin, exact size, no resize, provenance under `tools/assets/fx-gen/provenance/<hero>-fx/`, credit lines, pin tests.

Not yet approved (append here when the art session reports): boulderRoll and hurlRock keyed (REVISE 3, smooth/die-like; textured rerun queued), abyssalPull, lureOrb, sporeBurst, stoop (REVISE; lower-denoise batch queued), Brazgor moltenHide (REVISE on key, re-keyed v2 with the director), forgeGore (fully procedural attempt building). Batch the next approved ones into the same builder to save agent spawns.

## Update (art-director, 2026-11-26): Brazgor moltenHide approved, joins batch 2

Brazgor `moltenHide` APPROVE 4 (beats shipped ring), re-keyed v2: `.claude/worktrees/gpu-job-server/.scratch/brazgor-fx/k/moltenHide_v2.png` 80x80 RGBA -> `public/assets/img/fx/moltenHide.png`; approval `.scratch/brazgor-fx/k/approval-v2.json` (reviewer art-director, 2026-11-26; its `approved` field holds the bare filename `moltenHide_v2.png`). Minor flaw noted, not blocking: faint dark-red rim at lower left. Batch 2 is now talonRake, tentacleLash, moltenHide (brazgor entry in the table). Brazgor `forgeGore` (fully procedural attempt) is with the director.

## Update 2 (art-director, 2026-11-26): Brazgor forgeGore approved, completes Brazgor fx

Brazgor `forgeGore` APPROVE 4 (beats shipped), procedural variant c: `.claude/worktrees/gpu-job-server/.scratch/forge-proc/forgeGore_c.png` 80x60 RGBA -> `public/assets/img/fx/forgeGore.png`; approval `.scratch/forge-proc/approval.json` (reviewer art-director, 2026-11-26); generator `.scratch/forge-proc/gen.py` (imports `finish()` from `.scratch/proc-fx2/gen.py`; untracked; copy both for provenance, `proc-fx2/gen.py` is already in the repo as `tools/assets/roster24-art/hyalia-ouroth-proc-fx2-gen.py`). Director caveat: the arc bulges upward while the shipped sprite is a diagonal streak, so check in a real match that rotation/anchor matches the strike direction (real-game screenshot of a Brazgor attack). Batch 2 is now talonRake, tentacleLash, moltenHide, forgeGore.
