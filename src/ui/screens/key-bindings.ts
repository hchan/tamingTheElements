import { migrate, newEmptyState, type SaveV1 } from '@core/menu-index';
import {
  ACTION_LABELS,
  GAME_ACTIONS,
  SF_PRESET_BINDINGS,
  SLOTS_PER_ACTION,
  bindSteal,
  bindingsToSave,
  clearAlternate,
  codeLabel,
  parseBindings,
  resetBindings,
  setBindings,
  tryBind,
  type Bindings,
  type GameAction,
} from '../../game/platform/input/bindings';
import type { SaveStore } from '../../game/platform/storage/save-store';
import { el } from '../dom';
import type { PadSection } from './pad-bindings-section';
import type { Screen } from './screen';

export interface KeyBinding {
  readonly action: string;
  readonly keys: readonly string[];
}

/** Player-facing system keys; debug cheats (I Win, Freeze, CaptureWin) are deliberately omitted. */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { action: 'Toggle Pause', keys: ['SHIFT-P', 'ESCAPE (in the pause dialog)', 'GAMEPAD START'] },
  { action: 'Toggle Mute', keys: ['CTRL-M'] },
  { action: 'Back (menus)', keys: ['ESCAPE'] },
];

export function formatKeys(keys: readonly string[]): string {
  return keys.join(' or ');
}

const STORAGE_KEY = 'Taming the Elements';

/** Pure: the save with the bindings written (or removed when they equal the defaults). */
export function saveWithBindings(save: SaveV1, bindings: Bindings): SaveV1 {
  const next: SaveV1 = { ...save };
  delete next.keyBindings;
  const stored = bindingsToSave(bindings);
  return stored === undefined ? next : { ...next, keyBindings: stored };
}

/** Bindings stored in a save, sanitised; the defaults when absent. */
export function bindingsFromSave(save: SaveV1 | null): Bindings {
  return parseBindings(save?.keyBindings);
}

function readLocal(): SaveV1 {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    const r = migrate(text === null ? null : (JSON.parse(text) as unknown));
    return r.ok ? r.value : newEmptyState();
  } catch {
    return newEmptyState();
  }
}

async function persist(store: SaveStore | undefined, bindings: Bindings): Promise<void> {
  if (store) {
    const r = await store.load();
    if (r.ok) await store.save(saveWithBindings(r.value, bindings));
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saveWithBindings(readLocal(), bindings)));
  } catch {
    /* storage unavailable: the bindings still apply for this session */
  }
}

type Capture = { action: GameAction; slot: number } | null;

