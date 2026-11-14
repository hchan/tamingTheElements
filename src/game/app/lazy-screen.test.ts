// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { lazyScreen } from './lazy-screen';

describe('lazyScreen', () => {
  it('loads once and runs mount, unmount, mount, unmount in order even when visits overlap', async () => {
    const log: string[] = [];
    const load = vi.fn(() => Promise.resolve({ id: 'm' }));
    const make = lazyScreen(
      load,
      'X',
      (_m, c) => { log.push(`mount ${c.id}`); },
      () => { log.push('unmount'); },
    );
    const a = document.createElement('div');
    a.id = 'a';
    const b = document.createElement('div');
    b.id = 'b';
    const s1 = make(null);
    s1.mount(a);
    s1.unmount();
    const s2 = make(null);
    s2.mount(b);
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['mount a', 'unmount', 'mount b']);
  });

  it('retries the load on the next visit after a failure', async () => {
    const load = vi.fn<() => Promise<object>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    const mount = vi.fn();
    const make = lazyScreen(load, 'X', mount, () => undefined);
    make(null).mount(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mount).not.toHaveBeenCalled();
    make(null).mount(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledTimes(1);
  });
});
