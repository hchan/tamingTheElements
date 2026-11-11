import { el } from '@ui/dom';
import { focusHeading } from '@ui/keyboard';
import { arcadePickView, arcadeResultsView, raceLabel } from '@ui/screens/arcade-versus';
import type { Screen } from '@ui/screens/screen';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags, type UiFlags } from '../platform/flags';
import { controlsHint, P2_BINDINGS } from '../input/local-two';
import { getBindings } from '../platform/input/bindings';
import { getRecordSetting } from '../platform/record-setting';
import { createReplayStore, type ReplayStore } from '../platform/storage/replay-store';
import { requestOpenTesterPanel } from '@ui/tester/install';
import { tester } from '../platform/tester/session';
import type { ArenaLaunch } from '../scenes/launch';
import { ARCADE_AI_LEVELS, ARCADE_RACES, DEFAULT_PICK, parsePick, partner2For, partnerFor, type ArcadePick } from './arcade-pick';
import type { ArcadeHero, ArcadeResult } from './arcade-setup';
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

const LEVEL_LABELS: Readonly<Record<ArcadePick['level'], string>> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const LOCAL_HEADINGS: Readonly<Record<ArcadeResult['outcome'], string>> = { win: 'Player 1 wins!', lose: 'Player 2 wins!', draw: 'Draw' };
const OUTCOME_HEADINGS: Readonly<Record<ArcadeResult['outcome'], string>> = { win: 'Victory!', lose: 'Defeat', draw: 'Draw' };

/** The last pick, kept for Rematch and the next visit in this tab (memory only, never stored). */
let lastPick: ArcadePick = DEFAULT_PICK;

/**
 * Touch buttons, bottom-up on the right edge, 56 px apart: Super, Guard (hold), Dash, Weather and Charge (FUN-DESIGN 2.5, 2.7, 2.8,
 * 2.14, 2.17), in a tag team Tag (2.6: the first swap key) and in 3v3 Tag 2 (the second swap key, WP-arcade-3v3).
 */
export const TOUCH = ['Super', 'Guard', 'Dash', 'Weather', 'Charge', 'Tag', 'Tag2'] as const;
type TouchLabel = (typeof TOUCH)[number];
const TOUCH_KEY = { Super: 'super', Guard: 'guard', Dash: 'dash', Weather: 'weather', Charge: 'charge', Tag: 'slot3', Tag2: 'slot4' } as const;

/**
 * Pointer-only button over the arena for touch: it holds the first key bound to its action (the arena's keyboard agent
 * listens on window) for as long as the finger is down; an unbound action does nothing. Not in the Tab order: keyboards
 * press the key itself. Ids `arcadeSuper`, `arcadeGuard`, `arcadeDash`, `arcadeWeather`, `arcadeCharge`, `arcadeTag`, `arcadeTag2`.
 */
const coarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function touchButton(label: TouchLabel, row: number): HTMLButtonElement {
  const b = el('button', 'menuButton', label === 'Tag2' ? 'Tag 2' : label);
  b.type = 'button';
  b.id = `arcade${label}`;
  b.tabIndex = -1;
  // Touch: a column up the right edge (>= 48 px, safe areas). Mouse/keyboard: a compact row in the bottom band under the
  // walkable playfield (arcadePlayfield ends at y 640 of 720), so it never hides a fighter at the arena edge.
  b.style.cssText = coarsePointer()
    ? `position:absolute;right:max(8px,env(safe-area-inset-right));bottom:calc(max(8px,env(safe-area-inset-bottom)) + ${String(row * 56)}px);z-index:5;min-width:72px;min-height:48px;touch-action:none;opacity:.85`
    : `position:absolute;right:${String(4 + row * 68)}px;bottom:2px;z-index:5;width:64px;height:28px;min-height:0;padding:0;font-size:12px;touch-action:none;opacity:.7`;
  let code: string | undefined;
  const release = (): void => {
    if (code === undefined) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    code = undefined;
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (code !== undefined) return;
    code = getBindings()[TOUCH_KEY[label]][0];
    if (code === undefined) return;
    b.setPointerCapture(e.pointerId);
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, release);
  return b;
}

/** Both players' keys as words, along the bottom-left of a local two-player battle (left of the touch buttons). */
function keysHint(): HTMLElement {
  const p = el('p', undefined, `${controlsHint('Player 1', getBindings())}. ${controlsHint('Player 2', P2_BINDINGS)}.`);
  p.id = 'arcadeKeysHint';
  p.style.cssText = 'position:absolute;left:4px;bottom:2px;right:420px;margin:0;z-index:4;font-size:11px;line-height:1.2;pointer-events:none;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000';
  return p;
}

/** "Sindarosa (fire) 45% left, Pax (earth) knocked out": one team's heroes at the end of a 2v2 or 3v3 match. */
const team = (heroes: readonly ArcadeHero[], t: number): string =>
  heroes.filter((h) => h.team === t).map((h) => `${raceLabel(h.race)} ${h.pct ? `${String(h.pct)}% left` : 'knocked out'}`).join(', ');

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
        current: {
          ...lastPick,
          mode: lastPick.local ? 'local' : 'ai',
          size: lastPick.partner2 ? '3' : lastPick.partner ? '2' : '1',
          partner: partnerFor(lastPick.player, lastPick.partner),
          partner2: partner2For(lastPick.player, partnerFor(lastPick.player, lastPick.partner), lastPick.partner2),
          enemyPartner: partnerFor(lastPick.enemy, lastPick.enemyBench?.[0]),
          enemyPartner2: partner2For(lastPick.enemy, partnerFor(lastPick.enemy, lastPick.enemyBench?.[0]), lastPick.enemyBench?.[1]),
        },
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
        heading: r.pick.local ? LOCAL_HEADINGS[r.outcome] : OUTCOME_HEADINGS[r.outcome],
        summary:
          (r.pick.local
            ? r.heroes
              ? `Player 1's team: ${team(r.heroes, 0)}. Player 2's team: ${team(r.heroes, 1)}. `
              : `Player 1 (${raceLabel(r.pick.player)}) against Player 2 (${raceLabel(r.pick.enemy)}). `
            : r.heroes
            ? `Your team: ${team(r.heroes, 0)}. The AI's team (${LEVEL_LABELS[r.pick.level]}): ${team(r.heroes, 1)}. `
            : `${raceLabel(r.pick.player)} against the AI's ${raceLabel(r.pick.enemy)}, AI ${LEVEL_LABELS[r.pick.level]}. `) +
          (r.rounds ? `Rounds ${String(r.rounds[0])}-${String(r.rounds[1])}. ` : '') +
          'Arcade Versus saves nothing: no XP, no capture, no progress.',
        onRematch: startBattle,
        onChange: showPick,
        ...(replay ? { onDownload: () => { void downloadReplay(replay); } } : {}),
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
    const pick = lastPick;
    // The match builder (`arcade-setup`, WP-arcade-tag-view) is its own chunk, loaded with Phaser.
    import('./arcade-setup')
      .then(({ arcadeLaunch }) => import('../boot/phaser-config').then(({ createGame }) => {
        if (epoch !== mine) return;
        const base: ArenaLaunch = arcadeLaunch(pick, deps.flags.seed ?? deps.now() >>> 0, {
          cheats: tester.enabled,
          record: deps.flags.record || getRecordSetting(),
          replays: deps.replays,
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
        host.append(...TOUCH.slice(0, pick.partner2 ? 7 : pick.partner ? 6 : 5).map(touchButton));
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
