// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UI_FLAGS } from '../platform/flags';
import type { ArenaLaunch } from '../scenes/launch';
import type { ArcadeLaunchOptions, ArcadeResult } from './arcade-setup';

const h = vi.hoisted(() => ({
  webgl: true,
  created: [] as Array<{ host: HTMLElement; launch: unknown; destroyed: boolean }>,
  launches: [] as Array<{ pick: unknown; seed: number; opts: unknown }>,
  downloads: [] as unknown[],
}));

vi.mock('../boot/webgl-check', () => ({ detectWebgl: () => h.webgl }));
vi.mock('../boot/phaser-config', () => ({
  createGame: (host: HTMLElement, launch: unknown) => {
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
vi.mock('./arcade-setup', () => ({
  arcadeLaunch: (pick: unknown, seed: number, opts: unknown): ArenaLaunch => {
    h.launches.push({ pick, seed, opts });
    return { setup: {} as never };
  },
}));
vi.mock('./download', () => ({
  downloadReplay: (r: unknown) => {
    h.downloads.push(r);
    return Promise.resolve();
  },
}));

import { arcadeVersusScreen, keysHint, mountArcade, unmountArcade, type ArcadeVersusDeps } from './arcade-versus';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

let host: HTMLElement;
let navigate: ReturnType<typeof vi.fn<(route: string) => void>>;
const deps = (over: Partial<ArcadeVersusDeps> = {}): ArcadeVersusDeps => ({
  flags: DEFAULT_UI_FLAGS,
  now: () => 1234,
  navigate,
  replays: { add: vi.fn() },
  ...over,
});

beforeEach(() => {
  h.webgl = true;
  h.created.length = 0;
  h.launches.length = 0;
  h.downloads.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  navigate = vi.fn();
});
afterEach(() => {
  unmountArcade();
  document.body.replaceChildren();
});

const submit = (): void => {
  host.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
};
const setSel = (id: string, value: string): void => {
  const s = host.querySelector<HTMLSelectElement>(`#${id}`);
  if (!s) throw new Error(id);
  s.value = value;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};
const lastOpts = (): ArcadeLaunchOptions => {
  const l = h.launches.at(-1);
  if (!l) throw new Error('no launch');
  return l.opts as ArcadeLaunchOptions;
};
const result = (over: Partial<ArcadeResult> = {}): ArcadeResult =>
  ({ outcome: 'win', pick: { player: 'sindarosa', enemy: 'fiara', level: 'hard' }, ...over }) as ArcadeResult;

describe('arcade versus screen', () => {
  it('mounts the picker and Escape goes back to the main menu, except inside a select', () => {
    arcadeVersusScreen(deps()).mount(host);
    expect(host.querySelector('#arcadePick')).not.toBeNull();
    const sel = host.querySelector('select') as HTMLSelectElement;
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(navigate).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(navigate).toHaveBeenCalledWith('main');
  });

  it('shows the WebGL error when WebGL is missing', async () => {
    h.webgl = false;
    arcadeVersusScreen(deps()).mount(host);
    submit();
    await flush();
    expect(host.textContent).toContain('WebGL is required');
    expect(h.created).toHaveLength(0);
  });

  it('starts a battle: seed from now(), touch buttons, record flag, then shows results', async () => {
    arcadeVersusScreen(deps()).mount(host);
    submit();
    expect(host.querySelector('#battle h1')?.textContent).toBe('Loading...');
    await flush();
    expect(h.launches).toHaveLength(1);
    expect(h.launches[0]?.seed).toBe(1234);
    expect(h.created).toHaveLength(1);
    expect(host.querySelector('#battle #game')).not.toBeNull();
    expect(host.querySelector('#arcadeKeysHint')).toBeNull();
    expect(lastOpts().cheats).toBe(false);
    expect(lastOpts().record).toBe(false);
    expect(lastOpts().replays).toBeDefined();
    expect(() => lastOpts().onView?.({} as never)).not.toThrow();
    lastOpts().onResult(result({ rounds: [2, 1] }));
    expect(host.querySelector('#arcadeResults h1')?.textContent).toBe('Victory!');
    expect(host.textContent).toContain('AI Hard');
    expect(host.textContent).toContain('Rounds 2-1.');
    expect(host.querySelector('#downloadReplay')).toBeNull();
    await flush();
    expect(h.created[0]?.destroyed).toBe(true);
  });

  it('uses the seed flag and record flag when set', async () => {
    arcadeVersusScreen(deps({ flags: { ...DEFAULT_UI_FLAGS, seed: 77, record: true } })).mount(host);
    submit();
    await flush();
    expect(h.launches[0]?.seed).toBe(77);
    expect(lastOpts().record).toBe(true);
  });

  it('ignores a result from an old battle', async () => {
    arcadeVersusScreen(deps()).mount(host);
    submit();
    await flush();
    const opts = lastOpts();
    opts.onResult(result({ outcome: 'lose' }));
    expect(host.querySelector('#arcadeResults h1')?.textContent).toBe('Defeat');
    opts.onResult(result({ outcome: 'draw' }));
    expect(host.querySelector('#arcadeResults h1')?.textContent).toBe('Defeat');
  });

  it('results: team summary, download, rematch and change fighters', async () => {
    arcadeVersusScreen(deps()).mount(host);
    submit();
    await flush();
    const replay = { header: {} } as never;
    lastOpts().onResult(
      result({
        outcome: 'draw',
        replay,
        heroes: [
          { race: 'sindarosa', team: 0, pct: 45 },
          { race: 'pax', team: 1, pct: 0 },
        ] as never,
      }),
    );
    expect(host.textContent).toContain('Your team: Sindarosa (fire) 45% left');
    expect(host.textContent).toContain('knocked out');
    (host.querySelector('#downloadReplay') as HTMLElement).click();
    expect(h.downloads).toEqual([replay]);
    (host.querySelector('#arcadeRematch') as HTMLElement).click();
    await flush();
    expect(h.launches).toHaveLength(2);
    lastOpts().onResult(result({ outcome: 'win' }));
    (host.querySelector('#arcadeChange') as HTMLElement).click();
    expect(host.querySelector('#arcadePick')).not.toBeNull();
    expect(host.querySelector('#arcadeResults')).toBeNull();
  });

  it('the key hint sits above the action bar and fades out after a few seconds', () => {
    vi.useFakeTimers();
    try {
      const p = keysHint(5000);
      expect(p.style.bottom).toBe('34%');
      expect(p.style.opacity).toBe('');
      vi.advanceTimersByTime(4999);
      expect(p.style.opacity).toBe('');
      vi.advanceTimersByTime(1);
      expect(p.style.opacity).toBe('0');
    } finally {
      vi.useRealTimers();
    }
  });

  it('local two-player: key hint, player headings and summaries', async () => {
    arcadeVersusScreen(deps()).mount(host);
    setSel('arcadeMode', 'local');
    submit();
    await flush();
    expect(host.querySelector('#arcadeKeysHint')).not.toBeNull();
    lastOpts().onResult(result({ pick: { local: true, player: 'sindarosa', enemy: 'pax', level: 'normal' } as never, outcome: 'lose' }));
    expect(host.querySelector('#arcadeResults h1')?.textContent).toBe('Player 2 wins!');
    expect(host.textContent).toContain('Player 1 (Sindarosa (fire)) against Player 2 (Pax (earth))');
    (host.querySelector('#arcadeRematch') as HTMLElement).click();
    await flush();
    lastOpts().onResult(
      result({ pick: { local: true } as never, outcome: 'win', heroes: [{ race: 'sindarosa', team: 0, pct: 10 }, { race: 'pax', team: 1, pct: 20 }] as never }),
    );
    expect(host.querySelector('#arcadeResults h1')?.textContent).toBe('Player 1 wins!');
    expect(host.textContent).toContain("Player 1's team: Sindarosa (fire) 10% left. Player 2's team: Pax (earth) 20% left.");
  });

  it('builds the picked team and rematches with the same pick', async () => {
    arcadeVersusScreen(deps()).mount(host);
    setSel('arcadeSize', '3');
    setSel('arcadeLevel', 'hard');
    submit();
    await flush();
    const first = h.launches[0]?.pick as { level: string; partner?: string; partner2?: string };
    expect(first.level).toBe('hard');
    expect(first.partner).toBeDefined();
    expect(first.partner2).toBeDefined();
    lastOpts().onResult(result());
    (host.querySelector('#arcadeRematch') as HTMLElement).click();
    await flush();
    expect(h.launches[1]?.pick).toEqual(first);
    // The picker re-reads the remembered pick on "Change fighters" (happy-dom does not honour option.selected, so
    // the restored select values are covered by the e2e specs, not here).
    lastOpts().onResult(result());
    (host.querySelector('#arcadeChange') as HTMLElement).click();
    expect(host.querySelector('#arcadePick')).not.toBeNull();
  });

  it('a stale Phaser import is ignored after unmount', async () => {
    const screen = arcadeVersusScreen(deps());
    screen.mount(host);
    submit();
    screen.unmount();
    await flush();
    expect(h.created).toHaveLength(0);
    expect(host.querySelector('#battle')).toBeNull();
  });

  it('shows an error screen when the launch builder throws', async () => {
    arcadeVersusScreen(
      deps({
        now: () => {
          throw new Error('boom');
        },
      }),
    ).mount(host);
    submit();
    await flush();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('The battle could not start');
    expect(host.textContent).toContain('boom');
  });

  it('stringifies a non-Error failure', async () => {
    arcadeVersusScreen(
      deps({
        now: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain';
        },
      }),
    ).mount(host);
    submit();
    await flush();
    expect(host.textContent).toContain('plain');
  });

  it('mountArcade replaces the live instance; unmountArcade clears it', () => {
    mountArcade(host, deps());
    mountArcade(host, deps());
    expect(host.querySelectorAll('#arcadePick')).toHaveLength(1);
    unmountArcade();
    expect(host.querySelector('#arcadePick')).toBeNull();
    unmountArcade();
  });

  it('mountArcade builds browser deps by default', () => {
    mountArcade(host);
    expect(host.querySelector('#arcadePick')).not.toBeNull();
  });
});
