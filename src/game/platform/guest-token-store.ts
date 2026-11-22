/**
 * Persists the online guest session token (a random string, no personal data) in localStorage with an absolute expiry, so a reload
 * can resume inside the reconnect grace and the guest identity stays stable. Settings clears it with `clearGuestToken`.
 * Storage and wall clock are injected; nothing here throws.
 */
export const GUEST_TOKEN_KEY = 'tte.online.guest.v1';
/** [choice] A stored token is never trusted for longer than this, whatever expiresIn said. */
export const MAX_GUEST_TOKEN_MS = 24 * 3600 * 1000;

export interface GuestTokenStore {
  /** The stored token while unexpired; a stale or corrupt entry is removed and `undefined` returned. */
  load(): string | undefined;
  /** Keep `value` for `ttlMs` (capped at MAX_GUEST_TOKEN_MS). */
  save(value: string, ttlMs: number): void;
  clear(): void;
}

export function guestTokenStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined, wallNow: () => number): GuestTokenStore {
  const clear = (): void => {
    try { storage?.removeItem(GUEST_TOKEN_KEY); } catch { /* nothing stored */ }
  };
  return {
    load() {
      if (storage === undefined) return undefined;
      try {
        const raw = storage.getItem(GUEST_TOKEN_KEY);
        if (raw === null) return undefined;
        const p = JSON.parse(raw) as { v?: unknown; until?: unknown };
        const now = wallNow();
        if (typeof p.v === 'string' && p.v !== '' && typeof p.until === 'number' && p.until > now && p.until <= now + MAX_GUEST_TOKEN_MS) return p.v;
      } catch { /* corrupt */ }
      clear();
      return undefined;
    },
    save(value, ttlMs) {
      try { storage?.setItem(GUEST_TOKEN_KEY, JSON.stringify({ v: value, until: wallNow() + Math.min(ttlMs, MAX_GUEST_TOKEN_MS) })); } catch { /* memory only */ }
    },
    clear,
  };
}

/** Settings "forget": removes the stored guest token. */
export function clearGuestToken(storage: Pick<Storage, 'removeItem'> | undefined): void {
  try { storage?.removeItem(GUEST_TOKEN_KEY); } catch { /* nothing stored */ }
}
