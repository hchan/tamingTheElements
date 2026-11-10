# Contributing

Workflow details are in [docs/BRANCHING.md](docs/BRANCHING.md): trunk-based, one work package per branch cut from current
`main`, about 400 lines of code and under a day, unfinished work behind a default-off flag.

## Steps

1. Branch from current `main`.
2. Make small commits: imperative subject, blank line, then the body.
3. Run the checks before asking for review:

   ```sh
   pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test && pnpm test:legacy && pnpm build && pnpm e2e
   ```

   Also run `pnpm test:coverage` when you touch `src/core` (floors are enforced in CI). Never commit credentials; the
   secret scan, CodeQL and dependency audit are described in [docs/SECURITY-GATES.md](docs/SECURITY-GATES.md).

4. Open a PR using the template; merge with `git merge --no-ff` and subject `Merge <what it does> (<WP id>)`.

## Definition of Done

- Scope fits the size limit and the checks above pass.
- Tests are added or updated.
- Nothing under `war/` is modified unless the work package says so.
- Feature flags are listed; docs touched by the change are updated.

## Guard tests

These fail when a rule is broken (details in [docs/TESTING.md](docs/TESTING.md)):

- `tests/repo/repo-map.test.ts`: new directories must be listed in [docs/REPO-MAP.md](docs/REPO-MAP.md).
- `tests/repo/docs-tables.test.ts`: generated tables in `docs/GAME-DESIGN.md` match `pnpm docs:gen`.
- `tests/repo/links.test.ts`: relative markdown links resolve.
- `tests/repo/no-team-block-alias.test.ts`: `.team` versus `.teams` indexing.
- `tests/lint/core-bans.test.ts`: no `Date`, `Math.random` or transcendental `Math` in `src/core`.
- Golden replay and `pnpm test:browser`: re-record with `pnpm golden:record` only for an intended sim change, and bump
  `SIM_VERSION`.
