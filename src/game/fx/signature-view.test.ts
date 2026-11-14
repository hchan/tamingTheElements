import { describe, expect, it } from 'vitest';
import { SIGNATURE_MS, easeOut, hasSignature, signatureAlpha, signatureT } from './signature-view';

describe('signature-view helpers', () => {
  it('has a signature for every element but water', () => {
    expect(['fire', 'earth', 'air', 'void'].every((e) => hasSignature(e as never))).toBe(true);
    expect(hasSignature('water')).toBe(false);
    expect(hasSignature(undefined)).toBe(false);
  });
  it('maps age to progress and ends the burst', () => {
    expect(signatureT(0)).toBe(0);
    expect(signatureT(SIGNATURE_MS / 2)).toBeCloseTo(0.5);
    expect(signatureT(SIGNATURE_MS)).toBe(-1);
    expect(signatureT(-1)).toBe(-1);
  });
  it('holds solid then fades to zero', () => {
    expect(signatureAlpha(0.2)).toBe(1);
    expect(signatureAlpha(0.99)).toBeLessThan(0.05);
    expect(signatureAlpha(1)).toBe(0);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });
});
