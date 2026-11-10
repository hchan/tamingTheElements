import {
  DEFAULT_SIM_FLAGS,
  SIM_VERSION,
  applyMatchResult,
  characterId,
  newGame,
  objectivesMet,
  seedSfc32,
  type Agent,
  type ChapterNumber,
  type MatchOutcome,
  type MatchReport,
  type MatchSetup as CoreSetup,
  type ReplayFile,
  type SaveV1,
  type SimFlags,
} from '@core/menu-index';
import { el } from '@ui/dom';
import { defaultScreens, type ScreenTable } from '@ui/router';
import { objectivesScreen } from '@ui/screens/objectives';
import { keyBindingsScreen } from '@ui/screens/key-bindings';
import { gameMasterScreen } from '@ui/screens/game-master';
import { settingsScreen } from '@ui/screens/settings';
import { garrisonScreen } from '@ui/screens/garrison';
import type { MatchSetup as UiSetup } from '@ui/screens/garrison-model';
import { loadSave } from '@ui/screens/main-menu';
import type { Screen } from '@ui/screens/screen';
import { showErrorScreen, showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import type { UiFlags } from '../platform/flags';
import { getRecordSetting } from '../platform/record-setting';
import { activeSaveStorage, tester, type TesterSession } from '../platform/tester/session';
import { requestOpenTesterPanel } from '@ui/tester/install';
import type { ReplayStore } from '../platform/storage/replay-store';
import { requestPersistence } from '../platform/storage/idb-save-store';
import { NEW_GAME_SCRIPT } from '../cinematics/chain';
import type { Result, SaveStore } from '../platform/storage/save-store';
import { describeError } from '../platform/storage/export-import';
import type { ArenaLaunch, MatchEnd } from '../scenes/launch';
import { downloadReplay } from './download';
import { destroyGame, type GameHandle } from './game-handle';
import { replayViewerScreen } from './replay-viewer';

/** Legacy character names map to slugs the same way the garrison rows do. */
export function slugOf(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

/** Garrison selection -> sim setup: heroes in battle order (team 0) against the drawn opponents (team 1). */
export function toCoreSetup(
  ui: UiSetup,
  save: Pick<SaveV1, 'chapter' | 'difficulty'>,
  seed: number,
  flags: SimFlags = DEFAULT_SIM_FLAGS,
): CoreSetup {
  const roster = (xs: readonly { characterName: string; experience: number }[]): CoreSetup['p1'] =>
    xs.map((x) => ({ character: characterId(slugOf(x.characterName)), xp: x.experience }));
  return {
    simVersion: SIM_VERSION,
    seed,
    flags,
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
export async function enemyAgent(flags: Pick<UiFlags, 'aiScripted'>): Promise<Agent> {
  // Lazy: the bot lives in the `sim` chunk, which the menu does not load (see docs/PERFORMANCE.md).
  const { RandomBot } = await import('@core/lazy-index');
  return new RandomBot(flags.aiScripted ? 'p2-scripted-fallback' : 'p2');
}

export interface FlowDeps {
  readonly store: SaveStore;
  readonly flags: UiFlags;
  readonly now: () => number;
  readonly navigate: (route: string) => void;
  /** Local replay store; only written to when recording is on. */
  readonly replays: ReplayStore;
  /** Tester-mode session; defaults to the app-wide one (off until the cheat code is entered). */
  readonly tester?: TesterSession;
}

interface Pending {
  readonly ui: UiSetup;
  readonly seed: number;
}

/** Menu -> garrison -> battle -> results -> menu. Phaser is loaded only when a battle starts. */
export class AppFlow {
  private pending: Pending | undefined;
  private report: MatchReport | undefined;
  private lastReplay: ReplayFile | undefined;
  /** A finished match whose save failed; the results screen offers a retry. */
  private unsaved: SaveV1 | undefined;
  private saveError = '';
  /** Chapter whose objectives the last result met (so the results screen can point at Current Objectives), or undefined. */
  private objectivesChapter: number | undefined;
  private failedOnce = false;

  constructor(private readonly deps: FlowDeps) {}

  private get session(): TesterSession {
    return this.deps.tester ?? tester;
  }

  /** Battle/opponent seed: `?seed=` in dev and test builds, else the clock. */
  private seed(): number {
    return this.deps.flags.seed ?? this.deps.now() >>> 0;
  }

  /** `?ff=record` (dev/test) or the "Record playtests" setting; off by default. */
  private recording(): boolean {
    return this.deps.flags.record || getRecordSetting();
  }

  screens(): ScreenTable {
    const base = defaultScreens();
    const { navigate } = this.deps;
    return {
      ...base,
      newGame: () => this.newGameScreen(),
      storyMode: () => this.cinematicScreen(() => {
        navigate('main');
      }),
      battleground: () => redirect(navigate, 'garrison'),
      currentObjectives: () => objectivesScreen({ store: this.deps.store, navigate }),
      settings: () => settingsScreen(this.deps.store),
      ...(import.meta.env.DEV || import.meta.env.MODE === 'test'
        ? { gameMaster: () => gameMasterScreen(this.deps.store) }
        : {}),
      keyBindings: () => keyBindingsScreen(this.deps.store),
      garrison: garrisonScreen({
        load: () => loadSave(activeSaveStorage()),
        testerTeam: () => this.session.enabled && this.session.options.bigTeam,
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
      replay: () =>
        replayViewerScreen({ replays: this.recording() ? this.deps.replays : undefined, forceNoWebgl: this.deps.flags.forceNoWebgl }),
    };
  }

  /** Legacy order: the intro chain plays first and the new save is written when it ends or is skipped. */
  private newGameScreen(): Screen {
    return this.cinematicScreen(() => {
      const meta = seedSfc32(this.deps.now() >>> 0, 'meta');
      void this.deps.store.save(newGame(meta, { now: this.deps.now })).then(() => {
        this.deps.navigate('garrison');
      });
    });
  }

  /** Plays the story chain in a Phaser game that lives only as long as the screen; `onEnd` runs once. */
  private cinematicScreen(onEnd: () => void): Screen {
    let node: HTMLElement | undefined;
    let game: GameHandle | undefined;
    const life = { disposed: false };
    return {
      mount: (container) => {
        const mountNode = el('div');
        node = mountNode;
        mountNode.id = 'cinematic';
        container.append(mountNode);
        if (!detectWebgl(this.deps.flags.forceNoWebgl, () => document.createElement('canvas'))) {
          showWebglError(mountNode);
          return;
        }
        void import('../boot/phaser-config')
          .then(({ createGame }) => {
            if (life.disposed) return;
            const host = el('div');
            host.id = 'game';
            mountNode.replaceChildren(host);
            let ended = false;
            if (this.deps.flags.failGame) throw new Error('WebGL unsupported (injected)');
            game = createGame(host, false, {
              script: NEW_GAME_SCRIPT,
              onEnd: () => {
                if (ended || life.disposed) return;
                ended = true;
                onEnd();
              },
            });
          })
          .catch((e: unknown) => {
            if (life.disposed) return;
            showErrorScreen(mountNode, 'The intro could not start', e instanceof Error ? e.message : String(e));
          });
      },
      unmount: () => {
        life.disposed = true;
        destroyGame(game, node);
        game = undefined;
        node = undefined;
      },
    };
  }

  /** The battle screen owns the Phaser game: mount creates it, unmount destroys it (exit-to-menu). */
  private battleScreen(): Screen {
    let node: HTMLElement | undefined;
    let game: GameHandle | undefined;
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
        mountNode.append(el('h1', 'heading', 'Loading...'));
        const fail = (title: string, message: string): void => {
          if (life.isDisposed()) return;
          destroyGame(game, undefined);
          game = undefined;
          showErrorScreen(mountNode, title, message);
        };
        void this.startBattle(pending, mountNode, life, (g) => (game = g), fail);
      },
      unmount: () => {
        life.disposed = true;
        destroyGame(game, node);
        game = undefined;
        node = undefined;
      },
    };
  }

  /** Loads the save, builds the setup and starts the Phaser game; every failure ends in a visible error screen. */
  private async startBattle(
    pending: Pending,
    mountNode: HTMLElement,
    life: { isDisposed(): boolean },
    setGame: (g: GameHandle) => void,
    fail: (title: string, message: string) => void,
  ): Promise<void> {
    const { flags } = this.deps;
    try {
      const r: Result<SaveV1> = flags.failLoad
        ? { ok: false, error: { kind: 'storage', message: 'injected load failure' } }
        : await this.deps.store.load();
      if (life.isDisposed()) return;
      if (!r.ok) {
        fail('Could not load your save', describeError(r.error));
        return;
      }
      if (flags.failSetup) throw new Error('injected setup failure');
      const session = this.session;
      const setup = toCoreSetup(pending.ui, r.value, pending.seed, session.simFlags(DEFAULT_SIM_FLAGS));
      // Tester mode: the replay is kept but flagged `cheats` in its header, and verifiers refuse it.
      const { PlaytestRecorder } = await import('../replay/playtest-recorder');
      if (life.isDisposed()) return;
      const recorder = this.recording() ? new PlaytestRecorder(setup, session.enabled) : undefined;
      const enemy = await enemyAgent(flags);
      if (life.isDisposed()) return;
      this.lastReplay = undefined;
      const launch: ArenaLaunch = {
        setup,
        enemy,
        ...(recorder ? { recorder } : {}),
        ...(session.enabled ? { tester: { session, openPanel: requestOpenTesterPanel } } : {}),
        onEnd: (end) => {
          const replay = recorder?.finish();
          if (replay) {
            this.lastReplay = replay;
            void this.deps.replays.add(replay).catch(() => undefined);
          }
          void this.finish(pending, setup, end, () => !life.isDisposed());
        },
      };
      const { createGame } = await import('../boot/phaser-config');
      if (life.isDisposed()) return;
      const host = el('div');
      host.id = 'game';
      mountNode.replaceChildren(host);
      // Phaser can throw (WebGL missing an extension, context creation refused) after detectWebgl passed.
      if (flags.failGame) throw new Error('WebGL unsupported (injected)');
      setGame(createGame(host, launch));
    } catch (e) {
      fail('The battle could not start', e instanceof Error ? e.message : String(e));
    }
  }

  private async finish(pending: Pending, setup: CoreSetup, end: MatchEnd, screenIsCurrent: () => boolean): Promise<void> {
    this.unsaved = undefined;
    try {
      const loaded = await this.deps.store.load();
      if (!loaded.ok) throw new Error(describeError(loaded.error));
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
      this.report = report;
      this.objectivesChapter = report.victory && objectivesMet(save) ? save.chapter : undefined;
      this.pending = undefined;
      const saved = await this.persist(save);
      if (!saved) this.unsaved = save;
      else if (report.captured.length > 0 || report.xp?.leveledUp === true) void requestPersistence();
    } catch (e) {
      // Without a result there is nothing to show: report and go back rather than leaving the arena frozen.
      this.report = undefined;
      this.saveError = `Could not apply the match result: ${e instanceof Error ? e.message : String(e)}`;
    }
    // The player may have left while the save was in flight; the result is stored but not navigated to.
    if (screenIsCurrent()) this.deps.navigate('victory');
  }

  /** Writes to the store; false (never a throw) when it failed. */
  private async persist(save: SaveV1): Promise<boolean> {
    if (this.deps.flags.failSave && !this.failedOnce) {
      this.failedOnce = true;
      this.saveError = 'injected save failure';
      return false;
    }
    try {
      const w = await this.deps.store.save(save);
      if (!w.ok) this.saveError = describeError(w.error);
      return w.ok;
    } catch (e) {
      this.saveError = e instanceof Error ? e.message : String(e);
      return false;
    }
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
          if (this.saveError) showErrorScreen(page, 'Match result lost', this.saveError);
          else this.deps.navigate('main');
          return;
        }
        page.append(el('h1', 'heading', r.victory ? 'Victory!' : 'Defeat'));
        if (this.session.enabled) {
          page.append(
            el(
              'p',
              'testerWarn',
              this.session.options.keepProgress
                ? 'TESTER MODE: this result was written to your real save.'
                : 'TESTER MODE: this result was written to the throwaway slot, not your real save.',
            ),
          );
        }
        const unsaved = this.unsaved;
        if (unsaved) {
          const warn = el('div', 'settingsStatus', `Could not save progress: ${this.saveError}`);
          warn.setAttribute('role', 'alert');
          const retry = el('button', 'menuButton', 'Retry saving');
          retry.type = 'button';
          retry.id = 'retrySave';
          retry.addEventListener('click', () => {
            void this.persist(unsaved).then((ok) => {
              if (ok) {
                this.unsaved = undefined;
                warn.remove();
                retry.remove();
              } else {
                warn.textContent = `Could not save progress: ${this.saveError}`;
              }
            });
          });
          page.append(warn, retry);
        }
        if (r.xp) {
          const lvl = r.xp.leveledUp ? ` Level up! ${String(r.xp.levelBefore)} to ${String(r.xp.levelAfter)}.` : '';
          page.append(el('p', undefined, `${r.xp.characterName} gained ${String(r.xp.gained)} XP.${lvl}`));
        }
        for (const c of r.captured) page.append(el('p', undefined, `Captured ${c.characterName}!`));
        if (r.victory && this.objectivesChapter !== undefined) {
          const note = el(
            'p',
            undefined,
            this.objectivesChapter === 1
              ? 'Your objectives for this chapter are met. Open Current Objectives to begin chapter 2, where the Capture ability is unlocked!'
              : 'Your objectives for this chapter are met. Open Current Objectives to begin the next chapter.',
          );
          note.id = 'objectivesMet';
          page.append(note);
        }
        if (r.gameCompleted) page.append(el('p', undefined, 'You completed the game!'));
        const replay = this.lastReplay;
        if (replay) {
          const dl = el('button', 'menuButton', 'Download replay');
          dl.type = 'button';
          dl.id = 'downloadReplay';
          dl.addEventListener('click', () => {
            void downloadReplay(replay);
          });
          page.append(dl);
        }
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
