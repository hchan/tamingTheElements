import { Cmd, type ObservationView } from '@core/index';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, type KeyEffect, type KeyInput, rebind } from './key-map';
import { KeyboardAgent } from './keyboard-agent';

const view = {} as ObservationView;
const key = (type: KeyInput['type'], code: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  type,
  code,
  shiftKey: false,
  ctrlKey: false,
  repeat: false,
  ...extra,
});

function make(capturable = false, cheatsEnabled = false) {
  const effects: KeyEffect[] = [];
  const agent = new KeyboardAgent({ capturable: () => capturable, cheatsEnabled, onEffect: (e) => effects.push(e) });
  return { agent, effects };
}

describe('KeyboardAgent', () => {
  it('maps arrows and WASD to direction bits', () => {
    const { agent } = make();
    agent.handle(key('down', 'ArrowUp'));
    agent.handle(key('down', 'KeyD'));
    expect(agent.observe(view)).toBe(Cmd.up | Cmd.right);
    agent.handle(key('up', 'ArrowUp'));
    expect(agent.observe(view)).toBe(Cmd.right);
  });

  it('maps Space, Enter and digits to slots', () => {
    const { agent } = make();
    agent.handle(key('down', 'Space'));
    agent.handle(key('down', 'Enter'));
    expect(agent.observe(view)).toBe(Cmd.primary | Cmd.secondary);
    agent.handle(key('down', 'Digit3'));
    expect(agent.observe(view) & Cmd.swap1).toBe(Cmd.swap1);
  });

  it('sends capture only when capturable', () => {
    const no = make(false);
    no.agent.handle(key('down', 'KeyC'));
    expect(no.agent.observe(view)).toBe(0);
    const yes = make(true);
    yes.agent.handle(key('down', 'KeyC'));
    expect(yes.agent.observe(view)).toBe(Cmd.capture);
  });

  it('blur clears held keys', () => {
    const { agent } = make();
    agent.handle(key('down', 'KeyW'));
    agent.handle(key('blur', ''));
    expect(agent.observe(view)).toBe(0);
  });

  it('Shift-P and Ctrl-M are app effects, once per press, not commands', () => {
    const { agent, effects } = make();
    agent.handle(key('down', 'KeyP', { shiftKey: true }));
    agent.handle(key('down', 'KeyP', { shiftKey: true, repeat: true }));
    agent.handle(key('down', 'KeyM', { ctrlKey: true }));
    expect(effects).toEqual(['pause', 'mute']);
    expect(agent.observe(view)).toBe(0);
  });

  it('cheats fire only when enabled', () => {
    const off = make(false, false);
    off.agent.handle(key('down', 'KeyQ', { shiftKey: true }));
    expect(off.effects).toEqual([]);
    const on = make(false, true);
    on.agent.handle(key('down', 'KeyQ', { shiftKey: true }));
    on.agent.handle(key('down', 'KeyX', { shiftKey: true }));
    on.agent.handle(key('down', 'KeyC', { shiftKey: true }));
    expect(on.effects).toEqual(['cheatQ', 'cheatX', 'cheatC']);
    expect(on.agent.observe(view)).toBe(0);
  });

  it('rebinding moves a code between actions', () => {
    const b = rebind(DEFAULT_BINDINGS, 'slot1', ['KeyJ', 'KeyW']);
    expect(b.up).toEqual(['ArrowUp']);
    const { agent } = make();
    agent.setBindings(b);
    agent.handle(key('down', 'KeyW'));
    expect(agent.observe(view)).toBe(Cmd.primary);
  });

  it('attach wires DOM-like events and detaches', () => {
    const { agent } = make();
    const target = new EventTarget();
    const detach = agent.attach(target);
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyA', shiftKey: false, ctrlKey: false, repeat: false }));
    expect(agent.observe(view)).toBe(Cmd.left);
    target.dispatchEvent(new Event('blur'));
    expect(agent.observe(view)).toBe(0);
    detach();
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyA', shiftKey: false, ctrlKey: false, repeat: false }));
    expect(agent.observe(view)).toBe(0);
  });

  it('merges gamepad commands with keys and respects capturable', () => {
    const pad = { connected: true, axes: [1, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 || i === 3 })) };
    const agent = new KeyboardAgent({ capturable: () => false, gamepad: () => pad });
    agent.handle(key('down', 'Digit2'));
    expect(agent.observe(view)).toBe(Cmd.right | Cmd.primary | Cmd.secondary);
    const yes = new KeyboardAgent({ capturable: () => true, gamepad: () => pad });
    expect(yes.observe(view) & Cmd.capture).toBe(Cmd.capture);
  });

  it('pollPad pauses once per press of Start', () => {
    const effects: KeyEffect[] = [];
    let start = false;
    const agent = new KeyboardAgent({
      capturable: () => false,
      onEffect: (e) => effects.push(e),
      gamepad: () => ({ axes: [], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 9 && start })) }),
    });
    agent.pollPad();
    start = true;
    agent.pollPad();
    agent.pollPad();
    start = false;
    agent.pollPad();
    start = true;
    agent.pollPad();
    expect(effects).toEqual(['pause', 'pause']);
  });

  it('releaseAll drops held keys', () => {
    const { agent } = make();
    agent.handle(key('down', 'Enter'));
    agent.releaseAll();
    expect(agent.observe(view)).toBe(0);
  });
});
