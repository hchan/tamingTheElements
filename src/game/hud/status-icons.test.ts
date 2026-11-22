import { describe, expect, it } from 'vitest';
import { StatusId, type Element, type RenderStatus, type RenderView } from '@core/index';
import { FRIENDLY_COLOR, HC_FRIENDLY_COLOR, HC_HOSTILE_COLOR, HOSTILE_COLOR } from './buffs';
import { mainBar, sideOffset } from './bars';
import { hudFrame } from './arcade-hud';
import { SNAG_IMMUNE_TICKS, SNAG_ROOT_TICKS, TRAP_PUDDLE_LINGER_TICKS } from '@core/index';
import { CC_ICONS, CHIP_GAP, CHIP_MAX, CHIP_W, CHIP_Y, PORTRAIT_CHIP_MAX, chipText, collectStatusChips, secsLeft, weatherEffect } from './status-icons';

interface Opts {
  tick?: number;
  barTick?: number;
  statuses?: Partial<RenderStatus>[];
  arcade?: { rooted?: boolean; rootLeft?: number; rootImmuneLeft?: number; stunLeft?: number; mireLeft?: number; stunned?: boolean; guarding?: boolean; invulnerable?: boolean; weather?: number; weatherLeft?: number };
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
            rootLeft: () => o.arcade?.rootLeft ?? 0,
            rootImmuneLeft: () => o.arcade?.rootImmuneLeft ?? 0,
            stunLeft: () => o.arcade?.stunLeft ?? 0,
            mireLeft: () => o.arcade?.mireLeft ?? 0,
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
    expect(chipText('ADREN', false, 12)).toBe('▲ ADREN 12s');
    expect(chipText('SLOW', true, 3)).toBe('▼ SLOW 3s');
    expect(chipText('SNAG', true, null)).toBe('▼ SNAG');
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
    expect(out[0]).toMatchObject({ key: `s${String(StatusId.iceBlast)}`, hostile: true, glyph: 'cross', secs: 3, remaining: 0.75, x: minX, y: CHIP_Y, text: '▼ SLOW 3s', color: HOSTILE_COLOR });
    expect(out[1]).toMatchObject({ hostile: false, glyph: 'plus', secs: 1, remaining: 0.5, x: minX + CHIP_W + CHIP_GAP, text: '▲ ADREN 1s', color: FRIENDLY_COLOR });
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

  it('shows Snag (timed), stun and guard (untimed) and safe states', () => {
    const out = chips({ arcade: { rooted: true, rootLeft: SNAG_ROOT_TICKS, stunned: true, guarding: true, invulnerable: true } });
    expect(out.map((c) => c.label)).toEqual(['SNAGGED', 'STUN', 'GUARD']);
    expect(out.map((c) => c.secs)).toEqual([2, null, null]);
    expect(out.map((c) => c.hostile)).toEqual([true, true, false]);
    // Invulnerable while stunned is the stun, not a SAFE buff.
    const safe = chips({ arcade: { invulnerable: true } });
    expect(safe.map((c) => c.text)).toEqual(['▲ SAFE']);
  });

  it('shows weather as a buff for the favoured element, a debuff for the counter and nothing otherwise', () => {
    const arcade = { weather: 1, weatherLeft: 250 };
    expect(chips({ arcade }, 'fire')[0]).toMatchObject({ label: 'SUN +20%', hostile: false, secs: null, remaining: 0.5, text: '▲ SUN +20%' });
    expect(chips({ arcade }, 'water')[0]).toMatchObject({ label: 'SUN -17%', hostile: true, glyph: 'cross', text: '▼ SUN -17%' });
    expect(chips({ arcade }, 'earth')).toEqual([]);
    expect(chips({ arcade: { weather: 1, weatherLeft: 0 } }, 'fire')).toEqual([]);
  });

