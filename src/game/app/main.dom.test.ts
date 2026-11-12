// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION } from '@core/menu-index';
import { createLocalSaveStore } from '../platform/storage/local-save-store';
import { createMemoryStorage } from '../platform/storage/save-store';

type Table = Record<string, () => { mount: (c: HTMLElement) => void; unmount: () => void }>;

const m = vi.hoisted(() => ({
  webgl: true,
  flags: {} as Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
  startRouter: vi.fn(),
  createGame: vi.fn(),
  installTestHook: vi.fn(),
  installTesterUi: vi.fn(),
  mountBanner: vi.fn(),
  notify: vi.fn(),
  setBindings: vi.fn(),
  applyPrefs: vi.fn(),
  applyUiScale: vi.fn(),
  applyA11y: vi.fn(),
  tester: { enable: vi.fn() },
  arcade: { mountArcade: vi.fn(), unmountArcade: vi.fn() },
  online: { mountOnline: vi.fn(), unmountOnline: vi.fn() },
  tour: { mountTour: vi.fn(), unmountTour: vi.fn() },
  mq: [] as Array<() => void>,
}));

vi.mock('@ui/router', async (orig) => ({ ...(await orig<typeof import('@ui/router')>()), startRouter: m.startRouter }));
vi.mock('@ui/styles/main.css', () => ({}));
vi.mock('@ui/screens/settings', () => ({ applyA11y: m.applyA11y, applyUiScale: m.applyUiScale, loadSave: () => ({ displaySettings: { fake: true } }) }));
vi.mock('@ui/screens/key-bindings', async (orig) => ({ ...(await orig<typeof import('@ui/screens/key-bindings')>()), bindingsFromSave: () => ({ fake: 'bindings' }) }));
vi.mock('../boot/webgl-check', () => ({ detectWebgl: () => m.webgl }));
vi.mock('../boot/phaser-config', () => ({ createGame: m.createGame }));
vi.mock('../platform/a11y/prefs', () => ({ applyPrefsToDocument: m.applyPrefs, getPrefs: () => ({ prefs: true }) }));
vi.mock('../platform/flags', () => ({ getUiFlags: () => m.flags }));
vi.mock('../platform/storage/notices', () => ({ notify: m.notify }));
vi.mock('../platform/storage/replay-store', () => ({ createReplayStore: () => ({}) }));
vi.mock('../platform/input/bindings', () => ({ setBindings: m.setBindings }));
vi.mock('../platform/storage/create-save-store', () => ({ createSaveStore: () => createLocalSaveStore(createMemoryStorage(), () => 1) }));
vi.mock('../platform/tester/session', () => ({
  tester: m.tester,
  createTesterStore: (real: unknown) => real,
}));
vi.mock('@ui/tester/install', () => ({ installTesterUi: m.installTesterUi, requestOpenTesterPanel: vi.fn() }));
vi.mock('../platform/test-hook', () => ({ installTestHook: m.installTestHook }));
vi.mock('./notice-banner', () => ({ mountNoticeBanner: m.mountBanner }));
vi.mock('./flow', () => ({
  AppFlow: class {
    constructor(public deps: { navigate: (r: string) => void }) {}
    screens(): Record<string, unknown> {
      return { flowScreen: true };
    }
  },
}));
vi.mock('@core/lazy-index', () => ({}));
vi.mock('./arcade-versus', () => m.arcade);
vi.mock('./online-versus', () => m.online);
vi.mock('./tour', () => m.tour);

const baseFlags = {
  play: false,
  arenaDemo: false,
  cinematicDemo: false,
  forceNoWebgl: false,
  cheats: false,
};

async function boot(flags: Record<string, unknown> = {}, withRoot = true): Promise<void> {
  vi.resetModules();
  m.flags = { ...baseFlags, ...flags };
  document.body.replaceChildren();
  if (withRoot) {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.append(app);
  }
  await import('./main');
}

