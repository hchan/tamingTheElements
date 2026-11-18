// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { NOT_CONFIGURED, parseOnlineUrl } from '../net/ws/config';

const m = vi.hoisted(() => ({
  webrtc: { mountOnline: vi.fn(), unmountOnline: vi.fn() },
  quick: { mountQuickMatch: vi.fn(), unmountQuickMatch: vi.fn() },
}));
vi.mock('./online-versus', () => m.webrtc);
vi.mock('./online-quick', () => m.quick);

import { onlineRoute } from './online-route';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('online route', () => {
  it('an unconfigured build keeps the peer-to-peer Online screen', async () => {
    const s = onlineRoute(NOT_CONFIGURED)(null);
    const node = document.createElement('div');
    s.mount(node);
    await settle();
    expect(m.webrtc.mountOnline).toHaveBeenCalledWith(node);
    expect(m.quick.mountQuickMatch).not.toHaveBeenCalled();
    s.unmount();
    await settle();
    expect(m.webrtc.unmountOnline).toHaveBeenCalledTimes(1);
  });

  it('a configured build opens quick match', async () => {
    m.webrtc.mountOnline.mockClear();
    const s = onlineRoute(parseOnlineUrl('https://relay.example.invalid'))(null);
    const node = document.createElement('div');
    s.mount(node);
    await settle();
    expect(m.quick.mountQuickMatch).toHaveBeenCalledWith(node);
    expect(m.webrtc.mountOnline).not.toHaveBeenCalled();
    s.unmount();
    await settle();
    expect(m.quick.unmountQuickMatch).toHaveBeenCalledTimes(1);
  });
});
