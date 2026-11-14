import { getCharacter, type CharacterId } from '@core/index';
import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { raceLabel } from '@ui/screens/arcade-versus';
import type { Screen } from '@ui/screens/screen';
import { tourCardView, tourPickView, tourSplashView, type SplashSide } from '@ui/screens/tour';
import { elementGlyph, mapLayout, tourMapView } from '@ui/screens/tour-map';
import { requestOpenTesterPanel } from '@ui/tester/install';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags, type UiFlags } from '../platform/flags';
import { tester } from '../platform/tester/session';
import type { ArenaLaunch } from '../scenes/launch';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor } from './arcade-pick';
import { destroyGame, type GameHandle } from './game-handle';
import { firstRunHint } from './first-run-hint';
import { touchStick } from './touch-stick';
import { inVisualOrder, isMeleeRace, touchButtons, watchTouch } from './touch-controls';
import { currentStage, matchSeed, parseCompleteTeam, stagePick } from './tour-match';
import { TOUR_CONTINUES, TOUR_STAGES, advance, buildTour, gameOver, startRun, useContinue, type TourRun } from './tour-model';
import { runSummary } from './tour-summary';
import { browserTourStorage, clearRun, loadRun, saveRun, type TourStorage } from './tour-store';

/**
 * The `#tour` route (FUN-DESIGN 2.18, WP-tour-shell), its own lazy chunk: pick three heroes, then nine stage cards, each leading
 * to an Arcade best-of-3 against the stage's AI team. The run is saved in its own key (`tour-store`) after every transition.
 * Arcade-gated like `#arcade`. The Classic save is read only for that opt-in and never written.
 */
export interface TourDeps {
  readonly flags: UiFlags;
  readonly navigate: (route: string) => void;
  readonly storage: TourStorage | undefined;
  /** A fresh run seed (crypto in the browser). */
  readonly randomSeed: () => number;
}

/** How long the versus splash stays before the match starts. */
const SPLASH_MS = 1200;

const ELEMENT_WORD = (e: string): string => (e[0] ?? '').toUpperCase() + e.slice(1);

