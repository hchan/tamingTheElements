import { describe, expect, it, vi } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import {
  CUES, KIND_CUES, KO, MAX_VOICES, MIN_GAP_MS, NOISE, PITCH_VARY, SILENT, STINGERS, THUMP_GAIN, Voices, WEATHER_CUES,
  comboPitch, pickCues, type CueName,
} from './arcade-cues';

type Kind = SimEvent['kind'];
const ev = (kind: Kind, extra: Record<string, number> = {}, tick = 100, seq = 0): SimEvent => ({ ...extra, tick, sourceId: 1, kind, seq });

/** The cues `e` plays, as [name, pitch, gain]. */
function cues(e: SimEvent): [CueName, number, number][] {
  const out: [CueName, number, number][] = [];
  pickCues(e, (name, pitch, gain) => out.push([name, pitch, gain]));
  return out;
}

const names = Object.keys(SimEventKind) as (keyof typeof SimEventKind)[];
const arcadeKinds = names.filter((n) => SimEventKind[n] >= 40);

describe('Arcade cue coverage', () => {
  it('gives every Arcade event kind a cue unless it is silent on purpose', () => {
    expect(arcadeKinds.length).toBeGreaterThan(15);
    for (const n of arcadeKinds) {
      const played = cues(ev(SimEventKind[n], { strength: 1, weather: 1 })).length > 0;
      expect({ kind: n, played }).toEqual({ kind: n, played: SILENT[n] === undefined });
    }
  });

  it('keys the fixed cues by real event kinds, as the names say', () => {
    const byName: Partial<Record<keyof typeof SimEventKind, CueName>> = {
      guarded: 'guard', parried: 'parry', guardBroken: 'crack', dashed: 'dash', perfectDodge: 'dodge', clash: 'clang',
      superStarted: 'charge', roundStarted: 'round', fight: 'fight', ko: 'ko', roundEnded: 'roundEnd',
    };
    const expected = Object.fromEntries(Object.entries(byName).map(([n, c]) => [String(SimEventKind[n as keyof typeof SimEventKind]), c]));
    expect(KIND_CUES).toEqual(expected);
    expect(KO).toBe(SimEventKind.ko);
  });

  it('plays nothing for Classic-only events', () => {
    for (const n of names.filter((k) => SimEventKind[k] < 40 && k !== 'matchEnded')) expect(cues(ev(SimEventKind[n]))).toEqual([]);
  });

  it('keeps every layer short, audible and well formed', () => {
    for (const [name, layers] of Object.entries(CUES)) {
      expect(layers.length, name).toBeGreaterThan(0);
      for (const [wave, f0, f1, ms, gain, delay = 0] of layers) {
        expect(wave >= 0 && wave <= NOISE, name).toBe(true);
        expect(f0 > 20 && f1 > 20 && f0 < 8000 && f1 < 8000, name).toBe(true);
        expect(gain > 0 && gain <= 1, name).toBe(true);
        expect(ms > 0 && delay + ms <= 700, name).toBe(true);
      }
    }
    for (const s of STINGERS) expect(CUES[s].length).toBeLessThanOrEqual(4);
  });
});

