import type { SimEvent, SimEventKind } from '@core/index';

/**
 * Pure rules of the round and match result card ("YOU WIN" / "YOU LOSE" / "DRAW" with the score and what happened),
 * presentation only: it reads sim events, never writes sim state. `round-result-view.ts` draws it; the round announcer
 * speaks the `detailOf` text. "You" is team 0, as everywhere else in the round HUD. Event kinds are numbers checked by
 * type here (no run-time core import, as in `arcade-cues.ts`).
 */

type Kinds = typeof SimEventKind;
const ROUND_STARTED: Kinds['roundStarted'] = 53;
const HIT: Kinds['hitConfirmed'] = 41;
const SUPER: Kinds['superStarted'] = 50;
const KO: Kinds['ko'] = 55;
const TIME_OVER: Kinds['timeOver'] = 56;
const SNAG: Kinds['snag'] = 69;
const TRAP_TRIGGERED: Kinds['trapTriggered'] = 72;
/** `SnagEvent.rooted` and `TrapReason.overlap` (a trap that caught a foe), as numbers. */
const SNAG_ROOTED = 0;
const TRAP_OVERLAP = 0;

/** The round card stays 2 s (view ticks); the match card holds until the results screen replaces it. */
export const RESULT_TICKS = 100;

export type Tone = 'win' | 'lose' | 'draw';
/** How a round ended. */
export type How = '' | 'ko' | 'double' | 'time';

/** What team 0 did to its foe, and the foe to it, from the events of one round (or of the match). */
export interface Tally {
  dealt: number;
  taken: number;
  hits: number;
  combo: number;
  snags: number;
  traps: number;
  supers: number;
}

export const emptyTally = (): Tally => ({ dealt: 0, taken: 0, hits: 0, combo: 0, snags: 0, traps: 0, supers: 0 });

/** Counts the events of a match into a round tally (reset at each round start) and a match tally. */
export class ResultTally {
  round = emptyTally();
  match = emptyTally();
  how: How = '';
  perfect = false;

  /** `teamOf` maps a character id to its team (-1 when unknown). */
  consume(e: SimEvent, teamOf: (id: number) => number): void {
    if (e.kind === ROUND_STARTED) {
      this.round = emptyTally();
      this.how = '';
      this.perfect = false;
    } else if (e.kind === KO) {
      this.how = (e['team'] ?? -1) < 0 ? 'double' : 'ko';
      this.perfect = e['perfect'] === 1;
    } else if (e.kind === TIME_OVER) {
      this.how = 'time';
    } else if (e.kind === HIT) {
      const amount = Math.max(0, e['amount'] ?? 0);
      const victim = teamOf(e['target'] ?? -1);
      if (victim === 1) {
        this.add((t) => {
          t.dealt += amount;
          t.hits++;
          t.combo = Math.max(t.combo, e['combo'] ?? 0);
        });
      } else if (victim === 0) {
        this.add((t) => {
          t.taken += amount;
        });
      }
    } else if (e.kind === SNAG) {
      if (e['reason'] === SNAG_ROOTED && teamOf(e['id'] ?? -1) === 1) this.add((t) => t.snags++);
    } else if (e.kind === TRAP_TRIGGERED) {
      // `team` is the trap owner's; only one that caught a foe counts.
      if (e['team'] === 0 && e['reason'] === TRAP_OVERLAP) this.add((t) => t.traps++);
    } else if (e.kind === SUPER) {
      if (teamOf(e['caster'] ?? -1) === 0) this.add((t) => t.supers++);
    }
  }

  private add(f: (t: Tally) => void): void {
    f(this.round);
    f(this.match);
  }
}

/** Roster health left in whole percent: sum of hp over sum of max hp. */
export function healthPct(chars: readonly { hp: number; maxHp: number }[]): number {
  let hp = 0;
  let max = 0;
  for (const c of chars) {
    hp += Math.max(0, c.hp);
    max += Math.max(0, c.maxHp);
  }
  return max <= 0 ? 0 : Math.round((hp * 100) / max);
}

export interface ResultInput {
  /** The round number, or 0 for the match card. */
  readonly round: number;
  /** 0 you, 1 the foe, -1 a draw. */
  readonly winner: number;
  readonly won: readonly [number, number];
  readonly how: How;
  readonly perfect: boolean;
  readonly healthPct: number;
  readonly tally: Tally;
}

export interface ResultCard {
  readonly tone: Tone;
  /** The small line over the title: "ROUND 2" or "MATCH". */
  readonly kicker: string;
  /** YOU WIN, YOU LOSE or DRAW. */
  readonly title: string;
  /** How it ended and the score: "PERFECT K.O.  -  ROUNDS 1 - 0". */
  readonly headline: string;
  /** The stat lines. */
  readonly lines: readonly string[];
  /** The summary for the live region, without the verdict (the announcer says that). */
  readonly detail: string;
}

const TITLE: Readonly<Record<Tone, string>> = { win: 'YOU WIN', lose: 'YOU LOSE', draw: 'DRAW' };
const HOW: Readonly<Record<How, string>> = { '': '', ko: 'K.O.', double: 'DOUBLE K.O.', time: 'TIME OVER' };

export const toneOf = (winner: number): Tone => (winner === 0 ? 'win' : winner === 1 ? 'lose' : 'draw');

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** The card for a finished round (`round` > 0) or match (`round` 0). */
export function resultCard(i: ResultInput): ResultCard {
  const tone = toneOf(i.winner);
  const t = i.tally;
  const match = i.round <= 0;
  const how = match ? '' : i.perfect && i.how === 'ko' ? 'PERFECT K.O.' : HOW[i.how];
  const score = `${match ? 'FINAL ' : ''}ROUNDS ${String(i.won[0])} - ${String(i.won[1])}`;
  const extras: string[] = [];
  if (t.snags > 0) extras.push(`SNAGS ${String(t.snags)}`);
  if (t.traps > 0) extras.push(`TRAPS ${String(t.traps)}`);
  if (t.supers > 0) extras.push(`SUPERS ${String(t.supers)}`);
  const dealt = Math.round(t.dealt);
  const taken = Math.round(t.taken);
  const lines = [
    `HEALTH LEFT ${String(i.healthPct)}%`,
    `DAMAGE ${String(dealt)} DEALT  /  ${String(taken)} TAKEN`,
    `LONGEST COMBO ${String(t.combo)}  /  ${String(t.hits)} ${t.hits === 1 ? 'HIT' : 'HITS'}`,
    ...(extras.length > 0 ? [extras.join('  /  ')] : []),
  ];
  const how_ = match ? '' : i.how === 'ko' ? (i.perfect ? 'Perfect knockout' : 'Knockout') : i.how === 'double' ? 'Double knockout' : i.how === 'time' ? 'Time over' : '';
  const detail = [
    how_ === '' ? '' : `${how_}.`,
    `Health left ${String(i.healthPct)} percent.`,
    `Dealt ${String(dealt)} damage, took ${String(taken)}.`,
    `Longest combo ${String(t.combo)}.`,
    t.snags > 0 ? `${plural(t.snags, 'snag')}.` : '',
    t.traps > 0 ? `${plural(t.traps, 'trap')} sprung.` : '',
    t.supers > 0 ? `${plural(t.supers, 'super')}.` : '',
  ].filter((x) => x !== '').join(' ');
  return {
    tone, kicker: match ? 'MATCH' : `ROUND ${String(i.round)}`, title: TITLE[tone],
    headline: [how, score].filter((x) => x !== '').join('  -  '), lines, detail,
  };
}
