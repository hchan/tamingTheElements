/** Public types of the online client (split from online-client.ts; re-exported there). */
import type { GatewayNoticeEvent } from './inbound';
import type { OnlineConfig } from './config';
import type { SocketLike } from './transport';

/** Spec section 5: `resting` with no retry time means one hour. */
export const DEFAULT_RESTING_SEC = 3600;

export type OnlineFailure =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'network' }
  | { readonly kind: 'update-needed' }
  | { readonly kind: 'bad-response' }
  /** Kill switch: HTTP 503 from /session or /ticket, or (while connected) an ERROR 0x000B frame. `retryAfterSec` 0 means unknown (use `DEFAULT_RESTING_SEC`). */
  | { readonly kind: 'resting'; readonly retryAfterSec: number }
  /** Any other server error code of spec section 5 (HTTP status 0 for a frame). */
  | { readonly kind: 'server'; readonly code: number; readonly retryAfterSec: number; readonly status: number };
export type OnlineResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: OnlineFailure };

export type OnlineEvent =
  | { readonly t: 'queue'; readonly waitingSec: number }
  | { readonly t: 'room-created'; readonly code: string; readonly ttlSec: number }
  | { readonly t: 'room-peer'; readonly joined: boolean }
  | { readonly t: 'match'; readonly matchId: number; readonly slot: number; readonly seed: number; readonly inputDelay: number; readonly simVersion: number; readonly batchEvery: number; readonly resumed: boolean }
  | { readonly t: 'peer'; readonly matchId: number; readonly status: 'disconnected' | 'back' | 'gone'; readonly graceMs: number }
  | { readonly t: 'result-ack'; readonly matchId: number; readonly status: number }
  | { readonly t: 'reconnecting'; readonly attempt: number }
  | { readonly t: 'reconnected'; readonly resumed: boolean }
  /** The service switched off while connected; the socket closes later. Hide the online entries until the time passes. */
  | { readonly t: 'resting'; readonly failure: OnlineFailure }
  /** A refused request (busy, no-room, full, ...); the connection stays. */
  | { readonly t: 'error'; readonly failure: OnlineFailure }
  | GatewayNoticeEvent
  /** Final: no more events. `failure` is undefined for a normal close. */
  | { readonly t: 'closed'; readonly failure: OnlineFailure | undefined };

export interface FetchResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<FetchResponseLike>;
/** The slice of the browser WebSocket used here; the transport needs a `SocketLike`. */
export interface WsLike extends SocketLike {
  close(code?: number): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'open' | 'error', listener: () => void): void;
  addEventListener(type: 'close', listener: (ev: { code?: number }) => void): void;
}
export type WsCtor = new (url: string) => WsLike;

export interface OnlineDeps {
  readonly config: OnlineConfig;
  readonly fetch: FetchLike;
  readonly WebSocket: WsCtor;
  readonly simVersion: number;
  /** Monotonic milliseconds. */
  readonly now: () => number;
  /** One-shot timer; returns its canceller. */
  readonly after: (ms: number, fn: () => void) => () => void;
  /** 0 <= x < 1, for backoff jitter. */
  readonly random: () => number;
  /** Optional persistence of the guest session token across reloads. */
  readonly guestStore?: { load(): string | undefined; save(value: string, ttlMs: number): void; clear(): void };
}
