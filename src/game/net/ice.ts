import { parseTurn } from '../platform/turn-setting';

/**
 * ICE server configuration for the online link (docs/NETCODE.md, WP 04). Public STUN servers by default; a player on a strict
 * network (symmetric NAT, campus or office firewall) may add their own TURN relay in Settings (the save's `turnServer`, see
 * `platform/turn-setting.ts`). The credentials are only ever handed to `RTCPeerConnection`, never logged or shown in codes.
 */

/** Public STUN (no credentials, no media relayed): two independent operators so one outage does not block hosting. */
export const DEFAULT_STUN: readonly string[] = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];

/** The default STUN servers, plus the player's TURN relay when one is configured (`turn` is untrusted: junk is ignored). */
export function iceFromSettings(turn?: unknown): RTCIceServer[] {
  const servers: RTCIceServer[] = DEFAULT_STUN.map((urls) => ({ urls }));
  const t = parseTurn(turn);
  if (t !== undefined) {
    servers.push({
      urls: t.url,
      ...(t.username === undefined ? {} : { username: t.username }),
      ...(t.credential === undefined ? {} : { credential: t.credential }),
    });
  }
  return servers;
}
