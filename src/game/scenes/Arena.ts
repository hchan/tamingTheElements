import Phaser from 'phaser';
import {
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ARCADE_WORLD_BASE,
  ArcadeT,
  ArcadeW,
  DEFAULT_SIM_FLAGS,
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  applyArenaCheat,
  applyTickCheats,
  benchRows,
  hash,
  RandomBot,
  SIM_VERSION,
  SimEventKind,
  TeamField,
  WEATHER_TICKS,
  World,
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
  type ArenaCheat,
  type RenderView,
  type SimEvent,
  type SimWorld,
} from '@core/index';
import { CastDetector } from '../audio/cast-sounds';
import { createArenaAudio, type ArenaAudio } from '../audio/arena-audio';
import type { AudioContextLike } from '../audio/audio-manager';
import { EventFx, createPhaserFxSink, type FxPoint } from '../fx/event-fx';
import { KeyboardAgent } from '../input/keyboard-agent';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted, type ProbeCharacter } from '../platform/test-hook';
import { getUiFlags } from '../platform/flags';
import { ArcadeHudModel, numberLabel } from '../hud/arcade-hud';
import { getPrefs } from '../platform/a11y/prefs';
import { BLOCKED_EVENT } from '../boot/presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';
import { Announcer, LOW_HEALTH, LowHealthWatch, MATCH_START, announcementsFor, createLiveRegion } from '../a11y/announcer';
import { createPauseDialog, type PauseDialog } from '../a11y/pause-dialog';
import { firstPad } from '../input/gamepad';
import { getBindings, type Bindings } from '../platform/input/bindings';
import { collectSide } from '../hud/bars';
import { ActionBarView, labelsFromBindings, type KeyLabels } from '../hud/action-bar';
import { Backdrop } from '../views/backdrop';
import { CLASSIC_SPRITE_SCALE, CharacterView } from '../views/character-view';
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

