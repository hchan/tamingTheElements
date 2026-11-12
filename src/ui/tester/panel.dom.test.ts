// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ArenaCheat } from '@core/menu-index';
import { SAVE_KEY, createMemoryStorage } from '../../game/platform/storage/save-store';
import { createLocalSaveStore } from '../../game/platform/storage/local-save-store';
import { FULL_CHEAT_OPTIONS, TesterSession, createTesterStore, type ArenaBridge } from '../../game/platform/tester/session';
import { closeTesterPanel, isTesterPanelOpen, openTesterPanel } from './panel';

const SAVE = {
  schemaVersion: 1 as const,
  savedAt: 1,
  chapter: 1,
  garrisonSortOrder: 1,
  difficulty: 1,
  displaySettings: 1,
  garrison: [{ id: 'g1', experience: 1, characterName: 'Fiara', createdTime: 1, lastModifiedTime: 1 }],
};

interface Rig {
  session: TesterSession;
  real: ReturnType<typeof createMemoryStorage>;
  refresh: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  open: (fullCheat?: boolean) => void;
  slot: () => typeof SAVE;
  realSave: () => typeof SAVE;
}

function rig(confirmAnswer = true): Rig {
  const real = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(SAVE) });
  const session = new TesterSession(undefined, real);
  session.enable();
  const store = createTesterStore(createLocalSaveStore(real, () => 7), session, () => 7);
  const refresh = vi.fn();
  const confirm = vi.fn(() => confirmAnswer);
  return {
    session,
    real,
    refresh,
    confirm,
    open: (fullCheat) => { openTesterPanel({ session, store, now: () => 7, confirm, refresh, ...(fullCheat === undefined ? {} : { fullCheat }) }); },
    slot: () => JSON.parse(session.slotText() ?? 'null') as typeof SAVE,
    realSave: () => JSON.parse(real.getItem(SAVE_KEY) ?? 'null') as typeof SAVE,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- test helper: the caller names the element type
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};
const status = (): string => $('testerStatus').textContent;
const key = (k: string, extra: KeyboardEventInit = {}): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  (document.activeElement ?? document.body).dispatchEvent(ev);
  return ev;
};
const bridge = (over: Partial<Omit<ArenaBridge, 'cheat'>> = {}): ArenaBridge & { cheat: Mock<(c: ArenaCheat) => void> } => ({
  cheat: vi.fn<(c: ArenaCheat) => void>(),
  bench: () => [],
  ...over,
});
const heroOptions = (): string[] => [...$<HTMLSelectElement>('testerHero').options].map((o) => o.textContent);

afterEach(() => {
  closeTesterPanel();
  document.body.replaceChildren();
});

describe('open / close / focus', () => {
  it('opens one modal dialog with focus on Close, and a second open is ignored', () => {
    const r = rig();
    r.open();
    r.open();
    expect(isTesterPanelOpen()).toBe(true);
    expect(document.querySelectorAll('#testerPanel')).toHaveLength(1);
    const box = $('testerPanel');
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Tester options');
    expect(document.activeElement).toBe($('testerClose'));
  });

  it('Escape closes it, is consumed before other handlers and returns focus to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const other = vi.fn();
    document.body.addEventListener('keydown', other);
    const r = rig();
    r.open();
    const ev = key('Escape');
    expect(ev.defaultPrevented).toBe(true);
    expect(other).not.toHaveBeenCalled();
    expect(isTesterPanelOpen()).toBe(false);
    expect(document.getElementById('testerPanel')).toBeNull();
    expect(document.activeElement).toBe(opener);
    // The key listener is gone: a later Escape reaches normal handlers again.
    key('Escape');
    expect(other).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', other);
  });

  it('Close removes the panel and the panel can be reopened afterwards', () => {
    const r = rig();
    r.open();
    $('testerClose').click();
    expect(isTesterPanelOpen()).toBe(false);
    r.open();
    expect(isTesterPanelOpen()).toBe(true);
  });

  it('Tab and Shift+Tab wrap inside the dialog and skip disabled controls', () => {
    const r = rig();
    r.open();
    const items = [...$('testerPanel').querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.id === 'tester-cheat-win')).toBe(false); // no arena, so the cheat buttons are disabled
    items.at(-1)?.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(items.at(-1));
    key('Tab');
    key('Tab');
    expect(document.activeElement).toBe(items[1]);
  });

  it('Turn tester mode off closes the panel, disables the session and refreshes the screen', () => {
    const r = rig();
    r.open();
    $('testerOff').click();
    expect(r.session.enabled).toBe(false);
    expect(r.session.slotText()).toBeNull();
    expect(r.refresh).toHaveBeenCalledTimes(1);
    expect(isTesterPanelOpen()).toBe(false);
  });
});

describe('battle cheats', () => {
  it('are disabled with a hint until an arena attaches, then run on it and disable again on detach', () => {
    const r = rig();
    r.open();
    const win = $<HTMLButtonElement>('tester-cheat-win');
    expect(win.disabled).toBe(true);
    expect($('testerPanel').textContent).toContain('Start a battle to use these.');
    const b = bridge();
    const detach = r.session.attachArena(b);
    expect(win.disabled).toBe(false);
    expect($('testerPanel').textContent).toContain('Acts on the battle that is running.');
    win.click();
    $('tester-cheat-myHp25').click();
    expect(b.cheat.mock.calls).toEqual([['win'], ['myHp25']]);
    expect(status()).toBe('My HP to 25%: done.');
    detach();
    expect(win.disabled).toBe(true);
  });

  it('shows the Arcade toggles only for an Arcade battle', () => {
    const r = rig();
    r.open();
    const box = $('testerArcadeOptions');
    expect(box.hidden).toBe(true);
    const detach = r.session.attachArena(bridge({ arcade: false }));
    expect(box.hidden).toBe(true);
    detach();
    r.session.attachArena(bridge({ arcade: true }));
    expect(box.hidden).toBe(false);
  });
});

