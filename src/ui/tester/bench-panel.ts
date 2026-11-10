import type { BenchRow } from '@core/menu-index';
import type { TesterSession } from '../../game/platform/tester/session';
import { el } from '../dom';

export interface BenchRowView {
  readonly name: string;
  /** Health as a percentage of max (0..100), and the rest ceiling the character heals toward. */
  readonly hpPct: number;
  readonly restPct: number;
  /** Words as well as bars: `Lavax BENCH 120 / 400 (rest cap 300)`. */
  readonly text: string;
  readonly state: 'active' | 'bench' | 'dead';
}

function pct(value: number, max: number): number {
  return max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
}

/** Pure view-model for one bench row. */
export function benchRowView(r: BenchRow): BenchRowView {
  const state = r.dead ? 'dead' : r.active ? 'active' : 'bench';
  const label = state === 'dead' ? 'DEAD' : state === 'active' ? 'ACTIVE' : 'BENCH';
  const hp = String(Math.round(r.hp));
  const max = String(Math.round(r.maxHp));
  const cap = String(Math.round(r.restCap));
  return {
    name: r.name,
    hpPct: pct(r.hp, r.maxHp),
    restPct: pct(r.restCap, r.maxHp),
    text: `${r.name} ${label} ${hp} / ${max} (rest cap ${cap})`,
    state,
  };
}

const POLL_MS = 200;

/**
 * "Bench" panel of tester mode: every hero on the player's team with current health, the max, and the rest ceiling that
 * benched heroes heal toward, so the owner can watch health recover between swaps. Polls the running Arena while one is attached.
 */
export function mountBenchPanel(session: TesterSession, host: HTMLElement = document.body): () => void {
  const box = el('div', 'testerBench');
  box.id = 'testerBench';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Bench health (tester mode)');
  box.hidden = true;
  host.append(box);

  const render = (): void => {
    const arena = session.arena;
    const show = session.enabled && session.options.benchHud && arena !== undefined;
    box.hidden = !show;
    if (!show) return;
    const rows = arena.bench();
    // Rebuild only when the row set changed; otherwise update in place so the DOM is not churned 5 times a second.
    if (box.childElementCount !== rows.length + 1) {
      box.replaceChildren(el('div', 'testerBenchTitle', 'Bench (health / max, grey = rest cap)'));
      for (const r of rows) {
        const row = el('div', 'testerBenchRow');
        const text = el('div', 'testerBenchText');
        const track = el('div', 'testerBenchTrack');
        track.append(el('div', 'testerBenchRest'), el('div', 'testerBenchHp'));
        row.append(text, track);
        row.dataset['id'] = String(r.id);
        box.append(row);
      }
    }
    rows.forEach((r, i) => {
      const row = box.children.item(i + 1);
      if (!row) return;
      const v = benchRowView(r);
      row.className = `testerBenchRow testerBench-${v.state}`;
      const text = row.querySelector('.testerBenchText');
      if (text && text.textContent !== v.text) text.textContent = v.text;
      row.setAttribute('data-hp', String(r.hp));
      row.setAttribute('data-max', String(r.maxHp));
      row.setAttribute('data-rest-cap', String(r.restCap));
      const hp = row.querySelector<HTMLElement>('.testerBenchHp');
      const rest = row.querySelector<HTMLElement>('.testerBenchRest');
      if (hp) hp.style.width = `${v.hpPct.toFixed(1)}%`;
      if (rest) rest.style.width = `${v.restPct.toFixed(1)}%`;
    });
  };

  const timer = setInterval(render, POLL_MS);
  const off = session.subscribe(render);
  render();
  return () => {
    clearInterval(timer);
    off();
    box.remove();
  };
}
