import { describe, expect, it } from 'vitest';
import { cinematicKeyAction } from './keys';

describe('cinematicKeyAction', () => {
  it.each(['Escape', 'Enter', 'NumpadEnter'])('%s skips', (code) => {
    expect(cinematicKeyAction({ code, repeat: false })).toBe('skip');
  });
  it('other keys advance', () => {
    expect(cinematicKeyAction({ code: 'Space', repeat: false })).toBe('advance');
    expect(cinematicKeyAction({ code: 'KeyA', repeat: false })).toBe('advance');
  });
  it.each(['Escape', 'Enter', 'Space'])('auto-repeat of %s does nothing', (code) => {
    expect(cinematicKeyAction({ code, repeat: true })).toBe('none');
  });
});
