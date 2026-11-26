# Original-hero super cut-in composites

Nine of the twelve original heroes have an art-director-approved 1344x768 composite (hero `<name>Large.png` matted over an
approved SDXL-Turbo cut-in backdrop, CPU/PIL): lavax (backdrop B), sindarosa, curomo, ishimi, pax, rokcore, morblass (B),
treenoc (v2) and wispera (v2). Cyclonius and Fiara were rejected and Echo is pending: they keep the generic band.

- `comp_originals.py` + `cfg_originals.json`: the generator and per-hero placement, copied from the art session's
  `.scratch/originals-cutin/` as a record (it reads the art session's `cutin-final/` backdrops, so it is not rerunnable from the repo).
- `provenance/approval.json` (round 1: seven APPROVE; its fiara, treenoc, cyclonius, echo and wispera entries are REVISE or REJECT) and
  `provenance/approval-v2.json` (round 2: treenoc and wispera APPROVE, fiara REJECT, echo REVISE), reviewer art-director, 2026-11-26.
- `provenance/pins.json`: full sha256 and byte size of each installed file.
- `install-cutins.py <dir>` copies the files byte for byte to `public/assets/img/cutin/<hero>.png` (the name `cutinUrl` in
  `src/game/fx/cutin-gate.ts` requests) and refuses unless the approval entry approves exactly that file. Pinned by `tests/repo/originals-cutin.test.ts`.
- The source PNGs are the installed files (not stored twice); they live in the art session's worktree.

Not drawn yet: `CUTIN_HEROES` in `cutin-gate.ts` lists only the roster24 heroes (another work package adds the originals rule).
Credits: own work, SDXL-Turbo terms as in `../cutin-gen/license.txt`; no third-party artwork.
