import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import {
  BLOCKED_LINE, BUFF_WORDS, MAX_PARTICLES, PARTICLES_PER_PATCH, REDUCED_TELEGRAPH_ALPHA, STAGE_NAMES, SWAP_FLOOR, SWAP_TICKS, TerrainFx,
  badgeText, changedLine, enteredLine, glowAlpha, inPatch, nextBackdropAlpha, particle, patchAlpha, progress, swapLine, type Particle, type TerrainSink,
} from './terrain-fx';

let seq = 0;
const ev = (kind: number, tick: number, payload: Record<string, number>): SimEvent =>
  ({ tick, sourceId: 0, kind: kind as SimEvent['kind'], seq: seq++, ...payload });

function fakeSink(): { sink: TerrainSink; calls: string[]; lines: Announcement[] } {
  const calls: string[] = [];
  const lines: Announcement[] = [];
  const sink: TerrainSink = {
    swap: (stage, ticks) => calls.push(`swap ${String(stage)} ${String(ticks)}`),
    changed: (stage, count, from) => calls.push(`changed ${String(stage)} ${String(count)} ${String(from)}`),
    blocked: (x, y) => calls.push(`blocked ${String(x)} ${String(y)}`),
    stood: (team, stage, on) => calls.push(`stood ${String(team)} ${String(stage)} ${String(on)}`),
    healed: (amount) => calls.push(`healed ${String(amount)}`),
    say: (l) => lines.push(l),
  };
  return { sink, calls, lines };
}

