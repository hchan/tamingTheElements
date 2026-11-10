/** Run-length coding of a u16 input stream as a flat `[value, count, value, count, ...]` array. */
export type Rle = readonly number[];

export function rleEncode(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = out.length;
    if (n > 0 && out[n - 2] === v) out[n - 1] = (out[n - 1] as number) + 1;
    else out.push(v, 1);
  }
  return out;
}

export function rleDecode(rle: Rle): number[] {
  if (rle.length % 2 !== 0) throw new RangeError('rle length must be even');
  const out: number[] = [];
  for (let i = 0; i < rle.length; i += 2) {
    const v = rle[i] as number;
    const n = rle[i + 1] as number;
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`rle value out of u16 range: ${String(v)}`);
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`rle run length invalid: ${String(n)}`);
    for (let k = 0; k < n; k++) out.push(v);
  }
  return out;
}
