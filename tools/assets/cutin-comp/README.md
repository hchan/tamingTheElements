# roster24 super cut-in composites

Provenance: CPU/PIL composites (matted hero over an approved SDXL-Turbo backdrop) made in the art session's
`.scratch/r24-cutin-comp/` (generators `comp.py` round 1, `comp_r2.py` rounds 2-3, per-hero placement `cfg.json`; both read the
art session's fetch-*/matte/ sources, so they are kept as a record, not rerunnable from the repo). Per-hero source file and
method: `NOTES-source.md`. Approved by the art-director agent (`provenance/approval.json`, 2026-11-23 round 3, all APPROVE, all >= 4).

Installer: `python3 -I tools/assets/cutin-comp/install-cutins.py <r24-cutin-comp-dir>` copies the chosen files byte for byte to
`public/assets/img/cutin/<hero>.png` (1344x768) and verifies `provenance/pins.json` (sha256; `tests/repo/cutin-backdrops.test.ts`
pins the installed files to the same hashes). These replace the earlier 1344x168 backdrop bands (`../cutin-gen/`), which the
composites cannot be cropped to (the hero spans the full height). Nothing in `src/` draws them yet; heroes stay behind `?ff=roster24`.
No third-party artwork; SDXL terms as in `../cutin-gen/license.txt`.
