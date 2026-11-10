import { GARRISON_MAX_SIZE } from '../data/chapters';
import { CHARACTERS } from '../data/characters';
import { decodeFlags } from '../flags';
import { HASH_INTERVAL, isCheatHeader, type ReplayFile } from './format';

/** Two hours of play at 50 Hz: anything longer is not a real match and would cost real memory to decode. */
export const MAX_REPLAY_TICKS = 50 * 60 * 120;

const KNOWN: ReadonlySet<string> = new Set(CHARACTERS.map((c) => c.id as string));

export type ReplayCheck = { ok: true; value: ReplayFile } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

function checkRoster(name: string, r: unknown): string | undefined {
  if (!Array.isArray(r) || r.length < 1 || r.length > GARRISON_MAX_SIZE) {
    return `${name} must list 1 to ${String(GARRISON_MAX_SIZE)} characters`;
  }
  for (const m of r as unknown[]) {
    if (!isObj(m) || typeof m['character'] !== 'string' || !KNOWN.has(m['character'])) return `${name} has an unknown character`;
    const xp = m['xp'];
    if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0 || xp > 1_000_000_000) return `${name} has an invalid xp value`;
  }
  return undefined;
}

/** Sum of run lengths of a `[value, count, ...]` stream, or undefined when it is malformed. Never allocates the decoded stream. */
function rleLength(rle: unknown): number | undefined {
  if (!Array.isArray(rle) || rle.length % 2 !== 0) return undefined;
  let total = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const v: unknown = rle[i];
    const n: unknown = rle[i + 1];
    if (!isInt(v, 0, 0xffff) || !isInt(n, 1, MAX_REPLAY_TICKS)) return undefined;
    total += n;
    if (total > MAX_REPLAY_TICKS) return undefined;
  }
  return total;
}

/**
 * Validates a parsed replay before it reaches `createMatch` or the decoder. Never throws; returns a
 * friendly message on the first problem. The file format itself is unchanged.
 */
export function validateReplay(raw: unknown): ReplayCheck {
  try {
    if (!isObj(raw)) return { ok: false, message: 'This is not a replay file.' };
    const h = raw['header'];
    if (!isObj(h)) return { ok: false, message: 'The replay has no header.' };
    if (!isInt(h['simVersion'], 0, 1_000_000)) return { ok: false, message: 'The replay has an invalid simVersion.' };
    if (!isInt(h['seed'], 0, 0xffffffff)) return { ok: false, message: 'The replay has an invalid seed.' };
    const flags = h['flags'];
    if (typeof flags !== 'string' || flags.length > 200) return { ok: false, message: 'The replay has invalid flags.' };
    try {
      decodeFlags(flags);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'The replay has invalid flags.' };
    }
    if (h['cheats'] !== undefined && typeof h['cheats'] !== 'boolean') return { ok: false, message: 'The replay has an invalid cheats field.' };
    if (isCheatHeader({ flags, cheats: h['cheats'] })) {
      return { ok: false, message: 'This replay was recorded in tester mode (cheats), so it cannot be verified or played back.' };
    }
    const tickCount = h['tickCount'];
    if (!isInt(tickCount, 0, MAX_REPLAY_TICKS)) return { ok: false, message: 'The replay length is out of range.' };
    const s = h['setup'];
    if (!isObj(s)) return { ok: false, message: 'The replay has no match setup.' };
    if (!isInt(s['chapter'], 1, 5)) return { ok: false, message: 'The replay has an invalid chapter.' };
    const d = s['difficulty'];
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0.1 || d > 3) {
      return { ok: false, message: 'The replay has an invalid difficulty.' };
    }
    const bad = checkRoster('player team', s['p1']) ?? checkRoster('enemy team', s['p2']);
    if (bad) return { ok: false, message: `The replay is invalid: ${bad}.` };
    const inputs = raw['inputs'];
    if (!Array.isArray(inputs) || inputs.length !== 2) return { ok: false, message: 'The replay inputs are malformed.' };
    for (const side of inputs as unknown[]) {
      if (rleLength(side) !== tickCount) return { ok: false, message: 'The replay inputs do not match its length.' };
    }
    const hashes = raw['hashes'];
    if (!Array.isArray(hashes) || hashes.length !== Math.ceil(tickCount / HASH_INTERVAL)) {
      return { ok: false, message: 'The replay checkpoints do not match its length.' };
    }
    if (!(hashes as unknown[]).every((x) => typeof x === 'number')) {
      return { ok: false, message: 'The replay checkpoints are invalid.' };
    }
    if (typeof raw['finalHash'] !== 'number') return { ok: false, message: 'The replay has no final hash.' };
    return { ok: true, value: raw as unknown as ReplayFile };
  } catch {
    return { ok: false, message: 'The replay file could not be read.' };
  }
}

/** Parses replay JSON text and validates it; never throws. */
export function parseReplayChecked(text: string): ReplayCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The file is not valid JSON.' };
  }
  return validateReplay(raw);
}
