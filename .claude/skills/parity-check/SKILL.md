---
name: parity-check
description: Check docs/PARITY.md rows against the tests they cite and report matches, divergences and open rows. Use before a parity sign-off or when a PARITY row or a cited test changes.
argument-hint: [row id such as D03, or blank for all]
allowed-tools: Bash(corepack pnpm exec vitest *), Bash(corepack pnpm test:legacy), Read, Grep, Glob
---

# parity-check

Read-only. Never open `war/WEB-INF/user.properties`.

## Procedure

1. Structural check: `corepack pnpm exec vitest run --project repo tests/repo/parity.test.ts` (every cited `path#title` exists, `matches` rows cite a test, none leans on `it.fails`).
2. Run the legacy characterization suite: `corepack pnpm test:legacy`.
3. Tally rows by status (`matches`, `intentional divergence`, `open`) from `docs/PARITY.md`; with `$ARGUMENTS` restrict to that row.
4. For a semantic verdict, delegate to the `parity-verifier` agent.
5. Report counts, failing rows and open rows. Fix nothing.
