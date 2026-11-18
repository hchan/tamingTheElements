---
name: e2e-test
description: Run the Playwright end-to-end specs (Chromium, SwiftShader WebGL) against a test build and report failures. Use after UI, scene or loop changes, or when asked to run e2e.
argument-hint: [spec file or grep]
allowed-tools: Bash(corepack pnpm e2e *), Bash(corepack pnpm e2e), Bash(corepack pnpm e2e:smoke), Bash(corepack pnpm e2e:smoke *), Bash(corepack pnpm pc:probe), Bash(corepack pnpm pc:probe *), Read, Grep, Glob
---

# e2e-test

Specs live in `tests/e2e/` (config `playwright.config.ts`; it builds with `--mode test` and serves a preview on port 4173).

## Procedure

1. If the browser is missing: `corepack pnpm exec playwright install chromium`.
2. Run `corepack pnpm e2e $ARGUMENTS`, for example `corepack pnpm e2e tests/e2e/smoke.spec.ts`. The router tries the 4060 PC first and may fall back to the Mac for short runs; never force a Mac run (`e2e:local`, `--local`, `TTE_E2E_LOCAL=1`, `TTE_ALLOW_MAC_E2E=1`) and never rerun a red result on the other machine. Agents run only `@smoke` (`pnpm e2e:smoke`) plus the specs they touched, never the full suite. Copy the last stderr line (`e2e ran on: ...`) into the report. Over about 8 min use Bash `run_in_background`. `corepack pnpm pc:probe` shows PC health. Exits 89/94/95/96 are infra problems: report them, do not work around them.
3. On failure read the test, the HTML report folder and the trace; say whether it is a product bug, a flake (rerun once) or an environment problem.
4. Report: specs run, passed, failed, and the first failure's message. Do not retry more than once. Do not edit tests to make them pass.
5. Other suites: `e2e:pages` (`playwright.pages.config.ts`) and `e2e:itch` (`playwright.itch.config.ts`) are deployment smoke tests; see `docs/DEPLOYMENT.md`.
