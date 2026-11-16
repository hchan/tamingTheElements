import type Phaser from 'phaser';
import { counted } from '../platform/test-hook';
import { PORTRAIT_PLAY, PORTRAIT_PLAY_QUERY, PORTRAIT_QUERY } from './portrait-play';

export { PORTRAIT_QUERY };

/** Game event emitted when a full-screen DOM overlay starts or stops blocking the arena (true = blocked). */
export const BLOCKED_EVENT = 'tte:blocked';

export interface PresentationOptions {
  /** Show the "rotate your device" overlay on portrait phones (battle only). */
  readonly rotateHint: boolean;
  /** Pin the canvas under a top strip on coarse-pointer portrait phones (never in cinematics). */
  readonly portraitPlay?: boolean;
}

/** Game that currently owns `html[data-portrait-play]`: a destroyed game must not clear the flag a newer game set. */
let attrOwner: unknown;

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

  let overlayVisible = (): boolean => false;
  const playMq = opts.portraitPlay ? counted(window.matchMedia(PORTRAIT_PLAY_QUERY)) : undefined;
  let play = false;
  const setAttr = (on: boolean): void => {
    if (on) {
      attrOwner = game;
      document.documentElement.setAttribute('data-portrait-play', '');
    } else if (attrOwner === game) {
      attrOwner = undefined;
      document.documentElement.removeAttribute('data-portrait-play');
    }
  };
  const syncPlay = (): void => {
    const next = !!playMq?.matches && !overlayVisible();
    if (next === play) return;
    play = next;
    setAttr(play);
    game.registry.set(PORTRAIT_PLAY, play);
    // The canvas moved: recache its bounds for input.
    if (game.isBooted) game.scale.refresh();
  };
  if (playMq) {
    playMq.addEventListener('change', syncPlay);
    cleanups.push(() => {
      playMq.removeEventListener('change', syncPlay);
      play = false;
      setAttr(false);
      game.registry.set(PORTRAIT_PLAY, false);
    });
  }

  if (opts.rotateHint) {
    const mq = counted(window.matchMedia(PORTRAIT_QUERY));
    const overlay = document.createElement('div');
    overlay.id = 'rotateOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.hidden = true;
    const msg = document.createElement('p');
    msg.textContent = 'Rotate your device to landscape for the best view of the arena.';
    const dismiss = button('rotateDismiss', 'Play anyway in portrait', 'Play anyway');
    overlay.append(msg, dismiss);
    host.append(overlay);
    let dismissed = false;
    let blocked = false;
    overlayVisible = (): boolean => mq.matches && !dismissed;
    const sync = (): void => {
      const show = mq.matches && !dismissed;
      overlay.hidden = !show;
      if (show !== blocked) {
        blocked = show;
        game.registry.set(BLOCKED_EVENT, show);
        game.events.emit(BLOCKED_EVENT, show);
      }
      syncPlay();
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

  syncPlay();

  game.events.once('destroy', () => {
    for (const off of cleanups.splice(0)) off();
  });
}
