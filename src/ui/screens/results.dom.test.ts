// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { MatchReport } from '@core/menu-index';
import { defeatScreen, setPendingResult, victoryScreen } from './results';

const win: MatchReport = {
  winner: 0,
  victory: true,
  xp: { characterName: 'Fiara', gained: 0, before: 5, after: 5, levelBefore: 1, levelAfter: 1, leveledUp: false },
  captured: [{ characterName: 'Aqua', experience: 0 }],
  gameCompleted: false,
};

let host: HTMLElement | null = null;
const mount = (s: { mount(c: HTMLElement): void }): HTMLElement => {
  host = document.createElement('div');
  document.body.append(host);
  s.mount(host);
  return host;
};

afterEach(() => {
  setPendingResult(null);
  host?.remove();
  host = null;
});

describe('results screens in the DOM', () => {
  it('victory renders the pending match, capped-XP note, capture and chapter banner', () => {
    setPendingResult({ report: win, chapter: 1, objectivesMet: true });
    const h = mount(victoryScreen());
    expect(h.querySelector('h1')?.textContent).toBe('Victory!');
    expect(h.querySelector('h1')?.className).toContain('victory');
    expect(h.querySelector<HTMLElement>('.resultAvatar')?.dataset['character']).toBe('Fiara');
    expect(h.querySelector('.resultXp')?.textContent).toContain('max XP');
    expect(h.querySelector('.resultCaptured')?.textContent).toMatch(/^Aqua Level : \d+$/);
    expect(h.querySelector('.resultBanner')?.textContent).toContain('Capture is unlocked in chapter 2');
    expect(h.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
  });

  it('continues to the garrison when the objectives are not met', () => {
    setPendingResult({ report: win, chapter: 1, objectivesMet: false });
    const h = mount(victoryScreen());
    expect(h.querySelector('.resultBanner')).toBeNull();
    expect(h.querySelector('a.menuLink')?.getAttribute('href')).toBe('#garrison');
  });

  it('victory without a pending result still shows a heading and a way out', () => {
    const h = mount(victoryScreen());
    expect(h.querySelector('h1')?.textContent).toBe('Victory!');
    expect(h.querySelector('.resultXp')).toBeNull();
    expect(h.querySelector('a.menuLink')?.getAttribute('href')).toBe('#garrison');
  });

  it('defeat ignores a pending victory and consumes it so it does not leak into the next screen', () => {
    setPendingResult({ report: win, chapter: 1, objectivesMet: true });
    const d = mount(defeatScreen());
    expect(d.querySelector('h1')?.textContent).toBe('You have been defeated...');
    expect(d.querySelector('h1')?.className).toContain('defeat');
    expect(d.querySelector('.resultXp')).toBeNull();
    d.remove();
    const v = mount(victoryScreen());
    expect(v.querySelector('.resultXp')).toBeNull();
  });

  it('unmount removes the page', () => {
    const s = victoryScreen();
    const h = mount(s);
    s.unmount();
    expect(h.children).toHaveLength(0);
  });
});
