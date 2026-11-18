---
name: e2e-test
description: Run the Playwright end-to-end specs (Chromium, SwiftShader WebGL) against a test build and report failures. Use after UI, scene or loop changes, or when asked to run e2e.
argument-hint: [spec file or grep]
allowed-tools: Bash(corepack pnpm e2e *), Bash(corepack pnpm e2e), Read, Grep, Glob
---

# e2e-test

Specs live in `tests/e2e/` (config `playwright.config.ts`; it builds with `--mode test` and serves a preview on port 4173).

## Procedure

1. If the browser is missing: `corepack pnpm exec playwright install chromium`.
2. Run `corepack pnpm e2e $ARGUMENTS`, for example `corepack pnpm e2e tests/e2e/smoke.spec.ts`. It routes to the 4060 PC by default (`tte.remote` is configured); never launch Mac browsers (`TTE_ALLOW_MAC_E2E=1` is the coordinator's). Agents run only `@smoke` (`pnpm e2e:smoke`) plus the specs they touched, never the full suite. Over about 8 min use Bash `run_in_background`. Exits 94/95/96 are PC infra problems: report them, do not work around them.
3. On failure read the test, the HTML report folder and the trace; say whether it is a product bug, a flake (rerun once) or an environment problem.
4. Report: specs run, passed, failed, and the first failure's message. Do not retry more than once. Do not edit tests to make them pass.
5. Other suites: `e2e:pages` (`playwright.pages.config.ts`) and `e2e:itch` (`playwright.itch.config.ts`) are deployment smoke tests; see `docs/DEPLOYMENT.md`.
