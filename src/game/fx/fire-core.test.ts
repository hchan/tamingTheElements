import { describe, expect, it } from 'vitest';
import { HOT_CORE, lightFireCore } from './fire-core';

describe('lightFireCore', () => {
  it('gives only a light fire hit a white-hot core', () => {
    expect(lightFireCore('fire', 0)).toBe(HOT_CORE);
    expect(lightFireCore('fire', 1)).toBeUndefined();
    expect(lightFireCore('water', 0)).toBeUndefined();
    expect(lightFireCore(undefined, 0)).toBeUndefined();
  });
});
