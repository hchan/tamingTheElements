import { el } from '@ui/dom';
import { touchHaptic } from '../platform/a11y/touch-layout';
import { getBindings } from '../platform/input/bindings';

/** Virtual move stick for touch screens (DOM only, presentation/input layer): holds the bound move keys like a keyboard, 8-way. */

export type StickDir = { readonly left: boolean; readonly right: boolean; readonly up: boolean; readonly down: boolean };
export const STICK_NONE: StickDir = { left: false, right: false, up: false, down: false };

/** Fraction of the radius inside which nothing is held. */
export const STICK_DEADZONE = 0.3;
/** tan(22.5 degrees): the edge between a cardinal and a diagonal 45 degree sector. */
const TAN_22_5 = 0.4142;

/** Pure: the held directions for a finger offset (dx, dy in px, y down) on a stick of `radius` px; 8 sectors of 45 degrees, no trig. */
export function stickDir(dx: number, dy: number, radius: number): StickDir {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.hypot(ax, ay) < radius * STICK_DEADZONE) return STICK_NONE;
  const horizontal = ay <= ax * TAN_22_5; // mostly sideways
  const vertical = ax <= ay * TAN_22_5;
  return {
    left: dx < 0 && !vertical,
    right: dx > 0 && !vertical,
    up: dy < 0 && !horizontal,
    down: dy > 0 && !horizontal,
  };
}

const AXES = ['left', 'right', 'up', 'down'] as const;

/**
 * The stick element `#touchStick` (base ring plus `#touchStickKnob`). A finger on it holds the first key bound to each direction
 * (keydown on window, as the arena's keyboard agent listens there); it releases on lift, cancel, blur or removal. Hidden by CSS unless
 * the primary pointer is coarse.
 */
export function touchStick(): HTMLElement {
  const base = el('div', 'touchStick');
  base.id = 'touchStick';
  base.setAttribute('role', 'group');
  base.setAttribute('aria-label', 'Move stick: drag to move in 8 directions');
  const knob = el('div', 'touchStickKnob');
  knob.id = 'touchStickKnob';
  base.append(knob);
  const held = new Map<string, string>();
  let pointer: number | undefined;
  const apply = (d: StickDir): void => {
    for (const a of AXES) {
      const code = held.get(a);
      if (d[a] && code === undefined) {
        const first = getBindings()[a][0];
        if (first === undefined) continue;
        held.set(a, first);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: first }));
      } else if (!d[a] && code !== undefined) {
        held.delete(a);
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      }
    }
  };
  const release = (): void => {
    pointer = undefined;
    apply(STICK_NONE);
    knob.style.transform = '';
    base.dataset['active'] = 'false';
  };
  const move = (e: PointerEvent): void => {
    const r = base.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = e.clientX - (r.left + radius);
    const dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const k = len > radius ? radius / len : 1;
    knob.style.transform = `translate(${String(Math.round(dx * k))}px, ${String(Math.round(dy * k))}px)`;
    apply(stickDir(dx, dy, radius));
  };
  base.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (pointer !== undefined) return;
    pointer = e.pointerId;
    base.dataset['active'] = 'true';
    base.setPointerCapture(e.pointerId);
    touchHaptic();
    move(e);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) move(e);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    base.addEventListener(t, (e) => {
      if (pointer === undefined || (e as PointerEvent).pointerId === pointer) release();
    });
  }
  window.addEventListener('blur', release);
  // A stick removed mid-drag gets no pointerup: let go of the keys.
  const watch = setInterval(() => {
    if (!base.isConnected) {
      clearInterval(watch);
      window.removeEventListener('blur', release);
      release();
    }
  }, 250);
  return base;
}