describe('options', () => {
  it('start from the session values and a toggle updates the session and announces it', () => {
    const r = rig();
    r.open();
    const god = $<HTMLInputElement>('tester-opt-godMode');
    expect(god.checked).toBe(false);
    expect($<HTMLInputElement>('tester-opt-benchHud').checked).toBe(true);
    god.checked = true;
    god.dispatchEvent(new Event('change'));
    expect(r.session.options.godMode).toBe(true);
    expect(r.session.tickCheats().godMode).toBe(true);
    expect(status()).toBe('God mode (my team stays at full health): on.');
    expect(god.getAttribute('aria-describedby')).toBe('tester-opt-godMode-hint');
    expect(document.getElementById('tester-opt-godMode-hint')?.textContent).toMatch(/benched health/);
  });
});

describe('save edits (throwaway slot)', () => {
  it('lists the garrison heroes with their level once the save has loaded', async () => {
    const r = rig();
    r.open();
    await vi.waitFor(() => { expect(heroOptions()).toEqual(['Fiara (level 1)']); });
  });

  it('Level to 10 edits only the throwaway slot, reports it and refreshes the screen', async () => {
    const r = rig();
    r.open();
    await vi.waitFor(() => { expect(heroOptions()).toHaveLength(1); });
    $('tester-level-level-to-10').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalledTimes(1); });
    expect(r.slot().garrison[0]?.experience).toBe(20);
    expect(r.realSave().garrison[0]?.experience).toBe(1);
    expect(status()).toBe('Level to 10: done.');
    expect(heroOptions()).toEqual(['Fiara (level 10)']);
  });

  it('Advance chapter moves the throwaway slot on by one and leaves the real save alone', async () => {
    const r = rig();
    r.open();
    $('tester-advance-chapter').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalled(); });
    expect(r.slot().chapter).toBe(2);
    expect(r.realSave().chapter).toBe(1);
  });

  it('Add every race keeps the existing hero and adds the other races once', async () => {
    const r = rig();
    r.open();
    $('tester-add-races').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalled(); });
    const names = r.slot().garrison.map((g) => g.characterName);
    expect(names[0]).toBe('Fiara');
    expect(names.length).toBeGreaterThan(3);
    expect(new Set(names).size).toBe(names.length);
    expect(r.realSave().garrison).toHaveLength(1);
  });
});

describe('Full cheat', () => {
  it('applies the preset (keep stays off), ticks every box and fills the throwaway garrison', async () => {
    const r = rig();
    r.open();
    $('tester-full-cheat').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalled(); });
    expect(r.session.options).toEqual(FULL_CHEAT_OPTIONS);
    expect($<HTMLInputElement>('tester-opt-instantSwap').checked).toBe(true);
    expect($<HTMLInputElement>('tester-opt-keepProgress').checked).toBe(false);
    expect(r.slot().garrison.length).toBeGreaterThan(3);
    expect(r.realSave().garrison).toHaveLength(1);
  });

  it('runs immediately when the panel is opened with fullCheat', async () => {
    const r = rig();
    r.open(true);
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalled(); });
    expect(r.session.options.godMode).toBe(true);
    expect(status()).toBe('Full cheat: done.');
  });
});

describe('Keep cheat progress', () => {
  const toggle = (on: boolean): void => {
    const keep = $<HTMLInputElement>('tester-opt-keepProgress');
    keep.checked = on;
    keep.dispatchEvent(new Event('change'));
  };

  it('declining the overwrite confirm leaves the box off, the option off and the real save untouched', async () => {
    const r = rig(false);
    r.open();
    $('tester-advance-chapter').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalledTimes(1); });
    toggle(true);
    await Promise.resolve();
    expect(r.confirm).toHaveBeenCalledTimes(1);
    expect($<HTMLInputElement>('tester-opt-keepProgress').checked).toBe(false);
    expect(r.session.options.keepProgress).toBe(false);
    expect(r.realSave().chapter).toBe(1);
  });

  it('accepting copies the throwaway save over the real one and routes later edits to the real save', async () => {
    const r = rig(true);
    r.open();
    $('tester-advance-chapter').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalledTimes(1); });
    toggle(true);
    await vi.waitFor(() => { expect(r.session.options.keepProgress).toBe(true); });
    expect(r.realSave().chapter).toBe(2);
    expect(status()).toBe('Progress now goes to your real save.');
    $('tester-advance-chapter').click();
    await vi.waitFor(() => { expect(r.refresh).toHaveBeenCalledTimes(3); });
    expect(r.realSave().chapter).toBe(3);
  });

  it('turning it off again re-copies the real save into the throwaway slot', async () => {
    const r = rig(true);
    r.open();
    toggle(true);
    await vi.waitFor(() => { expect(r.session.options.keepProgress).toBe(true); });
    toggle(false);
    await vi.waitFor(() => { expect(r.session.options.keepProgress).toBe(false); });
    expect(r.session.slotText()).toBe(r.real.getItem(SAVE_KEY));
    expect(status()).toMatch(/throwaway slot/);
  });
});