describe('terrain fx: every terrain event gives its feedback (fake sink, feedback coverage)', () => {
  it('terrainSwap starts the telegraph and says the stage will turn', () => {
    for (const stage of [1, 2, 3, 4]) {
      const f = fakeSink();
      new TerrainFx(f.sink).consume([ev(SimEventKind.terrainSwap, 10, { stage, ticks: 30 })]);
      expect(f.calls).toEqual([`swap ${String(stage)} 30`]);
      expect(f.lines.map((l) => l.text)).toEqual([`The stage will turn to ${STAGE_NAMES[stage - 1] ?? ''}.`]);
    }
  });

  it('terrainSwap defaults a missing payload to the telegraph length', () => {
    const f = fakeSink();
    new TerrainFx(f.sink).consume([ev(SimEventKind.terrainSwap, 10, {})]);
    expect(f.calls).toEqual([`swap 0 ${String(SWAP_TICKS)}`]);
    expect(f.lines[0]?.text).toBe('The stage will turn to plain.');
  });

  it('terrainChanged to a new stage says "The stage turns to fire"; the first layout and a same-stage redraw differ', () => {
    const f = fakeSink();
    const fx = new TerrainFx(f.sink);
    fx.consume([ev(SimEventKind.terrainChanged, 1, { stage: 2, count: 3 })]);
    fx.consume([ev(SimEventKind.terrainChanged, 50, { stage: 1, count: 4 })]);
    fx.consume([ev(SimEventKind.terrainChanged, 90, { stage: 1, count: 3 })]);
    expect(f.calls).toEqual(['changed 2 3 0', 'changed 1 4 2', 'changed 1 3 1']);
    expect(f.lines.map((l) => l.text)).toEqual(['The stage is water.', 'The stage turns to fire.']);
    const g = fakeSink();
    new TerrainFx(g.sink).consume([ev(SimEventKind.terrainChanged, 1, {})]);
    expect(g.calls).toEqual(['changed 0 0 0']);
    expect(g.lines).toEqual([]);
  });

  it('start() sets the stage a late mount already shows, so a redraw of it is silent', () => {
    const f = fakeSink();
    const fx = new TerrainFx(f.sink);
    fx.start(3);
    fx.consume([ev(SimEventKind.terrainChanged, 1, { stage: 3, count: 3 })]);
    expect(f.lines).toEqual([]);
  });

  it('projectileBlocked sparks at the point and says "Rock blocks the shot"', () => {
    const f = fakeSink();
    new TerrainFx(f.sink).consume([ev(SimEventKind.projectileBlocked, 5, { x: 300, y: 400 })]);
    expect(f.calls).toEqual(['blocked 300 400']);
    expect(f.lines).toEqual([BLOCKED_LINE]);
    expect(BLOCKED_LINE.text).toBe('Rock blocks the shot.');
    const g = fakeSink();
    new TerrainFx(g.sink).consume([ev(SimEventKind.projectileBlocked, 5, {})]);
    expect(g.calls).toEqual(['blocked 0 0']);
  });

  it('patchEntered and patchLeft tell the view; only the player (team 0) entering is spoken', () => {
    const f = fakeSink();
    const fx = new TerrainFx(f.sink);
    fx.consume([
      ev(SimEventKind.patchEntered, 5, { team: 0, stage: 1 }),
      ev(SimEventKind.patchEntered, 5, { team: 1, stage: 1 }),
      ev(SimEventKind.patchLeft, 6, { team: 0, stage: 1 }),
    ]);
    expect(f.calls).toEqual(['stood 0 1 true', 'stood 1 1 true', 'stood 0 1 false']);
    expect(f.lines.map((l) => l.text)).toEqual(['You stand on a fire patch: damage doubled.']);
    const g = fakeSink();
    new TerrainFx(g.sink).consume([ev(SimEventKind.patchEntered, 7, {})]);
    expect(g.calls).toEqual(['stood 0 0 true']);
    expect(g.lines).toEqual([]); // no team in the payload: not the player
    expect(enteredLine(9).text).toBe('You stand on a  patch: a bonus.');
    const h = fakeSink();
    new TerrainFx(h.sink).consume([ev(SimEventKind.patchEntered, 8, { team: 0 })]);
    expect(h.calls).toEqual(['stood 0 0 true']);
  });

  it('patchHeal tells the view the amount, silently', () => {
    const f = fakeSink();
    new TerrainFx(f.sink).consume([ev(SimEventKind.patchHeal, 5, { amount: 1 }), ev(SimEventKind.patchHeal, 6, {})]);
    expect(f.calls).toEqual(['healed 1', 'healed 0']);
    expect(f.lines).toEqual([]);
  });

  it('ignores other events and skips re-delivered ones (tick, then seq)', () => {
    const f = fakeSink();
    const fx = new TerrainFx(f.sink);
    const other = ev(SimEventKind.weatherChanged, 4, { weather: 1 });
    const a = ev(SimEventKind.projectileBlocked, 5, { x: 1, y: 2 });
    fx.consume([other, a]);
    fx.consume([other, a]);
    fx.consume([ev(SimEventKind.projectileBlocked, 4, { x: 9, y: 9 })]);
    expect(f.calls).toEqual(['blocked 1 2']);
  });

  it('every line has its own key per stage so a quick sequence is not dropped', () => {
    const keys = [1, 2, 3, 4].flatMap((s) => [swapLine(s).key, changedLine(s, 1).key, enteredLine(s).key]);
    expect(new Set(keys).size).toBe(12);
    expect(changedLine(9, 1).text).toBe('The stage turns to plain.');
    expect(enteredLine(2).text).toContain('healing');
  });
});

