/** Legacy (v0) save: whatever the old game wrote to localStorage. Nothing is guaranteed, so it is `unknown`-shaped. */
export type SaveV0 = Record<string, unknown>;

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
