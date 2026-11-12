import { SimEventKind, TrapReason, type SimEvent } from '@core/index';
import { describe, expect, it } from 'vitest';
import { Announcer, LOW_HEALTH, LowHealthWatch, MATCH_START, announcementsFor } from './announcer';
import { nextFocusIndex } from './pause-dialog';

const ev = (kind: SimEvent['kind'], extra: Record<string, number> = {}): SimEvent => ({
  ...extra,
  tick: 1,
  sourceId: 0,
  kind,
  seq: 0,
});

describe('announcementsFor', () => {
  it('announces win, lose, draw, capture and deaths; stays silent on hits and moves', () => {
    const text = (e: SimEvent): string | undefined => announcementsFor([e])[0]?.text;
    expect(text(ev(SimEventKind.matchEnded, { winner: 0 }))).toMatch(/Victory/);
    expect(text(ev(SimEventKind.matchEnded, { winner: 1 }))).toMatch(/Defeat/);
    expect(text(ev(SimEventKind.matchEnded, { winner: -1 }))).toMatch(/draw/);
    expect(text(ev(SimEventKind.captured))).toMatch(/Snagged/);
    expect(text(ev(SimEventKind.captureFailed))).toMatch(/Snag failed/);
    expect(text(ev(SimEventKind.died, { team: 0 }))).toMatch(/Your elemental/);
    expect(text(ev(SimEventKind.died, { team: 1 }))).toMatch(/Enemy/);
    expect(announcementsFor([ev(SimEventKind.damage), ev(SimEventKind.moved), ev(SimEventKind.swapped)])).toEqual([]);
  });
  it('announces traps in words, politely: yours placed, armed, triggered, expired, doused; the foe\'s placed, triggered, doused only', () => {
    const text = (e: SimEvent): string | undefined => announcementsFor([e])[0]?.text;
    const placed = (team: number, trap: number): SimEvent => ev(SimEventKind.trapPlaced, { team, trap });
    expect(text(placed(0, 3))).toBe('Your Spike placed.');
    expect(text(placed(1, 1))).toBe('Enemy Fire Bomb placed.');
        // trapArmed has no team in its payload: the owner entity (sourceId) is mapped to a team.
    expect(announcementsFor([ev(SimEventKind.trapArmed, { trap: 2 })], () => 0)[0]?.text).toBe('Your Puddle is armed.');
    expect(announcementsFor([ev(SimEventKind.trapArmed, { trap: 2 })], () => 1)).toEqual([]);
    const ended = (team: number, reason: number): SimEvent => ev(SimEventKind.trapTriggered, { team, trap: 4, reason });
    expect(text(ended(0, TrapReason.overlap))).toBe('Your Gust triggered.');
    expect(text(ended(1, TrapReason.overlap))).toBe('Enemy Gust triggered.');
    expect(text(ended(0, TrapReason.timeout))).toBe('Your Gust expired.');
    expect(announcementsFor([ended(1, TrapReason.timeout)])).toEqual([]);
    expect(text(ended(1, TrapReason.doused))).toBe('Enemy Gust doused.');
    expect(announcementsFor([placed(0, 3), ended(1, TrapReason.doused)]).every((a) => !a.important)).toBe(true);
  });
  it('trap lines are rate-limited by the Announcer: the same line is not repeated inside the window, a burst keeps at most 3', () => {
    let now = 0;
    const spoken: string[] = [];
    const a = new Announcer((x) => spoken.push(x), () => now);
    const placed = announcementsFor([ev(SimEventKind.trapPlaced, { team: 0, trap: 3 })])[0];
    if (!placed) throw new Error('no line');
    a.say(placed);
    now = 2000;
    a.say(placed);
    expect(spoken).toEqual(['Your Spike placed.']);
    for (const t of [1, 2, 3, 4]) a.say({ key: `k${String(t)}`, text: String(t), important: false });
    expect(a.pending).toBe(3);
  });
  it('different trap kinds do not silence each other; the same kind still repeats only after the window', () => {
    const spoken: string[] = [];
    const a = new Announcer((x) => spoken.push(x), () => 0, { minGapMs: 0 });
    for (const trap of [3, 2]) for (const l of announcementsFor([ev(SimEventKind.trapPlaced, { team: 0, trap })])) a.say(l);
    expect(spoken).toEqual(['Your Spike placed.', 'Your Puddle placed.']);
  });
  it('over the queue cap, trap lines are dropped before death lines', () => {
    const spoken: string[] = [];
    const a = new Announcer((x) => spoken.push(x), () => 0);
    a.say({ key: 'first', text: 'first', important: false });
    a.say({ key: 'heroDied', text: 'died', important: false });
    for (const k of ['trapMine1Placed', 'trapMine2Placed', 'trapMine3Placed']) a.say({ key: k, text: k, important: false });
    expect(a.pending).toBe(3);
    expect(a.queued).toContain('died');
  });
  it('the match result is important', () => {
    expect(announcementsFor([ev(SimEventKind.matchEnded, { winner: 0 })])[0]?.important).toBe(true);
  });
});

