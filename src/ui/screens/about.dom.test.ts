// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_URL, aboutScreen } from './about';

afterEach(() => {
  document.body.replaceChildren();
});

describe('aboutScreen', () => {
  it('mounts the page with heading, safe external link, version and a Back link', () => {
    const container = document.createElement('div');
    document.body.append(container);
    aboutScreen().mount(container);
    expect(container.querySelector('h1')?.textContent).toBe('About');
    const link = container.querySelector<HTMLAnchorElement>('a.contactLink');
    expect(link?.getAttribute('href')).toBe(REPO_URL);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelector('#aboutVersion')?.textContent).toMatch(/^v/);
    expect(container.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
    expect(container.innerHTML).not.toMatch(/mailto:/i);
  });
  it('unmount removes everything and is safe to repeat', () => {
    const container = document.createElement('div');
    const screen = aboutScreen();
    screen.mount(container);
    screen.unmount();
    expect(container.childElementCount).toBe(0);
    expect(() => {
      screen.unmount();
    }).not.toThrow();
  });
});
