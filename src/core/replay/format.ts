import type { ChapterNumber } from '../data/chapters';
import type { CharacterId } from '../data/ids';
import { decodeFlags, encodeFlags } from '../flags';
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
}

export interface ReplayFile {
  readonly header: ReplayHeader;
  /** One RLE-coded u16 stream per side, each decoding to `tickCount` entries. */
  readonly inputs: readonly [Rle, Rle];
  /** `hashes[i]` is the state hash at the start of tick `i * HASH_INTERVAL`. */
  readonly hashes: readonly number[];
  /** State hash after the last tick. */
  readonly finalHash: number;
}

export function headerFromSetup(setup: MatchSetup, tickCount: number): ReplayHeader {
  const roster = (r: Roster) => r.map((m) => ({ character: m.character, xp: m.xp }));
  return {
    simVersion: setup.simVersion,
    seed: setup.seed,
    flags: encodeFlags(setup.flags),
    setup: { chapter: setup.chapter, difficulty: setup.difficulty, p1: roster(setup.p1), p2: roster(setup.p2) },
    tickCount,
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
