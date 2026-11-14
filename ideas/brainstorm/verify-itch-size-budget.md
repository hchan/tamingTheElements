---
status: idea
added: 2026-11-14
---

# build:itch fails the total size budget, so e2e:itch cannot run

At main 8c969b3f `pnpm build:itch` ends with `FAIL 74379796 bytes exceeds total budget 41943040` (itch site 70.93 MiB), so no zip is made and `pnpm e2e:itch` fails with `ENOENT dist-itch` / "no zip in dist-itch" (itch-zip.spec.ts:50). The owner says size does not matter, even 100 MB: raise the budget in `tools/ci/size-budget.json` (coordinator-owned shared file). `pnpm e2e:pages` passes (2/2).
