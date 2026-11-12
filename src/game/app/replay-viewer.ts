import { SIM_VERSION, type ReplayFile } from '@core/menu-index';
import { el } from '@ui/dom';
import type { Screen } from '@ui/screens/screen';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import type { ReplayStore } from '../platform/storage/replay-store';
import { teardown } from '../platform/test-hook';
import type { PlaybackControls, PlaybackStatus } from '../scenes/launch';
import { destroyGame, type GameHandle } from './game-handle';
import type { InputDisplay } from './input-display';

export interface ViewerDeps {
  /** Present only when recording is enabled; lists the last saved playtests. */
  readonly replays: ReplayStore | undefined;
  readonly forceNoWebgl: boolean;
}

export function describeStatus(s: PlaybackStatus): string {
  const at = `tick ${String(s.tick)} / ${String(s.total)}`;
  if (s.state === 'ok') return `OK: all hashes verified (${at})`;
  if (s.state === 'diverged') return `DIVERGED at tick ${String(s.divergentTick ?? s.tick)}`;
  return `${s.paused ? 'Paused' : 'Playing'} ${String(s.speed)}x, ${at}`;
}

/**
 * The screen-reader text: state, pause and speed only, never the tick counter, so the live region changes
 * only when something worth announcing changes (not 50 times a second).
 */
export function describeAnnouncement(s: PlaybackStatus): string {
  if (s.state === 'ok') return 'OK: all hashes verified';
  if (s.state === 'diverged') return `DIVERGED at tick ${String(s.divergentTick ?? s.tick)}`;
  return `${s.paused ? 'Paused' : 'Playing'} ${String(s.speed)}x`;
}

/** Loads a replay file (or a recent playtest) and plays it in the Arena, verifying the recorded hashes. */
export function replayViewerScreen(deps: ViewerDeps): Screen {
  let node: HTMLElement | undefined;
  let game: GameHandle | undefined;
  let host: HTMLElement | undefined;
  const life = { disposed: false, generation: 0 };

  return {
    mount: (container) => {
      const root = el('div');
      node = root;
      root.id = 'replayViewer';
      const bar = el('div', 'replayBar');
      bar.append(el('span', 'heading', 'Replay viewer'));
      const input = el('input');
      input.type = 'file';
      input.id = 'replayFile';
      input.accept = 'application/json,.json';
      const status = el('span');
      status.id = 'replayStatus';
      status.setAttribute('role', 'status');
      status.textContent = 'Choose a .replay.json file.';
      // Visible progress (tick counter) is not a live region: it updates every frame.
      const progress = el('span');
      progress.id = 'replayProgress';
      const controls: { current: PlaybackControls | undefined } = { current: undefined };
      const button = (id: string, label: string, run: (c: PlaybackControls) => void): HTMLButtonElement => {
        const b = el('button', 'menuButton', label);
        b.type = 'button';
        b.id = id;
        b.addEventListener('click', () => {
          if (controls.current) run(controls.current);
        });
        return b;
      };
      // The display is its own lazy chunk (created on the first replay) so the menu entry chunk stays small.
      const inputs: { current: InputDisplay | undefined } = { current: undefined };
      let showInputs = true;
      const toggle = el('button', 'menuButton', 'Inputs: on');
      toggle.type = 'button';
      toggle.id = 'replayInputs';
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-controls', 'inputDisplay');
      toggle.addEventListener('click', () => {
        showInputs = !showInputs;
        toggle.setAttribute('aria-pressed', String(showInputs));
        toggle.textContent = showInputs ? 'Inputs: on' : 'Inputs: off';
        inputs.current?.setVisible(showInputs);
      });
      const back = el('a', 'menuButton', 'Back');
      back.href = '#main';
      bar.append(
        input,
        button('replayPause', 'Pause', (c) => { c.setPaused(true); }),
        button('replayPlay', 'Play', (c) => { c.setPaused(false); }),
        button('replayHalf', '0.5x', (c) => { c.setSpeed(0.5); }),
        button('replay1x', '1x', (c) => { c.setSpeed(1); }),
        button('replay2x', '2x', (c) => { c.setSpeed(2); }),
        button('replayStep', 'Step', (c) => { c.step(); }),
        toggle,
        status,
        progress,
        back,
      );
      root.append(bar);
      container.append(root);

      const open = async (candidate: ReplayFile): Promise<void> => {
        const { validateReplay, setupFromHeader } = await import('@core/lazy-index');
        const checked = validateReplay(candidate);
        if (!checked.ok) {
          status.textContent = checked.message;
          return;
        }
        const replay = checked.value;
        if (!inputs.current) {
          const { createInputDisplay } = await import('./input-display');
          if (life.disposed) return;
          inputs.current ??= createInputDisplay();
          inputs.current.setVisible(showInputs);
          root.prepend(inputs.current.root);
        }
        inputs.current.setInputs(Array.isArray(replay.inputs) ? replay.inputs : undefined);
        const mine = ++life.generation;
        const stale = (): boolean => life.disposed || mine !== life.generation;
        controls.current = undefined;
        destroyGame(game, host);
        game = undefined;
        host = undefined;
        await teardown.settled;
        if (stale()) return;
        if (replay.header.simVersion !== SIM_VERSION) {
          status.textContent = `Replay is for simVersion ${String(replay.header.simVersion)}; this build is ${String(SIM_VERSION)}.`;
          return;
        }
        if (!detectWebgl(deps.forceNoWebgl, () => document.createElement('canvas'))) {
          showWebglError(root);
          return;
        }
        const { createGame } = await import('../boot/phaser-config');
        if (stale()) return;
        const mountPoint = el('div');
        mountPoint.id = 'game';
        root.prepend(mountPoint);
        host = mountPoint;
        game = createGame(mountPoint, {
          setup: setupFromHeader(replay.header),
          playback: {
            replay,
            onStatus: (s) => {
              progress.textContent = describeStatus(s);
              inputs.current?.update(s.tick);
              const text = describeAnnouncement(s);
              if (status.textContent !== text) status.textContent = text;
              status.dataset['state'] = s.state;
            },
            attach: (c) => {
              controls.current = c;
            },
          },
        });
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        void file
          .text()
          .then(async (text) => {
            const { parseReplayChecked } = await import('@core/lazy-index');
            const r = parseReplayChecked(text);
            if (!r.ok) {
              status.textContent = r.message;
              return undefined;
            }
            return open(r.value);
          })
          .catch((e: unknown) => {
            status.textContent = `Invalid replay: ${e instanceof Error ? e.message : String(e)}`;
          });
      });

      void deps.replays?.list().then((entries) => {
        if (life.disposed || entries.length === 0) return;
        const recent = el('span');
        recent.append('Recent: ');
        entries.forEach((entry, i) => {
          const b = el('button', 'menuButton', `#${String(i + 1)} (${String(entry.replay.header.tickCount)} ticks)`);
          b.type = 'button';
          b.addEventListener('click', () => {
            void open(entry.replay);
          });
          recent.append(b);
        });
        bar.append(recent);
      });
    },
    unmount: () => {
      life.disposed = true;
      // Phaser removes the canvas itself on destroy, so the DOM stays until then.
      destroyGame(game, node);
      game = undefined;
      host = undefined;
      node = undefined;
    },
  };
}
