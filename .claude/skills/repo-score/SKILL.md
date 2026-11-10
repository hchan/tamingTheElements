---
name: repo-score
description: Score the repository's health from 0 to 5 per category (build, tests, determinism, docs, hygiene, port progress) using read-only checks, and list the top fixes. Use for a periodic status check.
allowed-tools: Bash(git *), Bash(pnpm *), Bash(ls *), Bash(wc *), Bash(grep *), Read, Grep, Glob
---

# repo-score

Read-only. Never edit, commit or push. Scratch under `~/claudetmp/` only. Never open `war/WEB-INF/user.properties`.

## Procedure

1. Gather facts: `git log --oneline -n 15`, `git status --porcelain`, whether `package.json`, `src/core`, `docs/` files and `.claude/` exist. Skip pnpm checks that cannot run yet and mark them "n/a".
2. Score each 0-5 with one line of evidence:
   - **Build**: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm depcruise`.
   - **Tests**: `pnpm test` passes; characterization and golden coverage; no skipped tests.
   - **Determinism**: no banned APIs in `src/core` (grep for `Date`, `Math.random`, transcendental `Math`); goldens match `SIM_VERSION`.
   - **Docs**: files in `docs/` exist and are current; `docs/REPO-MAP.md` lists new files.
   - **Hygiene**: lint clean, no tracked junk (`node_modules`, `.svn`), no references to the system temp directory, no secrets.
   - **Port progress**: share of legacy features with a tested port.
3. Output a table (category, score, evidence), an overall average, and the top three fixes in priority order, each sized S/M/L.
