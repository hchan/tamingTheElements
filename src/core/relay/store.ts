/**
 * The two seams the relay needs from its host (a serverless backend, a Node process, a test). Both are async and small so a key-value
 * store with conditional writes (for example DynamoDB `ConditionExpression`) and a "post to connection" API fit without changes.
 */

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface StoreItem {
  readonly value: Json;
  /** Increases on every write of the key; used for conditional puts. */
  readonly version: number;
}

export interface PutOptions {
  /** `'absent'`: write only if the key does not exist. A number: write only if the stored version is exactly that. Omitted: unconditional. */
  readonly ifVersion?: number | 'absent';
  /** Absolute time after which the item may vanish (a TTL attribute). The relay also checks its own deadlines, so lazy expiry is fine. */
  readonly expiresAtMs?: number;
}

export interface Store {
  get(key: string): Promise<StoreItem | undefined>;
  /** True when written; false when the condition failed. Never throws for a failed condition. */
  put(key: string, value: Json, options?: PutOptions): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Maintenance only (`RelayCore.sweep`): keys with this prefix. A backend may implement it with a prefix query. */
  keys(prefix: string): Promise<readonly string[]>;
}

/** Delivery to a connection. A send to a connection that is gone may reject or be ignored; the relay swallows it. */
export interface Sender {
  send(conn: string, data: Uint8Array): Promise<void> | void;
  /** Close with a WebSocket close code (spec section 5: 4000 + the low byte of the error code). */
  close(conn: string, code: number): Promise<void> | void;
}

/** Time and randomness are injected; the core never reads a clock or a random source. */
export interface RelayCtx {
  now(): number;
  /** Uniform integer in [0, n), n up to 2^32. */
  randomInt(n: number): number;
  /** Kill switch (spec section 5, `resting`). Present = the game is resting; the value is when to look again (0 = unknown). */
  readonly resting?: { readonly retryAfterSec: number };
}
