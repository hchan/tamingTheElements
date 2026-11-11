import type { CharacterId, MatchSetup } from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK } from './arcade-pick';
import { arcadeSetup } from './arcade-setup';

/**
 * Online pick exchange, run on the control channel after the link opens and before the setup handshake: each side sends the
 * race it chose (and the host a match seed), then both derive the identical MatchSetup (host = team 0, joiner = team 1),
 * which the handshake double-checks. The peer is untrusted: anything malformed or an unknown race decodes to undefined.
 */
export const MSG_PICK = 10;

export interface OnlinePick {
  readonly race: CharacterId;
  /** Only the host's seed is used. */
  readonly seed: number;
}

export function encodePick(p: OnlinePick): Uint8Array {
  const slug = Array.from(p.race, (c) => c.charCodeAt(0) & 0x7f);
  const out = new Uint8Array(2 + slug.length + 4);
  out[0] = MSG_PICK;
  out[1] = slug.length;
  out.set(slug, 2);
  new DataView(out.buffer).setUint32(2 + slug.length, p.seed >>> 0);
  return out;
}

export function decodePick(m: Uint8Array): OnlinePick | undefined {
  if (m[0] !== MSG_PICK) return undefined;
  const n = m[1];
  if (n === undefined || m.length !== 2 + n + 4) return undefined;
  const slug = String.fromCharCode(...m.subarray(2, 2 + n));
  const race = ARCADE_RACES.find((r) => r === slug);
  if (race === undefined) return undefined;
  return { race, seed: new DataView(m.buffer, m.byteOffset).getUint32(2 + n) };
}

/** The shared 1v1 setup: the host's race against the joiner's, Arcade rules, the host's seed. */
export function onlineSetup(host: OnlinePick, join: OnlinePick): MatchSetup {
  return arcadeSetup({ ...DEFAULT_PICK, player: host.race, enemy: join.race }, host.seed);
}
