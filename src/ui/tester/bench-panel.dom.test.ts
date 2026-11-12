// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenchRow } from '@core/menu-index';
import { createMemoryStorage } from '../../game/platform/storage/save-store';
import { TesterSession, type ArenaBridge } from '../../game/platform/tester/session';
import { mountBenchPanel } from './bench-panel';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const row = (over: Partial<BenchRow> = {}): BenchRow => ({ id: 1, name: 'Fiara', active: true, dead: false, hp: 200, maxHp: 400, restCap: 300, ...over });
const box = (): HTMLElement => document.getElementById('testerBench') as HTMLElement;
const rows = (): HTMLElement[] => [...box().querySelectorAll<HTMLElement>('.testerBenchRow')];

function setup(initial: BenchRow[]): { session: TesterSession; data: { rows: BenchRow[] }; bench: ReturnType<typeof vi.fn> } {
  const session = new TesterSession(undefined, createMemoryStorage());
  const data = { rows: initial };
  const bench = vi.fn(() => data.rows);
  const bridge: ArenaBridge = { cheat: () => undefined, bench };
  session.enable();
  session.attachArena(bridge);
  return { session, data, bench };
}

describe('mountBenchPanel visibility', () => {
  it('is a labelled hidden group until tester mode is on with an arena attached', () => {
    const session = new TesterSession(undefined, createMemoryStorage());
    mountBenchPanel(session);
    expect(box().hidden).toBe(true);
    expect(box().getAttribute('role')).toBe('group');
    expect(box().getAttribute('aria-label')).toBe('Bench health (tester mode)');
    session.enable();
    expect(box().hidden).toBe(true); // no arena yet
    session.attachArena({ cheat: () => undefined, bench: () => [row()] });
    expect(box().hidden).toBe(false);
  });

  it('is hidden when the benchHud option is off and when the arena detaches', () => {
    const { session } = setup([row()]);
    mountBenchPanel(session);
    expect(box().hidden).toBe(false);
    session.setOption('benchHud', false);
    expect(box().hidden).toBe(true);
    session.setOption('benchHud', true);
    expect(box().hidden).toBe(false);
    session.disable();
    expect(box().hidden).toBe(true);
  });
});

describe('mountBenchPanel rows', () => {
  it('renders a title and one row per hero with words, state class, data attributes and bar widths', () => {
    const { session } = setup([row(), row({ id: 2, name: 'Lavax', active: false, hp: 100, maxHp: 400, restCap: 400 }), row({ id: 3, name: 'Rokcore', active: false, dead: true, hp: 0 })]);
    mountBenchPanel(session);
    expect(box().firstElementChild?.textContent).toBe('Bench (health / max, grey = rest cap)');
    const r = rows();
    expect(r.map((x) => x.querySelector('.testerBenchText')?.textContent)).toEqual([
      'Fiara ACTIVE 200 / 400 (rest cap 300)',
      'Lavax BENCH 100 / 400 (rest cap 400)',
      'Rokcore DEAD 0 / 400 (rest cap 300)',
    ]);
    expect(r.map((x) => x.className)).toEqual([
      'testerBenchRow testerBench-active',
      'testerBenchRow testerBench-bench',
      'testerBenchRow testerBench-dead',
    ]);
    expect(r[0]?.dataset['id']).toBe('1');
    expect(r[0]?.getAttribute('data-hp')).toBe('200');
    expect(r[0]?.getAttribute('data-rest-cap')).toBe('300');
    expect(r[0]?.querySelector<HTMLElement>('.testerBenchHp')?.style.width).toBe('50.0%');
    expect(r[0]?.querySelector<HTMLElement>('.testerBenchRest')?.style.width).toBe('75.0%');
    expect(r[2]?.querySelector<HTMLElement>('.testerBenchHp')?.style.width).toBe('0.0%');
  });

  it('polls every 200 ms and updates rows in place (same elements) when only health changes', () => {
    const { session, data } = setup([row()]);
    mountBenchPanel(session);
    const before = rows()[0];
    data.rows = [row({ hp: 400 })];
    expect(rows()[0]?.getAttribute('data-hp')).toBe('200'); // nothing happens before the timer
    vi.advanceTimersByTime(199);
    expect(rows()[0]?.getAttribute('data-hp')).toBe('200');
    vi.advanceTimersByTime(1);
    expect(rows()[0]).toBe(before);
    expect(rows()[0]?.getAttribute('data-hp')).toBe('400');
    expect(rows()[0]?.querySelector('.testerBenchText')?.textContent).toBe('Fiara ACTIVE 400 / 400 (rest cap 300)');
    expect(rows()[0]?.querySelector<HTMLElement>('.testerBenchHp')?.style.width).toBe('100.0%');
  });

  it('rebuilds when the number of heroes changes', () => {
    const { session, data } = setup([row()]);
    mountBenchPanel(session);
    expect(rows()).toHaveLength(1);
    data.rows = [row(), row({ id: 2, name: 'Lavax', active: false })];
    vi.advanceTimersByTime(200);
    expect(rows().map((x) => x.dataset['id'])).toEqual(['1', '2']);
  });

  it('switching the active hero is reflected in the state class and label', () => {
    const { session, data } = setup([row(), row({ id: 2, name: 'Lavax', active: false })]);
    mountBenchPanel(session);
    data.rows = [row({ active: false }), row({ id: 2, name: 'Lavax', active: true })];
    vi.advanceTimersByTime(200);
    expect(rows().map((x) => x.className)).toEqual(['testerBenchRow testerBench-bench', 'testerBenchRow testerBench-active']);
  });

  it('does not ask the arena for rows while hidden', () => {
    const { session, bench } = setup([row()]);
    session.setOption('benchHud', false);
    mountBenchPanel(session);
    bench.mockClear();
    vi.advanceTimersByTime(1000);
    expect(bench).not.toHaveBeenCalled();
  });
});

describe('mountBenchPanel cleanup', () => {
  it('removes the box, stops the timer and unsubscribes from the session', () => {
    const { session, bench } = setup([row()]);
    const off = mountBenchPanel(session);
    off();
    expect(document.getElementById('testerBench')).toBeNull();
    bench.mockClear();
    vi.advanceTimersByTime(1000);
    session.setOption('godMode', true);
    expect(bench).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
