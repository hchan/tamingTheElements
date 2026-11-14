// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPauseDialog, pauseHint, type PauseDialog } from './pause-dialog';

let dialog: PauseDialog | undefined;
afterEach(() => {
  dialog?.destroy();
  dialog = undefined;
  document.body.replaceChildren();
});

const key = (k: string, shiftKey = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true, bubbles: true });
  document.dispatchEvent(e);
  return e;
};
const active = (): string => document.activeElement?.id ?? '';

describe('pause hint', () => {
  it('names the keys on a keyboard device and the Resume button on a touch one', () => {
    expect(pauseHint(false)).toContain('Escape');
    expect(pauseHint(true)).not.toMatch(/Escape|Shift/);
    expect(pauseHint(true)).toContain('Resume');
  });
});

describe('createPauseDialog (DOM)', () => {
  it('mounts hidden with dialog semantics, shows and focuses Resume on open', () => {
    dialog = createPauseDialog({ onResume: vi.fn() });
    const box = document.querySelector('[role="dialog"]');
    expect(box?.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('pauseOverlay')?.hidden).toBe(true);
    dialog.open();
    expect(dialog.isOpen).toBe(true);
    expect(document.getElementById('pauseOverlay')?.hidden).toBe(false);
    expect(active()).toBe('pauseResume');
  });

  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    dialog = createPauseDialog({ onResume: vi.fn() });
    dialog.open();
    dialog.close();
    expect(document.activeElement).toBe(opener);
    expect(document.getElementById('pauseOverlay')?.hidden).toBe(true);
  });

  it('Escape resumes (and is prevented) only while open', () => {
    const onResume = vi.fn();
    dialog = createPauseDialog({ onResume });
    expect(key('Escape').defaultPrevented).toBe(false);
    expect(onResume).not.toHaveBeenCalled();
    dialog.open();
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('traps Tab and Shift+Tab inside, wrapping Resume -> Exit -> Resume', () => {
    dialog = createPauseDialog({ onResume: vi.fn() });
    dialog.open();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(active()).toBe('pauseExit');
    key('Tab');
    expect(active()).toBe('pauseResume');
    key('Tab', true);
    expect(active()).toBe('pauseExit');
  });

  it('includes the tester button only when asked, in the Tab cycle, and it calls onTester', () => {
    const onTester = vi.fn();
    dialog = createPauseDialog({ onResume: vi.fn(), onTester });
    dialog.open();
    key('Tab');
    expect(active()).toBe('pauseTester');
    document.getElementById('pauseTester')?.click();
    expect(onTester).toHaveBeenCalledTimes(1);
    key('Tab');
    expect(active()).toBe('pauseExit');
  });

  it('Tab with focus outside the dialog lands on the first item, Shift+Tab on the last', () => {
    dialog = createPauseDialog({ onResume: vi.fn() });
    dialog.open();
    (document.activeElement as HTMLElement).blur();
    key('Tab');
    expect(active()).toBe('pauseResume');
    (document.activeElement as HTMLElement).blur();
    key('Tab', true);
    expect(active()).toBe('pauseExit');
  });

  it('Resume click calls onResume; destroy removes the DOM and the key listener', () => {
    const onResume = vi.fn();
    dialog = createPauseDialog({ onResume });
    dialog.open();
    document.getElementById('pauseResume')?.click();
    expect(onResume).toHaveBeenCalledTimes(1);
    dialog.destroy();
    expect(document.getElementById('pauseOverlay')).toBeNull();
    key('Escape');
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(dialog.isOpen).toBe(false);
  });

  it('mounts in a custom host', () => {
    const host = document.createElement('div');
    document.body.append(host);
    dialog = createPauseDialog({ onResume: vi.fn(), host });
    expect(host.querySelector('#pauseOverlay')).not.toBeNull();
  });

  it('Escape asks for a pause when closed (not in a text field), and Restart and the Pause button are wired', () => {
    const onPause = vi.fn();
    const onRestart = vi.fn();
    dialog = createPauseDialog({ onResume: vi.fn(), onPause, onRestart });
    key('Escape');
    expect(onPause).toHaveBeenCalledTimes(1);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }));
    expect(onPause).toHaveBeenCalledTimes(1);
    dialog.button?.click();
    expect(onPause).toHaveBeenCalledTimes(2);
    document.getElementById('pauseRestart')?.click();
    expect(onRestart).toHaveBeenCalledTimes(1);
    dialog.open();
    key('Escape');
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('has no Restart or Pause button without the options (Online)', () => {
    dialog = createPauseDialog({ onResume: vi.fn() });
    expect(dialog.button).toBeNull();
    expect(document.getElementById('pauseRestart')).toBeNull();
    expect(document.getElementById('pauseExit')?.textContent).toBe('Quit to menu');
  });
});
