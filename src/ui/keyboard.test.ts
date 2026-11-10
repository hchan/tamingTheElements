import { describe, expect, it } from 'vitest';
import { ROUTE_NAMES } from './router';
import { backHash, shouldClickLinkOnSpace, shouldGoBack } from './keyboard';

describe('backHash', () => {
  it('has no back target on the main menu, battle, cinematics and results', () => {
    for (const r of ['main', 'loading', 'newGame', 'storyMode', 'victory', 'defeat']) expect(backHash(r)).toBeNull();
  });
  it('info and settings screens go back to the main menu; a character goes back to the garrison', () => {
    for (const r of ['settings', 'about', 'wiki', 'keyBindings', 'currentObjectives', 'garrison', 'race', 'gameMaster']) {
      expect(backHash(r)).toBe('#main');
    }
    expect(backHash('character')).toBe('#garrison');
  });
  it('every route has a defined answer (a hash or null)', () => {
    for (const r of ROUTE_NAMES) {
      const b = backHash(r);
      expect(b === null || b.startsWith('#')).toBe(true);
    }
  });
});

describe('shouldGoBack', () => {
  const base = { key: 'Escape', defaultPrevented: false, targetTag: 'BUTTON', targetIsTextInput: false };
  it('goes back on Escape from a control', () => {
    expect(shouldGoBack(base)).toBe(true);
  });
  it('leaves Escape alone inside text fields, when handled, or for other keys', () => {
    expect(shouldGoBack({ ...base, targetTag: 'TEXTAREA' })).toBe(false);
    expect(shouldGoBack({ ...base, targetTag: 'INPUT' })).toBe(false);
    expect(shouldGoBack({ ...base, defaultPrevented: true })).toBe(false);
    expect(shouldGoBack({ ...base, key: 'Enter' })).toBe(false);
  });
});

describe('shouldClickLinkOnSpace', () => {
  const base = { key: ' ', defaultPrevented: false, targetTag: 'A', hasHref: true };
  it('only for Space on a real link', () => {
    expect(shouldClickLinkOnSpace(base)).toBe(true);
    expect(shouldClickLinkOnSpace({ ...base, targetTag: 'BUTTON' })).toBe(false);
    expect(shouldClickLinkOnSpace({ ...base, hasHref: false })).toBe(false);
    expect(shouldClickLinkOnSpace({ ...base, key: 'Enter' })).toBe(false);
  });
});
