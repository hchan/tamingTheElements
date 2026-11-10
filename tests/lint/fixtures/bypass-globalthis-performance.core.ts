// Lint bypass fixture: must FAIL the core bans (tests/lint/core-bans.test.ts).
export const v = (globalThis as unknown as { performance: { now(): number } }).performance.now();
