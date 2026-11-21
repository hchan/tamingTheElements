import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, type PickInputHandlers } from './pick-input';

interface Pad {
  axes: number[];
  buttons: { pressed: boolean }[];
}
const mkPad = (): Pad => ({ axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) });
const press = (p: Pad, b: number, on: boolean): void => {
  const btn = p.buttons[b];
  if (btn) btn.pressed = on;
};

let calls: string[];
let off: () => void;
let frames: (() => void)[];
let pads: (Pad | null)[];

const handlers = (): PickInputHandlers => ({
  move: (s, dx, dy) => calls.push(`move${String(s)}:${String(dx)},${String(dy)}`),
  pick: (s) => calls.push(`pick${String(s)}`),
  cancel: (s) => calls.push(`cancel${String(s)}`),
  random: (s) => calls.push(`random${String(s)}`),
  fight: () => calls.push('fight'),
  escape: () => calls.push('escape'),
});

function key(code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}
const frame = (): void => {
  frames.shift()?.();
};

beforeEach(() => {
  calls = [];
  frames = [];
  pads = [null, null];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
  off = create(handlers());
});
afterEach(() => {
  off();
  vi.unstubAllGlobals();
});

describe('pick-input keys', () => {
  it('maps P1 keys', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyQ', 'KeyE']) key(c);
    expect(calls).toEqual(['move0:0,-1', 'move0:-1,0', 'move0:0,1', 'move0:1,0', 'pick0', 'cancel0', 'random0']);
  });
  it('maps P2 keys', () => {
    for (const c of ['KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyO', 'KeyP']) key(c);
    expect(calls).toEqual(['move1:0,-1', 'move1:-1,0', 'move1:0,1', 'move1:1,0', 'pick1', 'cancel1', 'random1']);
  });
  it('Escape goes to the menu once, not on repeat', () => {
    key('Escape');
    key('Escape', { repeat: true });
    expect(calls).toEqual(['escape']);
  });
  it('repeat only repeats moves', () => {
    key('KeyW', { repeat: true });
    key('Space', { repeat: true });
    key('KeyQ', { repeat: true });
    expect(calls).toEqual(['move0:0,-1']);
  });
  it('ignores modifiers', () => {
    key('KeyW', { ctrlKey: true });
    key('KeyW', { metaKey: true });
    key('KeyW', { altKey: true });
    key('KeyW', { shiftKey: true });
    expect(calls).toEqual([]);
  });
  it('ignores events another handler already prevented', () => {
    const stop = (e: Event): void => {
      e.preventDefault();
    };
    window.addEventListener('keydown', stop, { capture: true, once: true });
    key('KeyW');
    expect(calls).toEqual([]);
  });
  it('ignores select, input and textarea targets', () => {
    for (const tag of ['select', 'input', 'textarea']) {
      const t = document.body.appendChild(document.createElement(tag));
      key('KeyW', {}, t);
      t.remove();
    }
    expect(calls).toEqual([]);
  });
  it('leaves Space to a focused button or link but not other keys', () => {
    const b = document.body.appendChild(document.createElement('button'));
    const a = document.body.appendChild(document.createElement('a'));
    const sp = key('Space', {}, b);
    key('Space', {}, a);
    key('KeyD', {}, b);
    expect(sp.defaultPrevented).toBe(false);
    expect(calls).toEqual(['move0:1,0']);
    b.remove();
    a.remove();
  });
  it('prevents default on handled keys and ignores unmapped ones', () => {
    expect(key('KeyW').defaultPrevented).toBe(true);
    expect(key('KeyZ').defaultPrevented).toBe(false);
    expect(calls).toEqual(['move0:0,-1']);
  });
});

describe('pick-input pads', () => {
  it('pad 0 is P1, pad 1 is P2, edge-triggered', () => {
    const p0 = mkPad();
    const p1 = mkPad();
    pads = [p0, p1];
    press(p0, 0, true);
    press(p1, 1, true);
    frame();
    frame();
    expect(calls).toEqual(['pick0', 'cancel1']);
    press(p0, 0, false);
    frame();
    press(p0, 0, true);
    frame();
    expect(calls).toEqual(['pick0', 'cancel1', 'pick0']);
  });
  it('D-pad, stick, Y and Start', () => {
    const p = mkPad();
    pads = [p, null];
    press(p, 12, true);
    frame();
    press(p, 12, false);
    p.axes[0] = 0.9;
    frame();
    p.axes[0] = 0.3;
    p.axes[1] = 0.7;
    frame();
    p.axes[1] = 0;
    press(p, 3, true);
    press(p, 9, true);
    frame();
    expect(calls).toEqual(['move0:0,-1', 'move0:1,0', 'move0:0,1', 'random0', 'fight']);
  });
  it('a missing pad is skipped', () => {
    frame();
    frame();
    expect(calls).toEqual([]);
  });
});

describe('pick-input off', () => {
  it('stops keys and the pad poll', () => {
    off();
    key('KeyW');
    const p = mkPad();
    pads = [p, null];
    press(p, 0, true);
    frame();
    expect(calls).toEqual([]);
    expect(frames).toEqual([]);
  });
});

describe('pick-input targets', () => {
  it('Space on a stack row or grid tile picks from the cursor; on a plain button it stays native', () => {
    const row = document.createElement('button');
    row.className = 'tsRow';
    const plain = document.createElement('button');
    document.body.append(row, plain);
    const e1 = key('Space', {}, row);
    expect(calls).toEqual(['pick0']);
    expect(e1.defaultPrevented).toBe(true);
    key('Space', {}, plain);
    expect(calls).toEqual(['pick0']);
    const tile = document.createElement('button');
    tile.className = 'heroTile';
    document.body.append(tile);
    key('Space', {}, tile);
    expect(calls).toEqual(['pick0', 'pick0']);
    tile.remove();
    row.remove();
    plain.remove();
  });
  it('a <summary> keeps Space so the key fold opens', () => {
    const sum = document.createElement('summary');
    document.body.append(sum);
    const e = key('Space', {}, sum);
    expect(calls).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
    sum.remove();
  });
});
