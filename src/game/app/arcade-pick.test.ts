import { describe, expect, it } from 'vitest';
import type { CharacterId } from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK, isCompletePick, parsePick, partner2For, partnerFor } from './arcade-pick';

const PAX = 'pax' as CharacterId;
const CUROMO = 'curomo' as CharacterId;

describe('tag-team partner choice', () => {
  it('a partner is never the lead, for every lead and every raw value (valid, same-as-lead, junk, missing)', () => {
    for (const lead of ARCADE_RACES) {
      for (const raw of [undefined, '', 'nonsense', lead, ...ARCADE_RACES]) {
        const p = partnerFor(lead, raw);
        expect(p).not.toBe(lead);
        expect(ARCADE_RACES).toContain(p);
      }
    }
  });

  it('honours a valid distinct pick, else falls back to Pax, and to another race when the lead is Pax', () => {
    expect(partnerFor(DEFAULT_PICK.player, 'fiara')).toBe('fiara');
    expect(partnerFor(DEFAULT_PICK.player, 'junk')).toBe(PAX);
    expect(partnerFor(PAX, 'junk')).not.toBe(PAX);
    expect(partnerFor(PAX, 'pax')).not.toBe(PAX);
  });

  it('the third race is distinct from the lead and the partner, defaulting to Curomo', () => {
    for (const lead of ARCADE_RACES) {
      for (const partner of ARCADE_RACES.filter((r) => r !== lead)) {
        for (const raw of [undefined, 'junk', lead, partner]) {
          const third = partner2For(lead, partner, raw);
          expect(third).not.toBe(lead);
          expect(third).not.toBe(partner);
        }
      }
    }
    expect(partner2For(DEFAULT_PICK.player, PAX, undefined)).toBe(CUROMO);
    expect(partner2For(CUROMO, PAX, undefined)).not.toBe(CUROMO);
  });
});

describe('parsePick stage', () => {
  it('keeps a known stage and drops blank or unknown ones (random)', () => {
    expect(parsePick({ player: 'sindarosa', enemy: 'rokcore', level: 'normal', stage: 'water' }).stage).toBe('water');
    expect(parsePick({ player: 'sindarosa', enemy: 'rokcore', level: 'normal', stage: '' })).not.toHaveProperty('stage');
    expect(parsePick({ player: 'sindarosa', enemy: 'rokcore', level: 'normal', stage: 'lava' })).not.toHaveProperty('stage');
  });
});

describe('parsePick', () => {
  it('unknown races and levels fall back to the defaults and the result is a plain 1v1', () => {
    const p = parsePick({ player: 'zzz', enemy: 'void-thing', level: 'impossible' });
    expect(p).toEqual(DEFAULT_PICK);
    expect(p).not.toHaveProperty('partner');
  });

  it('a 3v3 form yields three distinct races on the team', () => {
    const p = parsePick({ player: 'sindarosa', enemy: 'fiara', level: 'hard', size: '3', partner: 'sindarosa', partner2: 'sindarosa' });
    expect(p.level).toBe('hard');
    expect(new Set([p.player, p.partner, p.partner2]).size).toBe(3);
  });

  it('a 2v2 form carries a partner but no third hero', () => {
    const p = parsePick({ player: 'sindarosa', enemy: 'fiara', level: 'easy', size: '2', partner: 'pax' });
    expect(p.partner).toBe(PAX);
    expect(p.partner2).toBeUndefined();
  });

  it('local two-player gives Player 2 a bench of the matching size with distinct heroes', () => {
    const one = parsePick({ player: 'sindarosa', enemy: 'fiara', level: 'normal', mode: 'local' });
    expect(one.local).toBe(true);
    expect(one.enemyBench).toEqual([]);
    const three = parsePick({ player: 'sindarosa', enemy: 'fiara', level: 'normal', mode: 'local', size: '3', enemyPartner: 'fiara', enemyPartner2: 'fiara' });
    expect(three.enemyBench).toHaveLength(2);
    expect(new Set([three.enemy, ...(three.enemyBench ?? [])]).size).toBe(3);
  });

  it('ignores a size that is not 2 or 3', () => {
    const p = parsePick({ player: 'pax', enemy: 'fiara', level: 'normal', size: '9', partner: 'curomo' });
    expect(p).not.toHaveProperty('partner');
  });
});

describe('isCompletePick', () => {
  it('is false when any hero field is empty, true when all are set or left out', () => {
    expect(isCompletePick({ player: 'fiara', enemy: 'rokcore', level: 'easy' })).toBe(true);
    expect(isCompletePick({ player: 'fiara', enemy: 'rokcore', partner: '', partner2: 'lavax', level: 'easy' })).toBe(false);
    expect(isCompletePick({ player: '', enemy: 'rokcore', level: 'easy' })).toBe(false);
  });
});