describe('terrain timing and geometry', () => {
  it('progress clamps to 0..1', () => {
    expect(progress(5, 10, 20)).toBe(0);
    expect(progress(20, 10, 20)).toBe(0.5);
    expect(progress(99, 10, 20)).toBe(1);
  });

  it('patchAlpha fades the old patches over the telegraph and the new ones in after; reduced holds and snaps', () => {
    expect(patchAlpha(0, 999, false)).toBe(1);
    expect(patchAlpha(30, 999, false)).toBe(1);
    expect(patchAlpha(15, 999, false)).toBeCloseTo(1 - (1 - SWAP_FLOOR) / 2);
    expect(patchAlpha(1, 999, false)).toBeGreaterThan(SWAP_FLOOR);
    expect(patchAlpha(0, 0, false)).toBe(SWAP_FLOOR);
    expect(patchAlpha(0, 15, false)).toBeCloseTo(SWAP_FLOOR + (1 - SWAP_FLOOR) / 2);
    expect(patchAlpha(12, 0, true)).toBe(REDUCED_TELEGRAPH_ALPHA);
    expect(patchAlpha(0, 0, true)).toBe(1);
  });

  it('the next backdrop fades in over the telegraph, never with reduced motion', () => {
    expect(nextBackdropAlpha(0, false)).toBe(0);
    expect(nextBackdropAlpha(30, false)).toBe(0);
    expect(nextBackdropAlpha(15, false)).toBe(0.5);
    expect(nextBackdropAlpha(15, true)).toBe(0);
  });

  it('the glow pulses between 0.75x and 1.25x and holds steady with reduced motion', () => {
    expect(glowAlpha(0, 1, false)).toBe(0.75);
    expect(glowAlpha(25, 1, false)).toBe(1);
    expect(glowAlpha(50, 1, false)).toBe(1.25);
    expect(glowAlpha(75, 1, false)).toBe(1);
    expect(glowAlpha(33, 0.6, true)).toBe(0.6);
  });

  it('inPatch and badgeText: only a hero of the stage element with its centre inside gets the badge', () => {
    const rects = [100, 100, 80, 80, 400, 300, 120, 120];
    expect(inPatch(rects, 2, 140, 140)).toBe(true);
    expect(inPatch(rects, 2, 180, 140)).toBe(false);
    expect(inPatch(rects, 1, 450, 350)).toBe(false);
    expect(inPatch(rects, 2, 450, 350)).toBe(true);
    expect(inPatch([], 3, 0, 0)).toBe(false);
    expect(badgeText(1, 1, rects, 2, 140, 140)).toBe('FIRE x2');
    expect(badgeText(2, 2, rects, 2, 140, 140)).toBe('HEAL');
    expect(badgeText(4, 4, rects, 2, 140, 140)).toBe('AIR x2');
    expect(badgeText(3, 3, rects, 2, 140, 140)).toBe('ROCK PASS');
    expect(badgeText(1, 2, rects, 2, 140, 140)).toBe('');
    expect(badgeText(1, 1, rects, 2, 0, 0)).toBe('');
    expect(badgeText(0, 0, rects, 2, 140, 140)).toBe('');
    expect(badgeText(5, 5, rects, 2, 140, 140)).toBe('');
    expect(BUFF_WORDS).toHaveLength(4);
  });
});

describe('terrain particles', () => {
  it('stay in or near their patch, with an alpha in 0..1, for each stage and slot over time (one reused object)', () => {
    const out: Particle = { x: 0, y: 0, len: 0, r: 0, a: 0 };
    for (const stage of [1, 2, 3, 4]) {
      for (let k = 0; k < 5; k++) {
        for (let i = 0; i < PARTICLES_PER_PATCH; i++) {
          for (let t = 0; t < 400; t += 7) {
            expect(particle(stage, k, i, t, 200, 300, 120, 100, out)).toBe(out);
            expect(out.x).toBeGreaterThanOrEqual(200 - 14);
            expect(out.x).toBeLessThanOrEqual(200 + 120);
            expect(out.y).toBeGreaterThanOrEqual(300);
            expect(out.y).toBeLessThanOrEqual(300 + 100);
            expect(out.a).toBeGreaterThanOrEqual(0);
            expect(out.a).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(MAX_PARTICLES).toBe(20);
  });

  it('are streaks for air and round for the rest; an unknown stage still draws', () => {
    const out: Particle = { x: 0, y: 0, len: 0, r: 0, a: 0 };
    expect(particle(4, 0, 0, 10, 0, 0, 100, 100, out).len).toBeGreaterThan(0);
    for (const s of [1, 2, 3]) expect(particle(s, 0, 0, 10, 0, 0, 100, 100, out).r).toBeGreaterThan(0);
    expect(particle(9, 0, 0, 10, 0, 0, 100, 100, out).len).toBeGreaterThan(0);
  });
});
