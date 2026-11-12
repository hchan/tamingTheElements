import { el } from '@ui/dom';
import { ABILITIES_A, ABILITIES_B, CHARACTERS, METER_BAR, WEATHER_CHARGE_FULL, WEATHER_RANGED_KINDS, type CharacterId, type RenderView } from '@core/index';
import { codeLabel, getBindings } from '../platform/input/bindings';

/** Shared on-screen touch controls of the Arcade battle (Arcade Versus and the World Tour fight); DOM only, no Phaser. */

/**
 * Touch buttons, bottom-up on the right edge, 56 px apart: Super, Guard (hold), Dash, Weather and Charge (FUN-DESIGN 2.5, 2.7, 2.8,
 * 2.14, 2.17), in a tag team Tag (2.6: the first swap key) and in 3v3 Tag 2 (the second swap key, WP-arcade-3v3).
 */
export const TOUCH = ['Super', 'Guard', 'Dash', 'Weather', 'Charge', 'Tag', 'Tag2'] as const;
type TouchLabel = (typeof TOUCH)[number];
const TOUCH_KEY = { Super: 'super', Guard: 'guard', Dash: 'dash', Weather: 'weather', Charge: 'charge', Tag: 'slot3', Tag2: 'slot4' } as const;
/**
 * The numbered action row (FUN-DESIGN 2.17): each button wears its number key, 3 Tag, 4 Tag 2, 5 Charge, 6 Weather, 7 Dash,
 * 8 Guard, 9 Super. The numbers are fixed, so hiding Charge for a team without a melee hero never renumbers the others.
 */
export const TOUCH_DIGIT = { Super: 9, Guard: 8, Dash: 7, Weather: 6, Charge: 5, Tag: 3, Tag2: 4 } as const;

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
 * (Dash, Guard and Charge cooldowns are not read-outs yet). Super and Weather read their fill, Tag its swap cooldown.
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
  return '';
}

function fill(v: number, full: number): string {
  return v >= full ? 'ready' : `${String(Math.floor((Math.min(v, full) * 100) / full))}%`;
}

/** Writes a button's text: `5 Charge`, plus a second line with the state when there is one. */
export function setTouchText(b: HTMLButtonElement, label: TouchLabel, status = ''): void {
  const name = label === 'Tag2' ? 'Tag 2' : label;
  const text = `${touchKeyLabel(label)} ${name}`;
  b.textContent = status === '' ? text : `${text}\n${status}`;
  b.setAttribute('aria-label', status === '' ? name : `${name}, ${status}`);
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

/**
 * Button over the arena for touch: it holds the first key bound to its action (the arena's keyboard agent
 * listens on window) for as long as the finger is down; an unbound action does nothing. Focusable: Enter or Space
 * held does the same as a finger. Ids `arcadeSuper`, `arcadeGuard`, `arcadeDash`, `arcadeWeather`, `arcadeCharge`, `arcadeTag`, `arcadeTag2`.
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
  const release = (): void => {
    if (code === undefined) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    code = undefined;
  };
  const press = (): boolean => {
    if (code !== undefined) return false;
    code = getBindings()[TOUCH_KEY[label]][0];
    if (code === undefined) return false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    return true;
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (press()) b.setPointerCapture(e.pointerId);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, release);
  // Keyboard, switch and screen-reader users: Enter or Space holds the action like a finger does (same keydown, then keyup).
  // The real key event stops here so Enter or Space never reaches the arena's own bindings or fires a click.
  const activation = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' ';
  b.addEventListener('keydown', (e) => {
    if (!activation(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) press();
  });
  b.addEventListener('keyup', (e) => {
    if (!activation(e)) return;
    e.preventDefault();
    e.stopPropagation();
    release();
  });
  b.addEventListener('blur', release);
  return b;
}

/**
 * The buttons of a battle with this many heroes a side: Super, Guard, Dash, Weather, Charge, plus Tag (2 heroes) and Tag 2 (3).
 * `melee` says whether each of the player's heroes is melee; when given and none is, Charge is left out (it is a melee-only
 * ability) and the rest close the gap, keeping their numbers.
 */
export function touchButtons(heroes: 1 | 2 | 3, melee?: readonly boolean[]): HTMLButtonElement[] {
  const noCharge = melee !== undefined && !melee.some(Boolean);
  return TOUCH.slice(0, heroes + 4).filter((l) => !(noCharge && l === 'Charge')).map(touchButton);
}
