import { afterEach, describe, expect, it } from 'vitest';
import { getChipDrop, setChipDrop } from '../../src/game/hud/slim-hud';

// qa-r84 P5: in tall portrait the bench chips drop below the boosted name labels; landscape keeps drop 0.
describe('slim HUD chip drop', () => {
  afterEach(() => {
    setChipDrop(0);
  });
  it('defaults to 0 so landscape layout is unchanged', () => {
    expect(getChipDrop()).toBe(0);
  });
  it('rounds and clamps to a non-negative whole number', () => {
    setChipDrop(12.4);
    expect(getChipDrop()).toBe(12);
    setChipDrop(-5);
    expect(getChipDrop()).toBe(0);
  });
});
