import { describe, expect, it } from 'vitest';
import { clearGuestToken, GUEST_TOKEN_KEY, guestTokenStore, MAX_GUEST_TOKEN_MS } from '../../game/platform/guest-token-store';
import { Harness } from './fake-online-service';
import { OnlineClient } from '../../game/net/ws/online-client';

function mem(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as Storage;
}

describe('guestTokenStore', () => {
  it('keeps a token until its expiry, then drops it', () => {
    const st = mem();
    let now = 1000;
    const s = guestTokenStore(st, () => now);
    s.save('abc', 5000);
    expect(guestTokenStore(st, () => now + 4999).load()).toBe('abc');
    now = 6001;
    expect(s.load()).toBeUndefined();
    expect(st.getItem(GUEST_TOKEN_KEY)).toBeNull();
  });
  it('caps the lifetime, rejects corrupt entries and clearGuestToken removes it', () => {
    const st = mem();
    const s = guestTokenStore(st, () => 0);
    s.save('abc', MAX_GUEST_TOKEN_MS * 10);
    expect(JSON.parse(st.getItem(GUEST_TOKEN_KEY) ?? '{}')).toMatchObject({ until: MAX_GUEST_TOKEN_MS });
    clearGuestToken(st);
    expect(s.load()).toBeUndefined();
    st.setItem(GUEST_TOKEN_KEY, '{nope');
    expect(s.load()).toBeUndefined();
    expect(st.getItem(GUEST_TOKEN_KEY)).toBeNull();
  });
});

describe('OnlineClient with a guest store', () => {
  it('a second client (a reload) reuses the stored session instead of asking /session again', async () => {
    const st = mem();
    const h = new Harness();
    const store = guestTokenStore(st, () => h.clock.ms);
    const a = new OnlineClient(h.deps(true, { guestStore: store }));
    const ra = a.connect();
    await h.flush();
    expect((await ra).ok).toBe(true);
    expect(h.svc.fetched.filter((p) => p === '/session')).toHaveLength(1);
    const b = new OnlineClient(h.deps(true, { guestStore: store }));
    const rb = b.connect();
    await h.flush();
    expect((await rb).ok).toBe(true);
    expect(h.svc.fetched.filter((p) => p === '/session')).toHaveLength(1);
  });
});
