// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION } from '@core/menu-index';
import type { ArenaLaunch, PlaybackControls, PlaybackStatus } from '../scenes/launch';
import type { ReplayStore } from '../platform/storage/replay-store';

const h = vi.hoisted(() => ({
  webgl: true,
  created: [] as Array<{ host: HTMLElement; launch: ArenaLaunch; destroyed: boolean }>,
  validate: undefined as undefined | ((r: unknown) => unknown),
  parse: undefined as undefined | ((t: string) => unknown),
}));

vi.mock('../boot/webgl-check', () => ({ detectWebgl: () => h.webgl }));
vi.mock('../boot/phaser-config', () => ({
  createGame: (host: HTMLElement, launch: ArenaLaunch) => {
    let once: (() => void) | undefined;
    const g = {
      host,
      launch,
      destroyed: false,
      destroy() {
        g.destroyed = true;
        queueMicrotask(() => once?.());
      },
      events: { once: (_e: string, fn: () => void) => void (once = fn) },
    };
    h.created.push(g);
    return g;
  },
}));
vi.mock('@core/lazy-index', () => ({
  validateReplay: (r: unknown) => (h.validate ? h.validate(r) : { ok: true, value: r }),
  parseReplayChecked: (t: string) => (h.parse ? h.parse(t) : { ok: true, value: JSON.parse(t) as unknown }),
  setupFromHeader: (hd: unknown) => ({ fromHeader: hd }),
}));

import { replayViewerScreen, type ViewerDeps } from './replay-viewer';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const replayOf = (simVersion: number = SIM_VERSION, tickCount = 100): { header: { simVersion: number; tickCount: number } } => ({ header: { simVersion, tickCount } });

let host: HTMLElement;
let unmounts: Array<() => void>;

