import {
  addEveryRace,
  fullGarrison,
  advanceChapterCheat,
  levelFromXp,
  levelHero,
  metaIdSource,
  seedSfc32,
  type ArenaCheat,
  type LevelEdit,
  type SaveV1,
} from '@core/menu-index';
import type { TesterAwareStore, TesterOptionKey, TesterSession } from '../../game/platform/tester/session';
import { el } from '../dom';

export interface PanelDeps {
  readonly session: TesterSession;
  readonly store: TesterAwareStore;
  readonly now: () => number;
  readonly confirm: (message: string) => boolean;
  /** Re-renders the current screen after a save edit. */
  readonly refresh: () => void;
}

interface OptionDef {
  readonly key: TesterOptionKey;
  readonly label: string;
  readonly hint: string;
}

export const OPTION_DEFS: readonly OptionDef[] = [
  { key: 'allAbilities', label: 'Unlock all abilities (Capture) in any chapter', hint: 'Applies to the next battle.' },
  { key: 'bigTeam', label: '3-hero team in any chapter (Swap available)', hint: 'Garrison lets you pick 1 to 3 heroes.' },
  { key: 'instantSwap', label: 'Instant swap (no swap cooldown)', hint: 'Zeroes the swap cooldown every tick.' },
  { key: 'godMode', label: 'God mode (my team stays at full health)', hint: 'Turn it off to watch benched health recover.' },
  { key: 'benchHud', label: 'Bench panel (health / max with rest cap)', hint: 'Shown during battle.' },
  { key: 'keepProgress', label: 'Keep cheat progress (write to my real save)', hint: 'Off: everything goes to a throwaway slot that ends with this tab.' },
];

/** Shown only while an Arcade battle is running; state edits outside the sim step, like God mode. */
export const ARCADE_OPTION_DEFS: readonly OptionDef[] = [
  { key: 'arcadeMeter', label: 'Arcade: full hyper meter', hint: 'Keeps your meter at three bars.' },
  { key: 'arcadeNoCooldowns', label: 'Arcade: no cooldowns', hint: 'Abilities, dash and weather are always ready.' },
];

const CHEATS: readonly { cheat: ArenaCheat; label: string }[] = [
  { cheat: 'myHp25', label: 'My HP to 25%' },
  { cheat: 'enemyHp25', label: 'Enemy HP to 25% (capture window)' },
  { cheat: 'win', label: 'I win (Shift-Q)' },
  { cheat: 'freezeEnemy', label: 'Freeze enemy (Shift-X)' },
  { cheat: 'captureWin', label: 'Capture win (Shift-C)' },
];

const LEVELS: readonly { label: string; edit: LevelEdit }[] = [
  { label: 'Level +1', edit: { by: 1 } },
  { label: 'Level to 5', edit: { to: 5 } },
  { label: 'Level to 10', edit: { to: 10 } },
  { label: 'Level to 15', edit: { to: 15 } },
];

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';

function button(label: string, id?: string): HTMLButtonElement {
  const b = el('button', 'menuButton', label);
  b.type = 'button';
  if (id !== undefined) b.id = id;
  return b;
}

let open: { close: () => void } | undefined;

export function isTesterPanelOpen(): boolean {
  return open !== undefined;
}

export function closeTesterPanel(): void {
  open?.close();
}

