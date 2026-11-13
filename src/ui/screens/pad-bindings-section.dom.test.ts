// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAD_BINDINGS_KEY, getPadDeadzone, getPadOverrides, setPadDeadzone, setPadOverrides } from '../../game/platform/input/pad-bindings';
import { keyBindingsScreen } from './key-bindings';
import type { Screen } from './screen';

let screen: Screen | undefined;
let root: HTMLElement;
let down: number[] = [];

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  setPadOverrides({});
  setPadDeadzone(0.4);
  down = [];
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [{ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: 0 })) }],
  });
  root = document.createElement('div');
  document.body.append(root);
  screen = keyBindingsScreen();
  screen.mount(root);
  await vi.dynamicImportSettled();
});
afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  setPadOverrides({});
  vi.useRealTimers();
});

const btn = (id: string): HTMLButtonElement => {
  const b = document.getElementById(id);
  if (!(b instanceof HTMLButtonElement)) throw new Error(`no button ${id}`);
  return b;
};
const status = (): string => root.querySelector('.padBindings [role="status"]')?.textContent ?? '';
const press = (code: string): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true });
  window.dispatchEvent(e);
  return e;
};
const tick = (): void => void vi.advanceTimersByTime(60);

describe('gamepad bindings section', () => {
  it('lists every action with the button in words and a descriptive aria-label', () => {
    expect(root.querySelector('.padBindings h2')?.textContent).toBe('Gamepad buttons');
    expect(btn('pad-primary').textContent).toBe('A');
    expect(btn('pad-pause').textContent).toBe('Start');
    expect(btn('pad-up').getAttribute('aria-label')).toBe('Move Up, gamepad button: D-pad Up. Activate to change.');
  });

  it('captures the next pad button, announces it, persists and refocuses', () => {
    btn('pad-primary').click();
    expect(btn('pad-primary').textContent).toBe('Press a button...');
    expect(status()).toContain('Press the new gamepad button for Primary Ability');
    down = [16];
    tick();
    expect(status()).toBe('Primary Ability is now Home.');
    expect(btn('pad-primary').textContent).toBe('Home');
    expect(document.activeElement?.id).toBe('pad-primary');
    expect(getPadOverrides()).toEqual({ primary: 16 });
    expect(JSON.parse(localStorage.getItem(PAD_BINDINGS_KEY) ?? '{}')).toEqual({ primary: 16 });
  });

  it('ignores a button already held when capture starts until it is released', () => {
    down = [0];
    btn('pad-secondary').click();
    tick();
    expect(btn('pad-secondary').textContent).toBe('Press a button...');
    down = [];
    tick();
    down = [0];
    tick();
    expect(status()).toContain('Secondary Ability is now A; Primary Ability took its old button.');
    expect(btn('pad-primary').textContent).toBe('B');
  });

  it('says so when no gamepad is connected', () => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null] });
    btn('pad-primary').click();
    expect(status()).toContain('No gamepad detected');
  });

  it('Escape cancels without changes and Tab leaves capture mode', () => {
    btn('pad-primary').click();
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(status()).toBe('Cancelled.');
    expect(getPadOverrides()).toEqual({});
    down = [16];
    tick();
    expect(getPadOverrides()).toEqual({});
    down = [];
    btn('pad-primary').click();
    expect(press('Tab').defaultPrevented).toBe(false);
    down = [16];
    tick();
    expect(getPadOverrides()).toEqual({});
    expect(btn('pad-primary').textContent).toBe('A');
  });

  it('resets to the defaults', () => {
    btn('pad-primary').click();
    down = [16];
    tick();
    btn('resetPadBindings').click();
    expect(status()).toBe('Gamepad buttons reset to defaults.');
    expect(btn('pad-primary').textContent).toBe('A');
    expect(getPadOverrides()).toEqual({});
  });

  it('the deadzone slider updates and stores the value, and reset restores 40 percent', () => {
    const dz = document.getElementById('padDeadzone') as HTMLInputElement;
    expect(dz.value).toBe('0.4');
    dz.value = '0.65';
    dz.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getPadDeadzone()).toBe(0.65);
    expect(localStorage.getItem('tte.padDeadzone')).toBe('0.65');
    expect(dz.getAttribute('aria-valuetext')).toBe('65 percent');
    btn('resetPadDeadzone').click();
    expect(getPadDeadzone()).toBe(0.4);
    expect(dz.value).toBe('0.4');
    expect(status()).toBe('Stick deadzone reset to 40 percent.');
  });

  it('stops polling on unmount', () => {
    btn('pad-primary').click();
    screen?.unmount();
    screen = undefined;
    down = [16];
    tick();
    expect(getPadOverrides()).toEqual({});
  });
});