describe('hit thump', () => {
  it('scales the gain with strength and uses the impact for a super-strength hit', () => {
    const played = [0, 1, 2, 3].map((strength) => cues(ev(SimEventKind.hitConfirmed, { strength, combo: 1 }))[0]);
    expect(played.map((p) => p?.[0])).toEqual(['thump', 'thump', 'thump', 'impact']);
    expect(played.map((p) => p?.[2])).toEqual([...THUMP_GAIN]);
    expect([...THUMP_GAIN]).toEqual([...THUMP_GAIN].sort((a, b) => a - b));
  });

  it('varies the pitch by at most 5% from a fixed cycle (the same event, the same pitch)', () => {
    const pitches = Array.from({ length: 20 }, (_, i) => cues(ev(SimEventKind.hitConfirmed, { strength: 1 }, 100 + i))[0]?.[1] ?? 0);
    for (const p of pitches) expect(Math.abs(p - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(new Set(pitches).size).toBe(PITCH_VARY.length);
    expect(cues(ev(SimEventKind.hitConfirmed, { strength: 1 }, 7, 2))).toEqual(cues(ev(SimEventKind.hitConfirmed, { strength: 1 }, 7, 2)));
  });

  it('ticks the combo up a semitone per hit from the second hit, capped at an octave', () => {
    expect(cues(ev(SimEventKind.hitConfirmed, { strength: 0, combo: 1 })).map((c) => c[0])).toEqual(['thump']);
    const ticks = [2, 3, 4, 8, 14, 30].map((combo) => cues(ev(SimEventKind.hitConfirmed, { strength: 0, combo })).find((c) => c[0] === 'combo')?.[1]);
    expect(ticks).toEqual([1, comboPitch(3), comboPitch(4), comboPitch(8), 2, 2]);
    expect(comboPitch(3)).toBeCloseTo(2 ** (1 / 12), 10);
  });
});

describe('stingers', () => {
  it('gives each weather its own stinger', () => {
    const played = [1, 2, 3, 4, 5].map((weather) => cues(ev(SimEventKind.weatherChanged, { weather, prev: 0, team: 0 }))[0]?.[0]);
    expect(played).toEqual([...WEATHER_CUES]);
    expect(new Set(played).size).toBe(5);
    expect(cues(ev(SimEventKind.weatherChanged, { weather: 0 }))).toEqual([]);
  });

  it('plays the match stinger lower after a loss or draw', () => {
    const [win, loss, draw] = [0, 1, -1].map((winner) => cues(ev(SimEventKind.matchEnded, { winner }))[0]);
    expect(win).toEqual(['match', 1, 1]);
    expect(loss?.[1]).toBeLessThan(1);
    expect(draw).toEqual(loss);
  });
});

describe('Voices', () => {
  it('never lets ordinary cues take the pool past MAX_VOICES, and releases ended voices', () => {
    const v = new Voices();
    const kill = vi.fn();
    const order: CueName[] = ['thump', 'guard', 'parry', 'crack', 'dash', 'dodge', 'clang', 'charge', 'sand', 'gale', 'eclipse'];
    let held = 0;
    for (const name of order) {
      if (!v.admit(name, CUES[name].length, 0)) continue;
      for (let i = 0; i < CUES[name].length; i++) v.add(kill, 500);
      held += CUES[name].length;
    }
    expect(held).toBeLessThanOrEqual(MAX_VOICES);
    expect(v.active(0)).toBe(held);
    expect(v.admit('clang', 3, 0)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    expect(v.active(500)).toBe(0);
    expect(kill).toHaveBeenCalledTimes(held);
  });

  it('drops a repeat of the same cue inside MIN_GAP_MS, not after it', () => {
    const v = new Voices();
    expect(v.admit('thump', 1, 0)).toBe(true);
    expect(v.admit('thump', 1, MIN_GAP_MS - 1)).toBe(false);
    expect(v.admit('guard', 2, MIN_GAP_MS - 1)).toBe(true);
    expect(v.admit('thump', 1, MIN_GAP_MS)).toBe(true);
  });

  it('always plays a stinger, even into a full pool or twice in a row', () => {
    const v = new Voices();
    for (let i = 0; i < MAX_VOICES; i++) v.add(() => undefined, 1000);
    expect(v.admit('dash', 1, 0)).toBe(false);
    expect(v.admit('ko', 2, 0)).toBe(true);
    expect(v.admit('ko', 2, 1)).toBe(true);
  });

  it('disconnects every held voice on clear', () => {
    const v = new Voices();
    const kill = vi.fn();
    v.add(kill, 100);
    v.add(kill, 900);
    v.clear();
    expect(kill).toHaveBeenCalledTimes(2);
    expect(v.active(0)).toBe(0);
  });
});