describe('LowHealthWatch', () => {
  it('fires once at 25% and re-arms only after recovering past 40%', () => {
    const w = new LowHealthWatch();
    expect(w.update(0.9)).toBe(false);
    expect(w.update(0.25)).toBe(true);
    expect(w.update(0.2)).toBe(false);
    expect(w.update(0.3)).toBe(false);
    expect(w.update(0.2)).toBe(false);
    expect(w.update(0.5)).toBe(false);
    expect(w.update(0.1)).toBe(true);
  });
  it('ignores a dead or missing hero', () => {
    const w = new LowHealthWatch();
    expect(w.update(undefined)).toBe(false);
    expect(w.update(0)).toBe(false);
  });
});

describe('Announcer throttle', () => {
  function make() {
    const said: { text: string; assertive: boolean }[] = [];
    let now = 0;
    const a = new Announcer((text, assertive) => said.push({ text, assertive }), () => now, { minGapMs: 1000, repeatMs: 5000 });
    return {
      a,
      said,
      at: (t: number) => {
        now = t;
      },
    };
  }
  const line = (key: string) => ({ key, text: key, important: false });

  it('speaks the first line at once and spaces later ones by the minimum gap', () => {
    const { a, said, at } = make();
    a.say(line('a'));
    at(100);
    a.say(line('b'));
    expect(said.map((s) => s.text)).toEqual(['a']);
    expect(a.pending).toBe(1);
    at(500);
    a.flush();
    expect(said).toHaveLength(1);
    at(1000);
    a.flush();
    expect(said.map((s) => s.text)).toEqual(['a', 'b']);
  });
  it('does not repeat the same key inside the repeat window', () => {
    const { a, said, at } = make();
    a.say(line('low'));
    at(2000);
    a.say(line('low'));
    expect(said).toHaveLength(1);
    at(6000);
    a.say(line('low'));
    expect(said).toHaveLength(2);
  });
  it('important lines go out immediately, assertive, carrying the lines still waiting', () => {
    const { a, said, at } = make();
    a.say(line('a'));
    at(10);
    a.say(line('b'));
    a.say(MATCH_START);
    expect(a.pending).toBe(0);
    expect(said.at(-1)).toEqual({ text: `b ${MATCH_START.text}`, assertive: true });
  });
  it('caps the queue so a burst cannot build a backlog', () => {
    const { a, at } = make();
    a.say(line('0'));
    at(1);
    for (let i = 1; i < 10; i++) a.say(line(String(i)));
    expect(a.pending).toBe(3);
  });
  it('LOW_HEALTH is polite', () => {
    expect(LOW_HEALTH.important).toBe(false);
  });
});

describe('nextFocusIndex (focus trap)', () => {
  it('wraps forwards and backwards', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 1, true)).toBe(0);
  });
  it('enters the trap from outside and handles empty or single sets', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
    expect(nextFocusIndex(1, 0, false)).toBe(0);
    expect(nextFocusIndex(1, 0, true)).toBe(0);
  });
});
