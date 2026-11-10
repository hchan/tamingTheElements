/** Pure focus-trap step: the index to focus after Tab (or Shift+Tab) among `count` focusables. */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PauseDialogOptions {
  readonly onResume: () => void;
  /** Tester mode only: adds a "Tester options" button that opens the tester panel. */
  readonly onTester?: () => void;
  /** Where the dialog is mounted; defaults to `document.body`. */
  readonly host?: HTMLElement;
}

export interface PauseDialog {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  destroy(): void;
}

/**
 * Modal pause overlay: `role="dialog"` with `aria-modal`, focus moves in on open and back on close,
 * Tab and Shift+Tab cycle inside it, and Escape resumes.
 */
export function createPauseDialog(opts: PauseDialogOptions): PauseDialog {
  const host = opts.host ?? document.body;
  const backdrop = document.createElement('div');
  backdrop.id = 'pauseOverlay';
  backdrop.className = 'pauseBackdrop';
  backdrop.hidden = true;

  const box = document.createElement('div');
  box.className = 'pauseDialog';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'pauseTitle');
  box.setAttribute('aria-describedby', 'pauseHint');

  const title = document.createElement('h2');
  title.id = 'pauseTitle';
  title.textContent = 'Paused';
  const hint = document.createElement('p');
  hint.id = 'pauseHint';
  hint.textContent = 'Press Escape or Shift P to resume.';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.id = 'pauseResume';
  resume.className = 'menuButton';
  resume.textContent = 'Resume';
  const exit = document.createElement('a');
  exit.id = 'pauseExit';
  exit.className = 'menuButton';
  exit.href = '#main';
  exit.textContent = 'Exit to menu';
  box.append(title, hint, resume);
  if (opts.onTester) {
    const tester = document.createElement('button');
    tester.type = 'button';
    tester.id = 'pauseTester';
    tester.className = 'menuButton';
    tester.textContent = 'Tester options';
    tester.addEventListener('click', opts.onTester);
    box.append(tester);
  }
  box.append(exit);
  backdrop.append(box);
  host.append(backdrop);

  let open = false;
  let returnTo: Element | null = null;

  const onKey = (e: KeyboardEvent): void => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onResume();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = items[nextFocusIndex(items.length, at, e.shiftKey)];
    e.preventDefault();
    to?.focus();
  };
  resume.addEventListener('click', () => {
    opts.onResume();
  });
  document.addEventListener('keydown', onKey);

  return {
    get isOpen() {
      return open;
    },
    open() {
      if (open) return;
      open = true;
      returnTo = document.activeElement;
      backdrop.hidden = false;
      resume.focus();
    },
    close() {
      if (!open) return;
      open = false;
      backdrop.hidden = true;
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
      returnTo = null;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      open = false;
    },
  };
}
