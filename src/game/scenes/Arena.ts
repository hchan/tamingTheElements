import { HoldLerp } from '../loop/hold-lerp';
import { mountShakeScroll } from '../fx/camera-shake';
import { LowLifeVignette } from '../fx/low-life-vignette';
import { shockSeek, shockState } from '../fx/shock-view';
import { DUST_H, DUST_W, SKY_LOOK, paintSkyDust } from '../fx/sky-dust';
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
  Cmd,
  createMatch,
  createRenderView,
  CHARACTERS,
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
import { heroName } from '../hud/tag-fx';
import { cleanseClockOf } from '../hud/cleanse-clock';
import { CastDetector } from '../audio/cast-sounds';
import { createArenaAudio, type ArenaAudio } from '../audio/arena-audio';
import type { AudioContextLike } from '../audio/audio-manager';
import { EventFx, createPhaserFxSink, type FxPoint } from '../fx/event-fx';
import { KeyboardAgent } from '../input/keyboard-agent';
import { P2_BINDINGS } from '../input/local-two';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted, type ArenaProbe, type ProbeCharacter } from '../platform/test-hook';
import { getUiFlags } from '../platform/flags';
import { ArcadeHudModel, CALLOUT_RECTS_KEY, CHIP_RECTS_KEY, POP_RECTS_KEY, hudFrame, projectToHud, viewOfCamera, numberLabel, type HudRect } from '../hud/arcade-hud';
import { getPrefs } from '../platform/a11y/prefs';
import { BLOCKED_EVENT } from '../boot/presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, fitScene, resolutionOf, viewHeight, viewWidth } from '../boot/viewport';
import { isPortraitPlay } from '../boot/portrait-play';

