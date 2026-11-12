import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMenuKeys } from './keyboard';

class FakeHTMLElement {
  clicked = 0;
  constructor(
    readonly tagName: string,
    private readonly href = false,
  ) {}
  hasAttribute(name: string): boolean {
    return name === 'href' && this.href;
  }
  click(): void {
    this.clicked++;
  }
}

interface Rig {
  doc: Document;
  press: (key: string, target?: unknown) => { prevented: boolean };
  navigate: ReturnType<typeof vi.fn>;
  setPause: (open: boolean) => void;
  off: () => void;
  listeners: () => number;
}

function rig(route: string): Rig {
  let handler: ((e: unknown) => void) | undefined;
  let pause = false;
  const doc = {
    addEventListener: (_: string, fn: (e: unknown) => void) => void (handler = fn),
    removeEventListener: () => void (handler = undefined),
    querySelector: () => (pause ? {} : null),
  } as unknown as Document;
  const navigate = vi.fn();
  const off = installMenuKeys(doc, () => route, navigate);
  return {
    doc,
    navigate,
    off,
    setPause: (o) => void (pause = o),
    listeners: () => (handler ? 1 : 0),
    press: (key, target) => {
      let prevented = false;
      handler?.({ key, defaultPrevented: false, target, preventDefault: () => void (prevented = true) });
      return { prevented };
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('HTMLElement', FakeHTMLElement);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installMenuKeys', () => {
  it('Escape on a sub-screen goes back to the main menu and the character screen back to the garrison', () => {
    const a = rig('settings');
    expect(a.press('Escape').prevented).toBe(true);
    expect(a.navigate).toHaveBeenCalledWith('#main');
    const b = rig('character');
    b.press('Escape');
    expect(b.navigate).toHaveBeenCalledWith('#garrison');
  });

  it('Escape does nothing on the main menu and on routes that pause or handle it themselves', () => {
    for (const route of ['main', 'loading', 'arcade', 'tour']) {
      const r = rig(route);
      expect(r.press('Escape').prevented).toBe(false);
      expect(r.navigate).not.toHaveBeenCalled();
    }
  });

  it('Escape is left to the pause dialog while it is open', () => {
    const r = rig('settings');
    r.setPause(true);
    r.press('Escape');
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('Escape keeps its meaning inside a text field', () => {
    const r = rig('settings');
    r.press('Escape', new FakeHTMLElement('INPUT'));
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('other keys never navigate', () => {
    const r = rig('settings');
    r.press('a');
    r.press('Enter');
    expect(r.navigate).not.toHaveBeenCalled();
  });

  it('Space clicks a focused link (like a button) but not a link without href or a button', () => {
    const r = rig('main');
    const link = new FakeHTMLElement('A', true);
    expect(r.press(' ', link).prevented).toBe(true);
    expect(link.clicked).toBe(1);
    const bare = new FakeHTMLElement('A', false);
    expect(r.press(' ', bare).prevented).toBe(false);
    expect(bare.clicked).toBe(0);
    const button = new FakeHTMLElement('BUTTON', true);
    r.press(' ', button);
    expect(button.clicked).toBe(0);
  });

  it('returns an uninstall function that removes the handler', () => {
    const r = rig('settings');
    expect(r.listeners()).toBe(1);
    r.off();
    expect(r.listeners()).toBe(0);
  });
});
