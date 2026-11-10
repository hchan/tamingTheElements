// Lint bypass fixture: must FAIL the core bans (tests/lint/core-bans.test.ts).
export function f(k: 'sin' | 'cos'): number {
  return Math[k](1);
}
