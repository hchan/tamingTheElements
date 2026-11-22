import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const css = readMainCss().replace(/\/\*[\s\S]*?\*\//g, '');

describe('Versus stack ability chips do not shrink twice (picker QA: 9-10 px chips)', () => {
  it('resets the .vsAbilities group inside the team stack to 1em, so only the chip 0.75em applies', () => {
    expect(css).toMatch(/#arcadePick \.teamStack \.vsAbilities\s*\{[^}]*font-size:\s*1em/);
  });
});
