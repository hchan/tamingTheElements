// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { byId, el, markMoreBelow } from './dom';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('el', () => {
  it('creates a bare element with no class or text', () => {
    const n = el('section');
    expect(n.tagName).toBe('SECTION');
    expect(n.className).toBe('');
    expect(n.textContent).toBe('');
  });
  it('sets class and text', () => {
    const n = el('p', 'a b', 'hello');
    expect(n.className).toBe('a b');
    expect(n.textContent).toBe('hello');
  });
  it('treats text as text, never markup', () => {
    const n = el('div', undefined, '<img src=x onerror=alert(1)>');
    expect(n.children).toHaveLength(0);
    expect(n.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('byId', () => {
  it('returns the element with that id', () => {
    const n = el('div');
    n.id = 'here';
    document.body.append(n);
    expect(byId('here')).toBe(n);
  });
  it('throws a named error when missing', () => {
    expect(() => byId('nope')).toThrow('Missing element #nope');
  });
});

describe('markMoreBelow', () => {
  const box = (top: number, client: number, height: number): HTMLElement => {
    const b = el('div');
    document.body.append(b);
    Object.defineProperty(b, 'scrollTop', { value: top, configurable: true, writable: true });
    Object.defineProperty(b, 'clientHeight', { value: client, configurable: true });
    Object.defineProperty(b, 'scrollHeight', { value: height, configurable: true });
    return b;
  };
  it('sets data-more while content continues below and clears it at the end', () => {
    const b = box(0, 100, 300);
    const update = markMoreBelow(b);
    update();
    expect(b.hasAttribute('data-more')).toBe(true);
    (b as unknown as { scrollTop: number }).scrollTop = 200;
    b.dispatchEvent(new Event('scroll'));
    expect(b.hasAttribute('data-more')).toBe(false);
  });
  it('ignores a 2 px rounding remainder', () => {
    const b = box(0, 100, 101);
    markMoreBelow(b)();
    expect(b.hasAttribute('data-more')).toBe(false);
  });
  it('re-checks on resize and disconnects the observer once the box is detached', () => {
    const cbs: (() => void)[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          cbs.push(cb);
        }
        observe(): void {}
        disconnect = disconnect;
      },
    );
    const b = box(0, 100, 300);
    markMoreBelow(b);
    cbs[0]?.();
    expect(b.hasAttribute('data-more')).toBe(true);
    b.remove();
    cbs[0]?.();
    expect(disconnect).toHaveBeenCalled();
  });
});
