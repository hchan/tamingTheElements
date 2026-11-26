import { HoldLerp } from '../loop/hold-lerp';
import { mountShakeScroll } from '../fx/camera-shake';
import { LowLifeVignette } from '../fx/low-life-vignette';
import { mountTallFills } from './tall-fills';
import { lingerSession } from '../net/linger';
import { PlayOnce } from '../net/play-once';
import Phaser from 'phaser';
import {
  DEFAULT_SIM_FLAGS,
  EntityFlag,
  applyArenaCheat,
  applyTickCheats,
  RandomBot,
  SIM_VERSION,
  SimEventKind,
  TeamField,
  arcadePlayfield,
  capturedRosterIndices,
  characterId,
  LockstepSession,
  CatchUp,
  FramePacer,
  collectCommands,
  Cmd,
  createMatch,
  createRenderView,
  CHARACTERS,
  step,
  type Agent,
  type Element,
  type MatchSetup,
  type RenderCharacter,
  type RenderProjectile,
  type ArenaCheat,
  type RenderView,
  type SimEvent,
  type SimWorld,
  ROLLBACK_WINDOW,
} from '@core/index';
import { playSfx } from '../audio/sfx';
import { heroName } from '../hud/tag-fx';
import { cleanseClockOf } from '../hud/cleanse-clock';
import { CastDetector } from '../audio/cast-sounds';
import { createArenaAudio, type ArenaAudio } from '../audio/arena-audio';
import type { AudioContextLike } from '../audio/audio-manager';
import { EventFx, createPhaserFxSink, type FxPoint } from '../fx/event-fx';
import type { KeyboardAgent } from '../input/keyboard-agent';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted } from '../platform/test-hook';
import { getUiFlags } from '../platform/flags';
import { ArcadeHudModel } from '../hud/arcade-hud';
import { getPrefs } from '../platform/a11y/prefs';
import { BLOCKED_EVENT } from '../boot/presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene } from '../boot/viewport';

import { Announcer, LOW_HEALTH, LowHealthWatch, announcementsFor, tagNotReady } from '../a11y/announcer';
import type { PauseDialog } from '../a11y/pause-dialog';
import { collectSide } from '../hud/bars';
import { victimAnchor } from '../hud/combo-anchor';
import { SwapFeedback } from './swap-feedback';
import { mountArenaInput } from './arena-input';
import type { ActionBarView } from '../hud/action-bar-view';
import { Backdrop } from '../views/backdrop';
import { createStageAmbient, type StageAmbient } from '../fx/stage-ambient-view';
import { CLASSIC_SPRITE_SCALE, CharacterView, frozenTintOf, lerp, setBrightFloor } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { ProjectileView } from '../views/projectile-view';
import type { MotionSmoother } from '../fx/ability-motion-view';
import { ReplayCursor } from '../replay/cursor';
import { buildMatchEnd, demoMatch, effectsHeld, playbackFrame, syncArcadeBg } from './arena-logic';
import { HUD_SCENE, type HudData } from './Hud';
import { createArenaProbe } from './arena-probe';
import type { ArenaLaunch, PlaybackSpeed } from './launch';

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
/** Cmd.swap1 and swap2: the Tag press bits (bits 9 and 10 are Cleanse and the elemental in Arcade). */
const TAG_BITS = Cmd.swap1 | Cmd.swap2;

/**
 * Caps the sprite batch at 3 textures. With 4 or more in one batch (floor, hero sheet, ambient glow and grain...) the
 * multi-texture shader sampled the wrong unit for part of a sprite under SwiftShader (Treenoc drawn as pale water-coloured
 * triangles, QA r71); the arena has few textures, so the extra flushes are cheap. No-op on the Canvas renderer.
 */
