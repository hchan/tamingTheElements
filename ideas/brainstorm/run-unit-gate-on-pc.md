---
status: idea
added: 2026-11-19
---

# Run the unit half of gate:push on the PC

Owner question: can `gate:push` go on the pueue when the Mac is under high load?

## Finding (2026-11-19)

- Only the e2e half of `gate:push` is PC-routed. `tools/ci/offload-routes.json` lists `gate:push` as `pc-first` (fallback `mac`), but its note says T1 runs on the Mac, then `@smoke` plus touched specs go through the router (`tools/ci/e2e-route.ts`).
- The unit half is Mac-only: `T1_STEPS` in `tools/ci/gate.ts` (lint, typecheck, depcruise, test, test:dom, test:legacy, build, size:check). `gate:commit` and the route `unit-gate` are both `mac`.
- The PC queue is reached only through `pnpm gpu:*` and the router; its only CPU lane for tests is `cpu-full`, used for the full e2e run when `TTE_E2E_VIA_QUEUE=1` (`viaQueue` in `e2e-route.ts`).
- `gate:long` and `e2e:full` are already PC-only.

## Idea

Add a unit-gate route to the PC so a high-load Mac can offload T1:

1. New `offload-routes.json` placement for `unit-gate` of `pc-first` with Mac fallback (validated by `tests/repo/offload-routes.test.ts`).
2. A queue lane (or reuse `cpu-full` with a job kind) that ships the source tarball as the e2e queue path does, runs the T1 steps and returns exit code plus log.
3. `gate.ts` chooses it when Mac load is above the core count (14) or on a flag; the stamp is written only from a PC result tied to the same tree id.
4. Same rules as the e2e router: a red result is final, no rerun on the other machine; exits 89/94/95/96 are reported.

## Open questions

- Does the PC have a matching Node/pnpm toolchain and a cached `node_modules` (install time vs. the roughly 5 min T1)?
- `test:dom` and `build` need no GPU, but should they queue behind art jobs on the one GPU lane? Probably a separate CPU lane.
- Stamp trust: stamps are convenience evidence keyed by tree id; a remote stamp needs the same key.
