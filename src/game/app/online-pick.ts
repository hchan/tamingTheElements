import type { CharacterId, MatchSetup } from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK } from './arcade-pick';
import { arcadeSetup } from './arcade-setup';

/**
 * Online pick exchange, run on the control channel after the link opens and before the setup handshake: each side sends the
 * heroes it chose (a lead and up to two more) (and the host a match seed), then both derive the identical MatchSetup (host = team 0, joiner = team 1),
 * which the handshake double-checks. The peer is untrusted: anything malformed or an unknown race decodes to undefined.
 */
export const MSG_PICK = 10;

export interface OnlinePick {
  /** The lead hero. */
  readonly race: CharacterId;
  /**
   * The bench (WP-pvp-3heroes): 0 to 2 more heroes, so a side is 1v1 or a 3-hero team; never a repeat within the team. Sent after
   * the seed, so a message with no bench is byte-identical to the original format.
   */
  readonly bench?: readonly CharacterId[];
  /** Only the host's seed is used. */
  readonly seed: number;
}

const slugOf = (id: string): number[] => Array.from(id, (c) => c.charCodeAt(0) & 0x7f);

export function encodePick(p: OnlinePick): Uint8Array {
  const slug = slugOf(p.race);
  const bench = p.bench ?? [];
  const extra = bench.length === 0 ? [] : [bench.length, ...bench.flatMap((b) => [slugOf(b).length, ...slugOf(b)])];
  const out = new Uint8Array(2 + slug.length + 4 + extra.length);
  out[0] = MSG_PICK;
  out[1] = slug.length;
  out.set(slug, 2);
  new DataView(out.buffer).setUint32(2 + slug.length, p.seed >>> 0);
  out.set(extra, 2 + slug.length + 4);
  return out;
}

const raceAt = (m: Uint8Array, at: number, n: number): CharacterId | undefined => {
  const slug = String.fromCharCode(...m.subarray(at, at + n));
  return ARCADE_RACES.find((r) => r === slug);
};

export function decodePick(m: Uint8Array): OnlinePick | undefined {
  if (m[0] !== MSG_PICK) return undefined;
  const n = m[1];
  if (n === undefined || m.length < 2 + n + 4) return undefined;
  const race = raceAt(m, 2, n);
  if (race === undefined) return undefined;
  const seed = new DataView(m.buffer, m.byteOffset).getUint32(2 + n);
  let at = 2 + n + 4;
  if (at === m.length) return { race, seed };
  // The bench: a count (1 or 2), then each hero as length and slug; exact length, known races, no repeat within the team.
  const count = m[at++];
  if (count !== 1 && count !== 2) return undefined;
  const team: CharacterId[] = [race];
  for (let i = 0; i < count; i++) {
    const len = m[at++];
    if (len === undefined || at + len > m.length) return undefined;
    const hero = raceAt(m, at, len);
    if (hero === undefined || team.includes(hero)) return undefined;
    team.push(hero);
    at += len;
  }
  return at === m.length ? { race, seed, bench: team.slice(1) } : undefined;
}

/**
 * The shared setup: the host's team against the joiner's, Arcade rules, the host's seed. Both sides bring the same number of
 * heroes (the smaller team size wins if a peer sent a different one), so PvP is a 1v1 duel of 1 or 3 heroes a side.
 */
export function onlineSetup(host: OnlinePick, join: OnlinePick): MatchSetup {
  const n = Math.min(host.bench?.length ?? 0, join.bench?.length ?? 0);
  const [partner, partner2] = host.bench ?? [];
  return arcadeSetup(
    {
      ...DEFAULT_PICK,
      player: host.race,
      enemy: join.race,
      ...(n > 0 && partner ? { partner } : {}),
      ...(n > 1 && partner2 ? { partner2 } : {}),
      enemyBench: (join.bench ?? []).slice(0, n),
    },
    host.seed,
  );
}
