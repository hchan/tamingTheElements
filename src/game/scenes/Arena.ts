import Phaser from 'phaser';
import {
  DEFAULT_SIM_FLAGS,
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  hash,
  RandomBot,
  SIM_VERSION,
  SimEventKind,
  TeamField,
  capturedRosterIndices,
  characterId,
  collectCommands,
  createMatch,
  createRenderView,
  step,
  type Agent,
  type MatchSetup,
  type RenderCharacter,
  type RenderProjectile,
  type RenderView,
  type SimEvent,
  type SimWorld,
} from '@core/index';
import { createArenaAudio, type ArenaAudio } from '../audio/arena-audio';
import type { AudioContextLike } from '../audio/audio-manager';
import { EventFx, createPhaserFxSink } from '../fx/event-fx';
import { KeyboardAgent } from '../input/keyboard-agent';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted, type ProbeCharacter } from '../platform/test-hook';
import { getPrefs } from '../platform/a11y/prefs';
import { BLOCKED_EVENT } from '../boot/presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';
import { Announcer, LOW_HEALTH, LowHealthWatch, MATCH_START, announcementsFor, createLiveRegion } from '../a11y/announcer';
import { createPauseDialog, type PauseDialog } from '../a11y/pause-dialog';
import { firstPad } from '../input/gamepad';
import { getBindings, type Bindings } from '../platform/input/bindings';
import { collectSide } from '../hud/bars';
import { ActionBarView, labelsFromBindings, type KeyLabels } from '../hud/action-bar';
import { CharacterView } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { ProjectileView } from '../views/projectile-view';
import { ReplayCursor } from '../replay/cursor';
import { HUD_SCENE, type HudData } from './Hud';
import type { ArenaLaunch } from './launch';

export const ARENA_SCENE = 'Arena';

/** Frames between low-health checks. */
const LOW_HEALTH_POLL_FRAMES = 10;

/** Beat between the final blow and the results route. */
const END_DELAY_MS = 1200;

const DEMO_SETUP: MatchSetup = {
  simVersion: SIM_VERSION,
  seed: 1,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [
    { character: characterId('curomo'), xp: 0 },
    { character: characterId('fiara'), xp: 0 },
  ],
  p2: [
    { character: characterId('pax'), xp: 0 },
    { character: characterId('cyclonius'), xp: 0 },
  ],
};

/**
 * Thin arena view: the sim steps at a fixed 50 Hz inside `update`, and every render reads the
 * RenderView facade and interpolates prev -> cur by the driver's alpha. No gameplay logic here.
 * Launched by the app flow with a `KeyboardAgent` vs the enemy agent; without launch data (`?ff=arenaDemo`)
 * it is random bot vs random bot.
 */
export class Arena extends Phaser.Scene {
  private launch: ArenaLaunch | undefined;
  private world: SimWorld | undefined;
  private view: RenderView | undefined;
  private driver: FixedStepDriver | undefined;
  private pool: EntityViewPool<CharacterView> | undefined;
  private projPool: EntityViewPool<ProjectileView> | undefined;
  private fx: EventFx | undefined;
  private agents: readonly [Agent, Agent] = [new RandomBot('p1'), new RandomBot('p2')];
  private actionBar: ActionBarView | undefined;
  private clicks: number[] = [];
  private pauseText: Phaser.GameObjects.Text | undefined;
  private cursor: ReplayCursor | undefined;
  private speed: 1 | 2 = 1;
  private keyboard: KeyboardAgent | undefined;
  private audio: ArenaAudio | undefined;
  private pauseDialog: PauseDialog | undefined;
  private announcer: Announcer | undefined;
  private readonly lowHealth = new LowHealthWatch();
  private frames = 0;
  private cleanups: (() => void)[] = [];
  private ended = false;

  constructor() {
    super(ARENA_SCENE);
  }

  init(data?: ArenaLaunch): void {
    this.launch = data;
    this.ended = false;
  }

