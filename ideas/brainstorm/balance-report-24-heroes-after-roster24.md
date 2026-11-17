---
status: idea
added: 2026-11-16
---

# Balance report across all 24 heroes after roster24 release

Goal: once roster24 ships, run `pnpm sim:match --tournament --json` and `pnpm balance:compare` across all 24 heroes in 1v1 and 2v2, report per-hero win rates and outliers, and file follow-up ideas (no silent retuning).

Why: the baseline only covers the original 12 ([balance-outliers](balance-outliers.md)).

- Size: M.
- Dependencies: roster24 released ([roster-24-heroes](../in-progress/roster-24-heroes.md), hidden until owner approval); retuning needs a SIM_VERSION bump, golden and baseline re-record with a stated reason, one agent at a time.
- GPU-suitable: no.
- Owner-gated: no for the report; yes for any change to released heroes.
