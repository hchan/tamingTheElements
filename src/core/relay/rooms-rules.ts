/**
 * The package's own copy of the room-code rules (the only copy: the old tools/signal-relay copy was removed with WebRTC).
 * tests/repo/room-code-rules-drift.test.ts keeps `src/game/net/relay.ts` equal to it.
 * Pure: randomness is injected.
 */

export const ROOM_TTL_MS = 10 * 60_000;
export const MAX_ROOMS = 2000;
/** No 0/O/1/I: a code read aloud or from a phone screen. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A fresh code; `randomInt(n)` is a uniform integer in [0, n). The caller checks for a collision (conditional put). */
export function generateRoomCode(randomInt: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? 'A';
  return code;
}

/** Trim and upper-case what a player typed. */
export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) if (!CODE_ALPHABET.includes(code.charAt(i))) return false;
  return true;
}
