// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame, seedSfc32, type ReplayFile, type SaveV1 } from '@core/menu-index';
import type { MatchSetup as UiSetup } from '@ui/screens/garrison-model';
import type { ArenaLaunch, MatchEnd } from '../scenes/launch';
import { DEFAULT_UI_FLAGS, type UiFlags } from '../platform/flags';
import { createLocalSaveStore } from '../platform/storage/local-save-store';
import { createMemoryStorage, type Result, type SaveStore } from '../platform/storage/save-store';
import { TesterSession } from '../platform/tester/session';
import type { ReplayStore } from '../platform/storage/replay-store';

const m = vi.hoisted(() => ({
  webgl: true,
  createGame: vi.fn(),
  persistence: vi.fn(),
  download: vi.fn(),
}));

vi.mock('../boot/webgl-check', () => ({ detectWebgl: () => m.webgl }));
vi.mock('../boot/phaser-config', () => ({ createGame: m.createGame }));
vi.mock('../platform/storage/idb-save-store', () => ({ requestPersistence: m.persistence }));
vi.mock('./download', () => ({ downloadReplay: m.download }));
vi.mock('../platform/record-setting', () => ({ getRecordSetting: () => false }));

const { AppFlow, enemyAgent, toCoreSetup } = await import('./flow');

const started = (): Promise<void> => vi.waitFor(() => { expect(m.createGame).toHaveBeenCalled(); });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setTimeout(r, 0));
};

interface FakeGame {
  destroy: ReturnType<typeof vi.fn>;
  events: { once: (e: string, fn: () => void) => void };
}
function fakeGame(): FakeGame {
  return {
    destroy: vi.fn(),
    events: { once: (_e, fn) => {
        queueMicrotask(fn);
      },
    },
  };
}

const clock = (): number => 1_700_000_000_000;
const WIN: MatchEnd = { winner: 0, activeSlot: 0, capturedIndices: [] };
const FAKE_REPLAY = { fake: true } as unknown as ReplayFile;
const memTesterStore = { getItem: () => null };
const newSession = (): TesterSession => new TesterSession(undefined, memTesterStore);

function freshSave(): SaveV1 {
  return newGame(seedSfc32(1, 'meta'), { now: clock });
}

function uiFor(save: SaveV1, mode: UiSetup['mode'] = 'battle'): UiSetup {
  const hero = save.garrison[0];
  if (!hero) throw new Error('new game has a garrison');
  return {
    mode,
    heroes: [hero],
    opponents: [{ id: 'opp', experience: 1, characterName: 'Dummy' }],
  };
}

