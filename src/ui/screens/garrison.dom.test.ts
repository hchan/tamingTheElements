// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newEmptyState, type SaveV1 } from '@core/menu-index';
import { garrisonScreen, avatarCss, type GarrisonDeps } from './garrison';
import type { MatchSetup } from './garrison-model';
import type { Screen } from './screen';

const heroes = (n: number): SaveV1['garrison'] =>
  ['Fiara', 'Aqua', 'Terra', 'Zephyr'].slice(0, n).map((characterName, i) => ({ id: `h${String(i)}`, experience: 10 * i, characterName }));
const save = (chapter: number, n: number): SaveV1 => ({ ...newEmptyState(), chapter, garrison: heroes(n) });

interface Harness {
  host: HTMLElement;
  screen: Screen;
  alert: ReturnType<typeof vi.fn<(m: string) => void>>;
  navigate: ReturnType<typeof vi.fn<(r: string) => void>>;
  onMatch: ReturnType<typeof vi.fn<(s: MatchSetup) => void>>;
}

let current: Harness | null = null;
afterEach(() => {
  current?.screen.unmount();
  current?.host.remove();
  current = null;
});

function mount(s: SaveV1 | null, extra: Partial<GarrisonDeps> = {}): Harness {
  const alert = vi.fn<(m: string) => void>();
  const navigate = vi.fn<(r: string) => void>();
  const onMatch = vi.fn<(s: MatchSetup) => void>();
  const host = document.createElement('div');
  document.body.append(host);
  const screen = garrisonScreen({
    load: () => s,
    navigate,
    alert,
    seed: () => 7,
    onMatch,
    avatarUrl: (k) => `url(${k})`,
    ...extra,
  })(null);
  screen.mount(host);
  current = { host, screen, alert, navigate, onMatch };
  return current;
}

const row = (h: Harness, id: string): HTMLElement => {
  const r = h.host.querySelector<HTMLElement>(`#${id}`);
  if (r === null) throw new Error(`no row ${id}`);
  return r;
};
const btn = (h: Harness, id: string): HTMLButtonElement | null => h.host.querySelector<HTMLButtonElement>(`#${id}`);

describe('garrison screen in the DOM', () => {
  it('shows an empty message and a Back link when there is no save or no heroes', () => {
    for (const s of [null, save(1, 0)]) {
      const h = mount(s);
      expect(h.host.textContent).toContain('No heroes yet.');
      expect(h.host.querySelector('#garrisonTable')).toBeNull();
      expect(h.host.querySelector('a.menuLink')?.getAttribute('href')).toBe('#main');
      h.screen.unmount();
      h.host.remove();
    }
  });

  it('renders each hero as a keyboard-operable toggle button', () => {
    const h = mount(save(1, 2));
    const r = row(h, 'h0');
    expect(r.tabIndex).toBe(0);
    expect(r.getAttribute('role')).toBe('button');
    expect(r.getAttribute('aria-pressed')).toBe('false');
    expect(r.textContent).toContain('Fiara');
  });

  it('chapter 1 is single-select: choosing another hero replaces the first, clicking again clears', () => {
    const h = mount(save(1, 2));
    row(h, 'h0').click();
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('true');
    row(h, 'h1').click();
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('false');
    expect(row(h, 'h1').getAttribute('aria-pressed')).toBe('true');
    row(h, 'h1').click();
    expect(row(h, 'h1').getAttribute('aria-pressed')).toBe('false');
    expect(h.host.querySelectorAll('.teamSlot')).toHaveLength(1);
  });

  it('Enter and Space select a row and keep focus on it; other keys do nothing', () => {
    const h = mount(save(1, 2));
    row(h, 'h0').focus();
    row(h, 'h0').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('false');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    row(h, 'h0').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement?.id).toBe('h0');
    row(h, 'h0').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('false');
  });

  it('Enter Battleground with nothing selected alerts and does not start a match', () => {
    const h = mount(save(1, 2));
    btn(h, 'enterBattlegroundContainer')?.click();
    expect(h.alert).toHaveBeenCalledWith('No hero has been selected yet!');
    expect(h.onMatch).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('a selected hero starts a battle: hands over the setup then navigates to loading', () => {
    const h = mount(save(1, 2));
    row(h, 'h1').click();
    btn(h, 'enterBattlegroundContainer')?.click();
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.onMatch).toHaveBeenCalledTimes(1);
    const setup = h.onMatch.mock.calls[0]?.[0];
    expect(setup?.mode).toBe('battle');
    expect(setup?.heroes.map((x) => x.id)).toEqual(['h1']);
    expect(setup?.opponents.length).toBeGreaterThan(0);
    expect(h.navigate).toHaveBeenCalledWith('loading');
  });

  it('practice is allowed with a single hero in a later chapter, but battle needs three', () => {
    const h = mount(save(3, 4));
    row(h, 'h0').click();
    btn(h, 'enterBattlegroundContainer')?.click();
    expect(h.alert).toHaveBeenCalledWith('You must select 3 heroes.  Only 1 has been selected so far');
    btn(h, 'enterPracticeContainer')?.click();
    expect(h.onMatch.mock.calls[0]?.[0].mode).toBe('practice');
  });

  it('later chapters keep battle order and a fourth pick evicts the third slot', () => {
    const h = mount(save(3, 4));
    for (const id of ['h2', 'h0', 'h1']) row(h, id).click();
    expect(row(h, 'h2').textContent).toContain('Slot 1');
    expect(row(h, 'h1').textContent).toContain('Slot 3');
    row(h, 'h3').click();
    expect(row(h, 'h1').getAttribute('aria-pressed')).toBe('false');
    expect(row(h, 'h3').textContent).toContain('Slot 3');
    btn(h, 'enterBattlegroundContainer')?.click();
    expect(h.onMatch.mock.calls[0]?.[0].heroes.map((x) => x.id)).toEqual(['h2', 'h0', 'h3']);
  });

  it('the portal button only exists from chapter 4', () => {
    const h3 = mount(save(3, 3));
    expect(btn(h3, 'enterPortalContainer')).toBeNull();
    h3.screen.unmount();
    h3.host.remove();
    const h4 = mount(save(4, 3));
    expect(btn(h4, 'enterPortalContainer')).not.toBeNull();
  });

  it('tester team mode allows a 1 to 3 hero team in chapter 1', () => {
    const h = mount(save(1, 3), { testerTeam: () => true });
    expect(h.host.querySelectorAll('.teamSlot')).toHaveLength(3);
    row(h, 'h0').click();
    row(h, 'h1').click();
    expect(row(h, 'h0').getAttribute('aria-pressed')).toBe('true');
    expect(row(h, 'h1').getAttribute('aria-pressed')).toBe('true');
    btn(h, 'enterBattlegroundContainer')?.click();
    expect(h.onMatch.mock.calls[0]?.[0].heroes).toHaveLength(2);
  });

  it('unmount removes the page', () => {
    const h = mount(save(1, 2));
    h.screen.unmount();
    expect(h.host.children).toHaveLength(0);
  });
});

describe('avatarCss', () => {
  it('builds a quoted url under the Vite base and encodes the sprite key', () => {
    expect(avatarCss('a b')).toBe(`url("${import.meta.env.BASE_URL}assets/img/map/a%20b.png")`);
  });
});
