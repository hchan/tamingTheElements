// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  quick: { mountQuickMatch: vi.fn(), unmountQuickMatch: vi.fn() },
}));
vi.mock('./online-quick', () => m.quick);

import { onlineRoute } from './online-route';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('online route', () => {
  it('always opens the quick match (an unconfigured build shows its own "not available" message)', async () => {
    const s = onlineRoute()(null);
    const node = document.createElement('div');
    s.mount(node);
    await settle();
    expect(m.quick.mountQuickMatch).toHaveBeenCalledWith(node);
    s.unmount();
    await settle();
    expect(m.quick.unmountQuickMatch).toHaveBeenCalledTimes(1);
  });
});
