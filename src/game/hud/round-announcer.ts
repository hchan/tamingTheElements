import { ROUND_INTRO_TICKS, ROUNDS_TO_WIN, RoundPhase, SimEventKind, type RenderArcade, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';

/**
 * Pure Arcade round announcer (FUN-DESIGN 2.10 and section 3, WP-arcade-announcer-view; no Phaser): turns the round
 * events of `systems/arcade/round.ts` into the big centred banner ("ROUND 1", "FIGHT!", "K.O.", "TIME", "PERFECT", the
 * round and match result) and into lines for the screen-reader live region. Banner times are view ticks (`W.tick`), so a
 * banner holds while the sim is paused and steps with e2e. `round-view.ts` draws it; this file holds the rules.
 */

/** The events the announcer reacts to: every round event, and the Arcade match end. */
export const ROUND_EVENT_KINDS: readonly number[] = [
  SimEventKind.roundStarted, SimEventKind.fight, SimEventKind.ko, SimEventKind.timeOver, SimEventKind.roundEnded,
  SimEventKind.matchEnded,
];
/** "FIGHT!" stays this many ticks (1 s); the others hold until the next banner replaces them. */
export const FIGHT_BANNER_TICKS = 50;
export const HOLD = Number.MAX_SAFE_INTEGER;
export const TICK_MS = 20;
/** Scale-in of a new banner: from 1 + BANNER_IN_SCALE down to 1 over BANNER_IN_MS (ease-out); none with reduced motion. */
export const BANNER_IN_MS = 600;
export const BANNER_IN_SCALE = 1;
/** The timer turns to its warning style from this many game ticks left (10 s). */
export const TIMER_LOW_TICKS = 500;

/** Where the announcer's output goes: the banner (shown while view tick < `until`) and the live region. */
export interface RoundSink {
  /** A banner from view tick `from`; `from` is kept when the main text did not change, so it does not scale in again. */
  banner(main: string, sub: string, from: number, until: number): void;
  say(line: Announcement): void;
}

const RESULT: Readonly<Record<string, string>> = { '0': 'YOU WIN', '1': 'YOU LOSE', '-1': 'DRAW' };
const MATCH: Readonly<Record<string, string>> = { '0': 'VICTORY', '1': 'DEFEAT', '-1': 'DRAW' };

export class RoundAnnouncer {
  /** Last event delivered (tick, seq): events arrive in order, so an older or repeated one is skipped. */
  private lastTick = -1;
  private lastSeq = -1;
  private round = 0;
  private won: [number, number] = [0, 0];
  private perfect = false;
  private main = '';
  private from = 0;

  /** `sudden` reads the sim's sudden-death slot (RenderArcade.sudden); it is set before `roundStarted` is emitted. */
  constructor(
    private readonly sink: RoundSink,
    private readonly sudden: () => boolean = () => false,
    /** The round's summary (`round-result.ts`), spoken after the verdict and the score; '' says nothing more. */
    private readonly detail: (winner: number) => string = () => '',
  ) {}

  /**
   * Catch-up when the view loads after the round already started (its code is a lazy chunk): an intro in progress, or
   * the world before its first tick (round 0, which starts round 1), shows its "ROUND n" banner.
   */
  sync(a: Pick<RenderArcade, 'round' | 'phase' | 'roundsWon'> & { sudden?: boolean }, tick: number): void {
    if (a.phase !== RoundPhase.intro) return;
    this.won = [a.roundsWon[0], a.roundsWon[1]];
    this.intro(Math.max(1, a.round), tick, false, a.sudden === true);
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (!ROUND_EVENT_KINDS.includes(e.kind)) continue;
      if (e.tick < this.lastTick || (e.tick === this.lastTick && e.seq <= this.lastSeq)) continue;
      this.lastTick = e.tick;
      this.lastSeq = e.seq;
      this.on(e);
    }
  }

  private show(main: string, sub: string, tick: number, until: number): void {
    if (main !== this.main) this.from = tick;
    this.main = main;
    this.sink.banner(main, sub, this.from, until);
  }

  private intro(round: number, tick: number, say: boolean, sudden: boolean): void {
    this.round = round;
    this.perfect = false;
    const final = !sudden && this.won[0] === ROUNDS_TO_WIN - 1 && this.won[1] === ROUNDS_TO_WIN - 1;
    const main = sudden ? 'SUDDEN DEATH' : final ? 'FINAL ROUND' : `ROUND ${String(round)}`;
    this.show(main, '', tick, tick + 1 + ROUND_INTRO_TICKS);
    if (say) {
      const text = sudden ? 'Sudden death. One hit may decide the match.' : final ? 'Final round.' : `Round ${String(round)}.`;
      this.sink.say({ key: `round${String(round)}`, text, important: sudden });
    }
  }

  private on(e: SimEvent): void {
    const t = e.tick;
    const n = String(this.round);
    switch (e.kind) {
      case SimEventKind.roundStarted:
        this.intro(e['round'] ?? this.round + 1, t, true, this.sudden());
        return;
      case SimEventKind.fight:
        this.show('FIGHT!', '', t, t + FIGHT_BANNER_TICKS);
        this.sink.say({ key: `fight${n}`, text: 'Fight!', important: true });
        return;
      case SimEventKind.ko: {
        // `team` is the KO'd team (-1: both); `perfect` when the winner is still at full HP.
        const team = e['team'] ?? -1;
        // PERFECT is praise: only for the player's own flawless win (the KO'd team is the foe's), never on a round that was lost.
        this.perfect = e['perfect'] === 1 && team === 1;
        const tail = this.perfect ? ' Perfect.' : '';
        this.show(team < 0 ? 'DOUBLE K.O.' : 'K.O.', this.perfect ? 'PERFECT' : '', t, HOLD);
        const who = team < 0 ? 'Double K.O.' : team === 1 ? 'K.O. You knocked out the enemy.' : 'K.O. You were knocked out.';
        this.sink.say({ key: `ko${n}`, text: who + tail, important: true });
        return;
      }
      case SimEventKind.timeOver:
        this.show('TIME', '', t, HOLD);
        this.sink.say({ key: `time${n}`, text: 'Time over.', important: true });
        return;
      case SimEventKind.roundEnded: {
        const w = e['winner'] ?? -1;
        this.won = [e['won0'] ?? 0, e['won1'] ?? 0];
        const result = w < 0 ? `ROUND ${n} DRAW` : `${RESULT[String(w)] ?? ''} ROUND ${n}`;
        this.show(this.perfect ? 'PERFECT' : this.main || 'TIME', result, t, HOLD);
        const said = w < 0 ? `Round ${n} is a draw.` : w === 0 ? `You win round ${n}.` : `You lose round ${n}.`;
        const more = this.detail(w);
        this.sink.say({ key: `roundEnded${n}`, text: `${said} Rounds ${String(this.won[0])} to ${String(this.won[1])}.${more === '' ? '' : ` ${more}`}`, important: false });
        return;
      }
      default: {
        // matchEnded: the live line is the shared one (announcementsFor), which carries the round score in Arcade.
        const w = e['winner'] ?? -1;
        this.show(MATCH[String(w)] ?? 'DRAW', `${String(e['won0'] ?? this.won[0])} - ${String(e['won1'] ?? this.won[1])}`, t, HOLD);
      }
    }
  }
}

