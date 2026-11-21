import type { TouchLayout, TouchSide, TouchSize } from '../../game/platform/a11y/touch-layout';
import { el } from '../dom';

/** Device-local (not in the save): size and side of the on-screen action buttons; see `touch-layout.ts`. */
export function touchGroup(current: TouchLayout): HTMLElement {
  const set = el('fieldset', 'settingsGroup');
  set.append(el('legend', 'heading', 'On-screen buttons'));
  const add = (name: string, value: string, label: string, checked: boolean): void => {
    const row = el('label', 'settingsOption');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    row.append(input, ` ${label}`);
    set.append(row);
  };
  add('touchSize', 'auto', 'Size: automatic (large when a touch screen is present)', current.size === 'auto');
  add('touchSize', 'large', 'Size: large', current.size === 'large');
  add('touchSize', 'compact', 'Size: compact', current.size === 'compact');
  add('touchSide', 'right', 'Side: right', current.side === 'right');
  add('touchSide', 'left', 'Side: left (left-handed)', current.side === 'left');
  const hap = el('label', 'settingsOption');
  const box = el('input');
  box.type = 'checkbox';
  box.name = 'touchHaptics';
  box.checked = current.haptics;
  hap.append(box, ' Vibrate when a button is pressed (phones and tablets)');
  set.append(hap);
  return set;
}

/** True unless the device reports no coarse pointer at all (a desktop); unknown (no matchMedia) counts as touch-capable. */
export function hasTouchScreen(): boolean {
  try {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(any-pointer: coarse)').matches;
  } catch {
    return true;
  }
}

/** Reads the touch layout radios of the settings form (unknown values fall back to the defaults). */
export function readTouchForm(form: HTMLFormElement): TouchLayout {
  const data = new FormData(form);
  const size = data.get('touchSize');
  const side = data.get('touchSide');
  return {
    size: (size === 'large' || size === 'compact' ? size : 'auto') satisfies TouchSize,
    side: (side === 'left' ? 'left' : 'right') satisfies TouchSide,
    haptics: data.get('touchHaptics') !== null,
  };
}
