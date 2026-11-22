import type { ChapterNumber } from '../data/chapters';
import type { CharacterId } from '../data/ids';
import { decodeFlags, encodeFlags, hasTesterFlags } from '../flags';
import type { MatchSetup, Roster } from '../sim/match';
import type { Rle } from './rle';

/** Ticks between state-hash checkpoints. */
export const HASH_INTERVAL = 50;

export interface ReplayHeader {
  readonly simVersion: number;
  readonly seed: number;
  /** `encodeFlags` output. */
  readonly flags: string;
  readonly setup: {
    readonly chapter: number;
    readonly difficulty: number;
    readonly p1: readonly { readonly character: string; readonly xp: number }[];
    readonly p2: readonly { readonly character: string; readonly xp: number }[];
  };
  readonly tickCount: number;
  /** Present (true) only for a match played in tester mode: not reproducible, refused by every verifier. */
  readonly cheats?: boolean;
}

export interface ReplayFile {
  readonly header: ReplayHeader;
  /** One RLE-coded 17-bit command stream per side, each decoding to `tickCount` entries. */
  readonly inputs: readonly [Rle, Rle];
  /** `hashes[i]` is the state hash at the start of tick `i * HASH_INTERVAL`. */
  readonly hashes: readonly number[];
  /** State hash after the last tick. */
  readonly finalHash: number;
  /** How the match ended, when a client recorded it (online reports only; never part of the sim or the hashes). */
  readonly end?: ReplayEnd;
}

/** A client's note on why an online match ended. Same reason values as the relay RESULT (0 natural, 1 forfeit, 2 timeout, 3 desync). */
export interface ReplayEnd {
  readonly reason: 0 | 1 | 2 | 3;
  readonly detail: string;
  readonly tick: number;
  readonly winner: number;
  readonly resultSent: boolean;
}

/** Longest `ReplayEnd.detail` the validator accepts. */
export const REPLAY_END_DETAIL_MAX = 32;

/** True for a header recorded in tester mode (explicit `cheats` or a tester-only sim flag). */
export function isCheatHeader(h: Pick<ReplayHeader, 'flags'> & { readonly cheats?: boolean }): boolean {
  return h.cheats === true || hasTesterFlags(decodeFlags(h.flags));
}

export function headerFromSetup(setup: MatchSetup, tickCount: number, cheats = false): ReplayHeader {
  const roster = (r: Roster) => r.map((m) => ({ character: m.character, xp: m.xp }));
  return {
    simVersion: setup.simVersion,
    seed: setup.seed,
    flags: encodeFlags(setup.flags),
    setup: { chapter: setup.chapter, difficulty: setup.difficulty, p1: roster(setup.p1), p2: roster(setup.p2) },
    tickCount,
    ...(cheats ? { cheats: true } : {}),
  };
}

export function setupFromHeader(h: ReplayHeader): MatchSetup {
  const roster = (r: ReplayHeader['setup']['p1']): Roster =>
    r.map((m) => ({ character: m.character as CharacterId, xp: m.xp }));
  return {
    simVersion: h.simVersion,
    seed: h.seed,
    flags: decodeFlags(h.flags),
    chapter: h.setup.chapter as ChapterNumber,
    difficulty: h.setup.difficulty,
    p1: roster(h.setup.p1),
    p2: roster(h.setup.p2),
  };
}

export function serializeReplay(r: ReplayFile): string {
  return JSON.stringify(r);
}

export function parseReplay(json: string): ReplayFile {
  const r = JSON.parse(json) as Partial<{ header: unknown; inputs: unknown[]; hashes: unknown; finalHash: unknown }>;
  if (!r.header || r.inputs?.length !== 2 || !Array.isArray(r.hashes) || typeof r.finalHash !== 'number') {
    throw new Error('malformed replay file');
  }
  return r as unknown as ReplayFile;
}
