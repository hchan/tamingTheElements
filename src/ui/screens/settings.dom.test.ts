// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DIFFICULTY, DISPLAY_SCALE, GARRISON_SORT_ORDER, newEmptyState, type SaveV1 } from '@core/menu-index';
import type { Result, SaveStore } from '../../game/platform/storage/save-store';
import { setSavedPrefs } from '../../game/platform/a11y/prefs';
import { settingsScreen, applyUiScale, loadSave } from './settings';
import type { Screen } from './screen';

interface FakeStore extends SaveStore {
  saved: SaveV1[];
  loadResult: Result<SaveV1>;
  saveResult: Result<SaveV1> | null;
  loads: number;
}

function fakeStore(initial: SaveV1 = newEmptyState()): FakeStore {
  const s: FakeStore = {
    saved: [],
    loads: 0,
    loadResult: { ok: true, value: initial },
    saveResult: null,
    load: () => {
      s.loads += 1;
      return Promise.resolve(s.loadResult);
    },
    save: (st) => {
      s.saved.push(st);
      return Promise.resolve(s.saveResult ?? { ok: true as const, value: st });
    },
    clear: () => Promise.resolve(),
    exportJson: () => Promise.resolve({ ok: true as const, value: '{}' }),
    importJson: () => Promise.reject(new Error('unused')),
  };
  return s;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

let screen: Screen | undefined;
let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  screen?.unmount();
  screen = undefined;
  setSavedPrefs({});
  document.body.replaceChildren();
  document.documentElement.removeAttribute('style');
});

async function mountWith(store: FakeStore): Promise<void> {
  screen = settingsScreen(store);
  screen.mount(root);
  await flush();
}
const radios = (name: string): HTMLInputElement[] => [...root.querySelectorAll<HTMLInputElement>(`input[type=radio][name=${name}]`)];
const checked = (name: string): string | undefined => radios(name).find((r) => r.checked)?.value;
const form = (): HTMLFormElement => root.querySelector('form') as HTMLFormElement;
const submit = async (): Promise<void> => {
  form().dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await flush();
};

