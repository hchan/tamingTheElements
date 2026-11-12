// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, migrate, type SaveV1 } from '@core/menu-index';
import { SAVE_KEY, createMemoryStorage } from '../../game/platform/storage/save-store';
import { createLocalSaveStore } from '../../game/platform/storage/local-save-store';
import type { SaveStore } from '../../game/platform/storage/save-store';
import { gameMasterScreen } from './game-master';
import type { Screen } from './screen';

const SAVE: SaveV1 = {
  schemaVersion: 1,
  savedAt: 1,
  chapter: 1,
  garrisonSortOrder: 1,
  difficulty: 1,
  displaySettings: 1,
  garrison: [{ id: 'g1', experience: 3, characterName: 'Fiara', createdTime: 1, lastModifiedTime: 1 }],
};

let current: { screen: Screen; host: HTMLElement } | null = null;
afterEach(() => {
  current?.screen.unmount();
  current?.host.remove();
  current = null;
});

function mount(initial: SaveV1 | null, wrap?: (s: SaveStore) => SaveStore) {
  const storage = createMemoryStorage(initial === null ? {} : { [SAVE_KEY]: JSON.stringify(initial) });
  let store = createLocalSaveStore(storage, () => 42);
  if (wrap) store = wrap(store);
  const host = document.createElement('div');
  document.body.append(host);
  const screen = gameMasterScreen(store);
  screen.mount(host);
  current = { screen, host };
  const area = host.querySelector<HTMLTextAreaElement>('#gameMasterTextArea');
  if (area === null) throw new Error('no textarea');
  const status = host.querySelector<HTMLElement>('[role="status"]');
  if (status === null) throw new Error('no status');
  const button = (label: string): HTMLButtonElement => {
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label);
    if (b === undefined) throw new Error(`no button ${label}`);
    return b;
  };
  const stored = (): SaveV1 | null => {
    const t = storage.getItem(SAVE_KEY);
    return t === null ? null : (JSON.parse(t) as SaveV1);
  };
  return { host, area, status, button, stored, storage };
}

describe('game master screen in the DOM', () => {
  it('shows the stored save JSON in an accessible textarea, with a Back link to the menu', async () => {
    const m = mount(SAVE);
    await vi.waitFor(() => { expect(m.area.value).not.toBe(''); });
    expect((JSON.parse(m.area.value) as SaveV1).garrison[0]?.characterName).toBe('Fiara');
    expect(m.area.getAttribute('aria-label')).toBe('Save JSON');
    expect(m.host.querySelector('h1')?.textContent).toBe('Game Master');
    expect(m.host.querySelector('a.menuButton')?.getAttribute('href')).toBe('#main');
    expect(m.host.querySelectorAll('button')).toHaveLength(7);
  });

  it('with no save the editor shows a fresh empty-state save (chapter 0, no heroes)', async () => {
    const m = mount(null);
    await vi.waitFor(() => { expect(m.area.value).not.toBe(''); });
    const shown = JSON.parse(m.area.value) as SaveV1;
    expect([shown.chapter, shown.garrison]).toEqual([0, []]);
  });

  it('a slow first read does not overwrite a preset or Clear clicked before it resolves', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const m = mount(SAVE, (s) => ({ ...s, exportJson: async () => { await gate; return s.exportJson(); } }));
    m.button('Chapter 3').click();
    const preset = m.area.value;
    expect((JSON.parse(preset) as SaveV1).chapter).toBe(3);
    release();
    await vi.waitFor(() => { expect(m.status.textContent).toBe('Chapter 3 preset written.'); });
    await Promise.resolve();
    expect(m.area.value).toBe(preset);
  });

  it('Apply JSON writes an edited save to the store and says so', async () => {
    const m = mount(null);
    m.area.value = JSON.stringify({ ...SAVE, chapter: 3 });
    m.button('Apply JSON').click();
    await vi.waitFor(() => { expect(m.status.textContent).toBe('Save written.'); });
    expect(m.stored()?.chapter).toBe(3);
  });

  it('Apply JSON reports invalid JSON and a non-object without touching the store', () => {
    const m = mount(SAVE);
    const before = m.storage.getItem(SAVE_KEY);
    m.area.value = '{nope';
    m.button('Apply JSON').click();
    expect(m.status.textContent).toMatch(/^Invalid JSON: /);
    m.area.value = '[1]';
    m.button('Apply JSON').click();
    expect(m.status.textContent).toBe('Invalid save: expected a JSON object');
    m.area.value = '{"schemaVersion":1,"chapter":"x"}';
    m.button('Apply JSON').click();
    expect(m.status.textContent).toMatch(/^Invalid save: /);
    expect(m.storage.getItem(SAVE_KEY)).toBe(before);
  });

  it('Apply JSON with blank text clears the save', async () => {
    const m = mount(SAVE);
    m.area.value = '   ';
    m.button('Apply JSON').click();
    await vi.waitFor(() => { expect(m.status.textContent).toBe('Save cleared.'); });
    expect(m.stored()).toBeNull();
  });

  it('Clear empties the textarea and the store', async () => {
    const m = mount(SAVE);
    await vi.waitFor(() => { expect(m.area.value).not.toBe(''); });
    m.button('Clear').click();
    expect(m.area.value).toBe('');
    await vi.waitFor(() => { expect(m.status.textContent).toBe('Save cleared.'); });
    expect(m.stored()).toBeNull();
  });

  it('Reload discards unsaved edits and shows the stored text again', async () => {
    const m = mount(SAVE);
    await vi.waitFor(() => { expect(m.area.value).not.toBe(''); });
    const original = m.area.value;
    m.area.value = 'scribble';
    m.button('Reload').click();
    await vi.waitFor(() => { expect(m.status.textContent).toBe('Reloaded.'); });
    expect(m.area.value).toBe(original);
  });

  it('each chapter preset fills the editor and writes a migratable save at that chapter', async () => {
    const m = mount(null);
    await vi.waitFor(() => { expect(m.area.value).not.toBe(''); });
    for (const [label, chapter] of [['Chapter 2', 2], ['Chapter 3', 3], ['Chapter 4', 4], ['Chapter complete', 4]] as const) {
      m.button(label).click();
      await vi.waitFor(() => { expect(m.status.textContent).toBe(`${label} preset written.`); });
      const written = m.stored();
      expect(written?.chapter).toBe(chapter);
      expect(migrate(JSON.parse(m.area.value)).ok).toBe(true);
      expect((JSON.parse(m.area.value) as SaveV1).chapter).toBe(chapter);
      m.status.textContent = '';
    }
    expect(m.stored()?.garrison).toHaveLength(CHARACTERS.length);
  });

  it('shows the store error when a write fails', async () => {
    const m = mount(null, (s) => ({ ...s, save: () => Promise.resolve({ ok: false, error: { kind: 'storage', message: 'full' } }) }));
    m.area.value = JSON.stringify(SAVE);
    m.button('Apply JSON').click();
    await vi.waitFor(() => { expect(m.status.textContent).toMatch(/^Could not write the save: .*full/); });
  });

  it('shows an empty editor when the export fails, and unmount removes the page', async () => {
    const m = mount(SAVE, (s) => ({ ...s, exportJson: () => Promise.resolve({ ok: false, error: { kind: 'storage', message: 'x' } }) }));
    await Promise.resolve();
    expect(m.area.value).toBe('');
    current?.screen.unmount();
    expect(m.host.querySelector('.menuPage')).toBeNull();
  });
});