const table = (): Table => m.startRouter.mock.calls[0]?.[1] as Table;
const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const f of Object.values(m)) if (typeof f === 'function' && 'mockReset' in f) (f as ReturnType<typeof vi.fn>).mockReset();
  for (const o of [m.arcade, m.online, m.tour, m.tester]) for (const f of Object.values(o)) f.mockReset();
  m.webgl = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: (_e: string, fn: () => void) => void (m.mq.push(fn)) })),
  );
  m.mq.length = 0;
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('main menu path', () => {
  it('mounts the menu with the sim version, the banner, the tester UI and the router', async () => {
    await boot();
    const menu = document.getElementById('menu');
    expect(menu?.tagName).toBe('MAIN');
    expect(menu?.dataset['simVersion']).toBe(String(SIM_VERSION));
    expect(m.mountBanner).toHaveBeenCalled();
    expect(m.installTesterUi).toHaveBeenCalled();
    expect(m.startRouter).toHaveBeenCalledWith(menu, expect.objectContaining({ flowScreen: true }));
    for (const k of ['arcade', 'online', 'tour']) expect(typeof table()[k]).toBe('function');
    expect(m.applyA11y).toHaveBeenCalled();
    expect(m.setBindings).toHaveBeenCalledWith({ fake: 'bindings' });
    expect(m.tester.enable).not.toHaveBeenCalled();
    expect(m.installTestHook).toHaveBeenCalledWith(SIM_VERSION, expect.any(Function));
  });

  it('enables tester mode for the cheats flag', async () => {
    await boot({ cheats: true });
    expect(m.tester.enable).toHaveBeenCalled();
  });

  it('does nothing when there is no #app root', async () => {
    await boot({}, false);
    expect(m.startRouter).not.toHaveBeenCalled();
    expect(m.installTestHook).not.toHaveBeenCalled();
  });

  it('reapplies the preferences when the OS motion or contrast preference changes', async () => {
    await boot();
    expect(m.mq.length).toBe(2);
    m.mq[0]?.();
    expect(m.applyPrefs).toHaveBeenCalledWith({ prefs: true });
  });

  it('the injected loadSave hook imports and re-renders on success only', async () => {
    await boot();
    const hook = m.installTestHook.mock.calls[0]?.[1] as (json: string) => Promise<boolean>;
    const changed = vi.fn();
    window.addEventListener('hashchange', changed);
    expect(await hook('not json')).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    const { newEmptyState } = await import('@core/menu-index');
    expect(await hook(JSON.stringify(newEmptyState()))).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener('hashchange', changed);
  });

  it('prefetches the sim once the page has loaded', async () => {
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    const ric = vi.fn((fn: () => void) => {
      fn();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', ric);
    await boot();
    expect(ric).toHaveBeenCalled();
    delete (document as unknown as { readyState?: string }).readyState;
  });

  it('falls back to a timeout without requestIdleCallback, and waits for load otherwise', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    const add = vi.spyOn(window, 'addEventListener');
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    await boot();
    const loadCall = add.mock.calls.find(([t]) => t === 'load');
    expect(loadCall).toBeDefined();
    (loadCall?.[1] as () => void)();
    await vi.advanceTimersByTimeAsync(1100);
    vi.useRealTimers();
    delete (document as unknown as { readyState?: string }).readyState;
  });
});

describe('lazy chunk routes', () => {
  it('mounts and unmounts each chunk', async () => {
    await boot();
    const host = document.createElement('div');
    for (const [name, mount, unmount] of [
      ['arcade', m.arcade.mountArcade, m.arcade.unmountArcade],
      ['online', m.online.mountOnline, m.online.unmountOnline],
      ['tour', m.tour.mountTour, m.tour.unmountTour],
    ] as const) {
      const s = table()[name]?.();
      s?.mount(host);
      await tick();
      expect(mount).toHaveBeenCalledWith(host);
      s?.unmount();
      await tick();
      expect(unmount).toHaveBeenCalled();
    }
  });
});

describe('failed chunk loads', () => {
  it('tells the player and returns to the menu', async () => {
    vi.resetModules();
    vi.doMock('./arcade-versus', () => {
      throw new Error('chunk gone');
    });
    await boot();
    const s = table()['arcade']?.();
    s?.mount(document.createElement('div'));
    await tick();
    await tick();
    expect(m.notify).toHaveBeenCalledWith('Versus could not load. Reload the page.');
    expect(window.location.hash).toBe('#main');
    expect(() => {
      s?.unmount();
    }).not.toThrow();
    vi.doUnmock('./arcade-versus');
  });
});

describe('play path', () => {
  it('starts Phaser for ?ff=play without a menu', async () => {
    m.createGame.mockReturnValue({});
    await boot({ play: true, arenaDemo: true, cinematicDemo: false });
    await tick();
    await tick();
    expect(document.getElementById('menu')).toBeNull();
    expect(document.getElementById('game')).not.toBeNull();
    expect(m.applyUiScale).toHaveBeenCalledWith({ fake: true });
    expect(m.createGame).toHaveBeenCalledWith('game', true, false);
    expect(m.startRouter).not.toHaveBeenCalled();
  });

  it('shows the WebGL error when WebGL is missing', async () => {
    m.webgl = false;
    await boot({ play: true });
    await tick();
    expect(m.createGame).not.toHaveBeenCalled();
    expect(document.getElementById('app')?.textContent).not.toBe('');
  });
});
