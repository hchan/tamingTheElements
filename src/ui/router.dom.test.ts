// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_TITLE, ROUTE_NAMES, routeTitle, startRouter, type ScreenTable } from './router';
import type { Screen, ScreenFactory } from './screens/screen';

function table(events: string[]): ScreenTable {
  const make =
    (name: string): ScreenFactory =>
    (param) => {
      let node: HTMLElement | null = null;
      return {
        mount(c) {
          events.push(`mount ${name}:${String(param)}`);
          node = document.createElement('div');
          const h = document.createElement('h1');
          h.tabIndex = -1;
          h.textContent = name;
          node.append(h);
          c.append(node);
        },
        unmount() {
          events.push(`unmount ${name}`);
          node?.remove();
        },
      } satisfies Screen;
    };
  return Object.fromEntries(ROUTE_NAMES.map((n) => [n, make(n)])) as unknown as ScreenTable;
}

let container: HTMLElement;
let stop: (() => void) | null = null;

beforeEach(() => {
  window.location.hash = '';
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  stop?.();
  stop = null;
  container.remove();
});

const nextHashChange = (act: () => void): Promise<void> =>
  new Promise((resolve) => {
    window.addEventListener('hashchange', () => { resolve(); }, { once: true });
    act();
  });

const goto = (hash: string): Promise<void> =>
  nextHashChange(() => {
    window.location.hash = hash;
  });

describe('startRouter', () => {
  it('mounts the main menu for an empty hash and titles the document', () => {
    const events: string[] = [];
    stop = startRouter(container, table(events));
    expect(events).toEqual(['mount main:null']);
    expect(document.title).toBe(APP_TITLE);
  });

  it('unmounts the old screen before mounting the new one on hashchange', async () => {
    const events: string[] = [];
    stop = startRouter(container, table(events));
    await goto('#settings');
    expect(events).toEqual(['mount main:null', 'unmount main', 'mount settings:null']);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(document.title).toBe(routeTitle('settings'));
  });

  it('passes the race id parameter and falls back to main for a malformed one', async () => {
    const events: string[] = [];
    stop = startRouter(container, table(events));
    await goto('#race_fiara');
    await goto('#race_../x');
    expect(events).toContain('mount race:fiara');
    expect(events.at(-1)).toBe('mount main:null');
  });

  it('moves focus to the new screen heading', async () => {
    const events: string[] = [];
    stop = startRouter(container, table(events));
    await goto('#about');
    expect(document.activeElement?.textContent).toBe('about');
  });

  it('Escape on a sub-screen goes back to the main menu', async () => {
    const events: string[] = [];
    stop = startRouter(container, table(events));
    await goto('#about');
    await nextHashChange(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(window.location.hash).toBe('#main');
    expect(events.at(-1)).toBe('mount main:null');
  });

  it('the stop function unmounts and ignores later hash changes and keys', async () => {
    const events: string[] = [];
    const off = startRouter(container, table(events));
    off();
    expect(events.at(-1)).toBe('unmount main');
    const n = events.length;
    window.location.hash = '#about';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toHaveLength(n);
  });
});
