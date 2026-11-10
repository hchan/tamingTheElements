/** Total order on strings by UTF-16 code units (what `sort()` does, made explicit for the lint ban). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Total ascending order on non-NaN numbers. */
export function compareNumbers(a: number, b: number): number {
  return a - b;
}
