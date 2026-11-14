/**
 * Client of the optional signalling relay (docs/WEBRTC-PLAN.md WP 10, server in `tools/signal-relay/`). It carries only the
 * two signalling codes (offer, answer) between a host and a friend who share a 6-character room code; gameplay stays peer
 * to peer. Shown only when the build sets `VITE_SIGNAL_URL` (dev and test builds also accept `?signal=ws://...`).
 */

/** The WebSocket surface used here (the browser's, or a fake in tests). */
export interface RelaySocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}
export type RelaySocketCtor = new (url: string) => RelaySocket;

export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

const ERROR_WORDS: Record<string, string> = {
  'no-room': 'That room code was not found. Check it, or ask your friend for a new one.',
  full: 'That room already has two players.',
  busy: 'This connection is already in a room.',
  'too-big': 'The code was too big for the relay.',
  'bad-message': 'The relay did not understand the message.',
  'full-house': 'The relay is busy right now. Try again in a minute.',
};
const DOWN = 'Could not reach the room server. Check your connection, or use the copy-paste codes instead.';

/** The relay address: the build's `VITE_SIGNAL_URL`, or (dev and test builds only) `?signal=`. Undefined hides the room-code UI. */
export function relayUrl(search: string, dev: boolean, built: string | undefined = import.meta.env['VITE_SIGNAL_URL'] as string | undefined): string | undefined {
  const asked = dev ? new URLSearchParams(search).get('signal') : null;
  const url = asked ?? built;
  return url !== undefined && url !== '' && /^wss?:\/\//.test(url) ? url : undefined;
}

/** Reads a room code typed by a person (spaces and case forgiven); undefined if it cannot be one. */
export function cleanRoomCode(text: string): string | undefined {
  const c = text.replace(/\s+/g, '').toUpperCase();
  return ROOM_CODE_RE.test(c) ? c : undefined;
}

type Incoming = { t: string; code?: string; data?: string; reason?: string };

function parse(data: unknown): Incoming | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const v: unknown = JSON.parse(data);
    return typeof v === 'object' && v !== null && typeof (v as Incoming).t === 'string' ? (v as Incoming) : undefined;
  } catch {
    return undefined;
  }
}

/** Opens a socket and resolves once it is open; rejects with words. */
function open(url: string, Ctor: RelaySocketCtor): Promise<RelaySocket> {
  return new Promise((resolve, reject) => {
    let ws: RelaySocket;
    try {
      ws = new Ctor(url);
    } catch {
      reject(new Error(DOWN));
      return;
    }
    ws.onopen = () => { resolve(ws); };
    ws.onerror = () => { reject(new Error(DOWN)); };
    ws.onclose = () => { reject(new Error(DOWN)); };
  });
}

export interface HostRoom {
  code: string;
  /** Resolves with the friend's answer code; rejects (words) if the room ends first. */
  answer: Promise<string>;
  close: () => void;
}

/** Makes a room and puts `offer` in it. The friend joins with the returned `code`. */
export async function hostRoom(url: string, offer: string, Ctor: RelaySocketCtor = WebSocket as unknown as RelaySocketCtor): Promise<HostRoom> {
  const ws = await open(url, Ctor);
  let onAnswer: (a: string) => void = () => undefined;
  let onFail: (e: Error) => void = () => undefined;
  const answer = new Promise<string>((res, rej) => { onAnswer = res; onFail = rej; });
  answer.catch(() => undefined);
  const code = await new Promise<string>((res, rej) => {
    ws.onmessage = (e) => {
      const m = parse(e.data);
      if (m === undefined) return;
      if (m.t === 'room' && typeof m.code === 'string') {
        res(m.code);
        ws.onmessage = (e2) => {
          const n = parse(e2.data);
          if (n?.t === 'sig' && typeof n.data === 'string') onAnswer(n.data);
          else if (n?.t === 'error') onFail(new Error(ERROR_WORDS[n.reason ?? ''] ?? DOWN));
        };
        ws.send(JSON.stringify({ t: 'sig', data: offer }));
      } else if (m.t === 'error') rej(new Error(ERROR_WORDS[m.reason ?? ''] ?? DOWN));
    };
    ws.onclose = () => { rej(new Error(DOWN)); onFail(new Error('The room closed before your friend joined. Make a new one.')); };
    ws.send(JSON.stringify({ t: 'host' }));
  });
  ws.onclose = () => { onFail(new Error('The room closed before your friend joined. Make a new one.')); };
  return { code, answer, close: () => { ws.onclose = null; ws.close(); } };
}

export interface JoinedRoom {
  /** The host's offer code. */
  offer: string;
  /** Sends our answer code back to the host. */
  reply: (answer: string) => void;
  close: () => void;
}

/** Joins a room by code and waits for the host's offer. */
export async function joinRoom(url: string, code: string, Ctor: RelaySocketCtor = WebSocket as unknown as RelaySocketCtor): Promise<JoinedRoom> {
  const ws = await open(url, Ctor);
  const offer = await new Promise<string>((res, rej) => {
    ws.onmessage = (e) => {
      const m = parse(e.data);
      if (m === undefined) return;
      if (m.t === 'sig' && typeof m.data === 'string') res(m.data);
      else if (m.t === 'error') rej(new Error(ERROR_WORDS[m.reason ?? ''] ?? DOWN));
      else if (m.t === 'left') rej(new Error('The host left the room. Ask for a new code.'));
    };
    ws.onclose = () => { rej(new Error(DOWN)); };
    ws.send(JSON.stringify({ t: 'join', code }));
  });
  ws.onclose = null;
  return { offer, reply: (answer) => { ws.send(JSON.stringify({ t: 'sig', data: answer })); }, close: () => { ws.close(); } };
}
