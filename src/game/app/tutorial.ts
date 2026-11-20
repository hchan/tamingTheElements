import { el, navigateHash } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { ringBox, tutorialOverlay, type TutorialOverlay } from '@ui/screens/tutorial-overlay';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getPrefs } from '../platform/a11y/prefs';
import { getUiFlags } from '../platform/flags';
import type { ActionSlot } from '../hud/action-bar';
import { destroyGame, type GameHandle } from './game-handle';
import { ABILITY_CMD, tutorialLaunch } from './tutorial-setup';
import { advance, currentStep, initialProgress, isFinished, TUTORIAL_STEPS, type TutorialEvent, type TutorialProgress, type TutorialTarget } from './tutorial-steps';

/**
 * The `#tutorial` route (Help > Practice), its own chunk: the real fight against an idle foe, with the lesson card, a ring over
 * the slot to use and a Skip button laid over it. No save store, no recording. If the match ends before the lessons are done
 * (the foe is knocked out for good), the fight restarts and the lesson progress is kept.
 */
export const SIM_EVENT = 'tte:sim-event';
/** How often the ring follows the action bar (CSS px can change on resize). */
const RING_POLL_MS = 100;
const EVENT_KINDS: ReadonlySet<string> = new Set(['super', 'weather', 'cleanse', 'patch', 'patchLeft', 'heal', 'blocked']);

/** The part of the Arena's action bar the ring needs (a narrow view of a private member; the bar already exposes both). */
interface BarProbe {
  screenSlots(): { x: number; y: number; size: number }[];
  readonly currentSlots: readonly ActionSlot[];
}

/** Which slot a lesson points at (pure, for tests). */
export function slotIndex(slots: readonly Pick<ActionSlot, 'kind' | 'cmd'>[], target: TutorialTarget): number {
  if (target.kind === 'ability') return slots.findIndex((s) => s.kind === 'ability' && s.cmd === ABILITY_CMD[target.which]);
  return slots.findIndex((s) => s.kind === target.kind);
}

let stop: (() => void) | undefined;

export function mountTutorial(container: HTMLElement): void {
  stop?.();
  const flags = getUiFlags(window.location.search);
  let epoch = 0;
  let progress: TutorialProgress = initialProgress();
  let game: GameHandle | undefined;
  let battle: HTMLElement | undefined;
  let overlay: TutorialOverlay | undefined;
  let bar: BarProbe | undefined;
  let timer: number | undefined;
  let canvasHost: HTMLElement | undefined;

  const reduced = (): boolean => getPrefs().reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const refresh = (): void => {
    const step = currentStep(progress);
    overlay?.setLesson(step ?? null, progress.index, TUTORIAL_STEPS.length);
    if (isFinished(progress)) overlay?.showDone('You know the basics: attack, abilities, the Super, elements, Weather, Cleanse, Guard and the four terrain patches. Pick a hero in Versus to try them for real.');
  };

  const place = (): void => {
    const step = currentStep(progress);
    const canvas = canvasHost?.querySelector('canvas');
    if (!overlay || !bar || !canvas || !step?.target) {
      overlay?.setRing(null);
      return;
    }
    if (step.id === 'guard' && bar.currentSlots.some((s) => s.kind === 'guard' && s.highlight)) {
      feed({ kind: 'guard' });
      return;
    }
    const slots = bar.screenSlots();
    const i = slotIndex(bar.currentSlots, step.target);
    const slot = slots[i];
    if (!slot || i < 0) {
      overlay.setRing(null);
      return;
    }
    const c = canvas.getBoundingClientRect();
    const p = canvasHost?.getBoundingClientRect() ?? { left: 0, top: 0 };
    overlay.setRing(ringBox(slot, { left: c.left, top: c.top, width: c.width, height: c.height }, p));
  };

  /** One more event for the lessons; a lesson on another scene restarts the fight there (the progress is kept). */
  const feed = (ev: TutorialEvent): void => {
    const before = currentStep(progress)?.scene;
    progress = advance(progress, ev);
    refresh();
    place();
    const after = currentStep(progress)?.scene;
    if (after !== undefined && after !== before) startBattle();
  };

  const onSim = (e: Event): void => {
    const d = (e as CustomEvent<{ kind: string; ability?: number }>).detail;
    const ev: TutorialEvent | undefined = d.kind === 'hit' ? { kind: 'hit', ability: d.ability ?? -1 } : EVENT_KINDS.has(d.kind) ? ({ kind: d.kind } as TutorialEvent) : undefined;
    if (ev) feed(ev);
  };

  const leave = (): void => {
    navigateHash('help');
  };

  const startBattle = (): void => {
    const mine = ++epoch;
    if (game) destroyGame(game, battle);
    else battle?.remove();
    game = undefined;
    bar = undefined;
    battle = el('div');
    battle.id = 'battle';
    container.append(battle);
    if (!detectWebgl(flags.forceNoWebgl, () => document.createElement('canvas'))) {
      showWebglError(battle);
      return;
    }
    battle.append(el('h1', 'heading', 'Loading...'));
    focusHeading(battle);
    const node = battle;
    void import('../boot/phaser-config')
      .then(({ createGame }) => {
        if (epoch !== mine) return;
        const launch = tutorialLaunch(flags.seed ?? (Date.now() >>> 0), currentStep(progress)?.scene ?? 'fire', {
          onRestart: () => { if (epoch === mine) startBattle(); },
          // The foe never fights back, so a finished match only means the lessons are not done yet: go again, progress kept.
          onResult: () => { if (epoch === mine && !isFinished(progress)) startBattle(); },
        });
        const withBar: typeof launch = {
          ...launch,
          arcadeView: (arena, v, alpha) => {
            launch.arcadeView?.(arena, v, alpha);
            bar = (arena as unknown as { actionBar?: BarProbe }).actionBar;
          },
        };
        const host = el('div');
        host.id = 'game';
        node.replaceChildren(host);
        canvasHost = host;
        game = createGame(host, withBar);
        overlay = tutorialOverlay({ onSkip: leave, reducedMotion: reduced() });
        host.append(overlay.root);
        refresh();
      })
      .catch((err: unknown) => {
        if (epoch !== mine) return;
        if (game) destroyGame(game, undefined);
        game = undefined;
        showErrorScreen(node, 'Practice could not start', err instanceof Error ? err.message : String(err));
      });
  };

  window.addEventListener(SIM_EVENT, onSim);
  timer = window.setInterval(place, RING_POLL_MS);
  startBattle();

  stop = () => {
    epoch++;
    window.removeEventListener(SIM_EVENT, onSim);
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    destroyGame(game, battle);
    game = undefined;
    battle = undefined;
    overlay = undefined;
    bar = undefined;
    stop = undefined;
  };
}

export function unmountTutorial(): void {
  stop?.();
}