type Flow = InstanceType<typeof AppFlow>;
interface Rig {
  flow: Flow;
  store: SaveStore;
  navigate: ReturnType<typeof vi.fn>;
  replays: { add: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
  host: HTMLElement;
  save: SaveV1;
  screens: ReturnType<Flow['screens']>;
}
interface Over {
  store?: SaveStore;
  tester?: TesterSession;
}

async function rig(flags: Partial<UiFlags> = {}, over: Over = {}): Promise<Rig> {
  const real = createLocalSaveStore(createMemoryStorage(), clock);
  const save = freshSave();
  await real.save(save);
  const store = over.store ?? real;
  const navigate = vi.fn();
  const replays = { add: vi.fn(() => Promise.resolve()), list: vi.fn(() => Promise.resolve([])) };
  const flow = new AppFlow({
    store,
    flags: { ...DEFAULT_UI_FLAGS, seed: 5, ...flags },
    now: clock,
    navigate,
    replays: replays as unknown as ReplayStore, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    ...(over.tester ? { tester: over.tester } : {}),
  });
  const host = document.createElement('div');
  document.body.append(host);
  return { flow, store, navigate, replays, host, save, screens: flow.screens() };
}

/** The garrison screen's onMatch hook is the only public way to set a pending match; set the private field directly. */
function setPending(r: Rig): void {
  (r.flow as unknown as { pending: unknown }).pending = { ui: uiFor(r.save), seed: 5 };
}

async function pendingRig(flags: Partial<UiFlags> = {}, over: Over = {}): Promise<Rig> {
  const r = await rig(flags, over);
  setPending(r);
  return r;
}

function launchOf(): ArenaLaunch {
  return m.createGame.mock.calls[0]?.[1] as ArenaLaunch;
}

beforeEach(() => {
  m.webgl = true;
  m.createGame.mockReset();
  m.persistence.mockReset();
  m.download.mockReset();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('AppFlow.screens', () => {
  it('provides the story screens and redirects battleground to the garrison', async () => {
    const r = await rig();
    for (const k of ['newGame', 'storyMode', 'battleground', 'currentObjectives', 'settings', 'keyBindings', 'garrison', 'loading', 'victory', 'replay', 'gameMaster'] as const) {
      expect(typeof r.screens[k]).toBe('function');
    }
    const s = r.screens.battleground(null);
    s.mount(r.host);
    expect(r.navigate).toHaveBeenCalledWith('garrison');
    expect(() => {
      s.unmount();
    }).not.toThrow();
  });

  it('mounts and unmounts the objectives, settings, key-binding and replay screens', async () => {
    const r = await rig();
    for (const k of ['currentObjectives', 'settings', 'keyBindings', 'replay'] as const) {
      const s = r.screens[k](null);
      expect(() => {
        s.mount(r.host);
      }).not.toThrow();
      s.unmount();
    }
  });

  it('the recording flag hands the replay screen the store', async () => {
    const r = await rig({ record: true });
    const s = r.screens.replay(null);
    s.mount(r.host);
    s.unmount();
  });
});

describe('cinematic screens', () => {
  it('shows the WebGL error without WebGL', async () => {
    m.webgl = false;
    const r = await rig();
    const s = r.screens.storyMode(null);
    s.mount(r.host);
    expect(r.host.querySelector('#cinematic')).not.toBeNull();
    expect(m.createGame).not.toHaveBeenCalled();
    s.unmount();
    expect(r.host.querySelector('#cinematic')).toBeNull();
  });

  it('story mode creates the game and navigates to main once when the chain ends', async () => {
    const g = fakeGame();
    m.createGame.mockReturnValue(g);
    const r = await rig();
    const s = r.screens.storyMode(null);
    s.mount(r.host);
    await flush();
    expect(r.host.querySelector('#cinematic #game')).not.toBeNull();
    const opts = m.createGame.mock.calls[0]?.[2] as { onEnd: () => void };
    opts.onEnd();
    opts.onEnd();
    expect(r.navigate).toHaveBeenCalledTimes(1);
    expect(r.navigate).toHaveBeenCalledWith('main');
    s.unmount();
    expect(g.destroy).toHaveBeenCalledWith(true);
    await flush();
    expect(r.host.querySelector('#cinematic')).toBeNull();
  });

  it('ignores onEnd after unmount', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const r = await rig();
    const s = r.screens.storyMode(null);
    s.mount(r.host);
    await flush();
    const opts = m.createGame.mock.calls[0]?.[2] as { onEnd: () => void };
    s.unmount();
    opts.onEnd();
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('does not create the game when unmounted before the chunk loads', async () => {
    const r = await rig();
    const s = r.screens.storyMode(null);
    s.mount(r.host);
    s.unmount();
    await flush();
    expect(m.createGame).not.toHaveBeenCalled();
  });

  it('shows an error screen when the game throws (failGame)', async () => {
    const r = await rig({ failGame: true });
    r.screens.storyMode(null).mount(r.host);
    await flush();
    expect(r.host.textContent).toContain('The intro could not start');
    expect(r.host.textContent).toContain('WebGL unsupported (injected)');
  });

  it('shows an error screen when createGame throws a non-Error', async () => {
    m.createGame.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'boom';
    });
    const r = await rig();
    r.screens.storyMode(null).mount(r.host);
    await flush();
    expect(r.host.textContent).toContain('boom');
  });

  it('new game saves a fresh game when the intro ends, then goes to the garrison', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const r = await rig();
    await r.store.clear();
    r.screens.newGame(null).mount(r.host);
    await flush();
    (m.createGame.mock.calls[0]?.[2] as { onEnd: () => void }).onEnd();
    await flush();
    expect(r.navigate).toHaveBeenCalledWith('garrison');
    const loaded = await r.store.load();
    expect(loaded.ok && loaded.value.garrison.length).toBeGreaterThan(0);
  });
});

describe('battle screen', () => {
  it('goes back to main without a pending match', async () => {
    const r = await rig();
    const s = r.screens.loading(null);
    s.mount(r.host);
    expect(r.navigate).toHaveBeenCalledWith('main');
    s.unmount();
  });

  it('shows the WebGL error without WebGL', async () => {
    m.webgl = false;
    const r = await pendingRig();
    r.screens.loading(null).mount(r.host);
    expect(r.host.querySelector('#battle')).not.toBeNull();
    expect(m.createGame).not.toHaveBeenCalled();
  });

  it('starts the arena with the scripted enemy and no recorder, and shows results on end', async () => {
    const g = fakeGame();
    m.createGame.mockReturnValue(g);
    const r = await pendingRig();
    const s = r.screens.loading(null);
    s.mount(r.host);
    expect(r.host.textContent).toContain('Loading');
    await started();
    expect(r.host.querySelector('#battle #game')).not.toBeNull();
    const launch = launchOf();
    expect(launch.recorder).toBeUndefined();
    expect(launch.tester).toBeUndefined();
    expect(launch.enemy).toBeDefined();
    expect(launch.setup.seed).toBe(5);
    launch.onEnd?.(WIN);
    await flush();
    expect(r.navigate).toHaveBeenCalledWith('victory');
    s.unmount();
    expect(g.destroy).toHaveBeenCalled();
  });

  it('records a replay when recording is on, and keeps it for the results screen', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const r = await pendingRig({ record: true });
    r.screens.loading(null).mount(r.host);
    await started();
    const launch = launchOf();
    expect(launch.recorder).toBeDefined();
    if (launch.recorder) vi.spyOn(launch.recorder, 'finish').mockReturnValue(FAKE_REPLAY);
    launch.onEnd?.(WIN);
    await flush();
    expect(r.replays.add).toHaveBeenCalledTimes(1);
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    const dl = page.querySelector<HTMLButtonElement>('#downloadReplay');
    expect(dl).not.toBeNull();
    dl?.click();
    expect(m.download).toHaveBeenCalledTimes(1);
  });

  it('a failing replay store does not break the flow', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const r = await pendingRig({ record: true });
    r.replays.add.mockRejectedValue(new Error('quota'));
    r.screens.loading(null).mount(r.host);
    await started();
    const launch = launchOf();
    if (launch.recorder) vi.spyOn(launch.recorder, 'finish').mockReturnValue(FAKE_REPLAY);
    launch.onEnd?.(WIN);
    await flush();
    expect(r.replays.add).toHaveBeenCalled();
    expect(r.navigate).toHaveBeenCalledWith('victory');
  });