export function keyBindingsScreen(store?: SaveStore): Screen {
  let node: HTMLElement | null = null;
  let stopCapture: (() => void) | null = null;
  let padSection: PadSection | null = null;
  return {
    mount(container) {
      let bindings = bindingsFromSave(readLocal());
      setBindings(bindings);
      let capture: Capture = null;
      const page = el('div', 'menuPage');
      node = page;
      page.append(el('h1', 'heading', 'Key Bindings'));
      page.append(
        el(
          'p',
          undefined,
          'Choose an action key to change it, then press the new key. Escape cancels; Backspace clears an alternate key.',
        ),
      );
      const status = el('div', 'menuStatus');
      status.setAttribute('role', 'status');
      const table = el('table', 'keyBindingTable');
      const caption = el('caption', undefined, 'Game controls');
      caption.className = 'srOnly';
      table.append(caption);
      const head = el('tr');
      for (const h of ['Action', 'Key', 'Alternate key']) {
        const th = el('th', undefined, h);
        th.scope = 'col';
        head.append(th);
      }
      const thead = el('thead');
      thead.append(head);
      table.append(thead);
      const body = el('tbody');
      table.append(body);

      const save = (): void => {
        setBindings(bindings);
        void persist(store, bindings);
      };

      const render = (): void => {
        body.replaceChildren();
        for (const action of GAME_ACTIONS) {
          if (action === 'capture') continue;
          const tr = el('tr');
          const th = el('th', undefined, ACTION_LABELS[action]);
          th.scope = 'row';
          tr.append(th);
          for (let slot = 0; slot < SLOTS_PER_ACTION; slot++) {
            const code = bindings[action][slot];
            const btn = el('button', 'menuButton', code === undefined ? 'None' : codeLabel(code));
            btn.type = 'button';
            btn.id = `bind-${action}-${String(slot)}`;
            btn.setAttribute(
              'aria-label',
              `${ACTION_LABELS[action]}, ${slot === 0 ? 'key' : 'alternate key'}: ${code === undefined ? 'none' : codeLabel(code)}. Activate to change.`,
            );
            btn.addEventListener('click', () => {
              startCapture(action, slot, btn);
            });
            const td = el('td');
            td.append(btn);
            tr.append(td);
          }
          body.append(tr);
        }
      };

      const finish = (focusId: string | null): void => {
        stopCapture?.();
        stopCapture = null;
        capture = null;
        render();
        if (focusId !== null) document.getElementById(focusId)?.focus();
      };

      const startCapture = (action: GameAction, slot: number, btn: HTMLElement): void => {
        stopCapture?.();
        capture = { action, slot };
        btn.textContent = 'Press a key...';
        btn.classList.add('keyCapturing');
        status.textContent = `Press the new key for ${ACTION_LABELS[action]}. Escape cancels.`;
        const id = btn.id;
        const onKey = (e: KeyboardEvent): void => {
          // Tab leaves capture mode and moves focus on as usual, so the capture is never a keyboard trap.
          if (e.code === 'Tab') {
            finish(null);
            return;
          }
          // Capture phase: nothing else (router Escape, game keys) may react while a key is being chosen.
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat || capture === null) return;
          if (e.code === 'Escape') {
            status.textContent = 'Cancelled.';
            finish(id);
            return;
          }
          if ((e.code === 'Backspace' || e.code === 'Delete') && capture.slot > 0) {
            bindings = clearAlternate(bindings, capture.action);
            save();
            status.textContent = `${ACTION_LABELS[capture.action]} alternate key cleared.`;
            finish(id);
            return;
          }
          const r = tryBind(bindings, capture.action, capture.slot, e.code);
          if (r.ok) {
            bindings = r.bindings;
            save();
            status.textContent = `${ACTION_LABELS[capture.action]} is now ${codeLabel(e.code)}.`;
            finish(id);
          } else if (r.reason === 'reserved') {
            status.textContent = `${codeLabel(e.code) || 'That key'} cannot be used. Press another key, or Escape to cancel.`;
          } else {
            // Conflict: say so, and offer to move the key instead of silently stealing it.
            const { action: a, slot: sl } = capture;
            const owner = ACTION_LABELS[r.with];
            status.textContent = `${codeLabel(e.code)} is already used by ${owner}.`;
            const move = el('button', 'menuButton', `Move ${codeLabel(e.code)} to ${ACTION_LABELS[a]}`);
            move.type = 'button';
            move.addEventListener('click', () => {
              bindings = bindSteal(bindings, a, sl, e.code);
              save();
              status.textContent = `${ACTION_LABELS[a]} is now ${codeLabel(e.code)}; ${owner} lost that key.`;
              move.remove();
              finish(id);
            });
            status.append(' ', move);
            finish(null);
            move.focus();
          }
        };
        window.addEventListener('keydown', onKey, true);
        stopCapture = () => {
          window.removeEventListener('keydown', onKey, true);
        };
      };

      const reset = el('button', 'menuButton', 'Reset to defaults');
      reset.type = 'button';
      reset.id = 'resetBindings';
      reset.addEventListener('click', () => {
        bindings = resetBindings();
        save();
        status.textContent = 'Key bindings reset to defaults.';
        finish(null);
      });

      const sf = el('button', 'menuButton', 'Fighting-game layout (J K L, U I O)');
      sf.type = 'button';
      sf.id = 'presetFighting';
      sf.addEventListener('click', () => {
        bindings = SF_PRESET_BINDINGS;
        save();
        status.textContent = 'Fighting-game layout applied: attacks on J K L and U I O. Reset to defaults brings the number keys back.';
        finish(null);
      });

      const system = el('table', 'keyBindingTable');
      const sysCaption = el('caption', undefined, 'Fixed keys');
      sysCaption.className = 'srOnly';
      system.append(sysCaption);
      for (const b of KEY_BINDINGS) {
        const tr = el('tr');
        const th = el('th', undefined, b.action);
        th.scope = 'row';
        tr.append(th, el('td', undefined, formatKeys(b.keys)));
        system.append(tr);
      }
      // Lazy: the gamepad section is its own chunk, fetched when this screen opens (keeps the menu entry small).
      const padSlot = el('div');
      void import('./pad-bindings-section').then((m) => {
        if (!padSlot.isConnected) return;
        padSection = m.padBindingsSection();
        padSlot.append(padSection.node);
      }, () => undefined);

      const back = el('a', 'menuLink', 'Back');
      back.setAttribute('href', '#main');
      page.append(table, sf, ' ', reset, status, el('h2', undefined, 'Other controls'), system, padSlot, back);
      render();
      container.append(page);
    },
    unmount() {
      padSection?.dispose();
      padSection = null;
      stopCapture?.();
      stopCapture = null;
      node?.remove();
      node = null;
    },
  };
}
