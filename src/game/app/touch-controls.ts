import { el } from '@ui/dom';
import { ABILITIES_A, ABILITIES_B, CHARACTERS, GUARD_MAX, METER_BAR, WEATHER_CHARGE_FULL, WEATHER_RANGED_KINDS, type CharacterId, type RenderView } from '@core/index';
import { codeLabel, getBindings } from '../platform/input/bindings';

/** Shared on-screen touch controls of the Arcade battle (Arcade Versus and the World Tour fight); DOM only, no Phaser. */

/**
 * Touch buttons, bottom-up on the right edge, 56 px apart: Super, Guard (hold), Dash, Weather and Charge (FUN-DESIGN 2.5, 2.7, 2.8,
 * 2.14, 2.17), in a tag team Tag (2.6: the first swap key) and in 3v3 Tag 2 (the second swap key, WP-arcade-3v3), and last Trap
 * (WP 39), always there.
 */
export const TOUCH = ['Super', 'Guard', 'Dash', 'Weather', 'Charge', 'Tag', 'Tag2', 'Trap'] as const;
type TouchLabel = (typeof TOUCH)[number];
const TOUCH_KEY = { Super: 'super', Guard: 'guard', Dash: 'dash', Weather: 'weather', Charge: 'charge', Tag: 'slot3', Tag2: 'slot4', Trap: 'trap' } as const;
/**
 * The numbered action row (FUN-DESIGN 2.17): each button wears its number key, 3 Tag, 4 Tag 2, 5 Charge, 6 Weather, 7 Dash,
 * 8 Guard, 9 Super, 0 Trap. The numbers are fixed, so hiding Charge for a team without a melee hero never renumbers the others.
 */
export const TOUCH_DIGIT = { Super: 9, Guard: 8, Dash: 7, Weather: 6, Charge: 5, Tag: 3, Tag2: 4, Trap: 0 } as const;

/** The key shown on a button: its number while that number key is bound to the action, else the action's first key. */
export function touchKeyLabel(label: TouchLabel): string {
  const keys = getBindings()[TOUCH_KEY[label]];
  const digit = `Digit${String(TOUCH_DIGIT[label])}`;
  const first = keys[0];
  return keys.includes(digit) || first === undefined ? String(TOUCH_DIGIT[label]) : codeLabel(first);
}

/** True when the race's primary ability is melee: the rule the sim uses for Charge (not ranged: kind outside WEATHER_RANGED_KINDS). */
export function isMeleeRace(race: CharacterId): boolean {
  const def = CHARACTERS.find((c) => c.id === race);
  const kind = [...ABILITIES_A, ...ABILITIES_B].find((d) => d.id === def?.abilities[0])?.kind ?? '';
  return !WEATHER_RANGED_KINDS.includes(kind);
}

/**
 * Ready state in words (never colour alone) for a button, from the render view of team 0; '' when the view does not expose it
 * (no arcade read-outs, or no active hero). Super and Weather read their fill, Tag its swap cooldown, Dash and Charge their cooldown
 * in seconds ('ready' when up; Charge reads '' for a ranged hero, which has none), Guard its meter (a guard that is up reads 'guarding').
 */
export function touchStatus(label: TouchLabel, view: RenderView): string {
  const ar = view.arcade();
  if (label === 'Super') return fill(ar?.meter[0] ?? 0, METER_BAR);
  if (label === 'Weather') return fill(ar?.weatherCharge[0] ?? 0, WEATHER_CHARGE_FULL);
  if (label === 'Tag' || label === 'Tag2') {
    const bar = view.actionBar(0);
    if (!bar) return '';
    const left = Math.max(0, bar.swapReadyTick - bar.tick);
    return left === 0 ? 'ready' : `${String(Math.ceil(left / 50))}s`;
  }
  if (label === 'Dash' || label === 'Guard' || label === 'Charge') {
    const id = ar?.active(0) ?? -1;
    if (ar === undefined || id < 0) return '';
    if (label === 'Guard') return ar.guarding(id) ? 'guarding' : fill(ar.guard(id), GUARD_MAX);
    const left = label === 'Dash' ? ar.dashIn(id) : ar.chargeIn(id);
    return left < 0 ? '' : left === 0 ? 'ready' : `${String(Math.ceil(left / 50))}s`;
  }
  // Trap
  const t = view.actionBar(0)?.trap;
  if (!t) return '';
  const left = Math.max(0, t.readyTick - (view.actionBar(0)?.tick ?? 0));
  return left > 0 ? `${String(Math.ceil(left / 50))}s` : t.count >= t.max ? 'full' : 'ready';
}

function fill(v: number, full: number): string {
  return v >= full ? 'ready' : `${String(Math.floor((Math.min(v, full) * 100) / full))}%`;
}

/** The last text written to each button (see `setTouchText`). */
const written = new WeakMap<HTMLButtonElement, string>();

