import {
  DEFAULT_SIM_FLAGS,
  RandomBot,
  SIM_VERSION,
  applyMatchResult,
  characterId,
  newGame,
  seedSfc32,
  type Agent,
  type ChapterNumber,
  type MatchOutcome,
  type MatchReport,
  type MatchSetup as CoreSetup,
  type SaveV1,
} from '@core/index';
import { el } from '@ui/dom';
import { defaultScreens, type ScreenTable } from '@ui/router';
import { objectivesScreen } from '@ui/screens/objectives';
import { settingsScreen } from '@ui/screens/settings';
import { garrisonScreen } from '@ui/screens/garrison';
import type { MatchSetup as UiSetup } from '@ui/screens/garrison-model';
import { loadSave } from '@ui/screens/main-menu';
import type { Screen } from '@ui/screens/screen';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import type { UiFlags } from '../platform/flags';
import { requestPersistence } from '../platform/storage/idb-save-store';
import { teardown } from '../platform/test-hook';
import type { SaveStore } from '../platform/storage/save-store';
import type { ArenaLaunch, MatchEnd } from '../scenes/launch';

/** Legacy character names map to slugs the same way the garrison rows do. */
export function slugOf(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

/** Garrison selection -> sim setup: heroes in battle order (team 0) against the drawn opponents (team 1). */
export function toCoreSetup(ui: UiSetup, save: Pick<SaveV1, 'chapter' | 'difficulty'>, seed: number): CoreSetup {
  const roster = (xs: readonly { characterName: string; experience: number }[]): CoreSetup['p1'] =>
    xs.map((x) => ({ character: characterId(slugOf(x.characterName)), xp: x.experience }));
  return {
    simVersion: SIM_VERSION,
    seed,
    flags: DEFAULT_SIM_FLAGS,
    chapter: Math.min(5, Math.max(1, save.chapter)) as ChapterNumber,
    difficulty: save.difficulty,
    p1: roster(ui.heroes),
    p2: roster(ui.opponents),
  };
}

/** Arena's end report -> rules input. `activeIndex` is a garrison index, not a battle-order index. */
export function toOutcome(ui: UiSetup, save: Pick<SaveV1, 'garrison'>, end: MatchEnd): MatchOutcome {
  const hero = ui.heroes[end.activeSlot];
  return {
    winner: end.winner,
    practice: ui.mode === 'practice',
    activeIndex: save.garrison.findIndex((g) => g.id === hero?.id),
    capturedIndices: end.capturedIndices,
  };
}

/** Enemy agent: the scripted AI is not complete yet, so both settings use the random bot for now. */
export function enemyAgent(flags: Pick<UiFlags, 'aiScripted'>): Agent {
  return new RandomBot(flags.aiScripted ? 'p2-scripted-fallback' : 'p2');
}

export interface FlowDeps {
  readonly store: SaveStore;
  readonly flags: UiFlags;
  readonly now: () => number;
  readonly navigate: (route: string) => void;
}

interface Pending {
  readonly ui: UiSetup;
  readonly seed: number;
}

/** Menu -> garrison -> battle -> results -> menu. Phaser is loaded only when a battle starts. */
export class AppFlow {
  private pending: Pending | undefined;
  private report: MatchReport | undefined;

  constructor(private readonly deps: FlowDeps) {}

  /** Battle/opponent seed: `?seed=` in dev and test builds, else the clock. */
  private seed(): number {
    return this.deps.flags.seed ?? this.deps.now() >>> 0;
  }

  screens(): ScreenTable {
    const base = defaultScreens();
    const { navigate } = this.deps;
    return {
      ...base,
      newGame: () => this.newGameScreen(),
      battleground: () => redirect(navigate, 'garrison'),
      currentObjectives: () => objectivesScreen({ store: this.deps.store, navigate }),
      settings: () => settingsScreen(this.deps.store),
      garrison: garrisonScreen({
        load: () => loadSave(window.localStorage),
        navigate,
        alert: (m) => {
          window.alert(m);
        },
        seed: () => this.seed(),
        onMatch: (ui) => {
          this.pending = { ui, seed: this.seed() };
        },
        avatarUrl: (sprite) => `url("img/map/${encodeURIComponent(sprite)}.png")`,
      }),
      loading: () => this.battleScreen(),
      victory: () => this.resultsScreen(),
    };
  }

  private newGameScreen(): Screen {
    return {
      mount: () => {
        const meta = seedSfc32(this.deps.now() >>> 0, 'meta');
        void this.deps.store.save(newGame(meta, { now: this.deps.now })).then(() => {
          this.deps.navigate('garrison');
        });
      },
      unmount: () => undefined,
    };
  }

  /** The battle screen owns the Phaser game: mount creates it, unmount destroys it (exit-to-menu). */
  private battleScreen(): Screen {
    let node: HTMLElement | undefined;
    let game:
      | { destroy(removeCanvas: boolean): void; events: { once(event: string, fn: () => void): unknown } }
      | undefined;
    const life = {
      disposed: false,
      isDisposed(): boolean {
        return this.disposed;
      },
    };
    return {
      mount: (container) => {
        const pending = this.pending;
        if (!pending) {
          this.deps.navigate('main');
          return;
        }
        const mountNode = el('div');
        node = mountNode;
        mountNode.id = 'battle';
        container.append(mountNode);
        if (!detectWebgl(this.deps.flags.forceNoWebgl, () => document.createElement('canvas'))) {
          showWebglError(mountNode);
          return;
        }
        mountNode.append(el('div', 'heading', 'Loading...'));
        void this.deps.store.load().then(async (r) => {
          if (life.disposed || !r.ok) return;
          const setup = toCoreSetup(pending.ui, r.value, pending.seed);
          const launch: ArenaLaunch = {
            setup,
            enemy: enemyAgent(this.deps.flags),
            onEnd: (end) => {
              void this.finish(pending, setup, end);
            },
          };
          const { createGame } = await import('../boot/phaser-config');
          if (life.isDisposed()) return;
          const host = el('div');
          host.id = 'game';
          mountNode.replaceChildren(host);
          game = createGame('game', launch);
        });
      },
      unmount: () => {
        life.disposed = true;
        const doomed = game;
        const doomedNode = node;
        game = undefined;
        node = undefined;
        if (!doomed) {
          doomedNode?.remove();
          return;
        }
        // Phaser destroys on its next frame; keep the DOM until then so the canvas is removed by Phaser itself.
        const done = new Promise<void>((resolve) => {
          doomed.events.once('destroy', () => {
            doomedNode?.remove();
            resolve();
          });
        });
        teardown.settled = Promise.all([teardown.settled, done]).then(() => undefined);
        doomed.destroy(true);
      },
    };
  }

  private async finish(pending: Pending, setup: CoreSetup, end: MatchEnd): Promise<void> {
    const loaded = await this.deps.store.load();
    if (!loaded.ok) return;
    const meta = seedSfc32(pending.seed, 'results');
    const now = this.deps.now();
    // Results rules need stamped garrison entries; older saves may lack the timestamps.
    const current = {
      ...loaded.value,
      garrison: loaded.value.garrison.map((g) => ({
        ...g,
        createdTime: g.createdTime ?? now,
        lastModifiedTime: g.lastModifiedTime ?? now,
      })),
    };
    const { save, report } = applyMatchResult(
      current,
      setup,
      toOutcome(pending.ui, current, end),
      meta,
      { now: this.deps.now },
    );
    await this.deps.store.save(save);
    if (report.captured.length > 0 || report.xp?.leveledUp === true) void requestPersistence();
    this.report = report;
    this.pending = undefined;
    this.deps.navigate('victory');
  }

  private resultsScreen(): Screen {
    let node: HTMLElement | undefined;
    return {
      mount: (container) => {
        const r = this.report;
        const page = el('div', 'menuPage');
        node = page;
        container.append(page);
        if (!r) {
          this.deps.navigate('main');
          return;
        }
        page.append(el('div', 'heading', r.victory ? 'Victory!' : 'Defeat'));
        if (r.xp) {
          const lvl = r.xp.leveledUp ? ` Level up! ${String(r.xp.levelBefore)} to ${String(r.xp.levelAfter)}.` : '';
          page.append(el('p', undefined, `${r.xp.characterName} gained ${String(r.xp.gained)} XP.${lvl}`));
        }
        for (const c of r.captured) page.append(el('p', undefined, `Captured ${c.characterName}!`));
        if (r.gameCompleted) page.append(el('p', undefined, 'You completed the game!'));
        for (const [label, href] of [
          ['Current Objectives', '#currentObjectives'],
          ['Garrison', '#garrison'],
          ['Main Menu', '#main'],
        ] as const) {
          const a = el('a', 'menuLink', label);
          a.setAttribute('href', href);
          a.style.display = 'block';
          page.append(a);
        }
      },
      unmount: () => {
        node?.remove();
        node = undefined;
      },
    };
  }
}

function redirect(navigate: (route: string) => void, route: string): Screen {
  return {
    mount: () => {
      navigate(route);
    },
    unmount: () => undefined,
  };
}
