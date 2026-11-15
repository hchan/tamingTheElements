import { describe, expect, it } from 'vitest';
import { OT_RIDERS, OtKind } from '../../../data/arcade';
import { ALL_ABILITIES } from '../../../data/abilities-all';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { EventSink, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { hasStatus, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyArcadeHit } from './hit';
import { skipIntro } from './round-testkit';

const def = (slug: string): number => ALL_ABILITIES.findIndex((d) => d.id === slug);
const ATT = 0;
const VICTIM = 1;

function duel(on: boolean, seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 75, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 450; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hit = (w: SimWorld, d: number): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, ATT, ATT, VICTIM, 10, d, 0);
  return [...sk.events];
};

describe('OT1 burn rider', () => {
  it('the table names two fire abilities, both burning, and both exist', () => {
    const burners = OT_RIDERS.filter((r) => r.kind === OtKind.burning);
    expect(burners.map((r) => r.slug)).toEqual(['crimson-fire', 'scorch-breath']);
    for (const r of burners) {
      expect(r.kind).toBe(OtKind.burning);
      expect(def(r.slug)).toBeGreaterThanOrEqual(0);
    }
  });

  it('flag on: crimson-fire and scorch-breath leave burning on a landed hit', () => {
    for (const slug of ['crimson-fire', 'scorch-breath']) {
      const w = duel(true);
      hit(w, def(slug));
      expect(hasStatus(w.state, VICTIM, StatusId.burning)).toBe(true);
    }
  });

  it('flag on: a repeat hit stacks, an unrelated ability leaves nothing', () => {
    const w = duel(true);
    hit(w, def('crimson-fire'));
    hit(w, def('crimson-fire'));
    const v = duel(true);
    hit(v, def('fireball'));
    expect(hasStatus(v.state, VICTIM, StatusId.burning)).toBe(false);
    expect(hasStatus(w.state, VICTIM, StatusId.burning)).toBe(true);
  });

  it('flag off: no burning is ever applied', () => {
    const w = duel(false);
    hit(w, def('crimson-fire'));
    hit(w, def('scorch-breath'));
    expect(hasStatus(w.state, VICTIM, StatusId.burning)).toBe(false);
  });
});