export function tourScreen(deps: TourDeps): Screen {
  let container: HTMLElement | undefined;
  let view: HTMLElement | undefined;
  let game: GameHandle | undefined;
  /** Bumped on every view change, so a late Phaser import or match end from an old battle is ignored. */
  let epoch = 0;
  let offKeys: (() => void) | undefined;
  let run: TourRun | undefined;
  /** Removes the versus splash's timer and key listener, when one is up. */
  let offSplash: (() => void) | undefined;

  const show = (next: HTMLElement): void => {
    epoch++;
    offSplash?.();
    if (game) destroyGame(game, view);
    else view?.remove();
    game = undefined;
    view = next;
    container?.append(next);
    focusHeading(next);
  };

  /** Escape goes back to the menu on every card (the route has no backHash: the battle lives here too), but a select keeps it. */
  const listenEscape = (): void => {
    const onKey = (e: KeyboardEvent): void => {
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

  /** Saves the run after a transition and shows the card it lands on. */
  const set = (next: TourRun): void => {
    run = next;
    saveRun(deps.storage, next);
    showRun();
  };

  const showPick = (): void => {
    show(
      tourPickView({
        races: ARCADE_RACES,
        current: [DEFAULT_PICK.player, partnerFor(DEFAULT_PICK.player), partner2For(DEFAULT_PICK.player, partnerFor(DEFAULT_PICK.player))],
        onStart: (v) => {
          const team = parseCompleteTeam(v);
          if (team) set(startRun(team, deps.flags.seed ?? deps.randomSeed()));
        },
      }),
    );
  };

  const showResume = (saved: TourRun): void => {
    const stage = String(saved.stage + 1);
    show(
      tourCardView({
        id: 'tourResume',
        heading: 'Play',
        lines: [
          `A tour is in progress: stage ${stage} of ${String(TOUR_STAGES)}, ${String(saved.continues)} continues left, team ${saved.hero.map(raceLabel).join(', ')}.`,
        ],
        actions: [
          { id: 'tourResumeRun', label: 'Resume', onClick: () => { set(saved); } },
          { id: 'tourNew', label: 'New tour', onClick: () => { clearRun(deps.storage); showPick(); } },
        ],
      }),
    );
  };

  function showRun(): void {
    if (!run) {
      showPick();
      return;
    }
    const r = run;
    const stage = currentStage(r);
    const n = `Stage ${String(stage.index + 1)} of ${String(TOUR_STAGES)}`;
    const left = `${String(r.continues)} of ${String(TOUR_CONTINUES)} continues left`;
    const foe = stage.opponents.map(raceLabel).join(', ');
    if (r.status === 'won') {
      const sum = runSummary(r, raceLabel);
      show(
        tourCardView({
          id: 'tourEnding',
          heading: 'The tour is complete!',
          lines: [`Congratulations! You beat all ${String(TOUR_STAGES)} stages, the Eternal Void included.`, ...sum.lines],
          actions: [{ id: 'tourAgain', label: 'Play again', onClick: () => { clearRun(deps.storage); showPick(); } }],
        }),
      );
    } else if (r.status === 'over') {
      const sum = runSummary(r, raceLabel);
      show(
        tourCardView({
          id: 'tourOver',
          heading: 'Game over',
          lines: [`The tour ended at ${n}: no continues were left or you gave up.`, ...sum.lines],
          actions: [{ id: 'tourAgain', label: 'Play again', onClick: () => { clearRun(deps.storage); showPick(); } }],
        }),
      );
    } else if (r.status === 'lost') {
      show(
        tourCardView({
          id: 'tourLost',
          heading: `Defeat at ${n}`,
          lines: [`${left}.${r.continues === 0 ? ' None left: the tour is over.' : ''}`],
          actions: [
            {
              id: 'tourContinue',
              label: `Continue (${String(r.continues)} left)`,
              disabled: r.continues === 0,
              onClick: () => { set(useContinue(r)); },
            },
            { id: 'tourGiveUp', label: 'Give up', onClick: () => { set(gameOver(r)); } },
          ],
        }),
      );
    } else {
      const card = tourCardView({
        id: 'tourStage',
        heading: n,
        extra: tourMapView(
          mapLayout(buildTour(r.hero, r.seed).map((s) => s.location), r.stage, false),
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        lines: [
          `Location: ${ELEMENT_WORD(stage.location)}.`,
          `Opponent: ${foe}.`,
          `Difficulty: ${ELEMENT_WORD(stage.aiLevel)}. ${left}.`,
        ],
        actions: [{ id: 'tourFight', label: 'Fight', onClick: () => { showSplash(r); } }],
      });
      show(card);
      const mine = epoch;
      void import('@ui/screens/tour-select').then((m) => {
        if (epoch !== mine) return;
        m.enhanceStage(card, stage, r.continues, TOUR_CONTINUES, raceLabel);
      });
    }
  }

  /**
   * The versus splash: 1.2 s, skipped by Enter, Space or a click/tap. Under reduced motion it is not shown at all. The view change
   * bumps `epoch` (and `show` drops the listeners), so leaving the screen mid-splash never starts a battle.
   */
  function showSplash(r: TourRun): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      startBattle();
      return;
    }
    const stage = currentStage(r);
    const lead = (id: CharacterId, who: string): SplashSide => ({ who, name: raceLabel(id), element: getCharacter(id).element, id });
    const view2 = tourSplashView(
      `Stage ${String(stage.index + 1)} of ${String(TOUR_STAGES)}`,
      lead(r.hero[0] as CharacterId, 'You'),
      lead(stage.opponents[0] as CharacterId, 'Opponent'),
      (e) => elementGlyph(e, 32),
      stage.location === 'void' ? 'The Eternal Void' : `${ELEMENT_WORD(stage.location)} arena`,
    );
    show(view2);
    const mine = epoch;
    let done = false;
    const go = (): void => {
      if (done || epoch !== mine) return;
      done = true;
      cleanup();
      startBattle();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    };
    const timer = deps.flags.holdSplash ? undefined : window.setTimeout(go, SPLASH_MS);
    const cleanup = (): void => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      offSplash = undefined;
    };
    document.addEventListener('keydown', onKey);
    view2.addEventListener('click', go);
    offSplash = cleanup;
  }

  function startBattle(): void {
    const r = run;
    if (!r) return;
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
    const stage = currentStage(r);
    import('./arcade-setup')
      .then(({ arcadeLaunch }) => import('../boot/phaser-config').then(({ createGame }) => {
        if (epoch !== mine) return;
        const pick = stagePick(r, stage);
        const buttons = touchButtons(3, [pick.player, pick.partner, pick.partner2].filter((x) => x !== undefined).map(isMeleeRace));
        const base: ArenaLaunch = arcadeLaunch(pick, matchSeed(r, stage), {
          onView: (v) => { watchTouch(buttons, v); },
          cheats: tester.enabled,
          record: false,
          // Never recording, so the store is never written: the Tour keeps only its own run.
          replays: { add: () => Promise.reject(new Error('The Tour does not record replays')) },
          onResult: (res) => {
            if (epoch === mine) set(advance(r, res.outcome === 'win'));
          },
        });
        const launch: ArenaLaunch = tester.enabled ? { ...base, tester: { session: tester, openPanel: requestOpenTesterPanel } } : base;
        const host = el('div');
        host.id = 'game';
        battle.replaceChildren(host);
        game = createGame(host, launch);
        const firstRun = firstRunHint();
        if (firstRun) host.append(firstRun);
        host.append(...inVisualOrder(buttons), touchStick());
      }))
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
      listenEscape();
      const saved = loadRun(deps.storage);
      if (saved && (saved.status === 'playing' || saved.status === 'lost')) showResume(saved);
      else showPick();
    },
    unmount: () => {
      epoch++;
      offSplash?.();
      offKeys?.();
      offKeys = undefined;
      destroyGame(game, view);
      game = undefined;
      view = undefined;
      container = undefined;
    },
  };
}

let active: Screen | undefined;

function browserDeps(): TourDeps {
  return {
    flags: getUiFlags(window.location.search),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
    storage: browserTourStorage(),
    randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1,
  };
}

export function mountTour(container: HTMLElement, deps: TourDeps = browserDeps()): void {
  active?.unmount();
  active = tourScreen(deps);
  active.mount(container);
}

export function unmountTour(): void {
  active?.unmount();
  active = undefined;
}
