import { el } from '../dom';
import type { Screen } from './screen';

export interface KeyBinding {
  readonly action: string;
  readonly keys: readonly string[];
}

/** Player-facing bindings only; debug cheats (I Win, Freeze, CaptureWin) are deliberately omitted. */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { action: 'Primary Ability', keys: ['SPACE', '1'] },
  { action: 'Secondary Ability', keys: ['ENTER', '2'] },
  { action: 'Capture', keys: ['3'] },
  { action: 'Swap 1', keys: ['4'] },
  { action: 'Swap 2', keys: ['5'] },
  { action: 'Toggle Pause', keys: ['SHIFT-P'] },
  { action: 'Toggle Mute', keys: ['CTRL-M'] },
];

export function formatKeys(keys: readonly string[]): string {
  return keys.join(' or ');
}

export function keyBindingsScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      node.append(el('div', 'heading', 'Key Bindings'));
      const table = el('table', 'keyBindingTable');
      for (const b of KEY_BINDINGS) {
        const tr = el('tr');
        tr.append(el('td', undefined, b.action), el('td', undefined, formatKeys(b.keys)));
        table.append(tr);
      }
      node.append(table);
      const back = el('a', 'menuLink', 'Back');
      back.setAttribute('href', '#main');
      node.append(back);
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
