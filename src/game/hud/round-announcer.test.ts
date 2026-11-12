import { describe, expect, it } from 'vitest';
import { ROUND_INTRO_TICKS, RoundPhase, SimEventKind, type SimEvent } from '@core/index';
import { announcementsFor, type Announcement } from '../a11y/announcer';
import {
  BANNER_IN_MS, FIGHT_BANNER_TICKS, HOLD, PIP_INNER, PIP_STEP, ROUND_EVENT_KINDS, RoundAnnouncer, TIMER_X, bannerScale, pips,
  timerLabel, type RoundSink,
} from './round-announcer';

interface Shown {
  main: string;
  sub: string;
  from: number;
  until: number;
}

/** Fake sink: records every banner and live line. */
function fake(): { sink: RoundSink; banners: Shown[]; lines: Announcement[] } {
  const banners: Shown[] = [];
  const lines: Announcement[] = [];
  return {
    banners,
    lines,
    sink: {
      banner: (main, sub, from, until) => { banners.push({ main, sub, from, until }); },
      say: (line) => { lines.push(line); },
    },
  };
}

let seq = 0;
function ev(tick: number, kind: number, payload: Record<string, number> = {}): SimEvent {
  return { ...payload, tick, sourceId: 0, kind, seq: seq++ } as SimEvent;
}

const last = <T>(xs: readonly T[]): T | undefined => xs[xs.length - 1];

describe('RoundAnnouncer', () => {
  it('covers every round event: each one gives a banner and a live line (match end: the shared line with the score)', () => {
    const payloads: Readonly<Record<number, Record<string, number>>> = {
      [SimEventKind.roundStarted]: { round: 1 },
      [SimEventKind.ko]: { team: 1, perfect: 0 },
      [SimEventKind.roundEnded]: { winner: 0, won0: 1, won1: 0 },
      [SimEventKind.matchEnded]: { winner: 0, won0: 2, won1: 0 },
    };
    for (const kind of ROUND_EVENT_KINDS) {
      const f = fake();
      const e = ev(10, kind, payloads[kind]);
      new RoundAnnouncer(f.sink).consume([e]);
      expect(f.banners.length, `banner for kind ${String(kind)}`).toBe(1);
      expect(last(f.banners)?.main, `banner text for kind ${String(kind)}`).not.toBe('');
      const spoken = kind === SimEventKind.matchEnded ? announcementsFor([e]) : f.lines;
      expect(spoken.length, `live line for kind ${String(kind)}`).toBe(1);
    }
    expect(announcementsFor([ev(1, SimEventKind.matchEnded, { winner: 0, won0: 2, won1: 1 })])[0]?.text).toBe(
      'Victory. You won the match. Rounds 2 to 1.',
    );
    // Classic match ends have no round score.
    expect(announcementsFor([ev(1, SimEventKind.matchEnded, { winner: 1 })])[0]?.text).toBe('Defeat. You lost the match.');
  });

  it('plays a knockout round: ROUND 1 for the intro, FIGHT! for 1 s, K.O. with PERFECT, then the result', () => {
    const f = fake();
    const a = new RoundAnnouncer(f.sink);
    a.consume([ev(1, SimEventKind.roundStarted, { round: 1 })]);
    expect(last(f.banners)).toEqual({ main: 'ROUND 1', sub: '', from: 1, until: 2 + ROUND_INTRO_TICKS });
    expect(last(f.lines)).toEqual({ key: 'round1', text: 'Round 1.', important: false });
    a.consume([ev(91, SimEventKind.fight)]);
    expect(last(f.banners)).toEqual({ main: 'FIGHT!', sub: '', from: 91, until: 91 + FIGHT_BANNER_TICKS });
    expect(last(f.lines)).toEqual({ key: 'fight1', text: 'Fight!', important: true });
    a.consume([ev(400, SimEventKind.died, { team: 1 }), ev(400, SimEventKind.ko, { team: 1, perfect: 1 })]);
    expect(last(f.banners)).toEqual({ main: 'K.O.', sub: 'PERFECT', from: 400, until: HOLD });
    expect(last(f.lines)?.text).toBe('K.O. You knocked out the enemy. Perfect.');
    a.consume([ev(550, SimEventKind.roundEnded, { winner: 0, won0: 1, won1: 0 })]);
    expect(last(f.banners)).toEqual({ main: 'PERFECT', sub: 'YOU WIN ROUND 1', from: 550, until: HOLD });
    expect(last(f.lines)).toEqual({ key: 'roundEnded1', text: 'You win round 1. Rounds 1 to 0.', important: false });
    // Hits and other events are not the announcer's.
    expect(f.banners).toHaveLength(4);
  });

  it('time over keeps TIME up with the result; a lost or drawn round says so; a double KO', () => {
    const f = fake();
    const a = new RoundAnnouncer(f.sink);
    a.consume([ev(1, SimEventKind.roundStarted, { round: 2 }), ev(91, SimEventKind.fight)]);
    a.consume([ev(4591, SimEventKind.timeOver), ev(4591, SimEventKind.roundEnded, { winner: 1, won0: 1, won1: 1 })]);
    expect(f.banners.slice(-2)).toEqual([
      { main: 'TIME', sub: '', from: 4591, until: HOLD },
      { main: 'TIME', sub: 'YOU LOSE ROUND 2', from: 4591, until: HOLD },
    ]);
    expect(f.lines.slice(-2).map((l) => [l.text, l.important])).toEqual([
      ['Time over.', true],
      ['You lose round 2. Rounds 1 to 1.', false],
    ]);
    // 1-1: the next round is the final one.
    a.consume([ev(4700, SimEventKind.roundStarted, { round: 3 })]);
    expect(last(f.banners)?.main).toBe('FINAL ROUND');
    expect(last(f.lines)?.text).toBe('Final round.');
    a.consume([ev(4800, SimEventKind.fight), ev(4900, SimEventKind.ko, { team: -1, perfect: 0 })]);
    expect(last(f.banners)).toMatchObject({ main: 'DOUBLE K.O.', sub: '' });
    expect(last(f.lines)?.text).toBe('Double K.O.');
    a.consume([ev(5050, SimEventKind.roundEnded, { winner: -1, won0: 2, won1: 2 })]);
    expect(last(f.banners)).toMatchObject({ main: 'DOUBLE K.O.', sub: 'ROUND 3 DRAW' });
    expect(last(f.lines)?.text).toBe('Round 3 is a draw. Rounds 2 to 2.');
    a.consume([ev(5110, SimEventKind.matchEnded, { winner: -1, won0: 2, won1: 2 })]);
    expect(last(f.banners)).toMatchObject({ main: 'DRAW', sub: '2 - 2', until: HOLD });
  });

  it('the player knocked out: K.O. without PERFECT; the match result banner', () => {
    const f = fake();
    const a = new RoundAnnouncer(f.sink);
    a.consume([ev(1, SimEventKind.roundStarted, { round: 1 }), ev(300, SimEventKind.ko, { team: 0, perfect: 0 })]);
    expect(last(f.lines)?.text).toBe('K.O. You were knocked out.');
    a.consume([ev(450, SimEventKind.roundEnded, { winner: 1, won0: 0, won1: 2 })]);
    expect(last(f.banners)).toMatchObject({ main: 'K.O.', sub: 'YOU LOSE ROUND 1' });
    a.consume([ev(510, SimEventKind.matchEnded, { winner: 1, won0: 0, won1: 2 })]);
    expect(last(f.banners)).toMatchObject({ main: 'DEFEAT', sub: '0 - 2' });
  });

  it('delivers each event once (repeats and older events are skipped)', () => {
    const f = fake();
    const a = new RoundAnnouncer(f.sink);
    const start = ev(1, SimEventKind.roundStarted, { round: 1 });
    const fight = ev(91, SimEventKind.fight);
    a.consume([start, fight]);
    a.consume([start, fight]);
    expect(f.banners).toHaveLength(2);
    expect(f.lines).toHaveLength(2);
  });

  it('syncs to an intro already running when the view loads late (round 0 is the world before round 1)', () => {
    const f = fake();
    const a = new RoundAnnouncer(f.sink);
    a.sync({ round: 0, phase: RoundPhase.intro, roundsWon: [0, 0] }, 0);
    expect(last(f.banners)).toMatchObject({ main: 'ROUND 1', from: 0 });
    expect(f.lines).toHaveLength(0);
    // The round's own start keeps the banner (no second scale-in) and says the line.
    a.consume([ev(1, SimEventKind.roundStarted, { round: 1 })]);
    expect(last(f.banners)).toMatchObject({ main: 'ROUND 1', from: 0 });
    expect(f.lines).toHaveLength(1);
    const g = fake();
    new RoundAnnouncer(g.sink).sync({ round: 2, phase: RoundPhase.fight, roundsWon: [1, 0] }, 900);
    expect(g.banners).toHaveLength(0);
    new RoundAnnouncer(g.sink).sync({ round: 3, phase: RoundPhase.intro, roundsWon: [1, 1] }, 900);
    expect(last(g.banners)?.main).toBe('FINAL ROUND');
  });
});

