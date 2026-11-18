import type { CharacterId } from '@core/index';
import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { raceLabel } from '@ui/screens/arcade-versus';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor } from './arcade-pick';
import { controlsFor, type ControlId, type QuickState } from './online-quick-model';

/**
 * DOM of the Online quick-match screen. No logic of its own beyond which controls show in which state (`controlsFor`); the
 * controller (online-quick.ts) owns the words and the network. Every control has a stable id for tests and e2e.
 */
export interface QuickHandlers {
  readonly find: () => void;
  readonly cancel: () => void;
  readonly ready: () => void;
  readonly retry: () => void;
  readonly reload: () => void;
  readonly again: () => void;
  readonly leave: () => void;
  readonly report: () => void;
}

export interface QuickView {
  readonly root: HTMLElement;
  show(state: QuickState): void;
  say(text: string): void;
  /** The failure box (role=alert); empty text hides it. */
  fail(text: string): void;
  link(text: string): void;
  /** Shows or hides the desync "Save report" button. */
  reportButton(visible: boolean): void;
  /** The three chosen heroes, as the pick form shows them. */
  pick(): { race: CharacterId; bench: CharacterId[] };
  /** Which of the picked controls are locked after Ready. */
  lockPick(locked: boolean): void;
}

function button(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'menuButton onlineBig', label);
  b.type = 'button';
  b.id = id;
  b.addEventListener('click', onClick);
  return b;
}

export function createQuickView(h: QuickHandlers): QuickView {
  const root = el('div', 'menuPage');
  const heading = el('h1', 'heading', 'Online');
  const status = el('p');
  status.id = 'quickStatus';
  status.setAttribute('role', 'status');
  const failBox = el('p', 'onlineFail');
  failBox.id = 'quickFailure';
  failBox.setAttribute('role', 'alert');
  failBox.hidden = true;
  const link = el('p', 'onlineChip');
  link.id = 'quickLink';

  const picker = el('div');
  picker.id = 'quickPick';
  const sels = ['Your hero 1', 'Your hero 2', 'Your hero 3'].map((text, i) => {
    const row = el('div', 'settingsOption');
    const lab = el('label', undefined, text);
    const sel = el('select');
    sel.id = `quickRace${String(i + 1)}`;
    lab.htmlFor = sel.id;
    for (const r of ARCADE_RACES) {
      const o = el('option', undefined, raceLabel(r));
      o.value = r;
      sel.append(o);
    }
    sel.value = [DEFAULT_PICK.player, 'pax', 'curomo'][i] ?? DEFAULT_PICK.player;
    row.append(lab, ' ', sel);
    picker.append(row);
    return sel;
  });

  const buttons: Record<Exclude<ControlId, 'quickPick' | 'quickLink' | 'quickBack'>, HTMLButtonElement> = {
    quickFind: button('quickFind', 'Find an opponent', h.find),
    quickCancel: button('quickCancel', 'Cancel', h.cancel),
    quickReady: button('quickReady', 'Ready', h.ready),
    quickRetry: button('quickRetry', 'Try again', h.retry),
    quickReload: button('quickReload', 'Reload', h.reload),
    quickAgain: button('quickAgain', 'Play again', h.again),
    quickLeave: button('quickLeave', 'Leave', h.leave),
  };
  const report = button('quickReport', 'Save report', h.report);
  report.hidden = true;
  const back = el('a', 'menuLink', 'Back');
  back.setAttribute('href', '#main');
  back.id = 'quickBack';

  const byControl = (id: ControlId): HTMLElement => {
    if (id === 'quickPick') return picker;
    if (id === 'quickLink') return link;
    if (id === 'quickBack') return back;
    return buttons[id];
  };
  const all: ControlId[] = ['quickFind', 'quickCancel', 'quickPick', 'quickReady', 'quickRetry', 'quickReload', 'quickAgain', 'quickLeave', 'quickBack', 'quickLink'];

  root.append(heading, status, failBox, link, picker, report, buttons.quickFind, buttons.quickCancel, buttons.quickReady, buttons.quickRetry, buttons.quickReload, buttons.quickAgain, buttons.quickLeave, back);
  for (const id of all) byControl(id).hidden = true;
  let first = true;

  return {
    root,
    show(state) {
      const on = controlsFor(state);
      for (const id of all) byControl(id).hidden = !on.includes(id);
      root.classList.toggle('onlineLive', state === 'playing');
      if (state === 'matched') for (const s of sels) s.disabled = false;
      buttons.quickReady.disabled = false;
      const lead = on[0];
      if (first) {
        first = false;
        focusHeading(root);
      } else if (lead !== undefined) {
        const target = state === 'matched' ? sels[0] : byControl(lead);
        target?.focus();
      }
    },
    say(text) {
      status.textContent = text;
    },
    fail(text) {
      failBox.textContent = text;
      failBox.hidden = text === '';
    },
    link(text) {
      link.textContent = text;
    },
    reportButton(visible) {
      report.hidden = !visible;
    },
    pick() {
      const race = ARCADE_RACES.find((r) => r === sels[0]?.value) ?? DEFAULT_PICK.player;
      const second = partnerFor(race, sels[1]?.value);
      return { race, bench: [second, partner2For(race, second, sels[2]?.value)] };
    },
    lockPick(locked) {
      for (const s of sels) s.disabled = locked;
      buttons.quickReady.disabled = locked;
    },
  };
}
