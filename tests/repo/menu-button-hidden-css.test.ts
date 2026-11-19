import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const main = readMainCss();

describe('hidden menu buttons', () => {
  it('button.menuButton sets display, so [hidden] needs its own display:none rule', () => {
    expect(main).toMatch(/button\.menuButton\[hidden\][^{]*\{\s*display:\s*none;/);
  });
});
