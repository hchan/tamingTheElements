---
status: in-progress
added: 2026-11-17
---

# Short gate on every merge, long gate once a day

Owner idea, 2026-11-17: the full `pnpm e2e` is 674 tests on one worker, 30 to 40 minutes on a busy Mac, which blocks every push.

- **Short gate (2-5 min), every merge to main:** lint, typecheck, depcruise, unit, dom, legacy, build, plus a tagged e2e smoke set (about 10-15 specs: menu to match, Online connect with `?ice=none`, Versus, phone viewport) and the specs for the files the merge touched. New script `pnpm e2e:smoke`.
- **Long gate (as long as it needs), once a day:** the full e2e, repeat runs, Firefox/WebKit determinism. Run it in the night window (23:00-07:00) before the daily Pages deploy and block the deploy on failure. Write the result and the last-good commit into `ideas/` so a failure becomes a visible task.
- **Cost:** a regression outside the smoke set can sit on main for up to a day; the last-good commit makes bisecting cheap.
- **To do:** tag the smoke specs, add `e2e:smoke`, update the gate rule in CLAUDE.md and `docs/TESTING.md`, wire the nightly run. Plan with Opus first.
