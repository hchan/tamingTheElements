import type Phaser from 'phaser';
import { counted } from '../platform/test-hook';

/** Game event emitted when a full-screen DOM overlay starts or stops blocking the arena (true = blocked). */
export const BLOCKED_EVENT = 'tte:blocked';

const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)';

export interface PresentationOptions {
  /** Show the "rotate your device" overlay on portrait phones (battle only). */
  readonly rotateHint: boolean;
}

function button(id: string, label: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.type = 'button';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  return b;
}

/**
 * DOM chrome around the Phaser canvas: fullscreen toggle (button and F key, both user gestures) and a
 * dismissible rotate hint for portrait phones. Everything is removed when the game is destroyed.
 */
export function installPresentation(game: Phaser.Game, host: HTMLElement, opts: PresentationOptions): void {
  const cleanups: (() => void)[] = [];
  // Not `counted`: this lives with the game (removed on destroy), not with a scene, so scene-teardown leak checks ignore it.
  const win = window;

  if (game.scale.fullscreen.available) {
    const fs = button('fullscreenToggle', 'Toggle fullscreen', '⛶');
    const toggle = (): void => {
      game.scale.toggleFullscreen();
    };
    fs.addEventListener('click', toggle);
    host.append(fs);
    cleanups.push(() => { fs.remove(); });
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      toggle();
    };
    win.addEventListener('keydown', onKey);
    cleanups.push(() => { win.removeEventListener('keydown', onKey); });
  }

  if (opts.rotateHint) {
    const mq = counted(window.matchMedia(PORTRAIT_QUERY));
    const overlay = document.createElement('div');
    overlay.id = 'rotateOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.hidden = true;
    const msg = document.createElement('p');
    msg.textContent = 'Rotate your device to landscape for the best view of the arena.';
    const dismiss = button('rotateDismiss', 'Play in portrait anyway', 'Play anyway');
    overlay.append(msg, dismiss);
    host.append(overlay);
    let dismissed = false;
    let blocked = false;
    const sync = (): void => {
      const show = mq.matches && !dismissed;
      overlay.hidden = !show;
      if (show !== blocked) {
        blocked = show;
        game.registry.set(BLOCKED_EVENT, show);
        game.events.emit(BLOCKED_EVENT, show);
      }
    };
    const onDismiss = (): void => { dismissed = true; sync(); };
    dismiss.addEventListener('click', onDismiss);
    mq.addEventListener('change', sync);
    sync();
    cleanups.push(() => {
      mq.removeEventListener('change', sync);
      overlay.remove();
    });
  }

  game.events.once('destroy', () => {
    for (const off of cleanups.splice(0)) off();
  });
}