/** Writes a button's text, one left-aligned line each: the key (the icon is CSS, before it), the name, then the state when there is one. */
export function setTouchText(b: HTMLButtonElement, label: TouchLabel, status = ''): void {
  const name = label === 'Tag2' ? 'Tag 2' : label;
  const text = `${touchKeyLabel(label)}\n${name}`;
  // Only write what changed: rewriting identical text or a label makes screen readers re-announce the control.
  const shown = status === '' ? text : `${text}\n${status}`;
  if (written.get(b) === shown) return;
  written.set(b, shown);
  b.textContent = shown;
  // The visible key stays in the accessible name (WCAG 2.5.3 label in name): "9 Super, 40%".
  const spoken = `${touchKeyLabel(label)} ${name}`;
  b.setAttribute('aria-label', status === '' ? spoken : `${spoken}, ${status}`);
}

/**
 * The buttons in DOM order for `append`: Tab must follow the visual left-to-right, top-to-bottom order. Slot 0 (Super) sits lowest and
 * rightmost, the last slot (Trap) highest and leftmost, so the DOM order is the slot order reversed.
 */
export function inVisualOrder(buttons: readonly HTMLButtonElement[]): HTMLButtonElement[] {
  return [...buttons].reverse();
}

/** Refreshes the state words of `buttons` four times a second off `view`; stops once they leave the page. */
export function watchTouch(buttons: readonly HTMLButtonElement[], view: RenderView): void {
  const timer = setInterval(() => {
    if (buttons.every((b) => !b.isConnected)) {
      clearInterval(timer);
      return;
    }
    for (const b of buttons) {
      const label = TOUCH.find((l) => b.id === `arcade${l}`);
      if (label) setTouchText(b, label, touchStatus(label, view));
    }
  }, 250);
}

/** Shortest time a keyboard activation holds the action (about five sim ticks), so a quick tap is never a one-frame press. */
const MIN_KEY_HOLD_MS = 100;

/**
 * Button over the arena for touch: it holds the first key bound to its action (the arena's keyboard agent
 * listens on window) for as long as the finger is down; an unbound action does nothing. Focusable: Enter or Space
 * held does the same as a finger. Ids `arcadeSuper`, `arcadeGuard`, `arcadeDash`, `arcadeWeather`, `arcadeCharge`, `arcadeTag`, `arcadeTag2`, `arcadeTrap`.
 */
export function touchButton(label: TouchLabel, row: number): HTMLButtonElement {
  const b = el('button', 'menuButton');
  setTouchText(b, label);
  b.type = 'button';
  b.id = `arcade${label}`;
  // The icon beside the number is CSS (`.touchBtn-<label>::before` in main.css), so the text stays plain and the state words still update.
  // Layout, sizes and the high-contrast look are all CSS (`.touchBtn`, coarse and fine pointer rules); only the slot is inline.
  b.className = `menuButton touchBtn touchBtn-${label}`;
  b.style.cssText = `--touch-row:${String(row)}`;
  let code: string | undefined;
  // Pointer and keyboard hold the action separately: the key goes up only when neither is still holding it.
  let byPointer = false;
  let byKey = false;
  let keyDownAt = 0;
  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  const sync = (): void => {
    if (code === undefined || byPointer || byKey) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    code = undefined;
  };
  const press = (): boolean => {
    if (code === undefined) {
      code = getBindings()[TOUCH_KEY[label]][0];
      if (code === undefined) return false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    }
    return true;
  };
  const releasePointer = (): void => {
    byPointer = false;
    sync();
  };
  const releaseKey = (): void => {
    if (keyTimer !== undefined) clearTimeout(keyTimer);
    keyTimer = undefined;
    byKey = false;
    sync();
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (press()) {
      byPointer = true;
      b.setPointerCapture(e.pointerId);
    }
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, releasePointer);
  // Keyboard, switch and screen-reader users: Enter or Space holds the action like a finger does (same keydown, then keyup).
  // The real key event stops here so Enter or Space never reaches the arena's own bindings or fires a click. A quick tap is held at
  // least MIN_KEY_HOLD_MS, so the 50 Hz sim always sees the key down for a tick or more.
  const activation = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' ';
  b.addEventListener('keydown', (e) => {
    if (!activation(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || byKey) return;
    if (press()) {
      byKey = true;
      keyDownAt = Date.now();
    }
  });
  b.addEventListener('keyup', (e) => {
    if (!activation(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!byKey) return;
    const wait = MIN_KEY_HOLD_MS - (Date.now() - keyDownAt);
    if (wait > 0) keyTimer = setTimeout(releaseKey, wait);
    else releaseKey();
  });
  b.addEventListener('blur', () => {
    releasePointer();
    releaseKey();
  });
  return b;
}

/**
 * The buttons of a battle with this many heroes a side: Super, Guard, Dash, Weather, Charge, plus Tag (2 heroes) and Tag 2 (3), then Trap.
 * `melee` says whether each of the player's heroes is melee; when given and none is, Charge is left out (it is a melee-only
 * ability) and the rest close the gap, keeping their numbers.
 */
export function touchButtons(heroes: 1 | 2 | 3, melee?: readonly boolean[]): HTMLButtonElement[] {
  const noCharge = melee !== undefined && !melee.some(Boolean);
  return [...TOUCH.slice(0, heroes + 4).filter((l) => !(noCharge && l === 'Charge')), 'Trap' as const].map(touchButton);
}
