import { describe, expect, it } from 'vitest';
import { characterId } from '@core/index';
import type { MatchSetup as UiSetup } from '@ui/screens/garrison-model';
import { slugOf, toCoreSetup, toOutcome } from './flow';
import { counted, listenerCount } from '../platform/test-hook';

const hero = (id: string, name: string, experience: number) => ({
  id,
  characterName: name,
  experience,
  createdTime: 0,
  lastModifiedTime: 0,
});

const ui: UiSetup = {
  mode: 'practice',
  heroes: [hero('b', 'Eternal Void', 5), hero('a', 'Curomo', 9)],
  opponents: [{ id: 'dummy', experience: 5, characterName: 'Dummy' }],
};

describe('app flow mapping', () => {
  it('slugs names like the garrison rows', () => {
    expect(slugOf('Eternal Void')).toBe('eternal-void');
  });

  it('builds the sim setup in battle order and clamps the chapter', () => {
    const s = toCoreSetup(ui, { chapter: 9, difficulty: 2 }, 77);
    expect(s.seed).toBe(77);
    expect(s.chapter).toBe(5);
    expect(s.p1.map((m) => m.character)).toEqual([characterId('eternal-void'), characterId('curomo')]);
    expect(s.p2).toEqual([{ character: characterId('dummy'), xp: 5 }]);
  });

  it('maps the active battle slot to its garrison index', () => {
    const garrison = [hero('a', 'Curomo', 9), hero('b', 'Eternal Void', 5)];
    const o = toOutcome(ui, { garrison }, { winner: 0, activeSlot: 1, capturedIndices: [0] });
    expect(o).toEqual({ winner: 0, practice: true, activeIndex: 0, capturedIndices: [0] });
  });
});

describe('listener counting', () => {
  it('tallies adds and removes', () => {
    const t = new EventTarget();
    const c = counted(t);
    const before = listenerCount.n;
    const fn = (): void => undefined;
    c.addEventListener('x', fn);
    expect(listenerCount.n).toBe(before + 1);
    c.removeEventListener('x', fn);
    expect(listenerCount.n).toBe(before);
  });
});
