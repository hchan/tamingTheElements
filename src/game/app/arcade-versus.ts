import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { arcadePickView, arcadeResultsView, raceLabel } from '@ui/screens/arcade-versus';
import { loadSave } from '@ui/screens/main-menu';
import type { Screen } from '@ui/screens/screen';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { arcadeEnabled } from '../platform/arcade-setting';
import { getUiFlags, type UiFlags } from '../platform/flags';
import { getBindings } from '../platform/input/bindings';
import { getRecordSetting } from '../platform/record-setting';
import { createReplayStore, type ReplayStore } from '../platform/storage/replay-store';
import { activeSaveStorage } from '../platform/tester/session';
import type { ArenaLaunch } from '../scenes/launch';
import { ARCADE_AI_LEVELS, ARCADE_RACES, DEFAULT_PICK, arcadeLaunch, parsePick, type ArcadePick, type ArcadeResult } from './arcade-setup';
import { downloadReplay } from './download';
import { destroyGame, type GameHandle } from './game-handle';

/**
 * The `#arcade` route (FUN-DESIGN WP 11), loaded as its own chunk: picker -> battle -> results, all inside this one screen,
 * so the story flow (`flow.ts`) and its routes stay untouched. It reads the save only to check the opt-in and has no save
 * store at all, so it cannot write progress, objectives or the garrison.
 */
export interface ArcadeVersusDeps {
  readonly flags: UiFlags;
  readonly now: () => number;
  readonly navigate: (route: string) => void;
  readonly replays: Pick<ReplayStore, 'add'>;
}

const LEVEL_LABELS: Readonly<Record<ArcadePick['level'], string>> = { easy: 'Easy (never supers)', normal: 'Normal' };
const OUTCOME_HEADINGS: Readonly<Record<ArcadeResult['outcome'], string>> = { win: 'Victory!', lose: 'Defeat', draw: 'Draw' };

/** The last pick, kept for Rematch and the next visit in this tab (memory only, never stored). */
let lastPick: ArcadePick = DEFAULT_PICK;

/**
 * Pointer-only Super button over the arena for touch: it holds the bound super key (the arena's keyboard agent listens on
 * window) for as long as the finger is down. Not in the Tab order: keyboards press the key itself.
 */
function superButton(): HTMLButtonElement {
  const b = el('button', 'menuButton', 'Super');
  b.type = 'button';
  b.id = 'arcadeSuper';
  b.tabIndex = -1;
  b.style.cssText =
    'position:absolute;right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:5;min-width:72px;min-height:48px;touch-action:none;opacity:0.85';
  let code: string | undefined;
  const release = (): void => {
    if (code === undefined) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    code = undefined;
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (code !== undefined) return;
    code = getBindings().super[0] ?? 'KeyX';
    b.setPointerCapture(e.pointerId);
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, release);
  return b;
}

export function arcadeVersusScreen(deps: ArcadeVersusDeps): Screen {
  let container: HTMLElement | undefined;
  let view: HTMLElement | undefined;
  let game: GameHandle | undefined;
  /** Bumped on every view change, so a late Phaser import or match end from an old battle is ignored. */
  let epoch = 0;
  let offKeys: (() => void) | undefined;

  const show = (next: HTMLElement): void => {
    epoch++;
    offKeys?.();
    offKeys = undefined;
    // Phaser removes its canvas a frame later; destroyGame drops the old battle node once it has.
    if (game) destroyGame(game, view);
    else view?.remove();
    game = undefined;
    view = next;
    container?.append(next);
    focusHeading(next);
  };

  const showPick = (): void => {
    show(
      arcadePickView({
        races: ARCADE_RACES,
        levels: ARCADE_AI_LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
        current: lastPick,
        onStart: (v) => {
          lastPick = parsePick(v);
          startBattle();
        },
      }),
    );
    // Escape goes back from the picker only (the route's backHash is null because the battle lives here too).
    const onKey = (e: KeyboardEvent): void => {
      // A select keeps Escape (it closes its list), as text fields do in shouldGoBack.
      if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        deps.navigate('main');
      }
    };
    document.addEventListener('keydown', onKey);
    offKeys = () => {
      document.removeEventListener('keydown', onKey);
    };
  };

  const showResults = (r: ArcadeResult): void => {
    const replay = r.replay;
    show(
      arcadeResultsView({
        heading: OUTCOME_HEADINGS[r.outcome],
        summary:
          `${raceLabel(r.pick.player)} against the AI's ${raceLabel(r.pick.enemy)}, AI ${LEVEL_LABELS[r.pick.level]}. ` +
          'Arcade Versus saves nothing: no XP, no capture, no progress.',
        onRematch: startBattle,
        onChange: showPick,
        ...(replay ? { onDownload: () => { downloadReplay(replay); } } : {}),
      }),
    );
  };

  function startBattle(): void {
    const battle = el('div');
    battle.id = 'battle';
    show(battle);
    const mine = epoch;
    if (!detectWebgl(deps.flags.forceNoWebgl, () => document.createElement('canvas'))) {
      showWebglError(battle);
      return;
    }
    battle.append(el('h1', 'heading', 'Loading...'));
    focusHeading(battle);
    const launch: ArenaLaunch = arcadeLaunch(lastPick, deps.flags.seed ?? deps.now() >>> 0, {
      record: deps.flags.record || getRecordSetting(),
      replays: deps.replays,
      onResult: (r) => {
        if (epoch === mine) showResults(r);
      },
    });
    import('../boot/phaser-config')
      .then(({ createGame }) => {
        if (epoch !== mine) return;
        const host = el('div');
        host.id = 'game';
        battle.replaceChildren(host);
        game = createGame(host, launch);
        host.append(superButton());
      })
      .catch((e: unknown) => {
        if (epoch !== mine) return;
        if (game) destroyGame(game, undefined);
        game = undefined;
        showErrorScreen(battle, 'The battle could not start', e instanceof Error ? e.message : String(e));
      });
  }

  return {
    mount: (c) => {
      container = c;
      // Off unless opted in (Settings) or `?ff=arcade`: a typed #arcade goes to the Classic menu.
      if (!arcadeEnabled(loadSave(activeSaveStorage()))) {
        deps.navigate('main');
        return;
      }
      showPick();
    },
    unmount: () => {
      epoch++;
      offKeys?.();
      offKeys = undefined;
      destroyGame(game, view);
      game = undefined;
      view = undefined;
      container = undefined;
    },
  };
}

/** The route's one live instance (`main.ts` loads this chunk on first use and calls these two). */
let active: Screen | undefined;

/** The page's flags, clock, hash navigation and the local replay store (its own instance; it opens IndexedDB lazily). */
function browserDeps(): ArcadeVersusDeps {
  return {
    flags: getUiFlags(window.location.search),
    now: () => Date.now(),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
    replays: createReplayStore(() => Date.now()),
  };
}

export function mountArcade(container: HTMLElement, deps: ArcadeVersusDeps = browserDeps()): void {
  active?.unmount();
  active = arcadeVersusScreen(deps);
  active.mount(container);
}

export function unmountArcade(): void {
  active?.unmount();
  active = undefined;
}
