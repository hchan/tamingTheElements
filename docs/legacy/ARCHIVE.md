# Legacy archive: how to get the old game back

The legacy Crafty.js game (the `war/` directory, about 25 MB and 270 tracked files, mostly vendored libraries and art) was
retired from the working tree on 2026-11-10 with the owner's explicit approval ("get rid of war/"). Nothing was lost:

- Git tag **`legacy-crafty-1.0`** (local and on origin) contains the complete legacy tree.
- `git show legacy-crafty-1.0:war/WEB-INF/private/src/scenes.js` restores a single file for reading.
- The recorded evidence stays in the tree: `tests/fixtures/legacy/` (captured from the real legacy code) is what the port's
  tests compare against, and `tests/legacy/fixtures.test.ts` checks it in the default suite.

## Restore the oracle

```
git fetch origin tag legacy-crafty-1.0   # only if the tag is not local
pnpm oracle:restore                      # git archive of the tag into the gitignored .oracle directory
pnpm test:oracle                         # run the characterization tests against .oracle/war
```

`oracle:restore` (`tools/oracle/restore.ts`) excludes `war/WEB-INF/user.properties` (old credentials), so that file is never
written to disk. `TTE_ORACLE_DIR` points the tools and tests at another directory that contains `war/`. Without `.oracle` the
oracle project shows one skipped placeholder, and the oracle-only checks inside `tests/repo/` are skipped.

The restored tree is also what `pnpm assets:build` (copies images and sounds into `public/`) and
`pnpm exec tsx tools/assets/extract-legacy-manifest.ts` (regenerates `src/game/assets/manifest.generated.json`) read.

## Re-record fixtures

Only when the stubs or loader in `src/testing/legacy/` changed, or a fixture is new (see [TESTING.md](../TESTING.md)):

```
pnpm oracle:restore
TTE_UPDATE_FIXTURES=1 pnpm test:oracle
```

State the reason in the commit. A changed fixture without a harness change means something unintended moved.

## Accepted differences

The parity rows U14 (default ability keys are positional digits in the port) and U15 (1.2 s end-of-match beat instead of 3 s)
stay documented as accepted differences in [PARITY.md](../PARITY.md); they are not defects of the retirement.
