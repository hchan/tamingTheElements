import { maskRude } from './chat-filter';
import {
  CHAT_CLIENT_BURST,
  CHAT_COST_MILLI,
  CHAT_LIMIT_CODE,
  CHAT_MAX_BYTES,
  CHAT_MAX_PER_SENDER,
  CHAT_RATE_PER_SEC,
  CHAT_REORDER_BACK,
  CHAT_SEEN_WORDS,
  CHAT_UNDELIVERED_CODE,
  sanitizeOutgoing,
  validateChatText,
} from './chat-rules';

/** Pure, DOM-free chat state for one match (docs/ONLINE-PROTOCOL.md 4a). The glue forwards `OnlineClient.onChat` to `receive` and `onChatError` to `refuse`. */
export interface ChatSender { sendChat(text: string): number | undefined }

export const CHAT_LOG_MAX = 100;
const RATE_CODE = 9;

export type ChatFailure = 'tooFast' | 'away' | 'limit' | 'rejected';
export type ChatSendResult =
  | { readonly kind: 'sent'; readonly seq: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'tooLong' }
  | { readonly kind: 'limit' }
  | { readonly kind: 'unavailable' }
  /** The client's own burst limit: nothing was sent; keep the text and retry after `seconds`. */
  | { readonly kind: 'wait'; readonly seconds: number };

export interface ChatLine {
  readonly id: number;
  readonly own: boolean;
  readonly seq: number;
  /** Display text: bidi controls stripped, rude words masked while the filter is on. */
  readonly text: string;
  readonly failure: ChatFailure | undefined;
}

/** What the glue shows after `refuse`: the reason, the original text (for 'tooFast', put it back in an empty input) and the relay's wait. */
export interface ChatRefusal { readonly reason: ChatFailure; readonly text: string; readonly retryAfterSec: number }

interface Entry { id: number; own: boolean; seq: number; raw: string; failure: ChatFailure | undefined }

const BIDI = /[‪-‮⁦-⁩]/g;
const encoder = new TextEncoder();

export class ChatChannel {
  private log: Entry[] = [];
  private seen = new Uint32Array(CHAT_SEEN_WORDS);
  private nextId = 0;
  private ownSent = 0;
  private limited = false;
  private isMuted = false;
  private filter = true;
  private tokens = CHAT_CLIENT_BURST * 1000;
  private lastMs: number;
  private listeners = new Set<() => void>();

  constructor(private readonly client: ChatSender, private readonly now: () => number) {
    this.lastMs = now();
  }

  send(raw: string): ChatSendResult {
    const text = sanitizeOutgoing(raw);
    if (text === '') return { kind: 'empty' };
    const bytes = encoder.encode(text);
    if (bytes.length > CHAT_MAX_BYTES) return { kind: 'tooLong' };
    if (this.limited || this.ownSent >= CHAT_MAX_PER_SENDER) return { kind: 'limit' };
    this.refill();
    if (this.tokens < CHAT_COST_MILLI) {
      return { kind: 'wait', seconds: Math.max(1, Math.ceil((CHAT_COST_MILLI - this.tokens) / (CHAT_RATE_PER_SEC * 1000))) };
    }
    const seq = this.client.sendChat(text);
    if (seq === undefined) return { kind: 'unavailable' };
    this.tokens -= CHAT_COST_MILLI;
    this.ownSent++;
    this.push({ id: this.nextId++, own: true, seq, raw: text, failure: undefined });
    this.changed();
    return { kind: 'sent', seq };
  }

  /** A tagged ERROR for an own line. `undefined` when no such line is waiting (unknown seq, a peer line, already marked). */
  refuse(e: { readonly seq: number; readonly code: number; readonly retryAfterSec: number }): ChatRefusal | undefined {
    const line = this.log.find((x) => x.own && x.seq === e.seq);
    if (line === undefined || line.failure !== undefined) return undefined;
    const reason: ChatFailure =
      e.code === RATE_CODE ? 'tooFast' : e.code === CHAT_UNDELIVERED_CODE ? 'away' : e.code === CHAT_LIMIT_CODE ? 'limit' : 'rejected';
    line.failure = reason;
    if (reason === 'limit') this.limited = true;
    this.changed();
    return { reason, text: line.raw, retryAfterSec: e.retryAfterSec };
  }

  /** A peer line. True when it was added and is visible (count it as unread); false when dropped. */
  receive(m: { readonly seq: number; readonly text: string }): boolean {
    if (m.seq >= CHAT_MAX_PER_SENDER) return false;
    const word = m.seq >>> 5;
    const bit = 1 << (m.seq & 31);
    if (((this.seen[word] as number) & bit) !== 0) return false;
    const text = m.text.replace(BIDI, '');
    const bytes = encoder.encode(text);
    if (bytes.length > CHAT_MAX_BYTES || !validateChatText(bytes, 0, bytes.length)) return false;
    this.seen[word] = (this.seen[word] as number) | bit; // Marked even when muted: unmuting never reveals old lines.
    if (this.isMuted) return false;
    let at = this.log.length;
    for (let j = this.log.length - 1; j >= 0 && j >= this.log.length - CHAT_REORDER_BACK; j--) {
      const x = this.log[j] as Entry;
      if (!x.own && x.seq > m.seq) at = j;
    }
    this.push({ id: this.nextId++, own: false, seq: m.seq, raw: text, failure: undefined }, at);
    this.changed();
    return true;
  }

  lines(): readonly ChatLine[] {
    return this.log.map((x) => ({ id: x.id, own: x.own, seq: x.seq, text: this.filter ? maskRude(x.raw) : x.raw, failure: x.failure }));
  }

  /** True after the relay's per-match limit (or the local one): sending stays off until `reset`. */
  limitReached(): boolean { return this.limited || this.ownSent >= CHAT_MAX_PER_SENDER; }
  muted(): boolean { return this.isMuted; }
  filterOn(): boolean { return this.filter; }
  setMuted(on: boolean): void { this.isMuted = on; this.changed(); }
  setFilter(on: boolean): void { this.filter = on; this.changed(); }

  /** A new match (not a resume): clears the log, seen-set, counters, mute and the limit. The filter choice stays for the session. */
  reset(): void {
    this.log = [];
    this.seen = new Uint32Array(CHAT_SEEN_WORDS);
    this.ownSent = 0;
    this.limited = false;
    this.isMuted = false;
    this.tokens = CHAT_CLIENT_BURST * 1000;
    this.lastMs = this.now();
    this.changed();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(CHAT_CLIENT_BURST * 1000, this.tokens + Math.max(0, t - this.lastMs) * CHAT_RATE_PER_SEC);
    this.lastMs = t;
  }

  private push(e: Entry, at = this.log.length): void {
    this.log.splice(at, 0, e);
    if (this.log.length > CHAT_LOG_MAX) this.log.shift();
  }

  private changed(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