/** Scale of a banner `ageMs` after it appeared: an ease-out scale-in; 1 with reduced motion (the text stays). */
export function bannerScale(ageMs: number, reduced: boolean): number {
  if (reduced || ageMs >= BANNER_IN_MS) return 1;
  const k = 1 - Math.max(0, ageMs) / BANNER_IN_MS;
  return 1 + BANNER_IN_SCALE * k * k;
}

/** Whole seconds left on the round timer (rounded up), two digits: 4500 ticks is "90". */
export function timerLabel(ticks: number): string {
  return String(Math.ceil(Math.max(0, ticks) / (1000 / TICK_MS))).padStart(2, '0');
}

/** The sudden-death round's timer: a word (not only a colour) in front of the seconds, a smaller size and its own colour. */
export const SUDDEN_TIMER_COLOR = '#c07ab0';
export const TIMER_COLOR = '#e0dacb';
export const LOW_TIMER_COLOR = '#d98a78';
export const SUDDEN_TIMER_PX = 32;

/** Text, colour and font size of the round timer: `SUDDEN 59` in magenta in the sudden-death round, red under 10 s otherwise. */
export function timerStyle(ticks: number, sudden: boolean): { text: string; color: string; px: number } {
  const label = timerLabel(ticks);
  if (sudden) return { text: `SUDDEN ${label}`, color: SUDDEN_TIMER_COLOR, px: SUDDEN_TIMER_PX };
  return { text: label, color: ticks <= TIMER_LOW_TICKS ? LOW_TIMER_COLOR : TIMER_COLOR, px: TIMER_PX };
}

/** Round-win pips under the timer: ROUNDS_TO_WIN per team, team 0 left of the centre, team 1 right; filled once won. */
export const PIP_Y = 60;
export const PIP_R = 11;
export const PIP_STEP = 27;
/** Gap from the centre line to the nearest pip's centre. */
export const PIP_INNER = 18;
export const TIMER_X = 640;
export const TIMER_Y = 4;
export const TIMER_PX = 34;

export interface Pip {
  readonly x: number;
  readonly team: 0 | 1;
  readonly won: boolean;
}

/** The pips for `won` rounds per team; team 0 fills from the centre outward on its side, team 1 likewise. */
export function pips(won: readonly [number, number]): Pip[] {
  const out: Pip[] = [];
  for (const team of [0, 1] as const) {
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const dx = PIP_INNER + i * PIP_STEP;
      out.push({ x: team === 0 ? TIMER_X - dx : TIMER_X + dx, team, won: won[team] > i });
    }
  }
  return out;
}
