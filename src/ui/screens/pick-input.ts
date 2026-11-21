/**
 * Picker input for the two-player hero picker: keyboard and gamepad, mapped to side-based handlers.
 * Same rules as the arcade-versus onKey and pad poll: P1 WASD / Space / Q / E, P2 IJKL / U / O / P;
 * pad D-pad or stick moves, A(0) picks, B(1) cancels, Y(3) random, Start(9) fights; pads[0] is P1,
 * pads[1] is P2, edge-triggered. Escape leaves. Leaf module: no pick-model, no screen imports.
 */

export type Side = 0 | 1;

export interface PickInputHandlers {
  move(side: Side, dx: number, dy: number): void;
  pick(side: Side): void;
  cancel(side: Side): void;
  random(side: Side): void;
  fight(): void;
  escape(): void;
}

type Act = 'up' | 'down' | 'left' | 'right' | 'pick' | 'cancel' | 'random';

const KEYS: readonly Readonly<Record<string, Act>>[] = [
  { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right', Space: 'pick', KeyQ: 'cancel', KeyE: 'random' },
  { KeyI: 'up', KeyJ: 'left', KeyK: 'down', KeyL: 'right', KeyU: 'pick', KeyO: 'cancel', KeyP: 'random' },
];

const STICK = 0.6;
const BTN_A = 0;
const BTN_B = 1;
const BTN_Y = 3;
const BTN_START = 9;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

function isMove(a: Act): boolean {
  return a === 'up' || a === 'down' || a === 'left' || a === 'right';
}

function dispatch(h: PickInputHandlers, side: Side, a: Act): void {
  if (a === 'up') h.move(side, 0, -1);
  else if (a === 'down') h.move(side, 0, 1);
  else if (a === 'left') h.move(side, -1, 0);
  else if (a === 'right') h.move(side, 1, 0);
  else if (a === 'pick') h.pick(side);
  else if (a === 'cancel') h.cancel(side);
  else h.random(side);
}

function isFormTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

function makeKeyHandler(h: PickInputHandlers): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (isFormTarget(t)) return;
    if (e.code === 'Escape') {
      if (!e.repeat) h.escape();
      return;
    }
    for (const side of [0, 1] as const) {
      const a = KEYS[side]?.[e.code];
      if (!a) continue;
      // A focused button or link keeps Space: the native click does the pick.
      if (a === 'pick' && (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement)) return;
      e.preventDefault();
      if (e.repeat && !isMove(a)) return;
      dispatch(h, side, a);
      return;
    }
  };
}

function padStates(pad: Gamepad): [string, boolean][] {
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  const down = (b: number): boolean => pad.buttons[b]?.pressed === true;
  return [
    ['up', down(DPAD_UP) || ay < -STICK],
    ['down', down(DPAD_DOWN) || ay > STICK],
    ['left', down(DPAD_LEFT) || ax < -STICK],
    ['right', down(DPAD_RIGHT) || ax > STICK],
    ['pick', down(BTN_A)],
    ['cancel', down(BTN_B)],
    ['random', down(BTN_Y)],
    ['fight', down(BTN_START)],
  ];
}

function makePadPoll(h: PickInputHandlers): () => void {
  const held = new Map<string, boolean>();
  return () => {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const side of [0, 1] as const) {
      const pad = pads[side];
      if (!pad) continue;
      for (const [name, on] of padStates(pad)) {
        const k = `${String(side)}${name}`;
        if (on && held.get(k) !== true) {
          if (name === 'fight') h.fight();
          else dispatch(h, side, name as Act);
        }
        held.set(k, on);
      }
    }
  };
}

/** Start listening (document keydown plus a requestAnimationFrame pad poll). Returns off(). */
export function create(handlers: PickInputHandlers): () => void {
  const onKey = makeKeyHandler(handlers);
  const poll = makePadPoll(handlers);
  let live = true;
  let raf = 0;
  const tick = (): void => {
    if (!live) return;
    poll();
    raf = requestAnimationFrame(tick);
  };
  document.addEventListener('keydown', onKey);
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  return () => {
    live = false;
    document.removeEventListener('keydown', onKey);
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
  };
}
