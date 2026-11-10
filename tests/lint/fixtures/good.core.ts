// Allowed in core: integer math, sqrt, floor, imul and plain multiplication.
export function good(x: number, y: number): number {
  const squared = x * x;
  return Math.floor(Math.sqrt(squared + y)) + Math.imul(x | 0, y | 0);
}
