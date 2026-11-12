// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newEmptyState } from '@core/menu-index';
import { MENU_ITEMS, mainMenuScreen, type MainMenuDeps } from './main-menu';

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

function mount(deps: MainMenuDeps): { host: HTMLElement; unmount: () => void } {
  host = document.createElement('div');
  document.body.append(host);
  const s = mainMenuScreen(deps)(null);
  s.mount(host);
  return { host, unmount: () => { s.unmount(); } };
}

describe('main menu in the DOM', () => {
  it('renders the five entries as enabled buttons in order, with the version stamp', () => {
    const { host: h } = mount({ load: () => null, navigate: () => undefined });
    const buttons = [...h.querySelectorAll<HTMLButtonElement>('li button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Play', 'Versus', 'Online', 'Settings', 'Help']);
    expect(buttons.map((b) => b.textContent)).toEqual(MENU_ITEMS.map((m) => m.label));
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    expect(h.querySelector('#versionStamp')?.textContent).not.toBe('');
  });

  it('clicking an entry navigates to its route', () => {
    const navigate = vi.fn();
    const { host: h } = mount({ load: () => newEmptyState(), navigate });
    h.querySelector<HTMLButtonElement>('li[data-route="settings"] button')?.click();
    h.querySelector<HTMLButtonElement>('li[data-route="tour"] button')?.click();
    expect(navigate.mock.calls).toEqual([['settings'], ['tour']]);
  });

  it('never shows the retired mode words', () => {
    const { host: h } = mount({ load: () => null, navigate: () => undefined });
    expect(h.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
  });

  it('unmount removes the menu', () => {
    const m = mount({ load: () => null, navigate: () => undefined });
    m.unmount();
    expect(m.host.querySelector('.menuPage')).toBeNull();
  });
});
