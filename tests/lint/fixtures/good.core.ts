// Allowed in core: integer math, the exact Math functions, explicit comparators, locals named like banned globals.
import { compareNumbers } from '../../../src/core/math/compare';

export function good(x: number, y: number): number {
  const squared = x * x;
  return Math.floor(Math.sqrt(squared + y)) + Math.imul(x | 0, y | 0);
}

export function exact(v: number): number {
  return Math.max(Math.min(Math.abs(v), Math.fround(v)), Math.round(v), Math.trunc(v), Math.sign(v), Math.clz32(v), Math.ceil(v));
}

export function sorted(values: readonly number[]): number[] {
  return [...values].sort(compareNumbers);
}

export function own(self: { readonly x: number }): string {
  const tick = self.x;
  return String(tick);
}
