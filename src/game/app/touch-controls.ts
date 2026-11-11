import { el } from '@ui/dom';
import { getBindings } from '../platform/input/bindings';

/** Shared on-screen touch controls of the Arcade battle (Arcade Versus and the World Tour fight); DOM only, no Phaser. */

/**
 * Touch buttons, bottom-up on the right edge, 56 px apart: Super, Guard (hold), Dash, Weather and Charge (FUN-DESIGN 2.5, 2.7, 2.8,
 * 2.14, 2.17), in a tag team Tag (2.6: the first swap key) and in 3v3 Tag 2 (the second swap key, WP-arcade-3v3).
 */
export const TOUCH = ['Super', 'Guard', 'Dash', 'Weather', 'Charge', 'Tag', 'Tag2'] as const;
type TouchLabel = (typeof TOUCH)[number];
const TOUCH_KEY = { Super: 'super', Guard: 'guard', Dash: 'dash', Weather: 'weather', Charge: 'charge', Tag: 'slot3', Tag2: 'slot4' } as const;

/**
 * Pointer-only button over the arena for touch: it holds the first key bound to its action (the arena's keyboard agent
 * listens on window) for as long as the finger is down; an unbound action does nothing. Not in the Tab order: keyboards
 * press the key itself. Ids `arcadeSuper`, `arcadeGuard`, `arcadeDash`, `arcadeWeather`, `arcadeCharge`, `arcadeTag`, `arcadeTag2`.
 */
const coarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function touchButton(label: TouchLabel, row: number): HTMLButtonElement {
  const b = el('button', 'menuButton', label === 'Tag2' ? 'Tag 2' : label);
  b.type = 'button';
  b.id = `arcade${label}`;
  b.tabIndex = -1;
  // Touch: a column up the right edge (>= 48 px, safe areas). Mouse/keyboard: a compact row in the bottom band under the
  // walkable playfield (arcadePlayfield ends at y 640 of 720), so it never hides a fighter at the arena edge.
  b.style.cssText = coarsePointer()
    ? `position:absolute;right:max(8px,env(safe-area-inset-right));bottom:calc(max(8px,env(safe-area-inset-bottom)) + ${String(row * 56)}px);z-index:5;min-width:72px;min-height:48px;touch-action:none;opacity:.85`
    : `position:absolute;right:${String(4 + row * 68)}px;bottom:2px;z-index:5;width:64px;height:28px;min-height:0;padding:0;font-size:12px;touch-action:none;opacity:.7`;
  let code: string | undefined;
  const release = (): void => {
    if (code === undefined) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    code = undefined;
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (code !== undefined) return;
    code = getBindings()[TOUCH_KEY[label]][0];
    if (code === undefined) return;
    b.setPointerCapture(e.pointerId);
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, release);
  return b;
}

/** The buttons of a battle with this many heroes a side: Super, Guard, Dash, Weather, Charge, plus Tag (2 heroes) and Tag 2 (3). */
export function touchButtons(heroes: 1 | 2 | 3): HTMLButtonElement[] {
  return TOUCH.slice(0, heroes + 4).map(touchButton);
}
