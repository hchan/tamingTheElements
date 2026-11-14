/**
 * The optional TURN relay for online play (docs/WEBRTC-PLAN.md WP 04), stored in the save as the optional field `turnServer`
 * (no version bump, see docs/SAVE-FORMAT.md). Settings writes it, `src/game/net/ice.ts` reads it. The password is only ever
 * handed to `RTCPeerConnection`: never logged, never put in a signalling code or a link.
 */
export interface TurnSetting {
  url: string;
  username?: string;
  credential?: string;
}

export const TURN_KEY = 'turnServer';

const MAX_FIELD = 512;
const SCHEME = /^turns?:\S+$/i;

/** Untrusted (a save, an import or the settings form): a usable `turn:` or `turns:` URL with bounded text, else undefined. */
export function parseTurn(raw: unknown): TurnSetting | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  if (url.length === 0 || url.length > MAX_FIELD || !SCHEME.test(url)) return undefined;
  const out: TurnSetting = { url };
  if (typeof o.username === 'string' && o.username !== '' && o.username.length <= MAX_FIELD) out.username = o.username;
  if (typeof o.credential === 'string' && o.credential !== '' && o.credential.length <= MAX_FIELD) out.credential = o.credential;
  return out;
}
