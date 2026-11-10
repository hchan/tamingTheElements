import { it } from 'vitest';

// Stands in for the oracle suites (see vitest.config.ts) when .oracle/war has not been restored.
it.skip('oracle absent: run `pnpm oracle:restore` (extracts git tag legacy-crafty-1.0 into .oracle/) then `pnpm test:oracle`', () => {});