  it('passes tester hooks and flags the session when tester mode is on', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const session = newSession();
    session.enable();
    const r = await pendingRig({}, { tester: session });
    r.screens.loading(null).mount(r.host);
    await started();
    const launch = launchOf();
    expect(launch.tester?.session).toBe(session);
    expect(typeof launch.tester?.openPanel).toBe('function');
    launch.onEnd?.(WIN);
    await flush();
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.textContent).toContain('TESTER MODE');
    expect(page.textContent).toContain('throwaway slot');
  });

  it('failLoad shows the load error', async () => {
    const r = await pendingRig({ failLoad: true });
    r.screens.loading(null).mount(r.host);
    await flush();
    expect(r.host.textContent).toContain('Could not load your save');
    expect(r.host.textContent).toContain('injected load failure');
  });

  it('a store that reports an error shows the load error', async () => {
    const real = createLocalSaveStore(createMemoryStorage(), clock);
    const store: SaveStore = { ...real, load: () => Promise.resolve({ ok: false, error: { kind: 'corrupt', message: 'bad json' } } as Result<SaveV1>) };
    const r = await pendingRig({}, { store });
    r.screens.loading(null).mount(r.host);
    await flush();
    expect(r.host.textContent).toContain('Could not load your save');
  });

  it('failSetup and failGame end in the battle error screen', async () => {
    for (const f of [{ failSetup: true }, { failGame: true }]) {
      const r = await pendingRig(f);
      r.screens.loading(null).mount(r.host);
      await flush();
      expect(r.host.textContent).toContain('The battle could not start');
      r.host.remove();
    }
  });

  it('an unmount during the load stops the start-up quietly', async () => {
    const r = await pendingRig();
    const s = r.screens.loading(null);
    s.mount(r.host);
    s.unmount();
    await flush();
    expect(m.createGame).not.toHaveBeenCalled();
  });

  it('an unmount during the save does not navigate to the results', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const r = await pendingRig();
    const s = r.screens.loading(null);
    s.mount(r.host);
    await started();
    const launch = launchOf();
    s.unmount();
    launch.onEnd?.(WIN);
    await flush();
    expect(r.navigate).not.toHaveBeenCalledWith('victory');
  });

  it('a load failure after the match reports a lost result', async () => {
    m.createGame.mockReturnValue(fakeGame());
    const real = createLocalSaveStore(createMemoryStorage(), clock);
    let calls = 0;
    const flaky: SaveStore = {
      ...real,
      load: () => (++calls === 1 ? real.load() : Promise.resolve({ ok: false, error: { kind: 'storage', message: 'gone' } } as Result<SaveV1>)),
    };
    const r = await pendingRig({}, { store: flaky });
    await real.save(r.save);
    r.screens.loading(null).mount(r.host);
    await started();
    launchOf().onEnd?.(WIN);
    await flush();
    expect(r.navigate).toHaveBeenCalledWith('victory');
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.textContent).toContain('Match result lost');
    expect(page.textContent).toContain('Could not apply the match result');
  });
});

