import { el } from '@ui/dom';

/**
 * Input display for the replay viewer: the recent commands of both fighters as direction plus button chips. Pure
 * presentation over the recorded u16 streams (the bit layout is `Cmd` in src/core/sim/commands.ts, pinned by a test);
 * it never touches the sim.
 */

/** A run-length coded u16 stream, `[value, count, ...]` (the replay file's `inputs` entries). */
type Rle = readonly number[];

const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

/** Button bits in display order, with a short label and a spoken name. Bit 6 is the Snag (or trap) button. */
export const INPUT_BUTTONS: readonly { readonly bit: number; readonly label: string; readonly name: string }[] = [
  { bit: 1 << 4, label: 'A', name: 'attack' },
  { bit: 1 << 5, label: 'B', name: 'special' },
  { bit: 1 << 6, label: 'S', name: 'snag' },
  { bit: 1 << 7, label: '1', name: 'swap 1' },
  { bit: 1 << 8, label: '2', name: 'swap 2' },
  { bit: 1 << 9, label: '3', name: 'swap 3' },
  { bit: 1 << 10, label: '4', name: 'swap 4' },
  { bit: 1 << 11, label: 'D', name: 'dash' },
  { bit: 1 << 12, label: 'G', name: 'guard' },
  { bit: 1 << 13, label: 'U', name: 'super' },
  { bit: 1 << 14, label: 'W', name: 'weather' },
  { bit: 1 << 15, label: 'C', name: 'charge' },
];

const ARROWS: Record<string, readonly [string, string]> = {
  '0,0': ['', 'neutral'],
  '0,-1': ['↑', 'up'],
  '0,1': ['↓', 'down'],
  '-1,0': ['←', 'left'],
  '1,0': ['→', 'right'],
  '-1,-1': ['↖', 'up-left'],
  '1,-1': ['↗', 'up-right'],
  '-1,1': ['↙', 'down-left'],
  '1,1': ['↘', 'down-right'],
};

export interface CommandText {
  /** Visible text, for example "↗ A+B"; "·" for no input. */
  readonly text: string;
  /** Screen-reader text, for example "up-right, attack, special"; "no input" for none. */
  readonly spoken: string;
}

/** Opposing directions cancel, as in the sim's axis helpers. */
export function describeCommand(cmd: number): CommandText {
  const x = ((cmd & RIGHT) !== 0 ? 1 : 0) - ((cmd & LEFT) !== 0 ? 1 : 0);
  const y = ((cmd & DOWN) !== 0 ? 1 : 0) - ((cmd & UP) !== 0 ? 1 : 0);
  const [arrow, dir] = ARROWS[`${String(x)},${String(y)}`] as readonly [string, string];
  const pressed = INPUT_BUTTONS.filter((b) => (cmd & b.bit) !== 0);
  const text = [arrow, pressed.map((b) => b.label).join('+')].filter((s) => s !== '').join(' ');
  const spoken = [...(dir === 'neutral' ? [] : [dir]), ...pressed.map((b) => b.name)].join(', ');
  return { text: text === '' ? '·' : text, spoken: spoken === '' ? 'no input' : spoken };
}

export interface InputRun {
  readonly cmd: number;
  /** Ticks the command was held. */
  readonly ticks: number;
}

/**
 * The most recent `limit` runs of identical commands among ticks `0 .. tick-1` (the ticks already simulated), newest
 * first. Adjacent RLE entries with the same value merge into one run.
 */
export function recentRuns(rle: Rle, tick: number, limit: number): InputRun[] {
  const spans: { cmd: number; ticks: number }[] = [];
  let end = 0;
  for (let i = 0; i + 1 < rle.length && end < tick; i += 2) {
    const n = Math.min(rle[i + 1] as number, tick - end);
    end += n;
    const cmd = rle[i] as number;
    const last = spans[spans.length - 1];
    if (last?.cmd === cmd) last.ticks += n;
    else spans.push({ cmd, ticks: n });
  }
  return spans.slice(-limit).reverse();
}

export interface InputDisplay {
  readonly root: HTMLElement;
  /** Shows the history up to `tick` (ticks already simulated). Cheap when nothing changed. */
  update(tick: number): void;
  /** Swaps in the replay's streams (or clears them). */
  setInputs(inputs: readonly [Rle, Rle] | undefined): void;
  setVisible(visible: boolean): void;
}

const ROWS = 6;

export function createInputDisplay(): InputDisplay {
  const root = el('div');
  root.id = 'inputDisplay';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Input display');
  let inputs: readonly [Rle, Rle] | undefined;
  let tickNow = 0;

  const lists = [0, 1].map((side) => {
    const col = el('div', 'inputCol');
    const list = el('ol', 'inputList');
    list.id = `inputList${String(side + 1)}`;
    list.setAttribute('aria-label', `Player ${String(side + 1)} recent inputs, newest first`);
    col.append(el('div', 'inputTitle', `Player ${String(side + 1)}`), list);
    root.append(col);
    return list;
  });

  const render = (): void => {
    if (root.hidden) return;
    lists.forEach((list, side) => {
      const rle = inputs?.[side as 0 | 1];
      const runs = rle ? recentRuns(rle, tickNow, ROWS) : [];
      const key = runs.map((r) => `${String(r.cmd)}x${String(r.ticks)}`).join(',');
      if (list.dataset['key'] === key) return;
      list.dataset['key'] = key;
      list.replaceChildren(
        ...runs.map((r, i) => {
          const d = describeCommand(r.cmd);
          const li = el('li', i === 0 ? 'inputRun inputNow' : 'inputRun');
          li.dataset['cmd'] = String(r.cmd);
          li.setAttribute('aria-label', `${d.spoken}, ${String(r.ticks)} ticks`);
          li.append(el('span', 'inputKeys', d.text), el('span', 'inputTicks', `×${String(r.ticks)}`));
          return li;
        }),
      );
    });
  };

  return {
    root,
    update: (tick) => {
      tickNow = tick;
      render();
    },
    setInputs: (next) => {
      inputs = next;
      tickNow = 0;
      for (const l of lists) delete l.dataset['key'];
      render();
    },
    setVisible: (visible) => {
      root.hidden = !visible;
      render();
    },
  };
}
