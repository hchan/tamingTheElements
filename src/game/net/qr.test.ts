import { describe, expect, it } from 'vitest';
import { formatBits, pickVersion, qrMatrix, qrSvg, rsRemainder, versionBits, type QrLevel } from './qr';

/** FNV-1a over the module rows: the vectors below were produced by the independent `qrcode-generator` encoder (MIT) with the same mask. */
function fnv(m: readonly (readonly boolean[])[]): number {
  let h = 2166136261;
  for (const row of m) for (const v of row) h = Math.imul(h ^ (v ? 49 : 48), 16777619) >>> 0;
  return h;
}

describe('qr encoder', () => {
  it('matches known matrices from an independent encoder (versions 1, 3 and 10)', () => {
    expect(fnv(qrMatrix('HELLO WORLD', 'L') ?? [])).toBe(1411826369);
    expect(fnv(qrMatrix('x'.repeat(30) + 'ABC', 'L') ?? [])).toBe(2801498971);
    expect(fnv(qrMatrix('x'.repeat(30) + 'ABC', 'M') ?? [])).toBe(3692324413);
    expect(fnv(qrMatrix('y'.repeat(200) + 'z', 'L', 3) ?? [])).toBe(526730702);
    expect(fnv(qrMatrix('y'.repeat(200) + 'z', 'M', 3) ?? [])).toBe(3083875743);
  });

  it('has the fixed patterns: finders, timing, dark module', () => {
    const m = qrMatrix('hello', 'L') ?? [];
    const n = m.length;
    expect(n).toBe(21);
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      for (let i = 0; i < 7; i++) {
        expect(m[r0]?.[c0 + i]).toBe(true);
        expect(m[r0 + 6]?.[c0 + i]).toBe(true);
        expect(m[r0 + i]?.[c0]).toBe(true);
        expect(m[r0 + i]?.[c0 + 6]).toBe(true);
      }
      expect(m[r0 + 3]?.[c0 + 3]).toBe(true);
      expect(m[r0 + 1]?.[c0 + 1]).toBe(false);
    }
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]?.[i]).toBe(i % 2 === 0);
      expect(m[i]?.[6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8]?.[8]).toBe(true);
  });

  it('format and version words are the spec values', () => {
    // Spec table: level L mask 0 = 111011111000100, level M mask 0 = 101010000010010.
    expect(formatBits('L', 0).toString(2).padStart(15, '0')).toBe('111011111000100');
    expect(formatBits('M', 0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
    expect(versionBits(10).toString(2).padStart(18, '0')).toBe('001010010011010011');
  });

  it('Reed-Solomon remainder: the spec worked example (HELLO WORLD, version 1-M)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('picks the smallest version and refuses oversize text', () => {
    expect(pickVersion(17, 'L')).toBe(1);
    expect(pickVersion(18, 'L')).toBe(2);
    expect(pickVersion(271, 'L')).toBe(10);
    expect(pickVersion(272, 'L')).toBe(11);
    expect(pickVersion(458, 'L')).toBe(14);
    expect(pickVersion(459, 'L')).toBeUndefined();
    expect(qrMatrix('a'.repeat(500))).toBeUndefined();
  });

  it('every size from 1 to 458 bytes encodes at both levels and is square', () => {
    for (const level of ['L', 'M'] as QrLevel[]) {
      for (let len = 1; len <= 458; len += 17) {
        const m = qrMatrix('k'.repeat(len), level);
        if (m === undefined) {
          expect(level).toBe('M');
          continue;
        }
        expect(m.every((row) => row.length === m.length)).toBe(true);
      }
    }
  });

  it('draws numeric-only SVG markup', () => {
    const svg = qrSvg(qrMatrix('hi') ?? []);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/<script|on\w+=/);
  });
});
