// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelFromXp, newEmptyState, type SaveV1 } from '@core/menu-index';
import type { Result, SaveStore } from '../../game/platform/storage/save-store';
import { objectivesScreen, type ObjectivesDeps } from './objectives';

const member = (xp: number): SaveV1['garrison'][number] => ({ id: 'a', experience: xp, characterName: 'Fiara' });
const save = (chapter: number, xp: number): SaveV1 => ({ ...newEmptyState(), chapter, garrison: [member(xp)] });

/** A chapter-2 save whose three heroes sit at exactly level 10 (the chapter 2 objective). */
function chapter2Met(): SaveV1 {
  let xp = 0;
  while (levelFromXp(xp) < 10) xp += 1;
  const garrison = ['a', 'b', 'c'].map((id) => ({ id, experience: xp, characterName: 'Fiara' }));
  return { ...newEmptyState(), chapter: 2, garrison };
}

function store(initial: Result<SaveV1>, saveResult: Result<SaveV1> | null = null): SaveStore & { saved: SaveV1[] } {
  const saved: SaveV1[] = [];
  return {
    saved,
    load: () => Promise.resolve(initial),
    save: (s) => {
      saved.push(s);
      return Promise.resolve(saveResult ?? { ok: true as const, value: s });
    },
    clear: () => Promise.resolve(),
    exportJson: () => Promise.resolve({ ok: true as const, value: '{}' }),
    importJson: () => Promise.reject(new Error('unused')),
  };
}

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

async function mount(deps: ObjectivesDeps): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  objectivesScreen(deps).mount(host);
  await vi.waitFor(() => {
    expect(host?.querySelector('a.menuLink')).not.toBeNull();
  });
  return host;
}

const advance = (h: HTMLElement): HTMLButtonElement | null =>
  h.querySelector<HTMLButtonElement>('button.clickable');

describe('objectives screen in the DOM', () => {
  it('without a started save shows the default title and only a Back link', async () => {
    const h = await mount({ store: store({ ok: true, value: newEmptyState() }), navigate: () => undefined, captureKey: () => 'C' });
    expect(h.querySelector('h1')?.textContent).toBe('Current Objectives');
    expect(h.querySelector('.objectiveLine')).toBeNull();
    expect(advance(h)).toBeNull();
    expect(h.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
  });

  it('a failed load degrades to the empty view instead of throwing', async () => {
    const h = await mount({
      store: store({ ok: false, error: { kind: 'storage', message: 'boom' } } as unknown as Result<SaveV1>),
      navigate: () => undefined,
      captureKey: () => 'C',
    });
    expect(h.querySelector('h1')?.textContent).toBe('Current Objectives');
  });

  it('shows progress but no advance button while the objectives are unmet', async () => {
    const h = await mount({ store: store({ ok: true, value: save(1, 1) }), navigate: () => undefined, captureKey: () => 'C' });
    expect(h.querySelector('h1')?.textContent).toBe('Chapter 1 Objectives');
    expect(h.querySelectorAll('.objectiveLine').length).toBeGreaterThan(0);
    expect(advance(h)).toBeNull();
  });

  it('advancing chapter 1 to 2 saves, stays on screen and announces Capture with the live key', async () => {
    const s = store({ ok: true, value: save(1, 5) });
    const navigate = vi.fn();
    const h = await mount({ store: s, navigate, captureKey: () => 'Q' });
    advance(h)?.click();
    await vi.waitFor(() => {
      expect(h.querySelector('#captureNotice')).not.toBeNull();
    });
    expect(s.saved.map((x) => x.chapter)).toEqual([2]);
    expect(h.querySelector('#captureNotice')?.textContent).toContain('Capture unlocked!');
    expect(h.querySelector('#captureNotice')?.textContent).toContain('Press Q');
    expect(h.querySelector('#continueToGarrison')?.getAttribute('href')).toBe('#garrison');
    expect(h.querySelector('h1')?.textContent).toBe('Chapter 2 Objectives');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('advancing from a later chapter goes straight to the battleground', async () => {
    const s = store({ ok: true, value: chapter2Met() });
    const navigate = vi.fn();
    const h = await mount({ store: s, navigate, captureKey: () => 'C' });
    const btn = advance(h);
    if (btn === null) return expect.unreachable('chapter 2 with huge XP should offer the next chapter');
    btn.click();
    expect(btn.disabled).toBe(true);
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('battleground');
    });
    expect(s.saved[0]?.chapter).toBe(3);
  });

  it('a failed save re-enables the button and does not navigate', async () => {
    const s = store({ ok: true, value: chapter2Met() }, { ok: false, error: { kind: 'storage', message: 'full' } } as unknown as Result<SaveV1>);
    const navigate = vi.fn();
    const h = await mount({ store: s, navigate, captureKey: () => 'C' });
    const btn = advance(h);
    btn?.click();
    await vi.waitFor(() => {
      expect(s.saved).toHaveLength(1);
      expect(btn?.disabled).toBe(false);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('unmounting before the load resolves renders nothing', async () => {
    host = document.createElement('div');
    document.body.append(host);
    const screen = objectivesScreen({ store: store({ ok: true, value: save(1, 1) }), navigate: () => undefined, captureKey: () => 'C' });
    screen.mount(host);
    screen.unmount();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.children).toHaveLength(0);
  });
});
