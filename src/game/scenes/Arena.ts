import { LowLifeVignette } from '../fx/low-life-vignette';
import { PlayOnce } from '../net/play-once';
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
  RoundPhase,
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
  arcadePlayfield,
  capturedRosterIndices,
  characterId,
  LockstepSession,
  FramePacer,
  collectCommands,
  createMatch,
  createRenderView,
  step,
  type Agent,
  type Element,
  type MatchSetup,
  type RenderCharacter,
  type RenderArcade,
  type RenderProjectile,
  type ArenaCheat,
  type RenderView,
  type SimEvent,
  type SimWorld,
} from '@core/index';
import { playSfx } from '../audio/sfx';
import { cleanseClockOf } from '../hud/cleanse-clock';
import { CastDetector } from '../audio/cast-sounds';
import { createArenaAudio, type ArenaAudio } from '../audio/arena-audio';
import type { AudioContextLike } from '../audio/audio-manager';
import { EventFx, createPhaserFxSink, type FxPoint } from '../fx/event-fx';
import { KeyboardAgent } from '../input/keyboard-agent';
import { P2_BINDINGS } from '../input/local-two';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted, type ProbeCharacter } from '../platform/test-hook';
import { getUiFlags } from '../platform/flags';
import { ArcadeHudModel, numberLabel } from '../hud/arcade-hud';
import { getPrefs } from '../platform/a11y/prefs';
import { BLOCKED_EVENT } from '../boot/presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';

/** Ticks an online match may predict ahead (rollback is the default; `?ff=lockstep` in dev and test builds sets 0). */
const ROLLBACK_WINDOW = 6;
import { Announcer, LOW_HEALTH, LowHealthWatch, MATCH_START, announcementsFor, createLiveRegion } from '../a11y/announcer';
import { createPauseDialog, type PauseDialog } from '../a11y/pause-dialog';
import { firstPad, nthPad } from '../input/gamepad';
import { getBindings, type Bindings } from '../platform/input/bindings';
import { collectSide } from '../hud/bars';
import { screenBox } from '../hud/screen-box';
import { SwapNotice, elementalNotice, swapNotice, swapSlotOf } from '../hud/swap-notice';
import { groupSlots, wantsGroupedBar } from '../hud/bar-groups';
import { ActionBarView, labelsFromBindings, shortLabels, type KeyLabels } from '../hud/action-bar';
import { Backdrop } from '../views/backdrop';
import { CLASSIC_SPRITE_SCALE, CharacterView } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { ProjectileView } from '../views/projectile-view';
import { ReplayCursor } from '../replay/cursor';
import { actionRefusal, activeHeroOf, buildMatchEnd, chargeLineFor, demoMatch, playbackFrame } from './arena-logic';
import { HUD_SCENE, type HudData } from './Hud';
import type { ArenaLaunch, PlaybackSpeed } from './launch';

export const ARENA_SCENE = 'Arena';

/** Frames between low-health checks. */
const LOW_HEALTH_POLL_FRAMES = 10;

/** Beat between the final blow and the results route. */
const END_DELAY_MS = 1200;

