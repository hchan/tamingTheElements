import { el, navigateHash } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { arcadePickView, arcadeResultsView, raceLabel } from '@ui/screens/arcade-versus';
import type { Screen } from '@ui/screens/screen';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags, type UiFlags } from '../platform/flags';
import { controlsHint, P2_BINDINGS } from '../input/local-two';
import { getBindings } from '../platform/input/bindings';
import { afterArenaCreate, anySnag, firstRunHint } from './first-run-hint';
import { touchStick } from './touch-stick';
import { touchStrikes } from './touch-strike';
import { inVisualOrder, isMeleeRace, touchButtons, watchTouch } from './touch-controls';
import { getRecordSetting } from '../platform/record-setting';
import { createReplayStore, type ReplayStore } from '../platform/storage/replay-store';
import { requestOpenTesterPanel } from '@ui/tester/install';
import { ARCADE_SNAG_SLOT, getCharacter, type CharacterId } from '@core/index';
import { tester } from '../platform/tester/session';
import type { ArenaLaunch } from '../scenes/launch';
import { ARCADE_AI_LEVELS, ARCADE_RACES, DEFAULT_PICK, arcadeRacesFor, VOID_BOSS, flagFallbackWarnings, isCompletePick, parsePick, partner2For, partnerFor, type ArcadePick } from './arcade-pick';
import type { ArcadeHero, ArcadeResult } from './arcade-setup';
import { downloadReplay } from './download';
import { destroyGame, type GameHandle } from './game-handle';
import { seedForStage } from './tour-match';

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

const LEVEL_LABELS: Readonly<Record<ArcadePick['level'], string>> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const LOCAL_HEADINGS: Readonly<Record<ArcadeResult['outcome'], string>> = { win: 'Player 1 wins!', lose: 'Player 2 wins!', draw: 'Draw' };
const OUTCOME_HEADINGS: Readonly<Record<ArcadeResult['outcome'], string>> = { win: 'Victory!', lose: 'Defeat', draw: 'Draw' };

/** The last pick, kept for Rematch and the next visit in this tab (memory only, never stored). */
let lastPick: ArcadePick = DEFAULT_PICK;
/** Dev and test builds only: `?foe=eternal-void` is allowed. */
const DEV_BUILD = import.meta.env.DEV || import.meta.env.MODE === 'test';
/** `?hero=` / `?foe=` (dev and test builds) start the real Versus fight once per page load, on the hero's own stage. */
let flagStarted = false;

/** How long the battle key hint stays before it fades out (the keys stay on the pause screen and Help). */
export const KEYS_HINT_MS = 8000;

/**
 * Both players' keys as words, along the bottom-left of a local two-player battle, just above the action bar (the bar is 80 of
 * the 720 logical px high, so a percentage keeps it clear at any size). Fades out after `KEYS_HINT_MS`.
 */
export function keysHint(fadeMs = KEYS_HINT_MS): HTMLElement {
  const p = el('p', undefined, `${controlsHint('Player 1', getBindings())}. ${controlsHint('Player 2', P2_BINDINGS)}.`);
  p.id = 'arcadeKeysHint';
  p.style.cssText =
    'position:absolute;left:4px;bottom:34%;right:40%;margin:0;z-index:4;font-size:11px;line-height:1.2;pointer-events:none;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000;transition:opacity 1s';
  // Harmless if the battle view has gone by then (the timer only touches this detached node).
  window.setTimeout(() => {
    p.style.opacity = '0';
  }, fadeMs);
  return p;
}

/** "Sindarosa (fire) 45% left, Pax (earth) knocked out": one team's heroes at the end of a 2v2 or 3v3 match. */
const team = (heroes: readonly ArcadeHero[], t: number): string =>
  heroes.filter((h) => h.team === t).map((h) => `${raceLabel(h.race)} ${h.pct ? `${String(h.pct)}% left` : 'knocked out'}`).join(', ');

/**
 * The heroes the match-end beat shows. Against the AI the player's own hero is large on every outcome (the foe sits beside it,
 * smaller; equal on a draw). In a local match the winner is large, so the headline ("Player 2 wins!") matches the portrait.
 */
