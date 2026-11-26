---
status: idea
added: 2026-11-26
---

# Integrate approved Nykra fx via the per-hero installer table

Art session (2026-11-26), Nykra bundle `.claude/worktrees/gpu-job-server/.scratch/bundles/nykra/` (MANIFEST.md):
- kelpLash: `fx_kelpLash_approved.png` 160x40 RGBA, approved 2026-11-21 (approval `.scratch/fx-keyed2/approval.json`, entry kelpLash), straight copy over `public/assets/img/fx/kelpLash.png`. Real swap.
- hoofCrash: approved plate is 512x512 (`.scratch/f269/approval.json`); do NOT integrate from the 512 file. The art session keyed it to 80x60 and sent it to the art-director with Glimmaw abyssFlash (f220 cell 5) and Durrok bristleStomp (f416 106302 d0.5) as `.scratch/fx-r3/*.png`; integrate only after the verdict (approval JSON must approve the exact keyed file).
- Everything else (cut-in, KO, Large, kelp_lash and kelp_whip icons) is identical to shipped.
Gaps: hoof_crash icon is the old 64x64 CC0 pick (a 128px procedural candidate exists, unapproved); open rig defects recorded by the director (idle/walk/cast near-identical, leg slivers on walk frame 1, narrowed N view).

Build after the Zephra fx builder merges (one agent at a time on `tools/assets/integrate-roster24-fx-art.ts`): add a nykra entry, sha pin, provenance and credit lines, contact sheet.

## Update (art-director verdicts, 2026-11-26): batch of three, hoofCrash dropped

Approval file (art worktree) `.claude/worktrees/gpu-job-server/.scratch/fx-r3/approval.json`. APPROVE 4, beats shipped, drop-in:
- Glimmaw `abyssFlash`: `.scratch/fx-r3/abyssFlash.png` 80x80 RGBA -> `public/assets/img/fx/abyssFlash.png`.
- Durrok `bristleStomp`: `.scratch/fx-r3/bristleStomp.png` 80x60 RGBA -> `public/assets/img/fx/bristleStomp.png`.
- Nykra `kelpLash` (see above, approval `.scratch/fx-keyed2/approval.json`) is unaffected.
Nykra `hoofCrash`: REVISE 3 (reads as a teal whirlpool; the f269 plate is a swirl). DROPPED: keep the shipped hoofCrash; ignore the hoofCrash note in the Nykra manifest.
One builder adds all three entries (nykra kelpLash, glimmaw abyssFlash, durrok bristleStomp) to the table after the Zephra fx builder merges.
