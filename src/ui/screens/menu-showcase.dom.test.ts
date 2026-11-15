// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "handleDisabledFileLoadingAsSuccess": true } }
import { afterEach, describe, expect, it } from 'vitest';
import { mainMenuScreen } from './main-menu';
import { mountShowcase, slotsFor } from './menu-showcase';

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelector('#menuShowcaseCss')?.remove();
});

describe('menu showcase', () => {
  it('slot count follows the viewport', () => {
    expect(slotsFor(390, 844)).toEqual(['ground']);
    expect(slotsFor(844, 390)).toEqual(['ground', 'ground']);
    expect(slotsFor(1280, 720)).toEqual(['ground', 'ground']);
    expect(slotsFor(2560, 1440)).toEqual(['ground', 'ground', 'floater']);
  });

  it('mounts an aria-hidden, unfocusable, text-free layer and leaves nothing behind', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const before = document.head.children.length;
    const off = mountShowcase(host);
    const layer = host.querySelector('#menuShowcase');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.querySelectorAll('img').length).toBeGreaterThan(0);
    expect(layer?.querySelectorAll('a, button, input, [tabindex]').length).toBe(0);
    expect([...(layer?.querySelectorAll('img') ?? [])].every((i) => i.alt === '')).toBe(true);
    expect(layer?.textContent).toBe('');
    off();
    expect(host.querySelector('#menuShowcase')).toBeNull();
    expect(document.head.children.length).toBe(before);
  });

  it('the main menu keeps its five entries and adds the layer lazily, removing it on unmount', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const s = mainMenuScreen({ load: () => null, navigate: () => undefined })(null);
    s.mount(host);
    expect([...host.querySelectorAll('li button')].map((b) => b.textContent)).toEqual([
      'Play',
      'Versus',
      'Online',
      'Settings',
      'Help',
    ]);
    await expect.poll(() => host.querySelector('#menuShowcase') !== null).toBe(true);
    expect(host.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    s.unmount();
    expect(host.querySelector('#menuShowcase')).toBeNull();
    expect(host.children.length).toBe(0);
  });
});
