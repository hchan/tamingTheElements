// Lint bypass fixture: must FAIL the core bans (tests/lint/core-bans.test.ts).
export async function f(p: Promise<number>): Promise<number> {
  return await p;
}