/** Opens the tester panel (modal DOM). Escape or Close dismisses it and returns focus to where it came from. */
export function openTesterPanel(deps: PanelDeps): void {
  if (open) return;
  const { session, store } = deps;
  const returnTo = document.activeElement;
  const backdrop = el('div', 'testerBackdrop');
  backdrop.id = 'testerPanelBackdrop';
  const box = el('div', 'testerPanel');
  box.id = 'testerPanel';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'testerPanelTitle');
  const title = el('h2', undefined, 'Tester options');
  title.id = 'testerPanelTitle';
  const warn = el('p', 'testerWarn', 'TESTER MODE is on. These cheats are for playtesting only.');
  const status = el('p', 'settingsStatus');
  status.id = 'testerStatus';
  status.setAttribute('role', 'status');

  const inputs = new Map<TesterOptionKey, HTMLInputElement>();
  const addRow = (parent: HTMLElement, def: OptionDef): void => {
    const row = el('div', 'settingsOption');
    const input = el('input');
    input.type = 'checkbox';
    input.id = `tester-opt-${def.key}`;
    input.checked = session.options[def.key];
    input.setAttribute('aria-describedby', `${input.id}-hint`);
    const label = el('label', undefined, def.label);
    label.htmlFor = input.id;
    const hint = el('div', 'info', def.hint);
    hint.id = `${input.id}-hint`;
    row.append(input, ' ', label, hint);
    parent.append(row);
    inputs.set(def.key, input);
    input.addEventListener('change', () => {
      if (def.key === 'keepProgress') {
        void changeKeep(input);
        return;
      }
      session.setOption(def.key, input.checked);
      status.textContent = `${def.label}: ${input.checked ? 'on' : 'off'}.`;
    });
  };

  const options = el('fieldset', 'settingsGroup');
  options.append(el('legend', 'heading', 'Options'));
  const fullBtn = button('Full cheat (everything on, full garrison at level 15)', 'tester-full-cheat');
  options.append(fullBtn);
  for (const def of OPTION_DEFS) addRow(options, def);
  const arcadeBox = el('fieldset', 'settingsGroup');
  arcadeBox.id = 'testerArcadeOptions';
  arcadeBox.append(el('legend', 'heading', 'Arcade battle'));
  for (const def of ARCADE_OPTION_DEFS) addRow(arcadeBox, def);

  /** Turning "keep" on copies the throwaway slot over the real save (after a confirm); off re-copies the real save. */
  const changeKeep = async (input: HTMLInputElement): Promise<void> => {
    if (input.checked) {
      const ok = deps.confirm('Keep cheat progress? This overwrites your real save with the tester session save.');
      if (!ok) {
        input.checked = false;
        return;
      }
      const text = session.slotText();
      if (text !== null) {
        const r = await store.real.importJson(text);
        if (!r.ok) {
          input.checked = false;
          status.textContent = `Could not write your real save: ${JSON.stringify(r.error)}`;
          return;
        }
      }
      session.setOption('keepProgress', true);
      status.textContent = 'Progress now goes to your real save.';
    } else {
      session.reseed();
      session.setOption('keepProgress', false);
      status.textContent = 'Back to the throwaway slot (copied from your real save).';
    }
    deps.refresh();
  };

  const match = el('fieldset', 'settingsGroup');
  match.append(el('legend', 'heading', 'In this battle'));
  const matchNote = el('p', 'info');
  const cheatButtons: HTMLButtonElement[] = [];
  for (const c of CHEATS) {
    const b = button(c.label, `tester-cheat-${c.cheat}`);
    b.addEventListener('click', () => {
      session.arena?.cheat(c.cheat);
      status.textContent = `${c.label}: done.`;
    });
    cheatButtons.push(b);
    match.append(b);
  }
  match.append(matchNote);

  const saveBox = el('fieldset', 'settingsGroup');
  saveBox.append(el('legend', 'heading', 'Hero and save'));
  const hero = el('select');
  hero.id = 'testerHero';
  hero.setAttribute('aria-label', 'Hero to level');
  saveBox.append(hero, el('div'));

  const fillHeroes = (save: SaveV1 | null): void => {
    hero.replaceChildren();
    (save?.garrison ?? []).forEach((g, i) => {
      const o = el('option', undefined, `${g.characterName} (level ${String(levelFromXp(g.experience))})`);
      o.value = String(i);
      hero.append(o);
    });
  };
  const reload = async (): Promise<SaveV1 | null> => {
    const r = await store.load();
    const save = r.ok ? r.value : null;
    fillHeroes(save);
    return save;
  };
  /** Applies a pure save edit to the active save (the throwaway slot unless "keep" is on) and refreshes the screen. */
  const edit = async (label: string, fn: (save: SaveV1) => SaveV1): Promise<void> => {
    const r = await store.load();
    if (!r.ok) {
      status.textContent = `Could not read the save: ${JSON.stringify(r.error)}`;
      return;
    }
    const w = await store.save(fn(r.value));
    status.textContent = w.ok ? `${label}: done.` : `Could not write the save: ${JSON.stringify(w.error)}`;
    await reload();
    deps.refresh();
  };
  for (const l of LEVELS) {
    const b = button(l.label, `tester-level-${l.label.replace(/\W+/g, '-').toLowerCase()}`);
    b.addEventListener('click', () => {
      void edit(l.label, (s) => levelHero(s, Number(hero.value), l.edit));
    });
    saveBox.append(b);
  }
  const advance = button('Advance chapter', 'tester-advance-chapter');
  advance.addEventListener('click', () => {
    void edit('Advance chapter', advanceChapterCheat);
  });
  const races = button('Add every race to the garrison', 'tester-add-races');
  races.addEventListener('click', () => {
    const now = deps.now();
    void edit('Add every race', (s) => addEveryRace(s, now, metaIdSource(seedSfc32(now >>> 0, 'meta'))));
  });
  saveBox.append(advance, races);
  fullBtn.addEventListener('click', () => {
    // Keep stays off: if it was on, go back to the throwaway slot (re-copied from the real save) before editing anything.
    if (session.options.keepProgress) session.reseed();
    session.applyFullCheat();
    for (const [key, input] of inputs) input.checked = session.options[key];
    const now = deps.now();
    void edit('Full cheat', (sv) => fullGarrison(sv, now, metaIdSource(seedSfc32(now >>> 0, 'meta'))));
  });

  const close = button('Close', 'testerClose');
  const turnOff = button('Turn tester mode off', 'testerOff');

  box.append(title, warn, options, arcadeBox, match, saveBox, status, close, turnOff);
  backdrop.append(box);
  document.body.append(backdrop);

  const syncArena = (): void => {
    const live = session.arena !== undefined;
    for (const b of cheatButtons) b.disabled = !live;
    arcadeBox.hidden = session.arena?.arcade !== true;
    matchNote.textContent = live ? 'Acts on the battle that is running.' : 'Start a battle to use these.';
  };
  const offSub = session.subscribe(syncArena);
  syncArena();
  void reload();

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at < 0 || at >= items.length - 1 ? 0 : at + 1;
    e.preventDefault();
    e.stopPropagation();
    items[next]?.focus();
  };
  // Capture phase on window: the pause dialog's own Escape (resume) must not also fire while this panel is on top.
  window.addEventListener('keydown', onKey, true);

  function done(): void {
    window.removeEventListener('keydown', onKey, true);
    offSub();
    backdrop.remove();
    open = undefined;
    if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
  }
  close.addEventListener('click', done);
  turnOff.addEventListener('click', () => {
    done();
    session.disable();
    deps.refresh();
  });
  open = { close: done };
  close.focus();
}