/** Legacy cheat keys (key-map CheatAction) to the tester cheats. */
const CHEAT_KEYS = { cheatQ: 'win', cheatX: 'freezeEnemy', cheatC: 'captureWin' } as const satisfies Record<string, ArenaCheat>;

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
  private arcadeHud: ArcadeHudModel | undefined;
  /**
   * Arcade only: the round announcer and timer HUD, with the defence view (two lazy chunks), fed the events of every tick
   * once they have loaded.
   */
  private rounds: ((events: readonly SimEvent[]) => void) | undefined;
  private terrain: ((events: readonly SimEvent[]) => void) | undefined;
  private poses: ((events: readonly SimEvent[]) => void) | undefined;
  private agents: readonly [Agent, Agent] = [new RandomBot('p1'), new RandomBot('p2')];
  private actionBar: ActionBarView | undefined;
  private backdrop: Backdrop | undefined;
  private clicks: number[] = [];
  private pauseText: Phaser.GameObjects.Text | undefined;
  private cursor: ReplayCursor | undefined;
  private speed: 1 | 2 = 1;
  private keyboard: KeyboardAgent | undefined;
  /** The battle's sound; public so the Arcade audio layers (`audio/arcade-audio.ts`, a lazy chunk) can find it. */
  audio: ArenaAudio | undefined;
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
    // `?ff=` flags exist only in dev and test builds; the static test drops this branch from production bundles.
    const ff = (import.meta.env.DEV || import.meta.env.MODE === 'test') && getUiFlags(window.location.search).arcade;
    const dev = import.meta.env.DEV || import.meta.env.MODE === 'test';
    // `?p1=<character slug>` (dev/test only) swaps the demo hero, so visual captures can render any character's abilities.
    const hero = dev ? new URLSearchParams(window.location.search).get('p1') : null;
    const demoBase = hero ? { ...DEMO_SETUP, p1: [{ character: characterId(hero), xp: 0 }, ...DEMO_SETUP.p1.slice(1)] } : DEMO_SETUP;
    const demo = ff ? { ...demoBase, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } } : demoBase;
    const world = this.cursor?.world ?? createMatch(this.launch?.setup ?? demo);
    this.world = world;
    const view = createRenderView(world);
    this.view = view;
    this.driver = new FixedStepDriver({ tick: () => { this.advance([undefined, undefined]); }, now: () => performance.now() });
    const driver = this.driver;
    const arcadeMatch = this.view.arcade() !== undefined;
    this.pool = new EntityViewPool(() => new CharacterView(this, arcadeMatch ? 1 : CLASSIC_SPRITE_SCALE), (v) => { v.hide(); });
    const projPool = new EntityViewPool(() => new ProjectileView(this), (v) => { v.hide(); });
    this.projPool = projPool;
    const pool = this.pool;
    // Agents keep their own memory and random streams, so every match (scene start) gets fresh ones.
    this.agents = [new RandomBot('p1'), new RandomBot('p2')];
    const arcade = view.arcade() !== undefined;
    const hud = arcade ? new ArcadeHudModel() : undefined;
    this.arcadeHud = hud;
    this.fx = new EventFx(
      createPhaserFxSink(
        this,
        (id) => pool.peek(id),
        (id) => {
          let p: FxPoint | undefined;
          view.forEachCharacter((c) => {
            if (c.id === id) p = { x: c.x + c.w / 2, y: c.y + c.h / 2, h: c.h };
          });
          return p;
        },
        () => driver.isPaused,
        () => view.tick,
        hud && ((x, y, amount, scaled, counter) => { hud.spawn(x, y, amount, scaled, counter); }),
      ),
      { reducedMotion: () => getPrefs().reduceMotion, arcade, elementOf: (id) => pool.peek(id)?.element },
    );

    if (this.launch && !playback) {
      const keyboard = new KeyboardAgent({
        capturable: () => true,
        bindings: getBindings(),
        gamepad: () => firstPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null),
        // Legacy Shift-Q / X / C cheats exist only in tester mode (docs/TESTER-MODE.md).
        cheatsEnabled: this.launch.tester !== undefined,
        arcade,
        onEffect: (e) => {
          if (e === 'pause') this.togglePause();
          else if (e === 'mute') this.audio?.audio.handleInputEffect({ kind: 'toggleMute' });
          else this.arenaCheat(CHEAT_KEYS[e]);
        },
      });
      this.keyboard = keyboard;
      const tester = this.launch.tester;
      this.pauseDialog = createPauseDialog({
        onResume: () => { this.togglePause(); },
        ...(tester ? { onTester: tester.openPanel } : {}),
      });
      if (tester) {
        this.cleanups.push(
          tester.session.attachArena({ cheat: (c) => { this.arenaCheat(c); }, bench: () => benchRows(world, 0), arcade: world.state.arcade.length > 0 }),
        );
      }
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
        !arcade,
      );
      this.cleanups.push(keyboard.attach(counted(window)));
    }
    this.cleanups.push(pauseOnHidden(counted(document), driver));
    this.setupAudio();

    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (!arcade && element) this.backdrop = new Backdrop(this, element, bg && `bg:${bg}`);
    else if (bg) this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1);

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
    const hudData: HudData = { view: this.view, ...(hud ? { arcade: hud } : {}) };
    this.scene.launch(HUD_SCENE, hudData);
    if (hud) {
      const hudScene = this.scene.get(HUD_SCENE);
      void import('../hud/round-view').then((m) => {
        if (this.arcadeHud === hud) {
          this.rounds = m.mountRoundView(this, hudScene, view, (a) => { this.announcer?.say(a); }, getPrefs, pool);
        }
      });
      // The terrain view (its own lazy chunk), fed beside the round view.
      void import('../fx/terrain-view').then((m) => {
        if (this.arcadeHud === hud) this.terrain = m.mountTerrainView(this, hudScene, view, (a) => { this.announcer?.say(a); }, getPrefs);
      });
    }
    // The pose layer (lazy chunk): smooth walking, leans, Arcade poses, projectile easing (docs/ARCHITECTURE.md).
    void import('../views/pose-layer').then((m) => {
      if (this.view === view) this.poses = m.mountPoseLayer(this, view, pool, projPool, getPrefs);
    });
    this.launch?.arcadeView?.(this, view, () => this.frameAlpha);

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
      actionSlots: () =>
        this.actionBar?.currentSlots.map((s) => ({
          x: s.x, y: s.y, size: s.size, cmd: s.cmd, kind: s.kind, label: s.label, disabled: s.disabled, highlight: s.highlight,
        })) ?? [],
      clicks: () => [...this.clicks],
      captureGranted: () => view.actionBar(0)?.capture !== undefined,
      bench: () => benchRows(world, 0),
      swapReadyTick: () => world.state.teams[TeamField.swapCooldownUntil] ?? 0,
      cheat: (c) => {
        this.arenaCheat(c);
      },
      shaking: () => this.cameras.main.shakeEffect.isRunning,
      fx: () => {
        const hud = this.arcadeHud;
        const tints: { id: number; tint: number; mode: number }[] = [];
        view.forEachCharacter((c) => {
          const img = this.pool?.peek(c.id)?.image;
          if (img?.visible) tints.push({ id: c.id, tint: img.tintTopLeft, mode: img.tintMode });
        });
        return {
          tints,
          numbers: hud?.numbers.filter((n) => n.live).map((n) => numberLabel(n.amount, n.counter)) ?? [],
          combo: [hud?.combos[0].hits ?? 0, hud?.combos[1].hits ?? 0],
          meter: [hud?.meters[0].value ?? 0, hud?.meters[1].value ?? 0],
        };
      },
      superFx: () => import('../fx/super-view').then((m) => m.superState(this)),
      rounds: () => import('../hud/round-view').then((m) => m.roundState(this.scene.get(HUD_SCENE))),
      defence: () => import('../fx/defence-view').then((m) => m.defenceState(this)),
      weather: () => import('../fx/weather-view').then((m) => m.weatherState(this)),
      viewsReady: () => (!this.arcadeHud || this.rounds !== undefined) && this.scene.isActive(HUD_SCENE),
      tag: () => import('../hud/tag-view').then((m) => m.tagState(this)),
      terrain: () => import('../fx/terrain-view').then((m) => m.terrainState(this)),
      aim: () => {
        const g = this.children.getByName('aim') as Phaser.GameObjects.Graphics | null;
        return g ? { visible: g.visible, x: g.x, y: g.y, angle: Math.round(g.angle) } : undefined;
      },
      setMeter: (team, value) => {
        this.launch?.recorder?.invalidate();
        world.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter] = value;
      },
      setWeatherCharge: (team, value) => {
        this.launch?.recorder?.invalidate();
        world.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge] = value;
      },
      setWeather: (kind, team) => {
        // As a cast would (systems/arcade/weather.ts): the slot, then its event to the views. Arcade only.
        this.launch?.recorder?.invalidate();
        const a = world.state.arcade;
        const w = ARCADE_WORLD_BASE;
        const prev = a[w + ArcadeW.weather] ?? 0;
        a[w + ArcadeW.weather] = kind;
        a[w + ArcadeW.weatherUntil] = (a[w + ArcadeW.gameTick] ?? 0) + WEATHER_TICKS;
        a[w + ArcadeW.weatherTeam] = team;
        const tick = world.state.world[World.tick] ?? 0;
        this.rounds?.([{ tick, sourceId: -1, kind: SimEventKind.weatherChanged, seq: 1000, weather: kind, prev, team }]);
      },
      audio: () => (this.audio ? { muted: this.audio.audio.muted, unlocked: this.audio.audio.isUnlocked } : undefined),
      arcadeAudio: () => import('../audio/arcade-audio').then((m) => m.arcadeAudioState(this.audio?.audio)),
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

  private readonly casts = new CastDetector();

  /** Legacy plays a sound when an ability is cast; the sim has no cast event, so the action bars are watched. */
  private playCasts(): void {
    const audio = this.audio?.audio;
    if (!audio || !this.view) return;
    for (const id of this.casts.detect(this.view)) audio.playSfx(id);
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
    const tester = this.launch?.tester?.session;
    if (tester) applyTickCheats(world, tester.tickCheats());
    const events = step(world, final);
    this.fx?.consume(events);
    this.audio?.audio.consume(events);
    this.playCasts();
    this.announce(events);
    this.rounds?.(events);
    this.terrain?.(events);
    this.poses?.(events);
    const over = events.find((e) => e.kind === SimEventKind.matchEnded);
    if (!over) return;
    this.ended = true;
    this.driver?.pause('ended');
    const s = world.state;
    const end = {
      winner: over['winner'] ?? -1,
      activeSlot: s.teams[TeamField.activeSlot] ?? 0,
      capturedIndices: capturedRosterIndices(s, 1),
      ...(over['won0'] === undefined ? {} : { rounds: [over['won0'], over['won1'] ?? 0] as const }),
    };
    // Wall clock, not `this.time`: Phaser caps a frame's delta at 200 ms, so under a slow (software) renderer the scene
    // clock runs several times slower than real time and the results could take many seconds to arrive.
    const t = setTimeout(() => { this.launch?.onEnd?.(end); }, END_DELAY_MS);
    this.cleanups.push(() => { clearTimeout(t); });
  }

  /** Tester mode only: a one-shot cheat on the running match (a state edit outside `step`; the replay is flagged `cheats`). */
  private arenaCheat(cheat: ArenaCheat): void {
    const world = this.world;
    if (!world || this.ended || !this.launch?.tester) return;
    applyArenaCheat(world, cheat);
  }

  /** Replay mode: one verified tick per call (two at 2x); a finished or diverged replay holds the driver. */
  private advancePlayback(cursor: ReplayCursor): void {
    for (let k = 0; k < this.speed; k++) {
      const events = cursor.next();
      if (!events) break;
      this.fx?.consume(events);
      this.rounds?.(events);
      this.terrain?.(events);
      this.poses?.(events);
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
    // Effects hold their frame while the sim is paused (and so in e2e manual stepping, where captures need them).
    const live = !driver.isPaused;
    const arcade = this.arcadeHud && view.arcade();
    if (arcade) this.arcadeHud?.update(live ? this.game.loop.delta : 0, arcade.comboHits, arcade.comboDamage, arcade.meter);
    this.actionBar?.update();
    this.backdrop?.update(live ? this.game.loop.delta : 0, getPrefs().reduceMotion);
    this.reportPlayback();
    this.frameTick = tick;
    this.frameAlpha = alpha;
    this.frameLive = live;
    pool.begin();
    view.forEachCharacter(this.drawCharacter);
    pool.end();
    projPool.begin();
    view.forEachProjectile(this.drawProjectile);
    // Classic melee boxes (Ice Shock, Ground Shock, ...) were never drawn: show their sprite over the hit box.
    if (view.arcade() === undefined) view.forEachProjectile(this.drawMelee, true);
    projPool.end();
  }

  /** Per-frame callbacks are fields so `update` allocates no closures. */
  private frameTick = 0;
  private frameAlpha = 0;
  private frameLive = true;
  private readonly drawCharacter = (c: RenderCharacter): void => {
    this.pool?.acquire(c.id).apply(c, this.frameTick, this.frameAlpha, this.frameLive);
  };
  private readonly drawProjectile = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.frameAlpha);
  };

  private readonly drawMelee = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.frameAlpha, true);
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
    this.backdrop?.destroy();
    this.backdrop = undefined;
    this.pool?.forEachView((v) => { v.destroy(); });
    this.pool?.clear();
    this.projPool?.forEachView((v) => { v.destroy(); });
    this.projPool?.clear();
    this.pool = undefined;
    this.projPool = undefined;
    this.fx = undefined;
    this.arcadeHud = undefined;
    this.rounds = undefined;
    this.terrain = undefined;
    this.poses = undefined;
    this.cursor = undefined;
    this.driver = undefined;
    this.keyboard = undefined;
    this.pauseDialog = undefined;
    this.announcer = undefined;
    this.view = undefined;
    this.world = undefined;
  }
}
