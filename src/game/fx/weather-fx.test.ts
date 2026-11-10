import { describe, expect, it } from 'vitest';
import { SimEventKind, WEATHER_TICKS, Weather, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import {
  BADGE_WORDS, CALL_IN_SCALE, CALL_IN_TICKS, CALL_OUT_TICKS, CALL_TICKS, MAX_PARTICLES, PARTICLE_COUNTS, SKY_TINTS, TINT_RAMP_TICKS,
  WEATHER_COLORS, WEATHER_NAMES, WeatherFx, badgeFill, badgeLabel, callAlpha, callScale, changedLine, endedLine, particle,
  progress, tintAlpha, type Particle, type WeatherSink,
} from './weather-fx';

/** Every sink call in order, as text. */
function fakeSink(): { sink: WeatherSink; calls: string[]; lines: Announcement[] } {
  const calls: string[] = [];
  const lines: Announcement[] = [];
  return {
    calls,
    lines,
    sink: {
      start: (kind) => calls.push(`start ${String(kind)}`),
      call: (kind, reduced) => calls.push(`call ${String(kind)}${reduced ? ' flat' : ''}`),
      end: (kind) => calls.push(`end ${String(kind)}`),
      say: (l) => { calls.push('say'); lines.push(l); },
    },
  };
}

let seq = 0;
const ev = (kind: number, tick: number, payload: Record<string, number>): SimEvent =>
  ({ tick, sourceId: 0, kind: kind as SimEvent['kind'], seq: seq++, ...payload });
const changed = (tick: number, weather: number, prev: number, team: number): SimEvent =>
  ev(SimEventKind.weatherChanged, tick, { weather, prev, team });
const ended = (tick: number, weather: number): SimEvent => ev(SimEventKind.weatherEnded, tick, { weather });

const KINDS = [Weather.sun, Weather.rain, Weather.sandstorm, Weather.gale, Weather.eclipse];

describe('weather fx: every weather event gives its feedback (fake sink, feedback coverage)', () => {
  it('a new weather of each kind starts the tint, calls its line and speaks who called it and what it does', () => {
    for (const kind of KINDS) {
      for (const team of [0, 1]) {
        const f = fakeSink();
        new WeatherFx(f.sink, () => false).consume([changed(10, kind, Weather.none, team)]);
        expect(f.calls).toEqual([`start ${String(kind)}`, `call ${String(kind)}`, 'say']);
        expect(f.lines[0]?.text).toMatch(new RegExp(`^${team === 0 ? 'You' : 'The enemy'} called ${WEATHER_NAMES[kind - 1] ?? '?'}: `));
        expect(f.lines[0]?.important).toBe(false);
      }
    }
  });
  it('a replacement is a new weather (start again); a refresh only calls the line again and says it was renewed', () => {
    const f = fakeSink();
    const fx = new WeatherFx(f.sink, () => false);
    fx.consume([changed(10, Weather.rain, Weather.none, 0), changed(20, Weather.sun, Weather.rain, 1), changed(30, Weather.sun, Weather.sun, 1)]);
    expect(f.calls).toEqual(['start 2', 'call 2', 'say', 'start 1', 'call 1', 'say', 'call 1', 'say']);
    expect(f.lines.map((l) => l.text)).toEqual([
      'You called Rain: water hits harder, fire softer.',
      'The enemy called Sunshine: fire hits harder, water softer.',
      'The enemy renewed the Sunshine.',
    ]);
  });
  it('the end of each weather is spoken and passed on', () => {
    for (const kind of KINDS) {
      const f = fakeSink();
      new WeatherFx(f.sink, () => false).consume([ended(600, kind)]);
      expect(f.calls).toEqual([`end ${String(kind)}`, 'say']);
      expect(f.lines[0]?.text).toBe(`The ${WEATHER_NAMES[kind - 1] ?? '?'} is over.`);
    }
  });
  it('reduced motion calls the line flat (no scale-in); everything else is the same', () => {
    const f = fakeSink();
    new WeatherFx(f.sink, () => true).consume([changed(10, Weather.gale, Weather.none, 0)]);
    expect(f.calls).toEqual(['start 4', 'call 4 flat', 'say']);
  });
  it('ignores other events and re-delivered ones (tick, then seq)', () => {
    const f = fakeSink();
    const fx = new WeatherFx(f.sink, () => false);
    const a = changed(10, Weather.rain, Weather.none, 0);
    fx.consume([ev(SimEventKind.dashed, 10, { dir: 0 }), a]);
    fx.consume([a]);
    fx.consume([{ ...a, tick: 9, seq: a.seq + 5 }]);
    expect(f.calls).toEqual(['start 2', 'call 2', 'say']);
    fx.consume([ended(510, Weather.rain)]);
    expect(f.calls.slice(3)).toEqual(['end 2', 'say']);
  });
});

describe('weather fx: lines, words and tables', () => {
  it('every table has a row per weather kind, and words are distinct (the badge reads by word, not colour)', () => {
    for (const t of [WEATHER_NAMES, BADGE_WORDS, WEATHER_COLORS, SKY_TINTS, PARTICLE_COUNTS]) expect(t).toHaveLength(KINDS.length);
    expect(new Set(BADGE_WORDS).size).toBe(KINDS.length);
    expect(Math.max(...PARTICLE_COUNTS)).toBeLessThanOrEqual(MAX_PARTICLES);
    // A light tint, the Eclipse dim the strongest.
    for (const [, a] of SKY_TINTS) expect(a).toBeLessThanOrEqual(0.4);
  });
  it('names the favoured and countered element (Eclipse favours void only), with keys per weather, side and line', () => {
    expect(changedLine(Weather.sandstorm, true, false)).toEqual({ key: 'weather3Mine', text: 'You called Sandstorm: earth hits harder, air softer.', important: false });
    expect(changedLine(Weather.gale, false, false).text).toBe('The enemy called Gale: air hits harder, earth softer.');
    expect(changedLine(Weather.eclipse, false, false)).toMatchObject({ key: 'weather5Foe', text: 'The enemy called Eclipse: void hits harder.' });
    expect(changedLine(Weather.eclipse, true, true)).toMatchObject({ key: 'weatherRenew5Mine', text: 'You renewed the Eclipse.' });
    expect(endedLine(Weather.sun)).toEqual({ key: 'weatherEnd1', text: 'The Sunshine is over.', important: false });
    // An unknown kind still reads as a sentence.
    expect(changedLine(9, true, false).text).toBe('You called Weather: void hits harder.');
    expect(endedLine(9).text).toBe('The weather is over.');
  });
  it('the badge shows the word and whole seconds left, and the bar fills by the time left', () => {
    expect(badgeLabel(Weather.rain, WEATHER_TICKS)).toBe('RAIN 10');
    expect(badgeLabel(Weather.eclipse, 451)).toBe('ECLIPSE 10');
    expect(badgeLabel(Weather.eclipse, 450)).toBe('ECLIPSE 9');
    expect(badgeLabel(Weather.sun, 1)).toBe('SUN 1');
    expect(badgeLabel(Weather.sun, -5)).toBe('SUN 0');
    expect(badgeFill(WEATHER_TICKS, 150)).toBe(150);
    expect(badgeFill(WEATHER_TICKS / 2, 150)).toBe(75);
    expect(badgeFill(0, 150)).toBe(0);
    expect(badgeFill(WEATHER_TICKS * 2, 150)).toBe(150);
  });
});

describe('weather fx: timing', () => {
  it('progress is clamped to 0..1', () => {
    expect(progress(5, 10, 10)).toBe(0);
    expect(progress(15, 10, 10)).toBe(0.5);
    expect(progress(30, 10, 10)).toBe(1);
  });
  it('the called line scales in from CALL_IN_SCALE over CALL_IN_TICKS (flat when reduced) and fades at the end', () => {
    expect(callScale(0, false)).toBe(CALL_IN_SCALE);
    expect(callScale(0, true)).toBe(1);
    expect(callScale(CALL_IN_TICKS / CALL_TICKS, false)).toBe(1);
    expect(callScale(1, false)).toBe(1);
    expect(callAlpha(0)).toBe(1);
    expect(callAlpha(1 - CALL_OUT_TICKS / CALL_TICKS)).toBeCloseTo(1, 9);
    expect(callAlpha(1)).toBe(0);
  });
  it('the tint fades in after a cast and out over the last ticks, holds steady when reduced, and is 0 with none left', () => {
    const base = SKY_TINTS[1][1];
    expect(tintAlpha(Weather.rain, 0, WEATHER_TICKS, false)).toBe(0);
    expect(tintAlpha(Weather.rain, TINT_RAMP_TICKS / 2, WEATHER_TICKS, false)).toBeCloseTo(base / 2, 9);
    expect(tintAlpha(Weather.rain, TINT_RAMP_TICKS, WEATHER_TICKS, false)).toBe(base);
    // Up before the view mounted (since = Infinity): full.
    expect(tintAlpha(Weather.rain, Number.POSITIVE_INFINITY, WEATHER_TICKS, false)).toBe(base);
    expect(tintAlpha(Weather.rain, 100, TINT_RAMP_TICKS / 5, false)).toBeCloseTo(base / 5, 9);
    expect(tintAlpha(Weather.rain, 0, 1, true)).toBe(base);
    expect(tintAlpha(Weather.rain, 100, 0, true)).toBe(0);
    expect(tintAlpha(0, 100, 100, false)).toBe(0);
  });
});

describe('weather fx: particles', () => {
  const p: Particle = { x: 0, y: 0, dx: 0, dy: 0, r: 0, a: 0 };
  it('are repeatable from the index and time alone, and stay in or near the arena', () => {
    for (const kind of KINDS) {
      for (let i = 0; i < (PARTICLE_COUNTS[kind - 1] ?? 0); i++) {
        for (const t of [0, 17, 333.5, 5000]) {
          particle(kind, i, t, p);
          const first = { ...p };
          particle(kind, i, t, p);
          expect(p).toEqual(first);
          expect(p.a).toBeGreaterThan(0);
          expect(p.a).toBeLessThanOrEqual(1);
          expect(p.x).toBeGreaterThanOrEqual(-240);
          expect(p.x).toBeLessThanOrEqual(1400);
          expect(p.y).toBeGreaterThanOrEqual(-60);
          expect(p.y).toBeLessThanOrEqual(760);
        }
      }
    }
  });
  it('rain falls and slants left, sand blows right, gale streaks run right, motes rise, sun rays stay at the corner', () => {
    const at = (kind: number, t: number): Particle => {
      const q = { ...p };
      particle(kind, 3, t, q);
      return q;
    };
    expect(at(Weather.rain, 1).y - at(Weather.rain, 0).y).toBeCloseTo(22, 5);
    expect(at(Weather.rain, 0)).toMatchObject({ dx: -5, dy: 20, r: 0 });
    expect(at(Weather.sandstorm, 1).x - at(Weather.sandstorm, 0).x).toBeCloseTo(9, 5);
    expect(at(Weather.sandstorm, 0).r).toBeGreaterThan(0);
    expect(at(Weather.gale, 1).x - at(Weather.gale, 0).x).toBeCloseTo(32, 5);
    expect(at(Weather.gale, 0).dx).toBeGreaterThan(80);
    expect(at(Weather.eclipse, 1).y - at(Weather.eclipse, 0).y).toBeCloseTo(-1.5, 5);
    expect(at(Weather.sun, 0)).toMatchObject({ x: -40, y: -40 });
    expect(at(Weather.sun, 0).r).toBeGreaterThan(20);
    expect(Math.hypot(at(Weather.sun, 50).dx, at(Weather.sun, 50).dy)).toBeCloseTo(1100, 5);
  });
  it('spread over the arena: no two particles of a weather start in the same place', () => {
    for (const kind of [Weather.rain, Weather.sandstorm, Weather.gale, Weather.eclipse]) {
      const seen = new Set<string>();
      for (let i = 0; i < (PARTICLE_COUNTS[kind - 1] ?? 0); i++) {
        particle(kind, i, 0, p);
        seen.add(`${String(Math.round(p.x))},${String(Math.round(p.y))}`);
      }
      expect(seen.size).toBe(PARTICLE_COUNTS[kind - 1]);
    }
  });
});
