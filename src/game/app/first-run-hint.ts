import { el } from '@ui/dom';
import { codeLabel, getBindings, type Bindings, type GameAction } from '../platform/input/bindings';

/** First-run battle hint: a short, dismissible card shown in the first battle only (flag kept in localStorage, never the save). */

export const FIRST_RUN_KEY = 'tte.firstRunHint';
/** After this long the card fades and counts as seen; Got it marks it seen at once. */
export const FIRST_RUN_MS = 6000;

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

const key = (b: Bindings, a: GameAction): string => {
  const first = b[a][0];
  return first === undefined ? 'unbound' : codeLabel(first);
};

/** The hint text, from the live bindings. Words only; the numbered bar is described in Help. */
export function firstRunLines(b: Bindings): readonly string[] {
  return [
    'Move with the arrows or WASD; your hero faces the enemy on its own.',
    `Strike with ${key(b, 'slot1')}. Dash with ${key(b, 'dash')}; hold ${key(b, 'guard')} to Guard.`,
    `Fill the Super meter, then press ${key(b, 'super')}. Tag with ${key(b, 'slot3')} to send in a rested hero.`,
    `Stuck in a root or slow? Press ${key(b, 'cleanse')} to Cleanse.`,
  ];
}

/** The card, or null when it was already seen. */
export function firstRunHint(store: Store | undefined = defaultStore(), fadeMs = FIRST_RUN_MS): HTMLElement | null {
  if (firstRunSeen(store)) return null;
  const card = el('div', 'firstRunHint');
  card.id = 'firstRunHint';
  card.setAttribute('role', 'note');
  card.append(el('h2', undefined, 'First blood'));
  for (const line of firstRunLines(getBindings())) card.append(el('p', undefined, line));
  card.append(el('p', 'firstRunMore', 'Every key is listed under Help, Controls.'));
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
    fade();
  };
  const timer = window.setTimeout(fade, fadeMs);
  window.addEventListener('keydown', onInput, true);
  window.addEventListener('pointerdown', onInput, true);
  return card;
}
