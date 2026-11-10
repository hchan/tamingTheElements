// Lint bypass fixture: must FAIL the core bans (tests/lint/core-bans.test.ts).
export const v: unknown = Reflect.get(Math, 'tan');
