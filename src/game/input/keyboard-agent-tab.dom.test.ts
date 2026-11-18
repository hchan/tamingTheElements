// @vitest-environment happy-dom
import { Cmd, type ObservationView } from '@core/index';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardAgent } from './keyboard-agent';

/** Tab is Run only when it is bare and aimed at the page or canvas; everywhere else it moves focus as usual (no keyboard trap). */
const view = {} as ObservationView;

function setup(opts: { arcade?: boolean; tabRun?: boolean } = {}) {
  const agent = new KeyboardAgent({
    capturable: () => true,
    cheatsEnabled: false,
    arcade: opts.arcade ?? true,
    tabRun: opts.tabRun ?? true,
  });
  const detach = agent.attach(window);
  return { agent, detach };
}

function tab(target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

const keyup = (target: EventTarget, code: string): void => {
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};

let detach: (() => void) | undefined;
afterEach(() => {
  detach?.();
  detach = undefined;
  document.body.replaceChildren();
});

describe('Tab runs', () => {
  it('a bare Tab on the body sets Cmd.run and is prevented', () => {
    const s = setup();
    detach = s.detach;
    const e = tab(document.body);
    expect(e.defaultPrevented).toBe(true);
    expect(s.agent.observe(view) & Cmd.run).toBe(Cmd.run);
  });

  it('a bare Tab on a canvas sets Cmd.run, and releasing it ends it', () => {
    const s = setup();
    detach = s.detach;
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    expect(tab(canvas).defaultPrevented).toBe(true);
    expect(s.agent.observe(view) & Cmd.run).toBe(Cmd.run);
    keyup(canvas, 'Tab');
    expect(s.agent.observe(view) & Cmd.run).toBe(0);
  });

  it('a Tab press shorter than a tick still counts once', () => {
    const s = setup();
    detach = s.detach;
    tab(document.body);
    keyup(document.body, 'Tab');
    expect(s.agent.observe(view) & Cmd.run).toBe(Cmd.run);
    expect(s.agent.observe(view) & Cmd.run).toBe(0);
  });

  it('Tab in an overlay (a button or dialog) is left alone', () => {
    const s = setup();
    detach = s.detach;
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    for (const t of [button, dialog]) expect(tab(t).defaultPrevented).toBe(false);
    expect(s.agent.observe(view) & Cmd.run).toBe(0);
  });

  it('Shift-Tab, Ctrl-Tab, Alt-Tab and Meta-Tab are left alone', () => {
    const s = setup();
    detach = s.detach;
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }])
      expect(tab(document.body, init).defaultPrevented).toBe(false);
    expect(s.agent.observe(view) & Cmd.run).toBe(0);
  });

  it('with tabRun off, or outside Arcade, Tab does nothing', () => {
    const off = setup({ tabRun: false });
    expect(tab(document.body).defaultPrevented).toBe(false);
    expect(off.agent.observe(view) & Cmd.run).toBe(0);
    off.detach();
    const classic = setup({ arcade: false });
    detach = classic.detach;
    tab(document.body);
    expect(classic.agent.observe(view) & Cmd.run).toBe(0);
  });

  it('the Backquote key runs too (the rebindable Run action)', () => {
    const s = setup({ tabRun: false });
    detach = s.detach;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', bubbles: true }));
    expect(s.agent.observe(view) & Cmd.run).toBe(Cmd.run);
  });
});