  create(): void {
    fitScene(this);
    const playback = this.launch?.playback;
    this.cursor = playback ? new ReplayCursor(playback.replay) : undefined;
    const world = this.cursor?.world ?? createMatch(this.launch?.setup ?? DEMO_SETUP);
    this.world = world;
    this.view = createRenderView(world);
    this.driver = new FixedStepDriver({ tick: () => { this.advance([undefined, undefined]); }, now: () => performance.now() });
    const driver = this.driver;
    this.pool = new EntityViewPool(() => new CharacterView(this), (v) => { v.hide(); });
    this.projPool = new EntityViewPool(() => new ProjectileView(this), (v) => { v.hide(); });
    const pool = this.pool;
    // Agents keep their own memory and random streams, so every match (scene start) gets fresh ones.
    this.agents = [new RandomBot('p1'), new RandomBot('p2')];
    this.fx = new EventFx(
      createPhaserFxSink(
        this,
        (id) => {
          const v = pool.peek(id)?.image;
          return v ? { x: v.x + v.displayWidth / 2, y: v.y + v.displayHeight / 2 } : undefined;
        },
        (id) => pool.peek(id)?.image,
      ),
      { reducedMotion: () => getPrefs().reduceMotion },
    );

    if (this.launch && !playback) {
      const keyboard = new KeyboardAgent({
        capturable: () => true,
        bindings: getBindings(),
        gamepad: () => firstPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null),
        onEffect: (e) => {
          if (e === 'pause') this.togglePause();
          else if (e === 'mute') this.audio?.audio.handleInputEffect({ kind: 'toggleMute' });
        },
      });
      this.keyboard = keyboard;
      this.pauseDialog = createPauseDialog({ onResume: () => { this.togglePause(); } });
      const live = createLiveRegion();
      this.announcer = new Announcer((text, assertive) => { live.speak(text, assertive); }, () => performance.now());
      this.cleanups.push(() => { this.pauseDialog?.destroy(); live.destroy(); });
      this.announcer.say(MATCH_START);
      this.agents = [keyboard, this.launch.enemy ?? new RandomBot('p2')];
      let labelled: { bindings: Bindings; labels: KeyLabels } | undefined;
      const labels = (): KeyLabels => {
        const b = keyboard.currentBindings();
        if (labelled?.bindings !== b) labelled = { bindings: b, labels: labelsFromBindings(b) };
        return labelled.labels;
      };
      this.actionBar = new ActionBarView(
        this,
        this.view,
        (cmd) => {
          this.clicks.push(cmd);
          keyboard.press(cmd);
        },
        0,
        labels,
      );
      this.cleanups.push(keyboard.attach(counted(window)));
    }
    this.cleanups.push(pauseOnHidden(counted(document), driver));
    this.setupAudio();

    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (bg) this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1);

    // A full-screen DOM overlay (rotate hint) blocks play: hold the sim until it is dismissed.
    const onBlocked = (blocked: boolean): void => {
      if (blocked) driver.pause('overlay');
      else driver.resume('overlay');
    };
    this.game.events.on(BLOCKED_EVENT, onBlocked);
    this.cleanups.push(() => { this.game.events.off(BLOCKED_EVENT, onBlocked); });
    if (this.game.registry.get(BLOCKED_EVENT) === true) driver.pause('overlay');

    if (playback) this.attachPlayback(playback, driver);
    this.installProbe(world, driver);
    const hudData: HudData = { view: this.view };
    this.scene.launch(HUD_SCENE, hudData);

    // Game destroy (exit-to-menu) emits DESTROY rather than SHUTDOWN on a running scene; handle both once.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdownHandler);
  }

  /** Sounds Phaser already decoded, played through the AudioManager (Ctrl-M mute, unlock on the first gesture). */
  private setupAudio(): void {
    const mgr = this.sound as unknown as { context?: AudioContextLike };
    const audio = createArenaAudio({
      ctx: mgr.context,
      buffer: (id): unknown => this.cache.audio.get(`snd:${id}`) as unknown,
      gestures: counted(window),
      storage: window.localStorage,
    });
    this.audio = audio;
    if (audio) this.cleanups.push(() => { audio.dispose(); this.audio = undefined; });
  }

  /** Test-build-only hook (statically removed from production builds). */
  private installProbe(world: SimWorld, driver: FixedStepDriver): void {
    if (!(import.meta.env.DEV || import.meta.env.MODE === 'test')) return;
    const hook = window.__TTE__;
    const view = this.view;
    if (!hook || !view) return;
    // `&manual=1` starts paused so e2e controls every tick (no real-time ticks before the first step).
    if (new URLSearchParams(window.location.search).has('manual')) driver.pause();
    hook.scene = ARENA_SCENE;
    hook.arena = {
      get tick() {
        return view.tick;
      },
      get paused() {
        return driver.isPaused;
      },
      hash: () => hash(world.state),
      characters: () => {
        const s = world.state;
        const out: ProbeCharacter[] = [];
        for (let i = 0; i < MAX_ENTITIES; i++) {
          const f = s.flags[i] ?? 0;
          if (s.kind[i] !== EntityKind.character || (f & EntityFlag.alive) === 0 || (f & EntityFlag.benched) !== 0) continue;
          out.push({ id: i, team: s.team[i] ?? 0, x: s.x[i] ?? 0, y: s.y[i] ?? 0, hp: s.hp[i] ?? 0, maxHp: s.maxHp[i] ?? 0 });
        }
        return out;
      },
      setHp: (id, hp) => {
        this.launch?.recorder?.invalidate();
        world.state.hp[id] = hp;
      },
      place: (id, x, y, dir) => {
        this.launch?.recorder?.invalidate();
        const st = world.state;
        st.x[id] = x;
        st.px[id] = x;
        st.y[id] = y;
        st.py[id] = y;
        st.dir[id] = dir;
      },
      actionSlots: () => this.actionBar?.currentSlots.map((s) => ({ x: s.x, y: s.y, size: s.size, cmd: s.cmd })) ?? [],
      clicks: () => [...this.clicks],
      captureGranted: () => view.actionBar(0)?.capture !== undefined,
      shaking: () => this.cameras.main.shakeEffect.isRunning,
      audio: () => (this.audio ? { muted: this.audio.audio.muted, unlocked: this.audio.audio.isUnlocked } : undefined),
      boundCodes: () => ({ ...(this.keyboard?.currentBindings() ?? getBindings()) }),
      step: (n, cmds = [0, 0]) => {
        driver.pause();
        for (let k = 0; k < n; k++) this.advance(cmds);
      },
      stepLive: (n) => {
        driver.pause();
        for (let k = 0; k < n; k++) this.advance([undefined, undefined]);
      },
    };
  }

  /** One sim tick: agents (or the given commands) in, events out to the effects and the end check. */
  private advance(cmds: readonly [number | undefined, number | undefined]): void {
    const world = this.world;
    if (!world || this.ended) return;
    if (this.cursor) {
      this.advancePlayback(this.cursor);
      return;
    }
    // Agents are consulted only when a side has no forced command. Consulting them never changes the sim
    // state (step alone mutates it), so forced and live ticks with the same commands hash the same.
    const [f0, f1] = cmds;
    const c = f0 === undefined || f1 === undefined ? collectCommands(world, this.agents) : [0, 0];
    const final: [number, number] = [f0 ?? c[0] ?? 0, f1 ?? c[1] ?? 0];
    this.launch?.recorder?.record(world, final);
    const events = step(world, final);
    this.fx?.consume(events);
    this.audio?.audio.consume(events);
    this.announce(events);
    const over = events.find((e) => e.kind === SimEventKind.matchEnded);
    if (!over) return;
    this.ended = true;
    this.driver?.pause('ended');
    const s = world.state;
    const end = {
      winner: over['winner'] ?? -1,
      activeSlot: s.teams[TeamField.activeSlot] ?? 0,
      capturedIndices: capturedRosterIndices(s, 1),
    };
    this.time.delayedCall(END_DELAY_MS, () => { this.launch?.onEnd?.(end); });
  }

  /** Replay mode: one verified tick per call (two at 2x); a finished or diverged replay holds the driver. */
  private advancePlayback(cursor: ReplayCursor): void {
    for (let k = 0; k < this.speed; k++) {
      const events = cursor.next();
      if (!events) break;
      this.fx?.consume(events);
    }
    if (cursor.state !== 'playing') this.driver?.pause('ended');
  }

  private attachPlayback(playback: NonNullable<ArenaLaunch['playback']>, driver: FixedStepDriver): void {
    const cursor = this.cursor;
    if (!cursor) return;
    playback.attach({
      setSpeed: (s) => {
        this.speed = s;
      },
      setPaused: (p) => {
        if (cursor.state !== 'playing') return;
        if (p) driver.pause('replay');
        else driver.resume('replay');
      },
      step: () => {
        driver.pause('replay');
        this.advancePlayback(cursor);
      },
    });
  }

  private reportPlayback(): void {
    const cursor = this.cursor;
    const driver = this.driver;
    if (!cursor || !driver) return;
    const d = cursor.divergence;
    this.launch?.playback?.onStatus({
      tick: cursor.tick,
      total: cursor.total,
      state: cursor.state,
      paused: driver.isPaused,
      speed: this.speed,
      ...(d ? { divergentTick: d.tick } : {}),
    });
  }

  private togglePause(): void {
    const driver = this.driver;
    if (!driver || this.ended) return;
    if (driver.isPausedFor('user')) driver.resume('user');
    else driver.pause('user');
    // A key held across the dialog must not replay on resume.
    this.keyboard?.releaseAll();
    if (driver.isPausedFor('user')) this.pauseDialog?.open();
    else this.pauseDialog?.close();
  }

  /** Feeds the screen-reader live region with match events. */
  private announce(events: readonly SimEvent[]): void {
    const announcer = this.announcer;
    if (!announcer) return;
    for (const a of announcementsFor(events)) announcer.say(a);
  }

  /** Low-health watch: polled every few frames rather than every 50 Hz tick. */
  private checkLowHealth(): void {
    const { announcer, view } = this;
    if (!announcer || !view) return;
    const hero = collectSide(view, 0).active;
    if (this.lowHealth.update(hero === undefined ? undefined : hero.hp / Math.max(1, hero.maxHp))) announcer.say(LOW_HEALTH);
  }

  override update(): void {
    const { driver, view, pool, projPool } = this;
    if (!driver || !view || !pool || !projPool) return;
    this.keyboard?.pollPad();
    this.announcer?.flush();
    if (++this.frames % LOW_HEALTH_POLL_FRAMES === 0) this.checkLowHealth();
    const alpha = driver.frame();
    const tick = view.tick;
    this.actionBar?.update();
    this.reportPlayback();
    this.frameTick = tick;
    this.frameAlpha = alpha;
    pool.begin();
    view.forEachCharacter(this.drawCharacter);
    pool.end();
    projPool.begin();
    view.forEachProjectile(this.drawProjectile);
    projPool.end();
  }

  /** Per-frame callbacks are fields so `update` allocates no closures. */
  private frameTick = 0;
  private frameAlpha = 0;
  private readonly drawCharacter = (c: RenderCharacter): void => {
    this.pool?.acquire(c.id).apply(c, this.frameTick, this.frameAlpha);
  };
  private readonly drawProjectile = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.frameAlpha);
  };

  private readonly shutdownHandler = (): void => {
    this.onShutdown();
  };

  private onShutdown(): void {
    for (const off of this.cleanups.splice(0)) off();
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      const hook = window.__TTE__;
      if (hook) {
        delete hook.arena;
        delete hook.scene;
      }
    }
    // Remove only our own handler: removeAllListeners would also drop Phaser's internal scene hooks.
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdownHandler);
    this.actionBar?.destroy();
    this.actionBar = undefined;
    this.pool?.forEachView((v) => { v.destroy(); });
    this.pool?.clear();
    this.projPool?.forEachView((v) => { v.destroy(); });
    this.projPool?.clear();
    this.pool = undefined;
    this.projPool = undefined;
    this.fx = undefined;
    this.cursor = undefined;
    this.driver = undefined;
    this.keyboard = undefined;
    this.pauseDialog = undefined;
    this.announcer = undefined;
    this.view = undefined;
    this.world = undefined;
  }
}
