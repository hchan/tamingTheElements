import type Phaser from 'phaser';
import { PRELOAD_READY } from '../scenes/launch';
import { el } from '@ui/dom';
import { ARCADE_SNAG_SLOT } from '@core/index';
import { actionKeyLabel, codeLabel, getBindings, type Bindings, type GameAction } from '../platform/input/bindings';

/** First-run battle hint: a short, dismissible card shown in the first battle only (flag kept in localStorage, never the save). */

export const FIRST_RUN_KEY = 'tte.firstRunHint';
/** After this long the card fades and counts as seen; Got it marks it seen at once. */
export const FIRST_RUN_MS = 4000;
/** Windows this short or shorter get the compact card (smaller text, no footer line). */
export const COMPACT_BELOW = 800;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function firstRunSeen(store: Store | undefined = defaultStore()): boolean {
  try {
    return store?.getItem(FIRST_RUN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(store: Store | undefined): void {
  try {
    store?.setItem(FIRST_RUN_KEY, '1');
  } catch {
    /* private mode: the hint just shows again next time */
  }
}

/** The key as the action bar labels it (one source: `actionKeyLabel`), so the card and the bar agree. */
const key = (b: Bindings, a: GameAction): string => actionKeyLabel(b, a) ?? 'unbound';

/** The action-bar key, plus the other key bound to the same action when there is one ("1 or Space"), so the card and the Versus key list read the same. */
function keyAlso(b: Bindings, a: GameAction): string {
  const main = key(b, a);
  const others = b[a].map(codeLabel).filter((l) => l !== main);
  return others.length === 0 ? main : `${main} or ${others.join('/')}`;
}

/** The four move keys as bound (every key of an action, so the default reads "W, Up ..."), in up, left, down, right order. */
const moveKeys = (b: Bindings): string =>
  (['up', 'left', 'down', 'right'] as const).map((a) => (b[a].length === 0 ? 'unbound' : b[a].map(codeLabel).join('/'))).join(', ');

/** True on a touch-first device (coarse primary pointer), where there is no keyboard to name. */
export function isTouchFirst(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** True when any of these heroes carries the Snag rope (only some do), so the card names Snag only for a side that can throw it. */
export function anySnag(heroes: readonly string[]): boolean {
  return heroes.some((h) => ARCADE_SNAG_SLOT[h] !== undefined);
}

/** The touch Snag line: its own paragraph so the slim landscape strip can keep it (class firstRunSnag). */
const SNAG_TOUCH_LINE = 'Tap the Snag box to root the foe.';

/** The hint text, from the live bindings (keyboard) or the on-screen controls (touch). Words only; the numbered bar is described in Help. */
export function firstRunLines(b: Bindings, touch = false, snag = true, snagSlot?: number): readonly string[] {
  if (touch) {
    return [
      'Drag the stick to move in eight directions; your hero faces the enemy on its own. Hold a direction to aim by hand.',
      'Tap the buttons to strike, Dash, Guard (hold) and fire your Super once its meter is full.',
      'Tap Tag to send in a rested hero, and Cleanse to shake off a root or slow.',
      ...(snag ? [SNAG_TOUCH_LINE] : []),
    ];
  }
  // The hero's own Snag box holds the rope: the strike or special key that is Snag is named as Snag (never "Strike"), and C works too.
  const snagKey = (a: GameAction): string => `${key(b, 'capture')} or ${key(b, a)}`;
  const rope = snag ? `Snag with ${snagSlot === 0 ? snagKey('slot1') : snagSlot === 1 ? snagKey('slot2') : key(b, 'capture')} to root the foe. ` : '';
  const strike = snag && snagSlot === 0 ? `Strike with ${keyAlso(b, 'slot2')}. ` : snag && snagSlot === 1 ? `Strike with ${keyAlso(b, 'slot1')}. ` : `Strike with ${keyAlso(b, 'slot1')}. Special with ${keyAlso(b, 'slot2')}. `;
  return [
    `Move with ${moveKeys(b)}; your hero faces the enemy on its own. Hold a direction to aim by hand.`,
    `${strike}${rope}Dash with ${key(b, 'dash')}; hold ${key(b, 'guard')} to Guard.`,
    `Fill the Super meter, then press ${key(b, 'super')}. Tag with ${key(b, 'slot3')} to send in a rested hero; press ${key(b, 'cleanse')} to Cleanse a root or slow.`,
  ];
}

/** True while the portrait "rotate your device" overlay covers the arena (the card stays hidden and untimed until it is dismissed). */
function rotateBlocked(): boolean {
  const o = typeof document === 'undefined' ? null : document.getElementById('rotateOverlay');
  return o !== null && !o.hidden;
}

/** `whenReady` for a real game: runs `go` once the Arena scene has built the arena (after the loading screen, never over it). */
export function afterArenaCreate(game: object): (go: () => void) => void {
  return (go) => {
    // A stand-in game without scenes (unit tests) shows the card at once.
    const g = game as Partial<Phaser.Game>;
    if (!g.scene || !g.events) {
      go();
      return;
    }
    // The Arena starts only after Preload finishes, by which time every scene is registered.
    g.events.once(PRELOAD_READY, () => {
      const scene = g.scene?.getScene('Arena') as Phaser.Scene | null | undefined;
      // Status 4 = CREATING, 5 = RUNNING: the arena is already being built, so its 'create' event may have fired.
      if (scene && scene.sys.settings.status < 4) scene.events.once('create', go);
      else go();
    });
  };
}

/** The card, or null when it was already seen. */
export function firstRunHint(
  store: Store | undefined = defaultStore(),
  fadeMs = FIRST_RUN_MS,
  /** Calls its argument once the arena exists (the card must not sit over the loading screen); default: now. */
  whenReady: (go: () => void) => void = (go) => { go(); },
  /** False when none of the player's heroes has Snag: the card then leaves the Snag line out. */
  snag = true,
  /** Which ability box (0 or 1) of the player's first hero holds Snag, so the card names that key as Snag, not Strike. */
  snagSlot?: number,
): HTMLElement | null {
  if (firstRunSeen(store)) return null;
  const card = el('div', 'firstRunHint');
  card.id = 'firstRunHint';
  card.setAttribute('role', 'note');
  card.append(el('h2', undefined, 'First blood'));
  for (const line of firstRunLines(getBindings(), isTouchFirst(), snag, snagSlot)) card.append(el('p', line === SNAG_TOUCH_LINE ? 'firstRunSnag' : undefined, line));
  // On a short window (1280x720) the card shrinks and drops its footer so it ends above the hero's wings instead of covering them.
  const short = typeof window !== 'undefined' && window.innerHeight <= COMPACT_BELOW;
  if (short && window.innerHeight > 500) card.style.fontSize = '11px';
  if (!short) card.append(el('p', 'firstRunMore', isTouchFirst() ? 'The controls are explained under Help.' : 'Every key is listed under Help, Controls.'));
  const done = el('button', 'firstRunDone', 'Got it');
  done.setAttribute('type', 'button');
  done.addEventListener('click', () => {
    window.clearTimeout(timer);
    window.removeEventListener('keydown', onInput, true);
    window.removeEventListener('pointerdown', onInput, true);
    markSeen(store);
    card.remove();
  });
  card.append(done);
  // The card gets out of the way on its own: after the delay, or at the first move or tap (a held key is a move).
  // It is a wide, low strip centred just above the action bar, so it never sits on a fighter at round start.
  // A detached node is harmless, so the timer needs no cleanup; the listeners remove themselves.
  const fade = (): void => {
    window.clearTimeout(timer);
    window.removeEventListener('keydown', onInput, true);
    window.removeEventListener('pointerdown', onInput, true);
    markSeen(store);
    card.classList.add('firstRunFade');
  };
  const onInput = (e: Event): void => {
    // Tab, Escape and modifier keys alone are not a move; a click on Got it is handled by the button.
    if (e instanceof KeyboardEvent && (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')) return;
    if (e.target instanceof Node && card.contains(e.target)) return;
    // A tap on the rotate overlay (Play anyway) is not the player's first move in the arena.
    if (rotateBlocked()) return;
    fade();
  };
  let timer = 0;
  card.classList.add('firstRunWait');
  whenReady(() => {
    card.classList.remove('firstRunWait');
    // The fade clock starts once the rotate overlay (if any) is gone, so the card is never timed out unseen behind it.
    const arm = (): void => {
      timer = window.setTimeout(rotateBlocked() ? arm : fade, rotateBlocked() ? 250 : fadeMs);
    };
    arm();
    window.addEventListener('keydown', onInput, true);
    window.addEventListener('pointerdown', onInput, true);
  });
  return card;
}