export const ARENA_MAX_TEXTURE_UNITS = 3;
function limitTextureBatch(scene: Phaser.Scene): void {
  const nodes = (scene.game.renderer as { renderNodes?: { setMaxParallelTextureUnits?: (n: number) => void } }).renderNodes;
  nodes?.setMaxParallelTextureUnits?.(ARENA_MAX_TEXTURE_UNITS);
}

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
  private ccFeed: ((events: readonly SimEvent[]) => void) | undefined;
  /** Throw/pull motion smoother (lazy chunk; undefined until it loads). Fed each sim step, read each frame. */
  private motion: MotionSmoother | undefined;
  private cleanseFx: ((events: readonly SimEvent[]) => void) | undefined;
  private agents: readonly [Agent | undefined, Agent | undefined] = [new RandomBot('p1'), new RandomBot('p2')];
  private actionBar: ActionBarView | undefined;
  /** Local two-player: Player 2's small mirrored readout (view only). */
  private actionBar2: ActionBarView | undefined;
  private backdrop: Backdrop | undefined; private arcadeBg: Phaser.GameObjects.Image | undefined;
  /** Per-stage ambient particles behind the fighters (view only; none under reduced motion). */
  private ambient: StageAmbient | undefined;
  private clicks: number[] = [];
  /** Arcade: the line shown when a swap press is refused (swap-feedback.ts); view only. */
  private swapNotice: SwapFeedback | undefined;
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
  private readonly catchUp = new CatchUp(); // rollback only: repays stalled ticks
  private lastStepped = false;
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
    limitTextureBatch(this);
    const playback = this.launch?.playback;
    this.cursor = playback ? new ReplayCursor(playback.replay) : undefined;
    // `?ff=` flags exist only in dev and test builds; the static test drops this branch from production bundles.
    const ff = (import.meta.env.DEV || import.meta.env.MODE === 'test') && getUiFlags(window.location.search).arcade;
    const dev = import.meta.env.DEV || import.meta.env.MODE === 'test';
    // `?p1=<character slug>` (dev/test only) swaps the demo hero, so visual captures can render any character's abilities.
    // `?hero=` and `?foe=` (flags.ts) pick both sides of a demo fight, so QA can test any hero.
    const uf = dev ? getUiFlags(window.location.search) : undefined;
    const hero = dev ? (uf?.hero ?? new URLSearchParams(window.location.search).get('p1')) : null;
    const demo = demoMatch(DEMO_SETUP, hero, ff, uf?.foe ?? null, uf?.cc === true);
    const setup = this.launch?.setup ?? demo;
    const world = this.cursor?.world ?? createMatch(setup);
    this.world = world;
    const view = createRenderView(world);
    this.view = view;
    this.holdLerp.reset();
    const net = this.launch?.net;
    const rollbackWindow = getUiFlags(window.location.search).lockstep ? 0 : ROLLBACK_WINDOW;
    if (rollbackWindow > 0) this.playOnce = new PlayOnce();
    this.pacing = rollbackWindow === 0;
    this.session = net && !playback ? new LockstepSession({ world, side: net.side, transport: net.input, match: net.match, rollbackWindow, ...(net.tickLimit === undefined ? {} : { tickLimit: net.tickLimit }), ...(net.inputDelay === undefined ? {} : { inputDelay: net.inputDelay }), ...(net.batchEvery === undefined ? {} : { batchEvery: net.batchEvery }) }) : undefined;
    this.driver = new FixedStepDriver({ tick: () => {
      this.advance([undefined, undefined]);
      if (this.session && !this.pacing) this.catchUp.repay(this.lastStepped, () => { this.advance([undefined, undefined]); return this.lastStepped; });
    }, now: () => performance.now() });
    const driver = this.driver;
    const arcadeMatch = this.view.arcade() !== undefined;
    this.arcadeMatch = arcadeMatch;
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
        () => effectsHeld(driver.isPaused, this.fxAges),
        () => view.tick,
        hud && ((x, y, amount, scaled, counter) => { hud.spawn(x, y, amount, scaled, counter); }),
        () => getPrefs().highContrast,
        (id) => {
          let sprite: string | undefined;
          view.forEachCharacter((c) => { if (c.id === id) sprite = c.sprite; });
          return sprite;
        },
      ),
      { reducedMotion: () => getPrefs().reduceMotion, arcade, elementOf: (id) => pool.peek(id)?.element, maxLifeOf: (id) => world.state.maxHp[id], sfx: playSfx },
    );

    if (this.launch && !playback) {
      const input = mountArenaInput({
        scene: this, launch: this.launch, world, view, arcade,
        online: this.session !== undefined || this.launch.net !== undefined,
        swapNotice: () => this.swapNotice,
        audio: () => this.audio,
        togglePause: () => { this.togglePause(); },
        cheat: (c) => { this.arenaCheat(c); },
        clicks: this.clicks,
        cleanups: this.cleanups,
      });
      this.keyboard = input.keyboard;
      this.second = input.second;
      this.pauseDialog = input.pauseDialog;
      this.announcer = input.announcer;
      this.agents = [this.launch.net?.agent ?? input.keyboard, input.second ?? this.launch.enemy ?? (this.session ? undefined : new RandomBot('p2'))];
      this.actionBar = input.actionBar;
      this.actionBar2 = input.actionBar2;
    }
    if (this.session) {
      const session = this.session;
      const onVis = (): void => { session.setHidden(document.hidden); };
      document.addEventListener('visibilitychange', onVis);
      this.cleanups.push(() => { document.removeEventListener('visibilitychange', onVis); });
    } else this.cleanups.push(pauseOnHidden(counted(document), driver));
    this.setupAudio();
    if (arcade && this.launch && !playback) {
      const notice = new SwapFeedback({
        scene: this,
        view: () => this.view,
        audio: () => this.audio,
        announcer: () => this.announcer,
        inputDelay: () => this.session?.inputDelay ?? 0,
      });
      this.swapNotice = notice;
      this.cleanups.push(() => { notice.destroy(); this.swapNotice = undefined; });
    }

    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (!arcade && element) this.backdrop = new Backdrop(this, element, bg && `bg:${bg}`);
    else if (bg) this.arcadeBg = this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(arcade ? arcadePlayfield().w : width, height).setDepth(-1).setVisible(!arcade); // QA r126: hidden until the sim stage is known (syncArcadeBg)
    if (element && arcade) mountTallFills(this, this.view, element, bg ? `bg:${bg}` : undefined, this.cleanups);
    if (element) this.ambient = createStageAmbient(this, element, arcade ? arcadePlayfield().w : width);

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
    const arenaView = (): { x: number; y: number; w: number; h: number } => {
      const c = this.cameras.main;
      const w = c.width / c.zoom;
      const h = c.height / c.zoom;
      return { x: c.scrollX + c.width / 2 - w / 2, y: c.scrollY + c.height / 2 - h / 2, w, h };
    };
    const hudData: HudData = { view: this.view, ...(hud ? { arcade: hud, arenaView } : {}) };
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
      // The Eternal Void's horizon band and turning rings (stage 9 presentation; mounts only when a void fighter is in the match).
      void import('../views/void-stage').then((m) => {
        if (this.arcadeHud === hud) m.mountVoidStage(this, view, () => this.frameAlpha, () => getPrefs().reduceMotion, () => this.framePos);
      });
      // The trap markers (WP 39b, its own lazy chunk).
      void import('../fx/trap-view').then((m) => {
        if (this.arcadeHud === hud) m.mountTrapView(this, view, () => getPrefs().reduceMotion);
      });
      // The stage hazard telegraph (stage-selection-hazards, its own lazy chunk).
      void import('../fx/hazard-view').then((m) => {
        if (this.arcadeHud === hud) m.mountHazardView(this, view, () => getPrefs().reduceMotion);
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
    // Throw/pull smoothing: foe body shift, tendril, shock rings, slide dust (ability-smoothness, its own lazy chunk).
    void import('../fx/ability-motion-view').then((m) => {
      if (this.view !== view) return;
      const smoother = new m.MotionSmoother({ positionOf: (id) => this.simPositionOf(view, id), reduced: () => getPrefs().reduceMotion });
      this.motion = smoother;
      m.mountAbilityMotionView(this, view, smoother, () => getPrefs().reduceMotion);
    });
    // Idle element auras around every active hero (idle-element-auras, its own lazy chunk).
    void import('../fx/idle-aura-view').then((m) => {
      if (this.view === view) m.mountIdleAuraView(this, view, () => this.frameAlpha, () => getPrefs().reduceMotion, () => getPrefs().highContrast, () => this.framePos);
    });
    // Status apply bursts, expiry fades and the debuff loops (buff-debuff-animation, its own lazy chunk).
    void import('../fx/status-fx-view').then((m) => {
      if (this.view === view) m.mountStatusFxView(this, view, () => getPrefs().reduceMotion);
    });
    void import('../fx/cc-view').then((m) => {
      if (this.view === view) this.ccFeed = m.mountCcView(this, view, () => this.frameAlpha, () => getPrefs().reduceMotion, () => getPrefs().highContrast, () => this.framePos);
    });
    // Cleanse animation on the casting hero (elemental-cleanse presentation, its own lazy chunk).
    void import('../fx/cleanse-view').then((m) => {
      if (this.view === view) this.cleanseFx = m.mountCleanseView(this, view, getPrefs);
    });
    // The pose layer (lazy chunk): smooth walking, leans, Arcade poses, projectile easing (docs/ARCHITECTURE.md).
    void import('../views/pose-layer').then((m) => {
      if (this.view === view) this.poses = m.mountPoseLayer(this, view, pool, projPool, getPrefs);
    });
    mountShakeScroll(this);
    this.launch?.arcadeView?.(this, view, () => this.framePos);
    // The `?ff=arenaDemo,arcade` hook has no `arcadeView` (Phaser hands the scene `{}` as launch data): mount the pan camera so it shows the real view.
    if (!this.launch?.arcadeView && arcade) {
      void import('../fx/arena-pan').then((m) => {
        if (this.view === view) m.mountArenaPan(this, view, () => this.frameAlpha, () => getPrefs().reduceMotion, () => this.framePos);
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
    hook.arena = createArenaProbe({
      scene: this, world, view, driver,
      launch: () => this.launch,
      session: () => this.session,
      actionBar: () => this.actionBar,
      actionBar2: () => this.actionBar2,
      swapNotice: () => this.swapNotice,
      arcadeHud: () => this.arcadeHud,
      pool: () => this.pool,
      ambient: () => this.ambient,
      audio: () => this.audio,
      keyboard: () => this.keyboard,
      rounds: () => this.rounds,
      clicks: () => this.clicks,
      advance: (cmds) => { this.advance(cmds); },
      drawFrame: (alpha) => { this.drawSweepFrame(view, alpha); },
      setFxAges: (on) => { this.fxAges = on; },
      cheat: (c) => { this.arenaCheat(c); },
    });
  }

  /** Probe only (sweepDrawn): one render frame at wall-clock alpha, through the same sampling and draw path as `update`. */
  private drawSweepFrame(view: RenderView, alpha: number): void {
    this.samplePos(view, alpha);
    this.frameTick = view.tick;
    this.frameAlpha = alpha;
    this.frameLive = false;
    this.pool?.begin();
    view.forEachCharacter(this.drawCharacter);
    this.pool?.end();
  }

  private readonly casts = new CastDetector();

  /** Cleanse presentation: the action-bar cooldown clock, the hero animation and (live play only) the cue. View only. */
  private feedCleanse(events: readonly SimEvent[], sound: boolean): void {
    const view = this.view;
    if (!view || events.length === 0) return;
    cleanseClockOf(view).consume(events, view.tick);
    this.cleanseFx?.(events);
    // A tag-in landed: the swap-refused line (if one is still up) is stale, and would sit under the arriving hero's banner.
    if (events.some((e) => e.kind === SimEventKind.tagIn && (e['team'] ?? 0) === 0)) {
      this.swapNotice?.clearOnTagIn();
    }
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
      this.lastStepped = false;
      const r = this.session.update(mine);
      this.lastStepped = r.stepped;
      this.launch?.net?.onStatus?.(r.status, this.session);
      if (!r.stepped) {
        if (r.status === 'desync' || r.status === 'forfeit') this.driver?.pause('ended');
        // Rollback: the match end is only confirmed once the peer's last inputs arrive, which can happen on an update that steps
        // nothing (found by the WP 11 soak under `?netsim=`): fall through to the end check below instead of never ending.
        if (r.status !== 'ended') return;
        events = [];
      } else {
        events = this.playOnce ? this.playOnce.fresh(r.events) : r.events;
      }
    } else {
      // Agents are consulted only when a side has no forced command. Consulting them never changes the sim
      // state (step alone mutates it), so forced and live ticks with the same commands hash the same.
      const [f0, f1] = cmds;
      const c = f0 === undefined || f1 === undefined ? collectCommands(world, this.agents) : [0, 0];
      const final: [number, number] = [f0 ?? c[0] ?? 0, f1 ?? c[1] ?? 0];
      this.launch?.recorder?.record(world, final);
      this.announceEarlyTag(final[0]);
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
    this.ccFeed?.(events);
    this.feedMotion(events);
    const over = events.find((e) => e.kind === SimEventKind.matchEnded);
    // Online only: the session's tick limit stops the match without a sim `matchEnded` (a draw, or the session's winner).
    const timedOut = !over && this.session !== undefined && this.session.status === 'ended';
    if (!over && !timedOut) return;
    this.ended = true;
    this.driver?.pause('ended');
    if (this.session) this.cleanups.push(lingerSession(this.session, this.launch?.net?.batchEvery));
    const s = world.state;
    const end = buildMatchEnd(over, this.session?.winner, s.teams[TeamField.activeSlot] ?? 0, capturedRosterIndices(s, 1));
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
      this.ccFeed?.(events);
      this.feedMotion(events);
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
    const defId = this.world?.state.defId;
    const nameOf = (id: number): string | undefined => {
      const sprite = CHARACTERS[defId?.[id] ?? -1]?.sprite;
      return sprite === undefined ? undefined : heroName(sprite);
    };
    for (const a of announcementsFor(events, (id) => team?.[id] ?? 0, nameOf)) announcer.say(a);
  }

  /** 2v2: a Tag press while the bench cooldown runs gets a live-region "Tag ready in N seconds." (the sim ignores it). */
  private announceEarlyTag(cmd: number): void {
    if ((cmd & TAG_BITS) === 0) return;
    const bar = this.view?.actionBar(0);
    if (!bar || bar.swaps.length === 0) return;
    const line = tagNotReady(bar.swapReadyTick - bar.tick);
    if (line) this.announcer?.say(line);
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
    // Phaser's rAF timestamp for this frame (loop.now, the performance.now clock; `update`'s own argument is game time, not that)
    // rather than a second wall-clock read per frame; the driver then snaps its jitter to the display period.
    const raf = this.game.loop.now;
    const alpha = raf > 0 ? driver.frame(raf) : driver.frame();
    const tick = view.tick;
    this.samplePos(view, alpha);
    // Effects hold their frame while the sim is paused (and so in e2e manual stepping, where captures need them), unless the
    // test hook's ageFx lets them age; the fx sink's pause check above uses the same rule.
    const live = !effectsHeld(driver.isPaused, this.fxAges);
    const arcade = this.arcadeHud && view.arcade();
    if (arcade) this.arcadeHud?.update(live ? this.game.loop.delta : 0, arcade.comboHits, arcade.comboDamage, arcade.meter);
    // Who each combo's victim is this frame (indexed by the victim's team), so drawCharacter can feed the anchor.
    for (let t = 0; t < 2; t++) {
      const combo = arcade ? this.arcadeHud?.combos[t] : undefined;
      this.comboActive[1 - t] = arcade && combo?.live ? arcade.active(1 - t) : -1;
    }
    this.actionBar?.update();
    this.actionBar2?.update();
    this.swapNotice?.checkBusySwap(view.arcade()?.gameTick);
    this.swapNotice?.update(this.time.now);
    this.backdrop?.update(live ? this.game.loop.delta : 0, getPrefs().reduceMotion);
    this.ambient?.update(getPrefs().reduceMotion); if (this.arcadeBg && arcade) syncArcadeBg(this.arcadeBg, arcade.stage, view.heroElement(), this.textures);
    this.reportPlayback();
    this.frameTick = tick;
    this.frameAlpha = alpha;
    this.frameLive = live;
    setBrightFloor(arcade ? arcade.stage === 4 : false);
    this.motion?.advance(view.tick);
    pool.begin();
    view.forEachCharacter(this.drawCharacter);
    pool.end();
    projPool.begin();
    view.forEachProjectile(this.drawProjectile);
    // Melee boxes (Ice Shock, Ground Shock, ...) were never drawn: show their sprite over the hit box (Classic and Arcade).
    view.forEachProjectile(this.drawMelee, true);
    projPool.end();
  }

  /** Position fraction: equals alpha unless the clock is held (hit-stop, super freeze, KO slow-mo); sampled once per frame. */
  private samplePos(view: RenderView, alpha: number): void {
    const hold = view.arcade();
    this.holdLerp.sample(view.tick, hold ? hold.gameTick : view.tick, hold?.frozen ?? false, hold?.slowHold ?? false);
    this.framePos = this.holdLerp.fraction(alpha);
  }

  /** Per-frame callbacks are fields so `update` allocates no closures. */
  private frameTick = 0;
  private frameAlpha = 0;
  /** Lerp weight for fighter and projectile positions (HoldLerp); `frameAlpha` stays for timing effects. */
  private framePos = 0;
  /** The active character id each combo is hitting, by the victim's team (-1 = none); set after the model update. */
  private readonly comboActive: number[] = [-1, -1];
  private readonly anchorBox = { x: 0, y: 0, w: 0, h: 0 };
  private readonly anchorOut = { headX: 0, headY: 0, laneX: 0 };
  private readonly holdLerp = new HoldLerp();
  private frameLive = true;
  private arcadeMatch = false;
  /** Test hook: let frame-timed view effects (hit flash, HUD numbers, white pops, rings, sparks, streaks, KO wash) age on real frames while the sim stays paused. */
  private fxAges = false;
  /** Element of each team's character this frame (characters draw before projectiles); picks the Snag rope art. */
  private readonly teamElement: string[] = [];
  /** Drawn caster minus sim caster per team this frame (lerp of the sim step), for lunge and spin boxes. */
  private readonly casterShift: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }];
  private simPos: { x: number; y: number } | undefined;
  private simPosId = -1;
  private readonly findSimPos = (c: RenderCharacter): void => {
    if (c.id === this.simPosId) this.simPos = { x: c.x, y: c.y };
  };

  /** Sim top-left of entity `id` (the box the character view draws from), or undefined when gone. */
  private simPositionOf(view: RenderView, id: number): { x: number; y: number } | undefined {
    this.simPos = undefined;
    this.simPosId = id;
    view.forEachCharacter(this.findSimPos);
    return this.simPos;
  }

  /** Sim step: events to the motion smoother (before the views are placed); a new round drops every ramp. */
  private feedMotion(events: readonly SimEvent[]): void {
    const m = this.motion;
    if (!m || events.length === 0) return;
    if (events.some((e) => e.kind === SimEventKind.roundStarted)) m.clear();
    m.consume(events);
  }

  private readonly drawCharacter = (c: RenderCharacter): void => {
    this.teamElement[c.team] = c.element;
    const cs = (this.casterShift[c.team] ??= { dx: 0, dy: 0 });
    cs.dx = lerp(c.px, c.x, this.framePos) - c.x;
    cs.dy = lerp(c.py, c.y, this.framePos) - c.y;
    const foe = this.motion?.shiftFor(c.id);
    // The freeze tint is the Classic Tornado status only: the frozen flag also marks a melee caster's recovery (PARITY C08).
    const tint = this.view ? frozenTintOf(this.view, c.id, this.arcadeMatch) : false;
    this.pool?.acquire(c.id).apply(c, this.frameTick, this.frameAlpha, this.frameLive, tint, this.framePos, foe);
    // The combo counter follows its victim's head: fed from the same lerped position the sprite uses, once per frame. After a KO the
    // anchor freezes at the last spot (the victim is no longer the active character, or has no hp).
    const hud = this.arcadeHud;
    const attacker = 1 - c.team;
    if (hud && c.id === this.comboActive[c.team] && (c.hp > 0 || !hud.combos[attacker === 0 ? 0 : 1].anchored)) {
      const a = victimAnchor(c.px, c.x, c.py, c.y, c.w, c.h, this.framePos, arcadePlayfield().w, this.anchorBox, this.anchorOut);
      hud.anchorCombo(attacker === 0 ? 0 : 1, c.id, a.headX, a.headY, a.laneX);
    }
  };
  private readonly drawProjectile = (p: RenderProjectile): void => {
    this.projPool?.acquire(p.id).apply(p, this.framePos);
  };

  private readonly drawMelee = (p: RenderProjectile): void => {
    const reduced = getPrefs().reduceMotion;
    this.projPool?.acquire(p.id).apply(p, this.framePos, true, this.teamElement[p.team], { tick: this.frameTick, alpha: this.frameAlpha }, this.casterShift[p.team], reduced);
  };

  private readonly shutdownHandler = (): void => {
    this.onShutdown();
  };

  private onShutdown(): void {
    for (const off of this.cleanups.splice(0)) off();
    this.comboActive[0] = -1;
    this.comboActive[1] = -1;
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
    this.ambient?.destroy();
    this.ambient = undefined;
    this.pool?.forEachView((v) => { v.destroy(); });
    this.pool?.clear();
    this.projPool?.forEachView((v) => { v.destroy(); });
    this.projPool?.clear();
    this.pool = undefined;
    this.projPool = undefined;
    this.holdLerp.reset();
    this.motion?.clear();
    this.motion = undefined;
    this.fx = undefined;
    this.arcadeHud = undefined;
    this.rounds = undefined;
    this.terrain = undefined;
    this.poses = undefined;
    this.ccFeed = undefined;
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
