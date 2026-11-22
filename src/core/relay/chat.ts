import {
  CHAT_CAP_MILLI,
  CHAT_COST_MILLI,
  CHAT_DETAIL_TAG,
  CHAT_LIMIT_CODE,
  CHAT_MAX_PER_SENDER,
  CHAT_UNDELIVERED_CODE,
  chatRefill,
  chatRetryAfterSec,
  validateChatText,
} from './chat-rules';
import type { FrameFields } from './codec';
import { ErrorCode, MATCH_RECORD_TTL_MS } from './constants';
import { encodeText } from './text-codec';

/** Counts-only outcome of one chat line (never text, never length). */
export type ChatOutcome = 'sent' | 'rate' | 'bad' | 'cap' | 'away' | 'stale';

/** Per sender and match: milli-tokens, the time they were last topped up, and lines sent. */
interface ChatRec {
  tokens: number;
  at: number;
  count: number;
}

/** The slice of the match record chat reads. */
interface ChatMatch {
  matchId: number;
  conns: [string, string];
  disc: [number, number];
  gone: [number, number];
}
export interface ChatConn {
  st: string;
  match: string | null;
  slot: number;
}

/** What core.ts hands in; chat touches the store only through `mutate`, and never a `match:*` key. */
export interface ChatDeps {
  matchFor(conn: string, rec: ChatConn): Promise<ChatMatch | undefined>;
  getConn(conn: string): Promise<ChatConn | undefined>;
  /** Compare-and-set on `key`; `fn` returns `keep` for no write. */
  mutate(
    key: string,
    expiresAtMs: number,
    fn: (cur: ChatRec | undefined) => readonly [ChatRec | symbol, { outcome: ChatOutcome; retry: number }],
  ): Promise<{ outcome: ChatOutcome; retry: number }>;
  keep: symbol;
  txRaw(conn: string, data: string): Promise<void>;
  sendError(conn: string, code: number, retryAfterSec: number, detail: number): Promise<void>;
  emit(e: { kind: 'chat'; match: string; slot: number; outcome: ChatOutcome }): void;
}

/**
 * One 0x70 frame from `conn` (state `rec`), already past the chat-off, structure and size checks. Forwards the client's bytes
 * unchanged to the peer (no echo) or answers with a tagged ERROR (`0x7000 | chatSeq`) that never closes the socket.
 * Order: no match or stale matchId (silent drop), rate, bad text, per-match cap, peer away, sent.
 */
export async function handleChat(
  d: ChatDeps,
  conn: string,
  rec: ChatConn,
  f: FrameFields['chat'],
  raw: Uint8Array,
  nowMs: number,
): Promise<void> {
  const matchKey = rec.match ?? '';
  const m = await d.matchFor(conn, rec);
  if (m === undefined || f.match !== m.matchId) {
    d.emit({ kind: 'chat', match: matchKey, slot: rec.slot, outcome: 'stale' });
    return;
  }
  const other = 1 - rec.slot;
  const peerConn = m.conns[other] as string;
  const peerRec = await d.getConn(peerConn);
  const peerHere =
    m.disc[other] === -1 &&
    m.gone[other] !== 1 &&
    peerRec?.st === 'match' &&
    peerRec.match === rec.match &&
    peerRec.slot === other;
  const ok = validateChatText(raw, 4, 4 + f.bytes.length);

  const r = await d.mutate(`chat:${matchKey}:${String(rec.slot)}`, nowMs + MATCH_RECORD_TTL_MS, (cur) => {
    const b = chatRefill({ tokens: cur?.tokens ?? CHAT_CAP_MILLI, atMs: cur?.at ?? nowMs }, nowMs);
    const count = cur?.count ?? 0;
    // A refused line costs nothing and writes nothing.
    if (b.tokens < CHAT_COST_MILLI) return [d.keep, { outcome: 'rate', retry: chatRetryAfterSec(b.tokens) }];
    // Past the rate check a line is charged even when it then fails as bad, cap or away (no free probing).
    const outcome: ChatOutcome = !ok
      ? 'bad'
      : count >= CHAT_MAX_PER_SENDER
        ? 'cap'
        : !peerHere
          ? 'away'
          : 'sent';
    return [
      { tokens: b.tokens - CHAT_COST_MILLI, at: b.atMs, count: outcome === 'sent' ? count + 1 : count },
      { outcome, retry: 0 },
    ];
  });

  if (r.outcome === 'sent') await d.txRaw(peerConn, encodeText(raw));
  else {
    const code =
      r.outcome === 'rate'
        ? ErrorCode.rateLimited
        : r.outcome === 'bad'
          ? ErrorCode.badFrame
          : r.outcome === 'cap'
            ? CHAT_LIMIT_CODE
            : CHAT_UNDELIVERED_CODE;
    await d.sendError(conn, code, r.retry, (CHAT_DETAIL_TAG << 8) | f.seq);
  }
  d.emit({ kind: 'chat', match: matchKey, slot: rec.slot, outcome: r.outcome });
}
