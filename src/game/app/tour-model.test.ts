import { describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterId } from '@core/index';
import { advance, buildTour, gameOver, parseRun, serializeRun, startRun, useContinue } from './tour-model';

const HERO = ['fiara', 'rokcore', 'curomo'] as CharacterId[];
const el = (id: CharacterId): string => CHARACTERS.find((c) => c.id === id)?.element ?? '';

describe('buildTour', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(buildTour(HERO, 7)).toEqual(buildTour(HERO, 7));
    expect(JSON.stringify(buildTour(HERO, 7))).not.toBe(JSON.stringify(buildTour(HERO, 8)));
  });

  it('has 9 stages with the ladder levels and a lone Void boss last', () => {
    const t = buildTour(HERO, 1);
    expect(t.map((s) => s.aiLevel)).toEqual(['easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'hard', 'hard']);
    expect(t[8]?.opponents).toEqual(['eternal-void']);
    for (const s of t.slice(0, 8)) expect(s.opponents).toHaveLength(3);
  });

  it('visits Fire, Earth, Water and Air first, each with a matching lead, terrain = location', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = buildTour(HERO, seed);
      expect(new Set(t.slice(0, 4).map((s) => s.location))).toEqual(new Set(['fire', 'earth', 'water', 'air']));
      for (const s of t.slice(0, 8)) {
        expect(el(s.opponents[0] as CharacterId)).toBe(s.location);
        expect(s.terrain).toBe(s.location);
        expect(new Set(s.opponents).size).toBe(s.opponents.length);
      }
    }
  });

  it('never repeats a team and ends on the rival element (water beats fire)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = buildTour(HERO, seed);
      expect(new Set(t.slice(0, 8).map((s) => s.opponents.join())).size).toBe(8);
      expect(t[7]?.location).toBe('water');
    }
  });

  it('rejects a team that is not 3 heroes', () => {
    expect(() => buildTour(HERO.slice(0, 2), 1)).toThrow(RangeError);
  });
});

describe('run state', () => {
  it('advances on wins, finishes after the Void, and is immutable', () => {
    const r0 = startRun(HERO, 5);
    const r1 = advance(r0, true);
    expect(r0.stage).toBe(0);
    expect(r1.stage).toBe(1);
    let r = r0;
    for (let i = 0; i < 9; i++) r = advance(r, true);
    expect(r).toMatchObject({ status: 'won', stage: 8 });
  });

  it('a loss waits, Continue replays the stage (3 times), then Game Over', () => {
    let r = advance(startRun(HERO, 5), true);
    for (let i = 0; i < 3; i++) {
      r = useContinue(advance(r, false));
      expect(r).toMatchObject({ stage: 1, status: 'playing', continues: 2 - i });
    }
    r = advance(r, false);
    expect(useContinue(r)).toBe(r);
    expect(gameOver(r).status).toBe('over');
    expect(advance(gameOver(r), true).status).toBe('over');
  });
});

describe('serialize and parse', () => {
  it('round-trips', () => {
    const r = advance(startRun(HERO, 123456), true);
    expect(parseRun(serializeRun(r))).toEqual(r);
  });

  it('returns undefined for bad input', () => {
    const good = JSON.parse(serializeRun(startRun(HERO, 1))) as Record<string, unknown>;
    const bad = (patch: Record<string, unknown>): string => JSON.stringify({ ...good, ...patch });
    for (const raw of [
      undefined,
      null,
      '',
      'nope',
      '[]',
      'null',
      bad({ v: 2 }),
      bad({ seed: 1.5 }),
      bad({ stage: 9 }),
      bad({ continues: 4 }),
      bad({ status: 'x' }),
      bad({ hero: ['fiara', 'fiara', 'curomo'] }),
      bad({ hero: ['fiara', 'rokcore', 'eternal-void'] }),
      bad({ hero: ['fiara', 'rokcore'] }),
    ]) {
      expect(parseRun(raw)).toBeUndefined();
    }
  });
});
