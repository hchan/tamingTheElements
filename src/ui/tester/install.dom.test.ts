// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, createMemoryStorage } from '../../game/platform/storage/save-store';
import { createLocalSaveStore } from '../../game/platform/storage/local-save-store';
import { TesterSession, createTesterStore } from '../../game/platform/tester/session';
import { closeTesterPanel, isTesterPanelOpen } from './panel';
import { KONAMI } from './code';
import { installTesterUi, onMainMenu, requestOpenTesterPanel } from './install';

const SAVE = {
  schemaVersion: 1 as const,
  savedAt: 1,
  chapter: 1,
  garrisonSortOrder: 1,
  difficulty: 1,
  displaySettings: 1,
  garrison: [{ id: 'g1', experience: 1, characterName: 'Fiara', createdTime: 1, lastModifiedTime: 1 }],
};

let off: (() => void) | undefined;
let hashChanges: number;
const onHash = (): void => { hashChanges++; };

function setup(): TesterSession {
  const real = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(SAVE) });
  const session = new TesterSession(undefined, real);
  const store = createTesterStore(createLocalSaveStore(real, () => 7), session, () => 7);
  off = installTesterUi({ session, store, now: () => 7 });
  return session;
}

function press(code: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}
const typeCode = (codes: readonly string[], target?: EventTarget): void => { for (const c of codes) press(c, target); };

beforeEach(() => {
  window.location.hash = '#main';
  hashChanges = 0;
  window.addEventListener('hashchange', onHash);
});

afterEach(() => {
  closeTesterPanel();
  off?.();
  off = undefined;
  window.removeEventListener('hashchange', onHash);
  document.body.replaceChildren();
  window.location.hash = '';
});

describe('onMainMenu', () => {
  it('is true only for the empty, "#" and "#main" hashes', () => {
    expect(['', '#', '#main'].map(onMainMenu)).toEqual([true, true, true]);
    expect(['#garrison', '#main/x', '#settings'].map(onMainMenu)).toEqual([false, false, false]);
  });
});

describe('installTesterUi', () => {
  it('mounts a hidden badge and bench panel, and removes both on teardown', () => {
    const s = setup();
    expect(s.enabled).toBe(false);
    expect(document.getElementById('testerBadge')?.hidden).toBe(true);
    expect(document.getElementById('testerBench')?.hidden).toBe(true);
    off?.();
    off = undefined;
    expect(document.getElementById('testerBadge')).toBeNull();
    expect(document.getElementById('testerBench')).toBeNull();
  });

  it('the Konami code on the main menu enables tester mode, shows the badge and refreshes the route', () => {
    const s = setup();
    typeCode(KONAMI.slice(0, -1));
    expect(s.enabled).toBe(false);
    press(KONAMI[KONAMI.length - 1] ?? '');
    expect(s.enabled).toBe(true);
    expect(document.getElementById('testerBadge')?.hidden).toBe(false);
    expect(document.getElementById('testerBadge')?.textContent).toContain('TESTER MODE');
    expect(hashChanges).toBe(1);
  });

  it('a wrong key mid-sequence restarts it, so the full code must follow', () => {
    const s = setup();
    typeCode(KONAMI.slice(0, 5));
    press('KeyX');
    typeCode(KONAMI.slice(5));
    expect(s.enabled).toBe(false);
    typeCode(KONAMI);
    expect(s.enabled).toBe(true);
  });

  it('ignores the code off the main menu', () => {
    const s = setup();
    window.location.hash = '#settings';
    typeCode(KONAMI);
    expect(s.enabled).toBe(false);
  });

  it('ignores keys typed in a text field, and a route change resets progress', () => {
    const s = setup();
    const input = document.createElement('input');
    document.body.append(input);
    typeCode(KONAMI, input);
    expect(s.enabled).toBe(false);
    const area = document.createElement('textarea');
    document.body.append(area);
    typeCode(KONAMI, area);
    expect(s.enabled).toBe(false);
    typeCode(KONAMI.slice(0, 9));
    window.location.hash = '#settings';
    press('KeyA');
    window.location.hash = '#main';
    press('KeyA');
    expect(s.enabled).toBe(false);
  });

  it('once enabled the code does nothing more (no second refresh)', () => {
    const s = setup();
    typeCode(KONAMI);
    typeCode(KONAMI);
    expect(s.enabled).toBe(true);
    expect(hashChanges).toBe(1);
  });

  it('clicking the badge opens the tester panel', () => {
    const s = setup();
    s.enable();
    (document.getElementById('testerBadge') as HTMLButtonElement).click();
    expect(isTesterPanelOpen()).toBe(true);
    expect(document.getElementById('testerPanel')?.getAttribute('role')).toBe('dialog');
  });

  it('requestOpenTesterPanel opens the panel while installed and is a no-op after teardown', () => {
    const s = setup();
    s.enable();
    requestOpenTesterPanel();
    expect(isTesterPanelOpen()).toBe(true);
    closeTesterPanel();
    off?.();
    off = undefined;
    requestOpenTesterPanel();
    expect(isTesterPanelOpen()).toBe(false);
  });

  it('requestOpenTesterPanel(true) also applies the Full cheat preset', () => {
    const s = setup();
    s.enable();
    expect(s.options.godMode).toBe(false);
    requestOpenTesterPanel(true);
    expect(isTesterPanelOpen()).toBe(true);
    expect(s.options.godMode).toBe(true);
    expect(s.options.keepProgress).toBe(false);
  });

  it('teardown removes the key listener', () => {
    const s = setup();
    const spy = vi.spyOn(window, 'removeEventListener');
    try {
      off?.();
      off = undefined;
      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    } finally {
      spy.mockRestore();
    }
    typeCode(KONAMI);
    expect(s.enabled).toBe(false);
  });
});
