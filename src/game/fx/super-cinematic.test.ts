import { describe, expect, it } from 'vitest';
import {
  ARCADE_TEAM_BASE, ArcadeT, Cmd, DEFAULT_SIM_FLAGS, SIM_VERSION, SimEventKind, characterId, createMatch, step,
  type SimEvent,
} from '@core/index';
import { cueFor } from '../audio/sound-map';
import { EventFx, type FxSink } from './event-fx';
import {
  CUT_IN_MS, PUNCH_IN_MS, PUNCH_OUT_MS, PUNCH_ZOOM, SUPER_DIM, SUPER_FADE_MS, TICK_MS, superFrame, type SuperFrame,
} from './super-cinematic';

const TOTAL = 41 * TICK_MS;
const at = (ms: number, reduced: boolean): SuperFrame => superFrame(ms, TOTAL, reduced, { dim: 0, bandAlpha: 0, slide: 0, zoom: 1 });
const samples = Array.from({ length: TOTAL / 10 + 1 }, (_, i) => i * 10);

describe('super cinematic plan (FUN-DESIGN section 3)', () => {
  it('dims lightly, fading in and out, and ends with nothing on screen', () => {
    expect(at(SUPER_FADE_MS, false).dim).toBeCloseTo(SUPER_DIM);
    expect(at(TOTAL / 2, false).dim).toBeCloseTo(SUPER_DIM);
    expect(at(SUPER_FADE_MS / 2, false).dim).toBeCloseTo(SUPER_DIM / 2);
    const end = at(TOTAL, false);
    expect([end.dim, end.bandAlpha, end.zoom]).toEqual([0, 0, 1]);
  });
  it('slides the band in (ease-out) and punches the camera in to 1.15 and back', () => {
    expect(at(0, false).slide).toBe(1);
    expect(at(CUT_IN_MS / 2, false).slide).toBeCloseTo(0.25);
    expect(at(CUT_IN_MS, false).slide).toBe(0);
    expect(at(PUNCH_IN_MS, false).zoom).toBeCloseTo(1 + PUNCH_ZOOM);
    expect(at(PUNCH_IN_MS + PUNCH_OUT_MS, false).zoom).toBe(1);
    expect(Math.max(...samples.map((ms) => at(ms, false).zoom))).toBeCloseTo(1 + PUNCH_ZOOM);
  });
  it('reduced motion drops the motion (no slide, no punch-in) and keeps the information (dim, band, name)', () => {
    for (const ms of samples) {
      const full = at(ms, false);
      const reduced = at(ms, true);
      expect(reduced.slide).toBe(0);
      expect(reduced.zoom).toBe(1);
      expect(reduced.dim).toBe(full.dim);
      expect(reduced.bandAlpha).toBeLessThanOrEqual(full.bandAlpha);
      for (const v of Object.values(reduced)) expect(Number.isFinite(v)).toBe(true);
    }
    // The band fades in instead of sliding, and is fully shown for most of the freeze.
    expect(at(CUT_IN_MS / 2, true).bandAlpha).toBeCloseTo(0.5);
    expect(samples.filter((ms) => at(ms, true).bandAlpha === 1).length / samples.length).toBeGreaterThan(0.5);
  });
  it('writes into the given frame (no allocation per rendered frame)', () => {
    const out: SuperFrame = { dim: 0, bandAlpha: 0, slide: 0, zoom: 1 };
    expect(superFrame(200, TOTAL, false, out)).toBe(out);
  });
});

const INTRO = 91;

/** A real Arcade duel where team 0 (Sindarosa, id 0) has a full bar and presses the super 5 ticks into the fight. */
function superEvents(arcade = true): SimEvent[] {
  const world = createMatch({
    simVersion: SIM_VERSION, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
  });
  if (arcade) world.state.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = 1000;
  const events: SimEvent[] = [];
  // Round 1's intro (FUN-DESIGN 2.10: 70 ticks after the roundStarted tick) holds every action; the fight starts at 71.
  for (let t = 0; t < INTRO + 60; t++) events.push(...step(world, [t === INTRO + 5 ? Cmd.super : 0, 0]));
  return events;
}

describe('super cinematic from the sim events', () => {
  const recorder = (): { sink: FxSink; cuts: string[]; shakes: number } => {
    const r = { cuts: [] as string[], shakes: 0 } as { sink: FxSink; cuts: string[]; shakes: number };
    r.sink = {
      flash: () => undefined, burst: () => undefined, spark: () => undefined, jitter: () => undefined, number: () => undefined,
      shake: () => { r.shakes++; },
      superCut: (c, from, until, reduced) => { r.cuts.push(`${String(c)}@${String(from)}<${String(until)}${reduced ? 'r' : ''}`); },
    };
    return r;
  };

  it('a real super starts one cinematic for its caster, lasting exactly the freeze, with a ducking sound cue', () => {
    const events = superEvents();
    const started = events.find((e) => e.kind === SimEventKind.superStarted);
    const freeze = events.find((e) => e.kind === SimEventKind.hitStop && e['cause'] === 2);
    expect(started && freeze).toBeTruthy();
    if (!started || !freeze) return;
    // The cinematic keys on the freeze's source: the caster (src/core/sim/systems/arcade/super.ts).
    expect(freeze.sourceId).toBe(started['caster']);
    expect(freeze.tick).toBe(started.tick);
    for (const reduced of [false, true]) {
      const r = recorder();
      const fx = new EventFx(r.sink, { reducedMotion: () => reduced, arcade: true });
      fx.consume(events.filter((e) => e.tick <= freeze.tick));
      fx.consume(events.filter((e) => e.tick === freeze.tick));
      const until = freeze.tick + 1 + (freeze['ticks'] ?? 0);
      expect(r.cuts).toEqual([`${String(started['caster'])}@${String(freeze.tick)}<${String(until)}${reduced ? 'r' : ''}`]);
      expect(r.shakes).toBe(0);
    }
    expect(cueFor(started)).toEqual({ id: 'whoosh', bus: 'sfx', duck: true });
  });
  it('Classic never starts it (the super bit is masked; no super events)', () => {
    const events = superEvents(false);
    expect(events.some((e) => e.kind === SimEventKind.superStarted || e.kind === SimEventKind.hitStop)).toBe(false);
    const r = recorder();
    new EventFx(r.sink, { reducedMotion: () => false }).consume(events);
    expect(r.cuts).toEqual([]);
  });
});