describe('results screen', () => {
  async function played(flags: Partial<UiFlags> = {}, winner = 0, over: Over = {}): Promise<Rig> {
    m.createGame.mockReturnValue(fakeGame());
    const r = await pendingRig(flags, over);
    r.screens.loading(null).mount(r.host);
    await started();
    launchOf().onEnd?.({ ...WIN, winner });
    await flush();
    return r;
  }

  it('redirects to main when there is no result', async () => {
    const r = await rig();
    const s = r.screens.victory(null);
    s.mount(r.host);
    expect(r.navigate).toHaveBeenCalledWith('main');
    s.unmount();
  });

  it('shows victory with xp and the navigation links', async () => {
    const r = await played();
    const page = document.createElement('div');
    const s = r.screens.victory(null);
    s.mount(page);
    expect(page.textContent).toContain('Victory!');
    expect(page.textContent).toContain('XP');
    expect(page.querySelectorAll('a.menuLink').length).toBe(3);
    expect(page.querySelector('#retrySave')).toBeNull();
    expect(page.querySelector('#downloadReplay')).toBeNull();
    s.unmount();
    expect(page.querySelector('.menuPage')).toBeNull();
  });

  it('shows defeat', async () => {
    const r = await played({}, 1);
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.textContent).toContain('Defeat');
  });

  it('failSave leaves the result unsaved and Retry saving recovers it', async () => {
    const r = await played({ failSave: true });
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('injected save failure');
    page.querySelector<HTMLButtonElement>('#retrySave')?.click();
    await flush();
    expect(page.querySelector('#retrySave')).toBeNull();
    expect(page.querySelector('[role=alert]')).toBeNull();
  });

  it('Retry saving keeps the warning when the store still fails', async () => {
    const real = createLocalSaveStore(createMemoryStorage(), clock);
    let failing = false;
    const store: SaveStore = {
      ...real,
      save: (s) => (failing ? Promise.resolve({ ok: false, error: { kind: 'storage', message: 'disk full' } } as Result<SaveV1>) : real.save(s)),
    };
    const r = await pendingRig({}, { store });
    await real.save(r.save);
    m.createGame.mockReturnValue(fakeGame());
    r.screens.loading(null).mount(r.host);
    await flush();
    failing = true;
    launchOf().onEnd?.(WIN);
    await flush();
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('disk full');
    page.querySelector<HTMLButtonElement>('#retrySave')?.click();
    await flush();
    expect(page.querySelector('#retrySave')).not.toBeNull();
    expect(page.querySelector('[role=alert]')?.textContent).toContain('disk full');
  });

  it('a throwing store.save is reported, not thrown', async () => {
    const real = createLocalSaveStore(createMemoryStorage(), clock);
    let throwing = false;
    const store: SaveStore = {
      ...real,
      save: (s) => (throwing ? Promise.reject(new Error('kaboom')) : real.save(s)),
    };
    const r = await pendingRig({}, { store });
    await real.save(r.save);
    m.createGame.mockReturnValue(fakeGame());
    r.screens.loading(null).mount(r.host);
    await flush();
    throwing = true;
    launchOf().onEnd?.(WIN);
    await flush();
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.querySelector('[role=alert]')?.textContent).toContain('kaboom');
  });

  it('tester results mention the real save when progress is kept', async () => {
    const session = newSession();
    session.enable();
    session.setOption('keepProgress', true);
    const r = await played({}, 0, { tester: session });
    const page = document.createElement('div');
    r.screens.victory(null).mount(page);
    expect(page.textContent).toContain('written to your real save');
  });
});

describe('enemyAgent', () => {
  it('falls back to a bot with an empty roster and a scripted AI otherwise', async () => {
    const save = freshSave();
    expect(await enemyAgent({ p1: [], p2: [] })).toBeDefined();
    expect(await enemyAgent(toCoreSetup(uiFor(save), save, 1))).toBeDefined();
  });
});