describe('round HUD helpers', () => {
  it('banners scale in over 600 ms (ease-out from 2x); reduced motion keeps them still at 1x', () => {
    expect(bannerScale(0, false)).toBe(2);
    expect(bannerScale(BANNER_IN_MS / 2, false)).toBeCloseTo(1.25);
    expect(bannerScale(BANNER_IN_MS, false)).toBe(1);
    expect([0, 100, 600, 5000].map((ms) => bannerScale(ms, true))).toEqual([1, 1, 1, 1]);
  });
  it('the timer shows whole seconds left, two digits', () => {
    expect([4500, 4451, 4450, 500, 49, 1, 0, -5].map(timerLabel)).toEqual(['90', '90', '89', '10', '01', '01', '00', '00']);
  });
  it('pips: two per team either side of the timer, filled once won', () => {
    expect(pips([1, 2])).toEqual([
      { x: TIMER_X - PIP_INNER, team: 0, won: true },
      { x: TIMER_X - PIP_INNER - PIP_STEP, team: 0, won: false },
      { x: TIMER_X + PIP_INNER, team: 1, won: true },
      { x: TIMER_X + PIP_INNER + PIP_STEP, team: 1, won: true },
    ]);
  });

  it('shows a SUDDEN DEATH banner and an assertive line when the sim says the round is sudden death', () => {
    const f = fake();
    new RoundAnnouncer(f.sink, () => true).consume([ev(500, SimEventKind.roundStarted, { round: 3 })]);
    expect(last(f.banners)?.main).toBe('SUDDEN DEATH');
    expect(last(f.lines)).toMatchObject({ key: 'round3', text: 'Sudden death. One hit may decide the match.', important: true });
    // Not sudden: the ordinary banners are untouched.
    const g = fake();
    new RoundAnnouncer(g.sink, () => false).consume([ev(500, SimEventKind.roundStarted, { round: 2 })]);
    expect(last(g.banners)?.main).toBe('ROUND 2');
  });

  it('syncs a late-loading view into a sudden-death intro', () => {
    const f = fake();
    new RoundAnnouncer(f.sink).sync({ round: 3, phase: RoundPhase.intro, roundsWon: [2, 2], sudden: true }, 700);
    expect(last(f.banners)).toMatchObject({ main: 'SUDDEN DEATH', from: 700 });
    expect(f.lines).toHaveLength(0);
  });
});