  it('shows the elemental buff until it ends, on the action-bar clock', () => {
    const elemental = { name: 'Inferno', activeUntil: 300 };
    const [c] = chips({ tick: 999, barTick: 100, elemental });
    expect(c).toMatchObject({ key: 'elem', label: 'INFERNO', hostile: false, secs: 4, text: '▲ INFERNO 4s' });
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

describe('chip layout at a larger scale', () => {
  const four = [0, 1, 2, 3].map((i) => ({ id: 1 + i }));
  const at = (scale: number, top = CHIP_Y) => collectStatusChips(viewWith({ statuses: four }), 0, 1, 'fire', 0, false, { scale, top });
  it('scales the chip box with the text, starts at the given top, and wraps to a new row instead of leaving the bar', () => {
    const base = at(1);
    const big = at(2, 130);
    expect(big[0]?.w).toBe((base[0]?.w ?? 0) * 2);
    expect(big[0]?.h).toBe((base[0]?.h ?? 0) * 2);
    expect(big[0]?.y).toBe(130);
    const { maxX } = mainBar(0);
    for (const c of big) expect(c.x + c.w).toBeLessThanOrEqual(maxX);
    expect(new Set(big.map((c) => c.y)).size).toBeGreaterThan(1);
    expect(Math.min(...big.map((c) => c.y))).toBe(130);
  });
});

describe('crowd-control chips (CA1)', () => {
  it('SNAGGED drains over the root, NO SNAG shows while immune (and never while rooted)', () => {
    const half = chips({ arcade: { rooted: true, rootLeft: SNAG_ROOT_TICKS / 2 } });
    expect(half).toHaveLength(1);
    expect(half[0]).toMatchObject({ key: 'root', label: 'SNAGGED', hostile: true, remaining: 0.5, secs: 1 });
    const immune = chips({ arcade: { rootImmuneLeft: SNAG_IMMUNE_TICKS } });
    expect(immune[0]).toMatchObject({ key: 'nosnag', label: 'NO SNAG', hostile: false, remaining: 1, glyph: 'plus' });
    expect(chips({ arcade: { rooted: true, rootLeft: 10, rootImmuneLeft: 10 } }).map((c) => c.key)).toEqual(['root']);
    expect(chips({ arcade: {} })).toEqual([]);
  });

  it('MIRED is hostile and drains over the Puddle linger', () => {
    const c = chips({ arcade: { mireLeft: TRAP_PUDDLE_LINGER_TICKS / 3 } })[0];
    expect(c).toMatchObject({ key: 'mire', label: 'MIRED', hostile: true, glyph: 'cross' });
    expect(c?.remaining).toBeCloseTo(1 / 3);
  });

  it('the STUN chip text carries the seconds left in tenths', () => {
    expect(chips({ arcade: { stunned: true, stunLeft: 30 } })[0]).toMatchObject({ label: 'STUN', text: '▼ STUN 0.6s' });
    expect(chips({ arcade: { stunned: true, stunLeft: 0 } })[0]?.text).toBe('▼ STUN');
  });

  it('STUN drains against the latched total and stays full without one', () => {
    const arcade = { stunned: true, stunLeft: 5 };
    expect(collectStatusChips(viewWith({ arcade }), 0, 1, 'fire', 0, false, undefined, 20)[0]?.remaining).toBe(0.25);
    expect(chips({ arcade })[0]?.remaining).toBe(1);
    expect(collectStatusChips(viewWith({ arcade: { stunned: true, stunLeft: 30 } }), 0, 1, 'fire', 0, false, undefined, 20)[0]?.remaining).toBe(1);
  });

  it('shows burn and venom as debuffs and mend as a buff, with seconds', () => {
    const out = chips({ tick: 10, statuses: [{ id: StatusId.burning, startTick: 0, expireTick: 110 }, { id: StatusId.venom, startTick: 0, expireTick: 160 }, { id: StatusId.mending, startTick: 0, expireTick: 60 }] });
    expect(out.map((c) => [c.label, c.hostile, c.secs, c.glyph])).toEqual([['BURN', true, 2, 'cross'], ['VENOM', true, 3, 'cross'], ['MEND', false, 1, 'plus']]);
  });

  it('shows a hostile chip with a time and an icon for each crowd-control status', () => {
    const out = chips({ tick: 10, statuses: [{ id: StatusId.dazed, startTick: 0, expireTick: 110 }, { id: StatusId.iced, startTick: 0, expireTick: 60 }, { id: StatusId.downed, startTick: 0, expireTick: 60 }, { id: StatusId.silenced, startTick: 0, expireTick: 110 }, { id: StatusId.ccWard, startTick: 0, expireTick: 99 }] });
    expect(out.map((c) => [c.label, c.hostile, c.secs])).toEqual([['DAZED', true, 2], ['ICED', true, 1], ['DOWN', true, 1], ['SILENCED', true, 2]]);
    for (const c of out) {
      expect(c.remaining).toBeGreaterThan(0);
      expect(c.remaining).toBeLessThanOrEqual(1);
      expect(CC_ICONS[c.key]?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(c.label).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
  });

  it('every remaining is in [0, 1], labels are short and avoid the banned words, icons exist', () => {
    const out = chips({ arcade: { rooted: true, rootLeft: 9999, stunned: true, stunLeft: 1, mireLeft: 9999, guarding: true } });
    const immune = chips({ arcade: { rootImmuneLeft: 9999 } });
    for (const c of [...out, ...immune]) {
      expect(c.remaining).toBeGreaterThanOrEqual(0);
      expect(c.remaining).toBeLessThanOrEqual(1);
      expect(c.label.length).toBeLessThanOrEqual(8);
      expect(c.label).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
    for (const k of ['stun', 'mire', 'nosnag']) expect(CC_ICONS[k]?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

describe('portrait chip cap', () => {
  const layout = { scale: 1, top: CHIP_Y, max: PORTRAIT_CHIP_MAX };
  const capped = (o: Opts): ReturnType<typeof collectStatusChips> => collectStatusChips(viewWith(o), 0, 1, 'fire', 0, false, layout);
  const three = [StatusId.adrenaline, StatusId.fireDance, StatusId.rockArmour].map((id) => ({ id }));

  it('shows one chip plus +N more for three or more', () => {
    const out = capped({ statuses: three });
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ key: 'more', text: '+2 more' });
  });

  it('shows both chips when there are exactly two', () => {
    const out = capped({ statuses: three.slice(0, 2) });
    expect(out.map((c) => c.key)).toEqual([`s${String(StatusId.adrenaline)}`, `s${String(StatusId.fireDance)}`]);
  });

  it('orders stun and snag first, then hostile, then friendly, then weather and elemental', () => {
    const out = capped({
      statuses: [{ id: StatusId.adrenaline }, { id: StatusId.tornado }],
      arcade: { rooted: true, rootLeft: 100, stunned: true, guarding: true, weather: 1, weatherLeft: 100 },
      elemental: { name: 'Blaze', activeUntil: 200 },
    });
    expect(out.map((c) => c.key)).toEqual(['root', 'more']);
    const two = capped({ statuses: [{ id: StatusId.adrenaline }, { id: StatusId.tornado }], arcade: { stunned: true, weather: 1, weatherLeft: 100 } });
    expect(two.map((c) => c.key)).toEqual(['stun', 'more']);
    const all = collectStatusChips(viewWith({ statuses: [{ id: StatusId.adrenaline }, { id: StatusId.tornado }], arcade: { stunned: true, weather: 1, weatherLeft: 100 }, elemental: { name: 'Blaze', activeUntil: 200 } }), 0, 1, 'fire', 0, false, { ...layout, max: 9 });
    expect(all.map((c) => c.key)).toEqual(['stun', `s${String(StatusId.tornado)}`, `s${String(StatusId.adrenaline)}`, 'weather', 'elem']);
  });

  it('is unchanged without max', () => {
    expect(chips({ statuses: three })).toHaveLength(3);
  });
});

describe('chip rows on wide views', () => {
  const six = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: 1 + i }));
  // 1280 (16:9), 1680 (21:9) and 2560 (32:9) logical px wide views: the HUD camera shows x from 640 - w/2 (hudFrame).
  it.each([1280, 1680, 2560])('both teams, every scale: chips sit inside the central 1280 box and the readable bar span at view width %i', (viewW) => {
    const frame = hudFrame(viewW);
    for (const team of [0, 1]) {
      for (const scale of [1, 1.5, 2, 3]) {
        const off = sideOffset(team);
        const row = collectStatusChips(viewWith({ statuses: six }), team, 1, 'fire', off, false, { scale, top: CHIP_Y });
        const { minX, maxX } = mainBar(off);
        expect(row.length).toBeGreaterThan(0);
        for (const c of row) {
          expect(c.x).toBeGreaterThanOrEqual(minX);
          expect(c.x + c.w).toBeLessThanOrEqual(maxX);
          expect(c.x).toBeGreaterThanOrEqual(frame.x);
          expect(c.x + c.w).toBeLessThanOrEqual(frame.x + frame.w);
          expect(c.x + c.w).toBeLessThanOrEqual(1280);
        }
      }
    }
  });
  it('chip x does not depend on the view width (nothing moves at 16:9 or wider)', () => {
    const a = collectStatusChips(viewWith({ statuses: six }), 1, 1, 'fire', sideOffset(1));
    expect(a[0]?.x).toBe(mainBar(sideOffset(1)).minX);
  });
});
