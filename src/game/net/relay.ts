/** Room codes for the online service (docs/ONLINE-PROTOCOL.md): 6 characters, no look-alikes (the alphabet of `src/core/relay/rooms-rules.ts`). */
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Reads a room code typed by a person (spaces and case forgiven); undefined if it cannot be one. */
export function cleanRoomCode(text: string): string | undefined {
  const c = text.replace(/\s+/g, '').toUpperCase();
  return ROOM_CODE_RE.test(c) ? c : undefined;
}
