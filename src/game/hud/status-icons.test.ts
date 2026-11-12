import { describe, expect, it } from 'vitest';
import { StatusId, type Element, type RenderStatus, type RenderView } from '@core/index';
import { FRIENDLY_COLOR, HC_FRIENDLY_COLOR, HC_HOSTILE_COLOR, HOSTILE_COLOR } from './buffs';
import { mainBar } from './bars';
import { CHIP_GAP, CHIP_MAX, CHIP_W, CHIP_Y, chipText, collectStatusChips, secsLeft, weatherEffect } from './status-icons';

interface Opts {
  tick?: number;
  barTick?: number;
  statuses?: Partial<RenderStatus>[];
  arcade?: { rooted?: boolean; stunned?: boolean; guarding?: boolean; invulnerable?: boolean; weather?: number; weatherLeft?: number };
  elemental?: { name: string; activeUntil: number };
}

const viewWith = (o: Opts): RenderView =>
  ({
    tick: o.tick ?? 0,
    forEachStatus: (_id: number, visit: (s: RenderStatus) => void) => {
      for (const s of o.statuses ?? []) visit({ id: 0, startTick: 0, expireTick: 100, ...s });
    },
    actionBar: () => ({ tick: o.barTick ?? o.tick ?? 0, elemental: o.elemental }),
    arcade: () =>
      o.arcade
        ? {
            rooted: () => o.arcade?.rooted ?? false,
            stunned: () => o.arcade?.stunned ?? false,
            guarding: () => o.arcade?.guarding ?? false,
            invulnerable: () => o.arcade?.invulnerable ?? false,
            weather: o.arcade.weather ?? 0,
            weatherLeft: o.arcade.weatherLeft ?? 0,
          }
        : undefined,
  }) as unknown as RenderView;

const chips = (o: Opts, element: Element = 'fire', offset = 0, hc = false) => collectStatusChips(viewWith(o), 0, 1, element, offset, hc);

describe('status chip helpers', () => {
  it('rounds seconds up so a running effect never reads 0s', () => {
    expect(secsLeft(1)).toBe(1);
    expect(secsLeft(50)).toBe(1);
    expect(secsLeft(51)).toBe(2);
    expect(secsLeft(0)).toBe(0);
    expect(secsLeft(-5)).toBe(0);
  });

  it('writes a plus for a buff, an x for a debuff and omits the time for a timerless state', () => {
    expect(chipText('ADREN', false, 12)).toBe('+ ADREN 12s');
    expect(chipText('SLOW', true, 3)).toBe('x SLOW 3s');
    expect(chipText('SNAG', true, null)).toBe('x SNAG');
  });

  it('weather favours its element, counters the opposite one and Eclipse only favours void', () => {
    expect(weatherEffect(1, 'fire')).toBe('favoured');
    expect(weatherEffect(1, 'water')).toBe('countered');
    expect(weatherEffect(1, 'earth')).toBeUndefined();
    expect(weatherEffect(2, 'water')).toBe('favoured');
    expect(weatherEffect(3, 'air')).toBe('countered');
    expect(weatherEffect(5, 'void')).toBe('favoured');
    expect(weatherEffect(5, 'fire')).toBeUndefined();
    expect(weatherEffect(0, 'fire')).toBeUndefined();
  });
});

describe('collectStatusChips', () => {
  it('returns nothing for a hero with no status', () => {
    expect(chips({})).toEqual([]);
    expect(chips({ arcade: {} })).toEqual([]);
  });

  it('lays chips out left to right from the bar start with a word, a time and a shape for buff or debuff', () => {
    const out = chips({
      tick: 50,
      statuses: [
        { id: StatusId.iceBlast, startTick: 0, expireTick: 200 },
        { id: StatusId.adrenaline, startTick: 0, expireTick: 100 },
      ],
    });
    const minX = mainBar(0).minX;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: `s${String(StatusId.iceBlast)}`, hostile: true, glyph: 'cross', secs: 3, remaining: 0.75, x: minX, y: CHIP_Y, text: 'x SLOW 3s', color: HOSTILE_COLOR });
    expect(out[1]).toMatchObject({ hostile: false, glyph: 'plus', secs: 1, remaining: 0.5, x: minX + CHIP_W + CHIP_GAP, text: '+ ADREN 1s', color: FRIENDLY_COLOR });
  });

  it('uses the high-contrast pair and keeps the shape and word cues', () => {
    const [bad, good] = chips({ statuses: [{ id: StatusId.tornado }, { id: StatusId.rockArmour }] }, 'fire', 0, true);
    expect(bad?.color).toBe(HC_HOSTILE_COLOR);
    expect(good?.color).toBe(HC_FRIENDLY_COLOR);
    expect(bad?.glyph).not.toBe(good?.glyph);
    expect(bad?.text).toContain('FREEZE');
    expect(good?.text).toContain('STONE');
  });

  it('shifts with the side offset', () => {
    const o = { statuses: [{ id: StatusId.adrenaline }] };
    expect((chips(o, 'fire', 640)[0]?.x ?? 0) - (chips(o, 'fire', 0)[0]?.x ?? 0)).toBe(mainBar(640).minX - mainBar(0).minX);
  });

  it('shows Snag, stun, guard and safe states without a time', () => {
    const out = chips({ arcade: { rooted: true, stunned: true, guarding: true, invulnerable: true } });
    expect(out.map((c) => c.label)).toEqual(['SNAG', 'STUN', 'GUARD']);
    expect(out.map((c) => c.secs)).toEqual([null, null, null]);
    expect(out.map((c) => c.hostile)).toEqual([true, true, false]);
    // Invulnerable while stunned is the stun, not a SAFE buff.
    const safe = chips({ arcade: { invulnerable: true } });
    expect(safe.map((c) => c.text)).toEqual(['+ SAFE']);
  });

  it('shows weather as a buff for the favoured element, a debuff for the counter and nothing otherwise', () => {
    const arcade = { weather: 1, weatherLeft: 250 };
    expect(chips({ arcade }, 'fire')[0]).toMatchObject({ label: 'SUN', hostile: false, secs: 5, remaining: 0.5, text: '+ SUN 5s' });
    expect(chips({ arcade }, 'water')[0]).toMatchObject({ label: 'SUN', hostile: true, glyph: 'cross', text: 'x SUN 5s' });
    expect(chips({ arcade }, 'earth')).toEqual([]);
    expect(chips({ arcade: { weather: 1, weatherLeft: 0 } }, 'fire')).toEqual([]);
  });

  it('shows the elemental buff until it ends, on the action-bar clock', () => {
    const elemental = { name: 'Inferno', activeUntil: 300 };
    const [c] = chips({ tick: 999, barTick: 100, elemental });
    expect(c).toMatchObject({ key: 'elem', label: 'INFERNO', hostile: false, secs: 4, text: '+ INFERNO 4s' });
    expect(chips({ barTick: 300, elemental })).toEqual([]);
  });

  it('folds the overflow into one +N chip so the row stays at CHIP_MAX', () => {
    const many = [StatusId.adrenaline, StatusId.fireDance, StatusId.rockArmour, StatusId.translucent, StatusId.superSpeed, StatusId.superArmour].map((id) => ({ id }));
    const out = chips({ statuses: many, arcade: { rooted: true, guarding: true } });
    expect(out).toHaveLength(CHIP_MAX);
    expect(out[CHIP_MAX - 1]).toMatchObject({ key: 'more', text: '+3 more' });
    expect(chips({ statuses: many })).toHaveLength(CHIP_MAX);
    expect(chips({ statuses: many })[CHIP_MAX - 1]?.key).not.toBe('more');
  });
});