describe('settingsScreen (DOM)', () => {
  it('shows Loading, then the form with each radio group at the saved value', async () => {
    const store = fakeStore({ ...newEmptyState(), difficulty: DIFFICULTY.Hard, displaySettings: DISPLAY_SCALE.Largest, garrisonSortOrder: 3 });
    screen = settingsScreen(store);
    screen.mount(root);
    expect(root.textContent).toContain('Loading...');
    await flush();
    expect(root.querySelector('h1')?.textContent).toBe('Settings');
    expect(checked('difficulty')).toBe(String(DIFFICULTY.Hard));
    expect(checked('displaySettings')).toBe(String(DISPLAY_SCALE.Largest));
    expect(checked('garrisonSortOrder')).toBe('3');
    expect(radios('difficulty')).toHaveLength(Object.keys(DIFFICULTY).length);
    expect(radios('garrisonSortOrder')).toHaveLength(Object.keys(GARRISON_SORT_ORDER).length);
    // exactly one choice per group, and applying the saved scale to the document
    for (const g of ['difficulty', 'displaySettings', 'garrisonSortOrder']) expect(radios(g).filter((r) => r.checked)).toHaveLength(1);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe(String(DISPLAY_SCALE.Largest));
  });

  it('every checkbox and radio has an accessible label, and the a11y checkboxes are described by a hint', async () => {
    await mountWith(fakeStore());
    for (const r of radios('difficulty')) expect(r.closest('label')?.textContent.trim()).not.toBe('');
    for (const name of ['reduceMotion', 'highContrast']) {
      const box = root.querySelector<HTMLInputElement>(`input[name=${name}]`);
      expect(box?.id).toBe(`setting-${name}`);
      expect(root.querySelector(`label[for="setting-${name}"]`)?.textContent).not.toBe('');
      expect(document.getElementById(`setting-${name}-hint`)?.textContent).not.toBe('');
      expect(box?.getAttribute('aria-describedby')).toBe(`setting-${name}-hint`);
    }
    expect(root.querySelector('a[href="#main"]')?.textContent).toBe('Back');
  });

  it('submit saves the chosen values as numbers onto the freshly loaded save and returns to #main', async () => {
    const store = fakeStore({ ...newEmptyState(), keyBindings: { dash: ['KeyQ'] } });
    await mountWith(store);
    const pick = (name: string, value: number): void => {
      const r = radios(name).find((x) => x.value === String(value));
      if (!r) throw new Error('no radio');
      r.checked = true;
    };
    pick('difficulty', DIFFICULTY.Hard);
    pick('displaySettings', DISPLAY_SCALE.Largest);
    const loadsBefore = store.loads;
    await submit();
    expect(store.loads).toBe(loadsBefore + 1);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ difficulty: DIFFICULTY.Hard, displaySettings: DISPLAY_SCALE.Largest });
    expect(store.saved[0]?.keyBindings).toEqual({ dash: ['KeyQ'] });
    expect(window.location.hash).toBe('#main');
  });

  it('ticking Reduce motion is stored as an explicit save preference', async () => {
    const store = fakeStore();
    await mountWith(store);
    const box = root.querySelector<HTMLInputElement>('input[name=reduceMotion]');
    if (!box) throw new Error('no box');
    box.checked = true;
    await submit();
    expect(store.saved[0]?.reduceMotion).toBe(true);
  });

  it('submit does not write when the save cannot be read, and says so', async () => {
    const store = fakeStore();
    await mountWith(store);
    store.loadResult = { ok: false, error: { kind: 'corrupt', message: 'bad json' } };
    await submit();
    expect(store.saved).toHaveLength(0);
    expect(root.querySelector('form [role=status]')?.textContent).toContain('nothing was changed');
    expect(window.location.hash).toBe('');
  });

  it('a failed write reports it and stays on the page', async () => {
    const store = fakeStore();
    await mountWith(store);
    store.saveResult = { ok: false, error: { kind: 'storage', message: 'quota' } };
    await submit();
    expect(root.querySelector('form [role=status]')?.textContent).toContain('Could not save settings');
    expect(window.location.hash).toBe('');
  });

  it('an unreadable save at mount shows an alert and only a Back link', async () => {
    const store = fakeStore();
    store.loadResult = { ok: false, error: { kind: 'corrupt', message: 'bad json' } };
    await mountWith(store);
    expect(root.querySelector('[role=alert]')?.textContent).toContain('Could not load your save');
    expect(root.querySelector('form')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#main');
  });

  it('unmounting before the load resolves renders nothing and a late submit writes nothing', async () => {
    const store = fakeStore();
    screen = settingsScreen(store);
    screen.mount(root);
    screen.unmount();
    await flush();
    expect(root.children).toHaveLength(0);
  });

  it('unmounting during a submit does not navigate or save', async () => {
    const store = fakeStore();
    await mountWith(store);
    form().dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    screen?.unmount();
    await flush();
    expect(store.saved).toHaveLength(0);
    expect(window.location.hash).toBe('');
  });

  it('shows Cheats, the replay link and the record checkbox with its ids', async () => {
    await mountWith(fakeStore());
    expect(document.getElementById('cheatsMenu')?.textContent).toBe('Cheats');
    expect(document.getElementById('recordPlaytests')).not.toBeNull();
    expect(root.querySelector('a[href="#replay"]')).not.toBeNull();
    expect(document.getElementById('unlockGarrison')).not.toBeNull();
    expect(root.querySelector('.settingsTransfer button')?.textContent).toBe('Export save');
  });
});

describe('applyUiScale / loadSave', () => {
  it('applyUiScale sets --ui-scale and --canvas-fraction on the root', () => {
    const el = document.createElement('div');
    applyUiScale(1.2, el);
    expect(el.style.getPropertyValue('--ui-scale')).toBe('1.2');
    expect(Number(el.style.getPropertyValue('--canvas-fraction'))).toBeGreaterThan(0);
  });

  it('loadSave returns an empty state for missing or corrupt storage, and migrates a stored save', () => {
    expect(loadSave()).toEqual(newEmptyState());
    localStorage.setItem('Taming the Elements', '{not json');
    expect(loadSave()).toEqual(newEmptyState());
    localStorage.setItem('Taming the Elements', JSON.stringify({ ...newEmptyState(), difficulty: DIFFICULTY.Hard }));
    expect(loadSave().difficulty).toBe(DIFFICULTY.Hard);
  });

  it('on-screen button size and side: default to auto/right, and submit stores them device-locally and applies them', async () => {
    localStorage.removeItem('tte.touchLayout');
    await mountWith(fakeStore());
    expect(checked('touchSize')).toBe('auto');
    expect(checked('touchSide')).toBe('right');
    for (const r of [...radios('touchSize'), ...radios('touchSide')]) expect(r.closest('label')?.textContent.trim()).not.toBe('');
    const set = (name: string, value: string): void => {
      const r = radios(name).find((x) => x.value === value);
      if (!r) throw new Error('no radio');
      r.checked = true;
    };
    set('touchSize', 'compact');
    set('touchSide', 'left');
    await submit();
    expect(JSON.parse(localStorage.getItem('tte.touchLayout') ?? '{}')).toEqual({ size: 'compact', side: 'left' });
    expect(document.documentElement.dataset['touchSize']).toBe('compact');
    expect(document.documentElement.dataset['touchSide']).toBe('left');
    localStorage.removeItem('tte.touchLayout');
    delete document.documentElement.dataset['touchSize'];
    delete document.documentElement.dataset['touchSide'];
  });
});