const heroesOf = (r: ArcadeResult): { winner: { id: CharacterId; name: string }; opponent: { id: CharacterId; name: string } } => {
  const mine = { id: r.pick.player, name: raceLabel(r.pick.player) };
  const theirs = { id: r.pick.enemy, name: raceLabel(r.pick.enemy) };
  return r.pick.local && r.outcome === 'lose' ? { winner: theirs, opponent: mine } : { winner: mine, opponent: theirs };
};

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

  /** Escape leaves for the main menu (the route's backHash is null because the battle lives here too); a select keeps it. */
  const escapeToMenu = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      deps.navigate('main');
    }
  };
  const listenEscape = (extra?: (e: KeyboardEvent) => void): void => {
    const onKey = (e: KeyboardEvent): void => {
      escapeToMenu(e);
      extra?.(e);
    };
    document.addEventListener('keydown', onKey);
    offKeys = () => {
      document.removeEventListener('keydown', onKey);
    };
  };

  const showPick = (): void => {
    show(
      arcadePickView({
        races: arcadeRacesFor(window.location.search),
        levels: ARCADE_AI_LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
        current: {
          ...lastPick,
          mode: lastPick.local ? 'local' : 'ai',
          stage: lastPick.stage ?? '',
          size: lastPick.partner2 ? '3' : lastPick.partner ? '2' : '1',
          partner: partnerFor(lastPick.player, lastPick.partner),
          partner2: partner2For(lastPick.player, partnerFor(lastPick.player, lastPick.partner), lastPick.partner2),
          enemyPartner: partnerFor(lastPick.enemy, lastPick.enemyBench?.[0]),
          enemyPartner2: partner2For(lastPick.enemy, partnerFor(lastPick.enemy, lastPick.enemyBench?.[0]), lastPick.enemyBench?.[1]),
        },
        onStart: (v) => {
          if (!isCompletePick(v)) return;
          lastPick = parsePick(v);
          startBattle();
        },
      }),
    );
    listenEscape();
  };

  const showResults = (r: ArcadeResult): void => {
    const replay = r.replay;
    show(
      arcadeResultsView({
        heading: r.pick.local ? LOCAL_HEADINGS[r.outcome] : OUTCOME_HEADINGS[r.outcome],
        summary:
          (r.pick.local
            ? r.heroes
              ? `Player 1's team: ${team(r.heroes, 0)}. Player 2's team: ${team(r.heroes, 1)}. `
              : `Player 1 (${raceLabel(r.pick.player)}) against Player 2 (${raceLabel(r.pick.enemy)}). `
            : r.heroes
            ? `Your team: ${team(r.heroes, 0)}. The AI's team (${LEVEL_LABELS[r.pick.level]}): ${team(r.heroes, 1)}. `
            : `${raceLabel(r.pick.player)} against the AI's ${raceLabel(r.pick.enemy)}, AI ${LEVEL_LABELS[r.pick.level]}.`).trim(),
        ...heroesOf(r),
        ...(r.pick.local && r.outcome !== 'draw' ? { player: r.outcome === 'win' ? (1 as const) : (2 as const) } : {}),
        tone: r.outcome === 'draw' ? 'draw' : r.outcome === 'win' || r.pick.local ? 'win' : 'loss',
        stats: r.rounds ? [`Rounds ${String(r.rounds[0])}-${String(r.rounds[1])}`] : [],
        onRematch: startBattle,
        onChange: showPick,
        ...(replay ? { onDownload: () => { void downloadReplay(replay); } } : {}),
      }),
    );
    // The primary action takes focus (not the heading), and a held Enter or Space must not auto-repeat into Rematch.
    view?.querySelector<HTMLElement>('#arcadeRematch')?.focus({ preventScroll: true });
    listenEscape((e) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    });
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
    const pick = lastPick;
    // The match builder (`arcade-setup`, WP-arcade-tag-view) is its own chunk, loaded with Phaser.
    import('./arcade-setup')
      .then(({ arcadeLaunch }) => import('../boot/phaser-config').then(({ createGame }) => {
        if (epoch !== mine) return;
        const buttons = touchButtons(pick.partner2 ? 3 : pick.partner ? 2 : 1, [pick.player, pick.partner, pick.partner2].filter((x) => x !== undefined).map(isMeleeRace));
        const base: ArenaLaunch = arcadeLaunch(pick, pick.stage ? seedForStage(deps.flags.seed ?? deps.now() >>> 0, pick.stage) : deps.flags.seed ?? deps.now() >>> 0, {
          onView: (v) => { watchTouch(buttons, v); },
          cheats: tester.enabled,
          cc: deps.flags.cc,
          record: deps.flags.record || getRecordSetting(),
          replays: deps.replays,
          onRestart: () => { if (epoch === mine) startBattle(); },
          onResult: (r) => {
            if (epoch === mine) showResults(r);
          },
        });
        // Tester mode: the Arena registers its cheat bridge, so the panel's Arcade toggles work in this battle.
        const launch: ArenaLaunch = tester.enabled ? { ...base, tester: { session: tester, openPanel: requestOpenTesterPanel } } : base;
        const host = el('div');
        host.id = 'game';
        battle.replaceChildren(host);
        game = createGame(host, launch);
        if (pick.local) host.append(keysHint());
        const firstRun = firstRunHint(undefined, undefined, afterArenaCreate(game), anySnag([pick.player, pick.partner, pick.partner2].filter((x) => x !== undefined)), ARCADE_SNAG_SLOT[pick.player], pick.partner !== undefined);
        if (firstRun) host.append(firstRun);
        host.append(...inVisualOrder(buttons), touchStick(), touchStrikes());
      }))
      .catch((e: unknown) => {
        if (epoch !== mine) return;
        if (game) destroyGame(game, undefined);
        game = undefined;
        showErrorScreen(battle, 'The battle could not start', e instanceof Error ? e.message : String(e));
      });
  }

  let flagMount = false;

  return {
    mount: (c) => {
      container = c;
      const { hero, foe } = deps.flags;
      if (!flagStarted && (hero !== null || foe !== null)) {
        flagStarted = true;
        flagMount = true;
        for (const w of flagFallbackWarnings(hero, foe, DEV_BUILD)) console.warn(w);
        const player = hero ?? DEFAULT_PICK.player;
        const stage = ARCADE_RACES.includes(player as CharacterId) ? getCharacter(player as CharacterId).element : '';
        lastPick = parsePick({ player, enemy: foe ?? DEFAULT_PICK.enemy, level: DEFAULT_PICK.level, stage });
        if (DEV_BUILD && foe === VOID_BOSS) lastPick = { ...lastPick, enemy: VOID_BOSS };
        startBattle();
        return;
      }
      showPick();
    },
    unmount: () => {
      // A flag-started mount torn down before its game exists (the router mounts twice at boot) must not use up the one-shot.
      if (flagMount && !game) flagStarted = false;
      flagMount = false;
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
    navigate: navigateHash,
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
