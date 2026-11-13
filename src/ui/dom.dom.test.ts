// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { byId, el } from './dom';

afterEach(() => {
  document.body.replaceChildren();
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
