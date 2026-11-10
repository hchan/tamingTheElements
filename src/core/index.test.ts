import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from './index';

describe('core public API', () => {
  it('exposes a positive integer SIM_VERSION', () => {
    expect(Number.isInteger(SIM_VERSION)).toBe(true);
    expect(SIM_VERSION).toBeGreaterThan(0);
  });
});