/** Online: how often an ended session still answers its peer (one wall tick, as the driver would). */
const LINGER_MS = 20;

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
  private cleanseFx: ((events: readonly SimEvent[]) => void) | undefined;
  private agents: readonly [Agent | undefined, Agent | undefined] = [new RandomBot('p1'), new RandomBot('p2')];
  private actionBar: ActionBarView | undefined;
  /** Local two-player: Player 2's small mirrored readout (view only). */
  private actionBar2: ActionBarView | undefined;
  private backdrop: Backdrop | undefined;
  private clicks: number[] = [];
  /** Arcade: the line shown when a swap press is refused (hud/swap-notice.ts); view only. */
  private swapNotice: SwapNotice | undefined;
  private pauseText: Phaser.GameObjects.Text | undefined;
  private cursor: ReplayCursor | undefined;
  private speed: PlaybackSpeed = 1;
  /** Frame parity for 0.5x playback. */
  private slowFrame = false;
  private keyboard: KeyboardAgent | undefined;
  private second: KeyboardAgent | undefined;
  /** Online matches only: the lockstep session that owns stepping (docs/NETCODE.md). */
  private session: LockstepSession | undefined;
  private readonly pacer = new FramePacer();
  private pacing = false;
  /** Rollback only: shows each event id once, so a corrected payload does not replay a sound or effect. */
  private playOnce: PlayOnce | undefined;
  /** The battle's sound; public so the Arcade audio layers (`audio/arcade-audio.ts`, a lazy chunk) can find it. */
  audio: ArenaAudio | undefined;
  private pauseDialog: PauseDialog | undefined;
  private announcer: Announcer | undefined;
  private readonly lowHealth = new LowHealthWatch();
  private lowLife: LowLifeVignette | undefined;
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
    const demo = demoMatch(DEMO_SETUP, hero, ff);
    const setup = this.launch?.setup ?? demo;
    const world = this.cursor?.world ?? createMatch(setup);
    this.world = world;
    const view = createRenderView(world);
    this.view = view;
    const net = this.launch?.net;
    const rollbackWindow = getUiFlags(window.location.search).lockstep ? 0 : ROLLBACK_WINDOW;
    if (rollbackWindow > 0) this.playOnce = new PlayOnce();
    this.pacing = rollbackWindow === 0;
    this.session = net && !playback ? new LockstepSession({ world, side: net.side, transport: net.input, match: net.match, rollbackWindow, ...(net.tickLimit === undefined ? {} : { tickLimit: net.tickLimit }) }) : undefined;
    this.driver = new FixedStepDriver({ tick: () => { this.advance([undefined, undefined]); }, now: () => performance.now() });
    const driver = this.driver;
    const arcadeMatch = this.view.arcade() !== undefined;
    this.pool = new EntityViewPool(() => new CharacterView(this, arcadeMatch ? 1 : CLASSIC_SPRITE_SCALE, arcadeMatch), (v) => { v.hide(); });
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
      { reducedMotion: () => getPrefs().reduceMotion, arcade, elementOf: (id) => pool.peek(id)?.element, sfx: playSfx },
    );

    if (this.launch && !playback) {
      const keyboard = new KeyboardAgent({
        capturable: () => true,
        bindings: getBindings(),
        gamepad: () => firstPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null),
        // Legacy Shift-Q / X / C cheats exist only in tester mode (docs/TESTER-MODE.md).
        cheatsEnabled: this.launch.tester !== undefined,
        arcade,
        // A swap sent on a tick where the game clock stood still (hit-stop, KO slow motion) is sent again on the next one.
        clock: () => view.actionBar(0)?.tick ?? 0,
        onSwap: (swaps) => { this.noteSwap(swaps); },
        onAction: (bits) => { this.noteAction(bits); },
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
      let second: KeyboardAgent | undefined;
      if (this.launch.local2) {
        // Player 2: its own keys and the second pad; pause, mute and cheats stay Player 1's (no onEffect, cheats off).
        second = new KeyboardAgent({
          capturable: () => true,
          bindings: P2_BINDINGS,
          gamepad: () => nthPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null, 1),
          cheatsEnabled: false,
          arcade,
        });
        this.cleanups.push(second.attach(counted(window)));
      }
      this.second = second;
      this.agents = [this.launch.net?.agent ?? keyboard, second ?? this.launch.enemy ?? (this.session ? undefined : new RandomBot('p2'))];
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
        true,
        arcade ? () => screenBox(this) : undefined,
        false,
        wantsGroupedBar(window.location.search, import.meta.env.DEV || import.meta.env.MODE === 'test') ? groupSlots : undefined,
      );
      if (second) {
        const p2Labels = shortLabels(labelsFromBindings(P2_BINDINGS));
        this.actionBar2 = new ActionBarView(this, this.view, () => undefined, 1, () => p2Labels, true, arcade ? () => screenBox(this) : undefined, true);
      }
      this.cleanups.push(keyboard.attach(counted(window)));
    }
    if (this.session) {
      const session = this.session;
      const onVis = (): void => { session.setHidden(document.hidden); };
      document.addEventListener('visibilitychange', onVis);
      this.cleanups.push(() => { document.removeEventListener('visibilitychange', onVis); });
    } else this.cleanups.push(pauseOnHidden(counted(document), driver));
    this.setupAudio();
    if (arcade && this.launch && !playback) {
      const notice = new SwapNotice(this, () => getPrefs().reduceMotion, () => screenBox(this));
      this.swapNotice = notice;
      this.cleanups.push(() => { notice.destroy(); this.swapNotice = undefined; });
    }

    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (!arcade && element) this.backdrop = new Backdrop(this, element, bg && `bg:${bg}`);
    else if (bg) this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(arcade ? arcadePlayfield().w : width, height).setDepth(-1);

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
        if (this.arcadeHud === hud) this.terrain = m.mountTerrainView(this, hudScene, view, (a) => { this.announcer?.say(a); }, getPrefs, setup.seed, import.meta.env.BASE_URL);
      });
      // The trap markers (WP 39b, its own lazy chunk).
      void import('../fx/trap-view').then((m) => {
        if (this.arcadeHud === hud) m.mountTrapView(this, view, () => getPrefs().reduceMotion);
      });
      // Own-element patch effects (own-element-tile-effects WP 1, its own lazy chunk).
      void import('../fx/own-element-view').then((m) => {
        if (this.arcadeHud === hud) m.mountOwnElementView(this, view, () => getPrefs().reduceMotion);
      });
    }
    // Melee danger-zone outlines (ability-telegraphs, its own lazy chunk).
    void import('../fx/danger-view').then((m) => {
      if (this.view === view) m.mountDangerView(this, view, () => getPrefs().reduceMotion);
    });
    // Buff auras and the Fire Heal pop (ability-graphics-audit-defects, its own lazy chunk).
    void import('../fx/ability-aura-view').then((m) => {
      if (this.view === view) m.mountAbilityAuraView(this, view, () => getPrefs().reduceMotion);
    });
    // Status apply bursts, expiry fades and the debuff loops (buff-debuff-animation, its own lazy chunk).
    void import('../fx/status-fx-view').then((m) => {
      if (this.view === view) m.mountStatusFxView(this, view, () => getPrefs().reduceMotion);
    });
    // Cleanse animation on the casting hero (elemental-cleanse presentation, its own lazy chunk).
    void import('../fx/cleanse-view').then((m) => {
      if (this.view === view) this.cleanseFx = m.mountCleanseView(this, view, getPrefs);
    });
    // The pose layer (lazy chunk): smooth walking, leans, Arcade poses, projectile easing (docs/ARCHITECTURE.md).
    void import('../views/pose-layer').then((m) => {
      if (this.view === view) this.poses = m.mountPoseLayer(this, view, pool, projPool, getPrefs);
    });
    this.launch?.arcadeView?.(this, view, () => this.frameAlpha);
    // The `?ff=arenaDemo,arcade` hook has no `arcadeView` (Phaser hands the scene `{}` as launch data): mount the pan camera so it shows the real view.
    if (!this.launch?.arcadeView && arcade) {
      void import('../fx/arena-pan').then((m) => {
        if (this.view === view) m.mountArenaPan(this, view, () => this.frameAlpha, () => getPrefs().reduceMotion);
      });
    }

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
      net: () => {
        const ses = this.session;
        return ses && { side: ses.side, status: ses.status, simTick: ses.simTick, desync: ses.desync, winner: ses.winner, checkpoints: ses.checkpoints(), stats: ses.stats };
      },
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
      actionBarScreen: () => this.actionBar?.screenSlots() ?? [],
      actionBar2Screen: () => this.actionBar2?.screenSlots() ?? [],
      clicks: () => [...this.clicks],
      captureGranted: () => view.actionBar(0)?.capture !== undefined,
      bench: () => benchRows(world, 0),
      swapReadyTick: () => world.state.teams[TeamField.swapCooldownUntil] ?? 0,
      swapNotice: () => this.swapNotice?.current ?? '',
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
      camera: () => import('../fx/arena-pan').then((m) => ({ ...m.panFraming(this), camZoom: this.cameras.main.zoom / (this.scale.width / LOGICAL_WIDTH), scrollX: this.cameras.main.scrollX })),
      superFx: () => import('../fx/super-view').then((m) => m.superState(this)),
      superBurst: () => import('../fx/super-view').then((m) => m.superBurstState(this)),
      sheets: () => import('../views/pose-layer').then((m) => m.sheetState(this)),
      rounds: () => import('../hud/round-view').then((m) => m.roundState(this.scene.get(HUD_SCENE))),
      defence: () => import('../fx/defence-view').then((m) => m.defenceState(this)),
      weather: () => import('../fx/weather-view').then((m) => m.weatherState(this)),
      viewsReady: () => (!this.arcadeHud || this.rounds !== undefined) && this.scene.isActive(HUD_SCENE),
      tag: () => import('../hud/tag-view').then((m) => m.tagState(this)),
      terrain: () => import('../fx/terrain-view').then((m) => m.terrainState(this)),
      traps: () => import('../fx/trap-view').then((m) => m.trapState(this)),
      ownElement: () => import('../fx/own-element-view').then((m) => m.ownElementState(this)),
      heroLabels: () => (this.scene.get(HUD_SCENE) as unknown as { heroLabels(): string[] }).heroLabels(),
      abilityFx: () => import('../fx/ability-aura-view').then((m) => m.abilityFxState(this)),
      dangerZones: () => import('../fx/danger-view').then((m) => m.dangerState(this)),
      aim: () => {
        const g = this.children.getByName('aim') as Phaser.GameObjects.Graphics | null;
        return g ? { visible: g.visible, x: g.x, y: g.y, angle: Math.round(g.angle) } : undefined;
      },
      setMeter: (team, value) => {
        this.launch?.recorder?.invalidate();
        world.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter] = value;
      },
      setRoundsWon: (won0, won1) => {
        // Dev/test only (the hook is dropped from production): lets a test reach the 2-2 draw that starts sudden death.
        this.launch?.recorder?.invalidate();
        const a = world.state.arcade;
        a[ARCADE_TEAM_BASE + ArcadeT.roundsWon] = won0;
        a[ARCADE_TEAM_BASE + ARCADE_T + ArcadeT.roundsWon] = won1;
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
      grantStatus: (id, status, ticks) => {
        // Dev/test only: writes a timed status as applyTimedStatus would (STATUS_SLOTS 8 x STATUS_STRIDE 5: [id, source, start, expire, mag]).
        this.launch?.recorder?.invalidate();
        const now = world.state.world[World.tick] ?? 0;
        for (let slot = 0; slot < 8; slot++) {
          const b = (id * 8 + slot) * 5;
          if ((world.state.status[b] ?? 0) !== 0) continue;
          world.state.status.set([status, id, now, now + ticks, 0], b);
          return;
        }
      },
      statusFx: () => import('../fx/status-fx-view').then((m) => m.statusFxState(this)),
      cleanse: () => import('../fx/cleanse-view').then((m) => m.cleanseState(this)),
      audio: () => (this.audio ? { muted: this.audio.audio.muted, unlocked: this.audio.audio.isUnlocked } : undefined),
      arcadeAudio: () => import('../audio/arcade-audio').then((m) => m.arcadeAudioState(this.audio?.audio)),
      boundCodes: () => ({ ...(this.keyboard?.currentBindings() ?? getBindings()) }),
      step: (n, cmds = [0, 0]) => {
        driver.pause();
        for (let k = 0; k < n; k++) this.advance(cmds);
      },
      ageFx: (on) => {
        this.fxAges = on;
      },
      stepLive: (n) => {
        driver.pause();
        for (let k = 0; k < n; k++) this.advance([undefined, undefined]);
      },
    };
  }

  private readonly casts = new CastDetector();

  /** Cleanse presentation: the action-bar cooldown clock, the hero animation and (live play only) the cue. View only. */
  private feedCleanse(events: readonly SimEvent[], sound: boolean): void {
    const view = this.view;
    if (!view || events.length === 0) return;
    cleanseClockOf(view).consume(events, view.tick);
    this.cleanseFx?.(events);
    if (!sound) return;
    for (const e of events) {
      if (e.kind !== SimEventKind.cleanse) continue;
      let element: Element = 'void';
      view.forEachCharacter((c) => {
        if (c.id === e.sourceId) element = c.element;
      });
      playSfx('cleanse', element);
    }
  }

  /** Legacy plays a sound when an ability is cast; the sim has no cast event, so the action bars are watched. */
  private playCasts(): void {
    const audio = this.audio?.audio;
    const view = this.view;
    if (!audio || !view) return;
    for (const { id, team } of this.casts.detectCasts(view)) {
      audio.playSfx(id);
      let element: Element = 'void';
      let found = false;
      view.forEachCharacter((c) => {
        if (!found && c.team === team && (c.flags & (EntityFlag.dead | EntityFlag.benched)) === 0) { element = c.element; found = true; }
      });
      playSfx('cast', element);
    }
  }

  /** Arcade: explains a swap press the sim is about to refuse (cooldown, frozen, stunned, no partner, no fight). View only. */
  private noteSwap(swaps: number): void {
    const { view, swapNotice: notice } = this;
    const arcade = view?.arcade();
    const bar = view?.actionBar(0);
    if (!view || !notice || !arcade || !bar) return;
    // A hit-stop skips the swap on this tick but the press is sent again, so it is not a refusal.
    if (arcade.frozen) return;
    const hero = activeHeroOf(view);
    const active = hero?.id ?? -1;
    const flags = hero?.flags ?? 0;
    const slot = swapSlotOf(swaps);
    const line = swapNotice({
      fighting: arcade.phase === RoundPhase.fight,
      frozen: (flags & EntityFlag.frozen) !== 0,
      stunned: active >= 0 && arcade.stunned(active),
      noPartner: bar.swaps[slot] === undefined || bar.swaps[slot].dead,
      cooldownTicks: bar.swapReadyTick - bar.tick,
    });
    if (line !== undefined) {
      notice.show(line, this.time.now);
      (this.audio?.audio as { refuse?: () => void } | undefined)?.refuse?.();
    }
  }

  /** Arcade: says why a Super or Weather press does nothing yet (meter or weather charge not full). View only. */
  private noteAction(bits: number): void {
    const arcade = this.view?.arcade();
    const notice = this.swapNotice;
    if (!arcade || !notice || arcade.phase !== RoundPhase.fight || arcade.frozen) return;
    const line = actionRefusal(
      bits,
      { phase: arcade.phase, frozen: arcade.frozen, meter0: arcade.meter[0], weatherCharge0: arcade.weatherCharge[0] },
      () => this.chargeLine(arcade),
      () => {
        const bar = this.view?.actionBar(0);
        return bar ? elementalNotice(true, bar.tick, bar.elemental) : undefined;
      },
    );
    if (line === undefined) return;
    notice.show(line, this.time.now);
    this.announcer?.say({ key: 'refusal', text: line, important: false });
    (this.audio?.audio as { refuse?: () => void } | undefined)?.refuse?.();
  }

  /** Arcade: the reason a Charge press does nothing (ranged hero, cooldown, stun, root, guard), or undefined. View only. */
  private chargeLine(arcade: RenderArcade): string | undefined {
    return this.view ? chargeLineFor(this.view, arcade) : undefined;
  }

  /** One sim tick: agents (or the given commands) in, events out to the effects and the end check. */
  private advance(cmds: readonly [number | undefined, number | undefined]): void {
    const world = this.world;
    if (!world || this.ended) return;
    if (this.cursor) {
      this.advancePlayback(this.cursor);
      return;
    }
    let events: readonly SimEvent[];
    if (this.session) {
      // Online: only our own side is read locally; the session swaps commands with the peer and steps the shared sim itself,
      // or reports a stall (no step this call) while the peer's command is late.
      const side = this.session.side;
      const mine = collectCommands(world, side === 0 ? [this.agents[0], undefined] : [undefined, this.agents[0]])[side];
      // Frame-advantage pacing (lockstep only: with rollback the advantage is the prediction lead, not a stall signal): a peer that runs ahead of its own best case skips an update now and then (the sim is unaffected).
      if (this.pacing && this.pacer.shouldSkip(this.session.frameAdvantage())) return;
      const r = this.session.update(mine);
      this.launch?.net?.onStatus?.(r.status, this.session);
      if (!r.stepped) {
        if (r.status === 'desync' || r.status === 'forfeit') this.driver?.pause('ended');
        return;
      }
      events = this.playOnce ? this.playOnce.fresh(r.events) : r.events;
    } else {
      // Agents are consulted only when a side has no forced command. Consulting them never changes the sim
      // state (step alone mutates it), so forced and live ticks with the same commands hash the same.
      const [f0, f1] = cmds;
      const c = f0 === undefined || f1 === undefined ? collectCommands(world, this.agents) : [0, 0];
      const final: [number, number] = [f0 ?? c[0] ?? 0, f1 ?? c[1] ?? 0];
      this.launch?.recorder?.record(world, final);
      const tester = this.launch?.tester?.session;
      if (tester) applyTickCheats(world, tester.tickCheats());
      events = step(world, final);
    }
    this.fx?.consume(events);
    this.feedCleanse(events, true);
    this.audio?.audio.consume(events);
    this.playCasts();
    this.announce(events);
    this.rounds?.(events);
    this.terrain?.(events);
    this.poses?.(events);
    const over = events.find((e) => e.kind === SimEventKind.matchEnded);
    // Online only: the session's tick limit stops the match without a sim `matchEnded` (a draw, or the session's winner).
    const timedOut = !over && this.session !== undefined && this.session.status === 'ended';
    if (!over && !timedOut) return;
    this.ended = true;
    this.driver?.pause('ended');
    if (this.session) this.lingerSession(this.session);
    const s = world.state;
    const end = buildMatchEnd(over, this.session?.winner, s.teams[TeamField.activeSlot] ?? 0, capturedRosterIndices(s, 1));
    // Wall clock, not `this.time`: Phaser caps a frame's delta at 200 ms, so under a slow (software) renderer the scene
    // clock runs several times slower than real time and the results could take many seconds to arrive.
    const t = setTimeout(() => { this.launch?.onEnd?.(end); }, END_DELAY_MS);
    this.cleanups.push(() => { clearTimeout(t); });
  }

  /**
   * Online: the datagram link is lossy and a lockstep side that ended may still owe its peer the inputs it needs to end too. Keep
   * receiving and re-sending (no stepping: an ended session only does that) until the scene shuts down, so the peer always finishes
   * instead of stalling to a timeout. Wall clock, not the paused driver.
   */
  private lingerSession(session: LockstepSession): void {
    const t = setInterval(() => { session.update(0); }, LINGER_MS);
    this.cleanups.push(() => { clearInterval(t); });
  }

  /** Tester mode only: a one-shot cheat on the running match (a state edit outside `step`; the replay is flagged `cheats`). */
  private arenaCheat(cheat: ArenaCheat): void {
    const world = this.world;
    if (!world || this.ended || !this.launch?.tester) return;
    applyArenaCheat(world, cheat);
  }

  /** Replay mode: one verified tick per call (two at 2x); a finished or diverged replay holds the driver. */
  private advancePlayback(cursor: ReplayCursor): void {
    const frame = playbackFrame(this.speed, this.slowFrame);
    this.slowFrame = frame.slowFrame;
    for (let k = 0; k < frame.ticks; k++) {
      const events = cursor.next();
      if (!events) break;
      this.fx?.consume(events);
      this.feedCleanse(events, false);
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
    // A shared online match cannot be paused by one side.
    if (!driver || this.ended || this.session) return;
    if (driver.isPausedFor('user')) driver.resume('user');
    else driver.pause('user');
    // A key held across the dialog must not replay on resume.
    this.keyboard?.releaseAll();
    this.second?.releaseAll();
    if (driver.isPausedFor('user')) this.pauseDialog?.open();
    else this.pauseDialog?.close();
  }

  /** Feeds the screen-reader live region with match events. */
  private announce(events: readonly SimEvent[]): void {
    const announcer = this.announcer;
    if (!announcer) return;
    const team = this.world?.state.team;
    for (const a of announcementsFor(events, (id) => team?.[id] ?? 0)) announcer.say(a);
  }

  /** Low-health watch: polled every few frames rather than every 50 Hz tick. */
  private checkLowHealth(): void {
    const { announcer, view } = this;
    if (!announcer || !view) return;
    const hero = collectSide(view, 0).active;
    const fraction = hero === undefined ? undefined : hero.hp / Math.max(1, hero.maxHp);
    this.lowLife ??= new LowLifeVignette(this.cameras.main, () => getPrefs().reduceMotion, (st) => {
      (this.scene.get(HUD_SCENE) as unknown as { edgeGrain?(s: number): void }).edgeGrain?.(st);
    });
    this.lowLife.set(fraction);
    if (this.lowHealth.update(fraction)) announcer.say(LOW_HEALTH);
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
    const live = !driver.isPaused || this.fxAges;
    const arcade = this.arcadeHud && view.arcade();
    if (arcade) this.arcadeHud?.update(live ? this.game.loop.delta : 0, arcade.comboHits, arcade.comboDamage, arcade.meter);
    this.actionBar?.update();
    this.actionBar2?.update();
    this.swapNotice?.update(this.time.now);
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
    // Melee boxes (Ice Shock, Ground Shock, ...) were never drawn: show their sprite over the hit box (Classic and Arcade).
    view.forEachProjectile(this.drawMelee, true);
    projPool.end();
  }

  /** Per-frame callbacks are fields so `update` allocates no closures. */
  private frameTick = 0;
  private frameAlpha = 0;
  private frameLive = true;
  /** Test hook: let view effects (hit flash) age on real frames while the sim stays paused. */
  private fxAges = false;
  /** Element of each team's character this frame (characters draw before projectiles); picks the Snag rope art. */
  private readonly teamElement: string[] = [];
  private readonly drawCharacter = (c: RenderCharacter): void => {
    this.teamElement[c.team] = c.element;
    this.pool?.acquire(c.id).apply(c, this.frameTick, this.frameAlpha, this.frameLive);
  };
  private readonly drawProjectile = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.frameAlpha);
  };

  private readonly drawMelee = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.frameAlpha, true, this.teamElement[p.team]);
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
    this.actionBar2?.destroy();
    this.actionBar2 = undefined;
    this.lowLife = undefined;
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
    this.second = undefined;
    this.pauseDialog = undefined;
    this.announcer = undefined;
    this.view = undefined;
    this.world = undefined;
  }
}