/** Ticks an online match may predict ahead (rollback is the default; `?ff=lockstep` in dev and test builds sets 0). */
const ROLLBACK_WINDOW = 6;
import { Announcer, LOW_HEALTH, LowHealthWatch, MATCH_START, announcementsFor, createLiveRegion, tagNotReady } from '../a11y/announcer';
import { createPauseDialog, type PauseDialog } from '../a11y/pause-dialog';
import { firstPad, nthPad } from '../input/gamepad';
import { getBindings, type Bindings } from '../platform/input/bindings';
import { collectSide } from '../hud/bars';
import { victimAnchor } from '../hud/combo-anchor';
import { screenBox } from '../hud/screen-box';
import { SWAP_BUSY_LINE, SWAP_BUSY_TICKS, SwapNotice, busySwapDue, elementalNotice, swapRefusalLine, swapSlotOf } from '../hud/swap-notice';
import { groupSlots, wantsGroupedBar } from '../hud/bar-groups';
import { ActionBarView, labelsFromBindings, shortLabels, type KeyLabels } from '../hud/action-bar';
import { Backdrop } from '../views/backdrop';
import { createStageAmbient, type StageAmbient } from '../fx/stage-ambient-view';
import { CLASSIC_SPRITE_SCALE, CharacterView, frozenTintOf, lerp, setBrightFloor } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { ProjectileView } from '../views/projectile-view';
import type { MotionSmoother } from '../fx/ability-motion-view';
import { ReplayCursor } from '../replay/cursor';
import { actionRefusal, buildMatchEnd, chargeLineFor, demoMatch, runLineFor, effectsHeld, playbackFrame } from './arena-logic';
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
  private backdrop: Backdrop | undefined;
  /** Per-stage ambient particles behind the fighters (view only; none under reduced motion). */
  private ambient: StageAmbient | undefined;
  private clicks: number[] = [];
  /** Arcade: the line shown when a swap press is refused (hud/swap-notice.ts); view only. */
  private swapNotice: SwapNotice | undefined;
  /** Arcade: the game tick of a swap press nothing visible explained, until a tag-in lands (else the busy line shows); -1 none. */
  private pendingSwap = -1;
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
    this.pendingSwap = -1;
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
    this.driver = new FixedStepDriver({ tick: () => { this.advance([undefined, undefined]); }, now: () => performance.now() });
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
      ),
      { reducedMotion: () => getPrefs().reduceMotion, arcade, elementOf: (id) => pool.peek(id)?.element, maxLifeOf: (id) => world.state.maxHp[id], sfx: playSfx },
    );

    if (this.launch && !playback) {
      const keyboard = new KeyboardAgent({
        capturable: () => true,
        bindings: getBindings(),
        gamepad: () => firstPad(typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null),
        // Legacy Shift-Q / X / C cheats exist only in tester mode (docs/TESTER-MODE.md).
        cheatsEnabled: this.launch.tester !== undefined,
        arcade,
        tabRun: true, // bare Tab on the page or canvas is Run (Player 1 only; docs/ACCESSIBILITY.md)
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
        // A shared online match cannot be paused by one side: no Escape pause, no button.
        ...(this.session || this.launch.net ? {} : { onPause: () => { this.togglePause(); } }),
        ...(this.launch.onRestart ? { onRestart: this.launch.onRestart } : {}),
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
    if (element && arcade) this.mountTallFills(element, bg ? `bg:${bg}` : undefined);
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

  /**
   * Portrait tall view only: sky above and ground below the backdrop. The sky is a vertical gradient that starts at the backdrop's own
   * top-row colour (sampled, so there is no seam) and falls off to a much darker tone with a faint haze low down; the ground takes the
   * backdrop's bottom-row colour. Falls back to the stage's edge colour when the art cannot be sampled.
   */
  private mountTallFills(element: string, bgKey?: string): void {
    const colour: Record<string, number> = { fire: 0x3a1208, water: 0x0a2440, earth: 0x1c2a0e, air: 0x1a2840 };
    const mix = (a: number, b: number, t: number): number => {
      const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
    const edge = (key: string | undefined, fallback: number, fromTop: boolean): number => {
      try {
        if (!key || !this.textures.exists(key)) return fallback;
        const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
        const probe = document.createElement('canvas');
        probe.width = 1;
        probe.height = 1;
        const cx = probe.getContext('2d', { willReadFrequently: true });
        if (!cx) return fallback;
        // A band a little inside the edge (3% to 9%), so a darkened outermost rim does not make the sky darker than the picture.
        const band = Math.max(2, Math.round(src.height * 0.06));
        const y0 = Math.round(src.height * 0.03);
        cx.drawImage(src, 0, fromTop ? y0 : src.height - y0 - band, src.width, band, 0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        return ((d[0] ?? 0) << 16) | ((d[1] ?? 0) << 8) | (d[2] ?? 0);
      } catch {
        return fallback;
      }
    };
    const w = arcadePlayfield().w + 4000;
    const pw = arcadePlayfield().w;
    const SKY_H = 2400;
    const GRAD_FRAME = 'grad';
    const GRAD_PAD = 4;
    const made: string[] = [];
    /**
     * A 4 x 256 vertical gradient (frame GRAD_FRAME), made once per key. The canvas carries 4 padding rows of the end colours above and
     * below the frame: a bilinear sample at the frame's first or last row would otherwise blend in the opposite end of the texture (a
     * wrapped neighbour), which drew a 2 px dark hairline at the bottom of the fade overlay (the join with the backdrop).
     */
    const gradient = (key: string, stops: readonly (readonly [number, string])[]): string => {
      if (this.textures.exists(key)) return key;
      const tex = this.textures.createCanvas(key, 4, 256 + 2 * GRAD_PAD);
      const ctx = tex?.getContext();
      if (!tex || !ctx) return '';
      const g = ctx.createLinearGradient(0, GRAD_PAD, 0, GRAD_PAD + 256);
      for (const [at, c] of stops) g.addColorStop(at, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256 + 2 * GRAD_PAD);
      tex.add(GRAD_FRAME, 0, 0, GRAD_PAD, 4, 256);
      tex.refresh();
      made.push(key);
      return key;
    };
    const rgba = (n: number, a: number): string => `rgba(${String((n >> 16) & 255)},${String((n >> 8) & 255)},${String(n & 255)},${String(a)})`;
    // The stage's own backdrop (the sim's stage, which the Versus pick steers; not the hero's element), as the terrain view draws it.
    let voidFight = false;
    this.view?.forEachCharacter((c) => { if (c.element === 'void') voidFight = true; });
    const stageElement = (): string => {
      if (voidFight) return 'void';
      return ['fire', 'water', 'earth', 'air'][(this.view?.arcade()?.stage ?? 0) - 1] ?? element;
    };
    const keyFor = (el: string): string | undefined => (this.textures.exists(`bg:${el}`) ? `bg:${el}` : bgKey);
    const first = stageElement();
    const firstKey = keyFor(first);
    const sky = this.add.image(-2000, -SKY_H, '__DEFAULT').setOrigin(0, 0).setDisplaySize(w, SKY_H).setDepth(-2);
    const ground = this.add.rectangle(-2000, LOGICAL_HEIGHT, w, 4000, 0).setOrigin(0, 0).setDepth(-2);
    const art = firstKey !== undefined;
    // (The mirrors overlap the backdrop by 2 px, behind it, so a fractional camera zoom cannot show a hairline gap at the joins.)
    // Below the backdrop: its floor mirrored about the bottom edge and dimmed downward to the floor tone, so no flat dark band shows
    // between the arena and the touch area.
    const groundMirror = this.add.image(0, LOGICAL_HEIGHT - 2, '__DEFAULT').setOrigin(0, 0).setFlipY(true).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
    const groundFade = this.add.image(0, LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.7);
    // The backdrop mirrored about its top edge (a seamless join), then an upright tile above it for the tallest phones, dimmed upward.
    const mirror = this.add.image(0, 2, '__DEFAULT').setOrigin(0, 1).setFlipY(true).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
    const upper = this.add.image(0, 2 - LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 1).setDisplaySize(pw, LOGICAL_HEIGHT).setDepth(-1.8);
    const fade = this.add.image(-2000, -2 * LOGICAL_HEIGHT, '__DEFAULT').setOrigin(0, 0).setDisplaySize(w, 2 * LOGICAL_HEIGHT).setDepth(-0.915);
    // The terrain view's additive "light lift" wash (fx/terrain-ambient, depth -0.78) starts with a hard edge at world y 0; continue it
    // upward as a fading ramp so the join with the sky is not a brightness step. Same per-stage colours as that file's LOOK table.
    const LIFT: Record<string, number> = { fire: 0x120a06, water: 0x081420, earth: 0x0e1408, air: 0x0a0e1a };
    const LIFT_RAMP = 360;
    const liftRamp = this.add.image(0, -LIFT_RAMP, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, LIFT_RAMP).setDepth(-0.78).setBlendMode('ADD');
    // The sky band's dressing (fx/sky-dust): a stage-coloured horizon glow rising from the join, and a drifting mote field above it.
    const GLOW_H = 840; // from 640 above the join to 200 below it (over the far wall), where it has faded out
    const DUST_SCALE = 2;
    const glow = this.add.image(0, -640, '__DEFAULT').setOrigin(0, 0).setDisplaySize(pw, GLOW_H).setDepth(-0.8).setBlendMode('ADD');
    const dust = this.add.tileSprite(0, -DUST_H * DUST_SCALE, pw, DUST_H * DUST_SCALE, '__DEFAULT').setOrigin(0, 0).setDepth(-0.9).setTileScale(DUST_SCALE, DUST_SCALE);
    let shown = '';
    const apply = (el: string): void => {
      const look = SKY_LOOK[el];
      if (look) {
        const glowKey = gradient(`tall-glow:${String(look.glow)}`, [[0, rgba(look.glow, 0)], [0.5, rgba(look.glow, 0.06)], [0.74, rgba(look.glow, 0.26)], [1, rgba(look.glow, 0)]]);
        if (glowKey) glow.setTexture(glowKey, GRAD_FRAME).setDisplaySize(pw, GLOW_H);
        const dustKey = `tall-dust:${el}`;
        if (!this.textures.exists(dustKey)) {
          const tex = this.textures.createCanvas(dustKey, DUST_W, DUST_H);
          const dctx = tex?.getContext();
          if (tex && dctx) {
            paintSkyDust(dctx, el);
            tex.refresh();
            made.push(dustKey);
          }
        }
        if (this.textures.exists(dustKey)) dust.setTexture(dustKey);
      }
      const lift = LIFT[el];
      const liftKey = lift === undefined ? '' : gradient(`tall-lift:${String(lift)}`, [[0, rgba(lift, 0)], [1, rgba(lift, 1)]]);
      if (liftKey) liftRamp.setTexture(liftKey, GRAD_FRAME).setDisplaySize(pw, LIFT_RAMP);
      const key = keyFor(el);
      const fallback = colour[el] ?? 0x120a1c;
      // The drawn picture is warmer and lighter than its raw edge pixels (the stage tint), so pull the sample toward the stage palette.
      const top = mix(edge(key, fallback, true), mix(fallback, 0xffffff, 0.12), 0.5);
      const deep = mix(top, 0x05060c, 0.72);
      const skyKey = gradient(`tall-sky:${String(top)}`, [[0, css(deep)], [1, css(mix(top, deep, 0.7))]]);
      if (skyKey) sky.setTexture(skyKey, GRAD_FRAME).setDisplaySize(w, SKY_H);
      const floor = edge(key, fallback, false);
      ground.setFillStyle(mix(floor, 0x05060c, 0.45));
      if (key) {
        // Dim the mirrored art and the stage's far layer (which starts 316 px above the backdrop, its top edge was the hard seam) upward:
        // strong at the top, still strong where the far layer starts, easing to clear at the join with the real backdrop (no brightness step).
        const toneEnd = mix(top, deep, 0.7);
        // (Opaque at its very top in the sky gradient's own colour there, so the overlay's top edge does not show on the tallest phones.)
        const fadeKey = gradient(`tall-fade2:${String(top)}`, [[0, rgba(mix(deep, toneEnd, 0.4), 1)], [0.6, rgba(toneEnd, 0.96)], [0.78, rgba(toneEnd, 0.95)], [0.86, rgba(toneEnd, 0.6)], [0.93, rgba(toneEnd, 0.25)], [1, rgba(toneEnd, 0)]]);
        if (fadeKey) fade.setTexture(fadeKey, GRAD_FRAME).setDisplaySize(w, 2 * LOGICAL_HEIGHT);
        const toneLow = mix(floor, 0x05060c, 0.45);
        const gKey = gradient(`tall-gfade:${String(floor)}`, [[0, rgba(toneLow, 0)], [1, rgba(toneLow, 0.95)]]);
        if (gKey) groundFade.setTexture(gKey, GRAD_FRAME).setDisplaySize(pw, LOGICAL_HEIGHT);
        for (const im of [mirror, upper, groundMirror]) im.setTexture(key);
        mirror.setDisplaySize(pw, LOGICAL_HEIGHT);
        upper.setDisplaySize(pw, LOGICAL_HEIGHT);
        groundMirror.setDisplaySize(pw, LOGICAL_HEIGHT);
      }
      shown = el;
    };
    apply(first);
    const artLayers = [groundMirror, groundFade, mirror, upper, fade];
    const sync = (): void => {
      const on = viewHeight(this) > LOGICAL_HEIGHT + 0.5 && isPortraitPlay(this.game);
      sky.setVisible(on);
      ground.setVisible(on);
      for (const e of artLayers) e.setVisible(on && art);
      if (on) {
        const el = stageElement();
        if (el !== shown) apply(el);
      }
      liftRamp.setVisible(on && LIFT[shown] !== undefined);
      glow.setVisible(on && SKY_LOOK[shown] !== undefined);
      dust.setVisible(on && SKY_LOOK[shown] !== undefined);
    };
    // A slow sideways drift of the mote field (view time, so it does not touch the sim).
    const drift = (_time: number, delta: number): void => {
      if (dust.visible) dust.tilePositionX += delta * 0.004;
    };
    sync();
    this.scale.on('resize', sync);
    this.events.on(Phaser.Scenes.Events.UPDATE, sync);
    this.events.on(Phaser.Scenes.Events.UPDATE, drift);
    this.cleanups.push(() => {
      this.scale.off('resize', sync);
      this.events.off(Phaser.Scenes.Events.UPDATE, sync);
      this.events.off(Phaser.Scenes.Events.UPDATE, drift);
      for (const k of made) if (this.textures.exists(k)) this.textures.remove(k);
    });
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
          out.push({ id: i, team: s.team[i] ?? 0, x: s.x[i] ?? 0, y: s.y[i] ?? 0, w: s.w[i] ?? 0, h: s.h[i] ?? 0, hp: s.hp[i] ?? 0, maxHp: s.maxHp[i] ?? 0 });
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
        const tints: { id: number; tint: number; mode: number; wash: number }[] = [];
        view.forEachCharacter((c) => {
          const v = this.pool?.peek(c.id);
          const img = v?.image;
          if (img?.visible) tints.push({ id: c.id, tint: img.tintTopLeft, mode: img.tintMode, wash: v?.washAlpha ?? 0 });
        });
        return {
          tints,
          numbers: hud?.numbers.filter((n) => n.live).map((n) => numberLabel(n.amount, n.counter)) ?? [],
          numberBoxes: (this.scene.get(HUD_SCENE) as unknown as { numberBoxes?(): { x: number; y: number; w: number; h: number }[] }).numberBoxes?.() ?? [],
          popBoxes: (this.scene.get(HUD_SCENE) as unknown as { popBoxes?(): { x: number; y: number; w: number; h: number }[] }).popBoxes?.() ?? [],
          combo: [hud?.combos[0].hits ?? 0, hud?.combos[1].hits ?? 0],
          meter: [hud?.meters[0].value ?? 0, hud?.meters[1].value ?? 0],
        };
      },
      camera: () => import('../fx/arena-pan').then((m) => ({ ...m.panFraming(this), camZoom: this.cameras.main.zoom / resolutionOf(this), scrollX: this.cameras.main.worldView.x, centerY: this.cameras.main.worldView.centerY, viewHeight: viewHeight(this), floorScreenY: (LOGICAL_HEIGHT - this.cameras.main.worldView.y) * this.cameras.main.zoom / resolutionOf(this) })),
      shockFx: () => Promise.resolve(shockState(this)),
      shockSeek: (ms) => {
        shockSeek(this, ms);
        return Promise.resolve();
      },
      superFx: () => import('../fx/super-view').then((m) => m.superState(this)),
      superBurst: () => import('../fx/super-view').then((m) => m.superBurstState(this)),
      sheets: () => import('../views/pose-layer').then((m) => m.sheetState(this)),
      rounds: () => import('../hud/round-view').then((m) => m.roundState(this.scene.get(HUD_SCENE))),
      defence: () => import('../fx/defence-view').then((m) => m.defenceState(this)),
      overlays: () => {
        const box = (r: HudRect): { x: number; y: number; w: number; h: number } => ({ x: r.x, y: r.y, w: r.w, h: r.h });
        const from = viewOfCamera(this.cameras.main, { x: 0, y: 0, w: 0, h: 0 });
        const frame = hudFrame(viewWidth(this), undefined, viewHeight(this));
        const sx = frame.w / from.w;
        const sy = frame.h / from.h;
        const corner = { x: 0, y: 0 };
        const callouts = ((this.registry.get(CALLOUT_RECTS_KEY) as HudRect[] | undefined) ?? []).map(box);
        return {
          pops: ((this.registry.get(POP_RECTS_KEY) as HudRect[] | undefined) ?? []).map(box),
          callouts,
          hudCallouts: callouts.map((r) => {
            const c = projectToHud(r.x, r.y, from, frame, corner);
            return { x: c.x, y: c.y, w: r.w * sx, h: r.h * sy };
          }),
          chips: ((this.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined) ?? [[], []]).map((team) => team.map(box)),
          frame: box(frame),
        };
      },
      stageAmbient: () => this.ambient?.state() ?? { emitters: 0, particles: 0 },
      weather: () => import('../fx/weather-view').then((m) => m.weatherState(this)),
      viewsReady: () => (!this.arcadeHud || this.rounds !== undefined) && this.scene.isActive(HUD_SCENE),
      tag: () => import('../hud/tag-view').then((m) => m.tagState(this)),
      terrain: () => import('../fx/terrain-view').then((m) => m.terrainState(this)),
      traps: () => import('../fx/trap-view').then((m) => m.trapState(this)),
      hazard: () => import('../fx/hazard-view').then((m) => m.hazardState(this)),
      ownElement: () => import('../fx/own-element-view').then((m) => m.ownElementState(this)),
      hudTextSizes: () => (this.scene.get(HUD_SCENE) as unknown as { textSizes(): ReturnType<ArenaProbe['hudTextSizes']> }).textSizes(),
      heroLabels: () => (this.scene.get(HUD_SCENE) as unknown as { heroLabels(): string[] }).heroLabels(),
      hitMarkHide: (on: boolean) => {
        // Test only: hides the hit-mark layers so a test can diff the same frame with and without the mark.
        for (const n of ['hit-mark', 'hit-mark-rim']) (this.children.getByName(n) as Phaser.GameObjects.Graphics | null)?.setVisible(!on);
      },
      idleAura: () => import('../fx/idle-aura-view').then((m) => m.idleAuraState(this)),
      idleAuraHide: (on: boolean) => import('../fx/idle-aura-view').then((m) => { m.idleAuraHide(this, on); }),
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
      ccFx: () => import('../fx/cc-view').then((m) => m.ccFxState(this)),
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
      sweepDrawn: (id, n, cmds, frames) => {
        driver.pause();
        const out: { x: number; frozen: boolean }[] = [];
        for (let k = 0; k < n; k++) {
          this.advance(cmds);
          for (let f = 0; f < frames; f++) {
            // One render frame at wall-clock alpha f / frames, through the same sampling and draw path as `update`.
            const alpha = f / frames;
            this.samplePos(view, alpha);
            this.frameTick = view.tick;
            this.frameAlpha = alpha;
            this.frameLive = false;
            this.pool?.begin();
            view.forEachCharacter(this.drawCharacter);
            this.pool?.end();
            out.push({ x: this.pool?.acquire(id).drawnX ?? Number.NaN, frozen: view.arcade()?.frozen ?? false });
          }
        }
        return out;
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
    // A tag-in landed: the swap-refused line (if one is still up) is stale, and would sit under the arriving hero's banner.
    if (events.some((e) => e.kind === SimEventKind.tagIn && (e['team'] ?? 0) === 0)) {
      this.swapNotice?.clear();
      this.pendingSwap = -1;
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

  /** Arcade: explains a swap press the sim is about to refuse, from the sim's own rules (`RenderArcade.swapBlock`). View only. */
  private noteSwap(swaps: number): void {
    const { view, swapNotice: notice } = this;
    const arcade = view?.arcade();
    const bar = view?.actionBar(0);
    if (!view || !notice || !arcade || !bar) return;
    // A hit-stop skips the swap on this tick but the press is sent again, so it is not a refusal.
    if (arcade.frozen) return;
    const line = swapRefusalLine(arcade.swapBlock(0, swapSlotOf(swaps)), bar.swapReadyTick - bar.tick);
    if (line !== undefined) {
      notice.show(line, this.time.now);
      (this.audio?.audio as { refuse?: () => void } | undefined)?.refuse?.();
    } else if (this.pendingSwap < 0) {
      // Only `busy` refuses it (block-stun, a dash or its recovery, a charge, hard crowd control, a super, weather
      // recovery), or a dash, charge or weather cast this same press starts will: if no tag-in follows, say so.
      this.pendingSwap = arcade.gameTick;
    }
  }

  /** A swap the sim has not taken SWAP_BUSY_TICKS game ticks after the press (plus the online input delay; hit-stop does not count): say so. */
  private checkBusySwap(gameTick: number | undefined): void {
    if (gameTick === undefined || !busySwapDue(this.pendingSwap, gameTick, SWAP_BUSY_TICKS + (this.session?.inputDelay ?? 0))) return;
    this.pendingSwap = -1;
    this.swapNotice?.show(SWAP_BUSY_LINE, this.time.now);
    (this.audio?.audio as { refuse?: () => void } | undefined)?.refuse?.();
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
      () => (this.view ? runLineFor(this.view, arcade) : undefined),
    );
    if (line === undefined) return;
    notice.show(line, this.time.now);
    this.announcer?.say({ key: `refusal ${line}`, text: line, important: false, transient: true });
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
    this.checkBusySwap(view.arcade()?.gameTick);
    this.swapNotice?.update(this.time.now);
    this.backdrop?.update(live ? this.game.loop.delta : 0, getPrefs().reduceMotion);
    this.ambient?.update(getPrefs().reduceMotion);
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
