import {
  PAD_DEADZONE_DEFAULT,
  PAD_DEADZONE_MAX,
  PAD_DEADZONE_MIN,
  PAD_ROWS,
  getPadDeadzone,
  setPadDeadzone,
  getPadOverrides,
  padBind,
  padButtonFor,
  padButtonLabel,
  setPadOverrides,
  type PadOverrides,
} from '../../game/platform/input/pad-bindings';
import { el } from '../dom';

export interface PadSection {
  readonly node: HTMLElement;
  /** Stops any capture in progress (call on unmount). */
  dispose(): void;
}

const POLL_MS = 50;

function pads(): readonly (Gamepad | null)[] {
  try {
    return typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [];
  } catch {
    return [];
  }
}

/** Indices of every pressed button on every connected pad. */
function heldButtons(): Set<number> {
  const held = new Set<number>();
  for (const p of pads()) p?.buttons.forEach((b, i) => (b.pressed || b.value > 0.5 ? held.add(i) : undefined));
  return held;
}

/**
 * The gamepad part of the controls screen: one button per action; activate it (Enter or Space or a click), then press the
 * new button on the pad. Everything is announced in words through its own status region; Escape cancels, Tab leaves.
 */
export function padBindingsSection(): PadSection {
  let overrides: PadOverrides = getPadOverrides();
  let stop: (() => void) | null = null;
  const node = el('section', 'padBindings');
  node.setAttribute('aria-labelledby', 'padBindingsHeading');
  const heading = el('h2', undefined, 'Gamepad buttons');
  heading.id = 'padBindingsHeading';
  const help = el(
    'p',
    undefined,
    'Choose an action, then press the new button on your gamepad. Escape cancels. A button used by another action is swapped with it.',
  );
  const status = el('div', 'menuStatus');
  status.setAttribute('role', 'status');
  const table = el('table', 'keyBindingTable');
  const caption = el('caption', undefined, 'Gamepad controls');
  caption.className = 'srOnly';
  table.append(caption);
  const head = el('tr');
  for (const h of ['Action', 'Button']) {
    const th = el('th', undefined, h);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  table.append(thead, body);

  const save = (next: PadOverrides): void => {
    overrides = next;
    setPadOverrides(next, true);
  };

  const render = (): void => {
    body.replaceChildren();
    for (const row of PAD_ROWS) {
      const label = padButtonLabel(padButtonFor(overrides, row.id));
      const btn = el('button', 'menuButton', label);
      btn.type = 'button';
      btn.id = `pad-${row.id}`;
      btn.setAttribute('aria-label', `${row.label}, gamepad button: ${label}. Activate to change.`);
      btn.addEventListener('click', () => {
        startCapture(row.id, row.label, btn);
      });
      const tr = el('tr');
      const th = el('th', undefined, row.label);
      th.scope = 'row';
      const td = el('td');
      td.append(btn);
      tr.append(th, td);
      body.append(tr);
    }
  };

  const finish = (focusId: string | null): void => {
    stop?.();
    stop = null;
    render();
    if (focusId !== null) document.getElementById(focusId)?.focus();
  };

  const startCapture = (id: string, label: string, btn: HTMLElement): void => {
    stop?.();
    btn.textContent = 'Press a button...';
    btn.classList.add('keyCapturing');
    status.textContent =
      pads().some((p) => p !== null)
        ? `Press the new gamepad button for ${label}. Escape cancels.`
        : `No gamepad detected. Connect one and press any button on it, then press the new button for ${label}. Escape cancels.`;
    // Buttons already down when capture starts (the one that was just used to confirm) never count.
    const ignore = heldButtons();
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Tab') {
        finish(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || e.code !== 'Escape') return;
      status.textContent = 'Cancelled.';
      finish(btn.id);
    };
    const timer = setInterval(() => {
      const held = heldButtons();
      for (const i of [...ignore]) if (!held.has(i)) ignore.delete(i);
      const hit = [...held].find((i) => !ignore.has(i));
      if (hit === undefined) return;
      const r = padBind(overrides, id, hit);
      save(r.overrides);
      const name = padButtonLabel(hit);
      status.textContent =
        r.swappedWith === undefined
          ? `${label} is now ${name}.`
          : `${label} is now ${name}; ${r.swappedWith} took its old button.`;
      finish(btn.id);
    }, POLL_MS);
    window.addEventListener('keydown', onKey, true);
    stop = () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  };

  const reset = el('button', 'menuButton', 'Reset gamepad buttons');
  reset.type = 'button';
  reset.id = 'resetPadBindings';
  reset.addEventListener('click', () => {
    save({});
    status.textContent = 'Gamepad buttons reset to defaults.';
    finish(null);
  });

  render();
  const dzLabel = el('label', 'settingsOption', 'Stick deadzone: ');
  const dz = el('input');
  dz.type = 'range';
  dz.id = 'padDeadzone';
  dz.min = String(PAD_DEADZONE_MIN);
  dz.max = String(PAD_DEADZONE_MAX);
  dz.step = '0.05';
  const dzText = el('span');
  const showDz = (v: number): void => {
    dz.value = String(v);
    const pct = `${String(Math.round(v * 100))} percent`;
    dz.setAttribute('aria-valuetext', pct);
    dzText.textContent = ` ${pct}`;
  };
  showDz(getPadDeadzone());
  dz.addEventListener('input', () => {
    setPadDeadzone(Number(dz.value), true);
    showDz(getPadDeadzone());
  });
  const dzHelp = el('p', undefined, 'A higher deadzone ignores small stick movements (drift); a lower one reacts sooner.');
  const dzReset = el('button', 'menuButton', 'Reset stick deadzone');
  dzReset.type = 'button';
  dzReset.id = 'resetPadDeadzone';
  dzReset.addEventListener('click', () => {
    setPadDeadzone(PAD_DEADZONE_DEFAULT, true);
    showDz(getPadDeadzone());
    status.textContent = 'Stick deadzone reset to 40 percent.';
  });
  dzLabel.append(dz, dzText);
  const dzBox = el('div');
  dzBox.append(dzLabel, dzHelp, dzReset);
  node.append(heading, help, table, reset, dzBox, status);
  return {
    node,
    dispose() {
      stop?.();
      stop = null;
    },
  };
}