function mount(over: Partial<ViewerDeps> = {}): { unmount: () => void } {
  const screen = replayViewerScreen({ replays: undefined, forceNoWebgl: false, ...over });
  screen.mount(host);
  unmounts.push(() => { screen.unmount(); });
  return screen;
}
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const $ = <T extends HTMLElement>(id: string): T => {
  const e = host.querySelector<T>(`#${id}`);
  if (!e) throw new Error(id);
  return e;
};
async function chooseFile(text: string): Promise<void> {
  const input = $<HTMLInputElement>('replayFile');
  const file = new File([text], 'x.replay.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

beforeEach(() => {
  h.webgl = true;
  h.created.length = 0;
  h.validate = undefined;
  h.parse = undefined;
  unmounts = [];
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  for (const u of unmounts) u();
  await flush();
  document.body.replaceChildren();
});

const status = (over: Partial<PlaybackStatus> = {}): PlaybackStatus => ({ tick: 5, total: 100, state: 'playing', paused: false, speed: 1, ...over });

describe('replay viewer screen', () => {
  it('mounts the bar with the file input and an idle status', () => {
    mount();
    expect($('replayStatus').textContent).toBe('Choose a .replay.json file.');
    expect($('replayStatus').getAttribute('role')).toBe('status');
    expect($<HTMLInputElement>('replayFile').accept).toContain('.json');
    expect(host.querySelector('a[href="#main"]')).not.toBeNull();
  });

  it('control buttons do nothing before a replay plays', () => {
    mount();
    expect(() => {
      $('replayPause').click();
    }).not.toThrow();
  });

  it('loads a file, starts the Arena and drives the playback controls', async () => {
    mount();
    await chooseFile(JSON.stringify(replayOf()));
    expect(h.created).toHaveLength(1);
    const made = h.created[0];
    expect(made?.host.id).toBe('game');
    expect(host.querySelector('#replayViewer > #game')).not.toBeNull();
    const pb = made?.launch.playback;
    expect(pb).toBeDefined();
    const calls: string[] = [];
    const controls: PlaybackControls = {
      setSpeed: (s) => calls.push(`speed${String(s)}`),
      setPaused: (p) => calls.push(`paused${String(p)}`),
      step: () => calls.push('step'),
    };
    pb?.attach(controls);
    for (const id of ['replayPause', 'replayPlay', 'replayHalf', 'replay1x', 'replay2x', 'replayStep']) $(id).click();
    expect(calls).toEqual(['pausedtrue', 'pausedfalse', 'speed0.5', 'speed1', 'speed2', 'step']);

    pb?.onStatus(status());
    expect($('replayProgress').textContent).toBe('Playing 1x, tick 5 / 100');
    expect($('replayStatus').textContent).toBe('Playing 1x');
    expect($('replayStatus').dataset['state']).toBe('playing');
    pb?.onStatus(status({ state: 'diverged', divergentTick: 50 }));
    expect($('replayStatus').textContent).toBe('DIVERGED at tick 50');
    expect($('replayStatus').dataset['state']).toBe('diverged');
  });

  it('reports a parse failure and an unexpected exception', async () => {
    mount();
    h.parse = () => ({ ok: false, message: 'Not a replay.' });
    await chooseFile('junk');
    expect($('replayStatus').textContent).toBe('Not a replay.');
    h.parse = () => {
      throw new Error('bad json');
    };
    await chooseFile('junk');
    expect($('replayStatus').textContent).toBe('Invalid replay: bad json');
    h.parse = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'oops';
    };
    await chooseFile('junk');
    expect($('replayStatus').textContent).toBe('Invalid replay: oops');
    expect(h.created).toHaveLength(0);
  });

  it('shows both fighters inputs up to the current tick and toggles the display', async () => {
    mount();
    const rep = { ...replayOf(), inputs: [[0, 2, 24, 3], [8, 5]] };
    await chooseFile(JSON.stringify(rep));
    const pb = h.created[0]?.launch.playback;
    pb?.onStatus(status({ tick: 4 }));
    expect($('inputList1').textContent).toBe('→ A×2·×2');
    expect($('inputList2').textContent).toBe('→×4');
    const toggle = $('replayInputs');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('Inputs: off');
    expect($('inputDisplay').hidden).toBe(true);
    toggle.click();
    expect($('inputDisplay').hidden).toBe(false);
    expect($('inputList1').textContent).toBe('→ A×2·×2');
  });

  it('ignores an empty file selection', async () => {
    mount();
    const input = $<HTMLInputElement>('replayFile');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect($('replayStatus').textContent).toBe('Choose a .replay.json file.');
  });

  it('shows the validation message when the replay is invalid', async () => {
    mount();
    h.validate = () => ({ ok: false, message: 'Header is damaged.' });
    await chooseFile(JSON.stringify(replayOf()));
    expect($('replayStatus').textContent).toBe('Header is damaged.');
    expect(h.created).toHaveLength(0);
  });

  it('refuses a replay from another sim version', async () => {
    mount();
    await chooseFile(JSON.stringify(replayOf(SIM_VERSION - 1)));
    expect($('replayStatus').textContent).toBe(`Replay is for simVersion ${String(SIM_VERSION - 1)}; this build is ${String(SIM_VERSION)}.`);
    expect(h.created).toHaveLength(0);
  });

  it('shows the WebGL error when WebGL is missing', async () => {
    h.webgl = false;
    mount();
    await chooseFile(JSON.stringify(replayOf()));
    expect(host.textContent).toContain('WebGL is required');
    expect(h.created).toHaveLength(0);
  });

  it('opening a second replay destroys the first game and mounts a new one', async () => {
    mount();
    await chooseFile(JSON.stringify(replayOf()));
    await chooseFile(JSON.stringify(replayOf()));
    expect(h.created).toHaveLength(2);
    expect(h.created[0]?.destroyed).toBe(true);
    expect(h.created[1]?.destroyed).toBe(false);
    expect(host.querySelectorAll('#game')).toHaveLength(1);
  });

  it('unmount destroys the running game and ignores a late open', async () => {
    const screen = mount();
    await chooseFile(JSON.stringify(replayOf()));
    screen.unmount();
    await flush();
    expect(h.created[0]?.destroyed).toBe(true);
    expect(host.querySelector('#replayViewer')).toBeNull();
  });

  it('lists recent playtests and opens one on click', async () => {
    const list = vi.fn(() => Promise.resolve([{ replay: replayOf(SIM_VERSION, 40) }, { replay: replayOf(SIM_VERSION, 80) }]));
    mount({ replays: { list } as unknown as ReplayStore });
    await flush();
    const buttons = [...host.querySelectorAll('button')].filter((b) => b.textContent.startsWith('#'));
    expect(buttons.map((b) => b.textContent)).toEqual(['#1 (40 ticks)', '#2 (80 ticks)']);
    buttons[1]?.click();
    await flush();
    expect(h.created).toHaveLength(1);
    expect((h.created[0]?.launch.playback?.replay.header as { tickCount: number }).tickCount).toBe(80);
  });

  it('shows no recent list when empty or after unmount', async () => {
    mount({ replays: { list: () => Promise.resolve([]) } as unknown as ReplayStore });
    await flush();
    expect(host.textContent).not.toContain('Recent');
    host.replaceChildren();
    let resolve: (v: never[]) => void = () => undefined;
    const slow = new Promise<never[]>((r) => { resolve = r; });
    const screen = mount({ replays: { list: () => slow } as unknown as ReplayStore });
    screen.unmount();
    resolve([{ replay: replayOf() }] as never[]);
    await flush();
    expect(host.textContent).not.toContain('Recent');
  });
});
