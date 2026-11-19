import type Phaser from 'phaser';
import {
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ARCADE_WORLD_BASE,
  ArcadeT,
  ArcadeW,
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  SimEventKind,
  TeamField,
  WEATHER_TICKS,
  World,
  benchRows,
  hash,
  type ArenaCheat,
  type LockstepSession,
  type RenderView,
  type SimEvent,
  type SimWorld,
} from '@core/index';
import { shockSeek, shockState } from '../fx/shock-view';
import type { ArenaAudio } from '../audio/arena-audio';
import type { FixedStepDriver } from '../loop/fixed-step-driver';
import type { ArenaProbe, ComboProbe, ProbeCharacter } from '../platform/test-hook';
import { CALLOUT_RECTS_KEY, CHIP_RECTS_KEY, POP_RECTS_KEY, hudFrame, projectToHud, viewOfCamera, numberLabel, type ArcadeHudModel, type HudRect } from '../hud/arcade-hud';
import { LOGICAL_HEIGHT, resolutionOf, viewHeight, viewWidth } from '../boot/viewport';
import { getBindings } from '../platform/input/bindings';
import type { ActionBarView } from '../hud/action-bar-view';
import type { StageAmbient } from '../fx/stage-ambient-view';
import type { EntityViewPool } from '../views/entity-view-pool';
import type { CharacterView } from '../views/character-view';
import type { KeyboardAgent } from '../input/keyboard-agent';
import type { SwapFeedback } from './swap-feedback';
import type { ArenaLaunch } from './launch';
import { HUD_SCENE } from './Hud';

/** What the test probe reads from the Arena: the scene, the sim, and getters for state that is created later (test builds only). */
export interface ArenaProbeContext {
  scene: Phaser.Scene;
  world: SimWorld;
  view: RenderView;
  driver: FixedStepDriver;
  launch: () => ArenaLaunch | undefined;
  session: () => LockstepSession | undefined;
  actionBar: () => ActionBarView | undefined;
  actionBar2: () => ActionBarView | undefined;
  swapNotice: () => SwapFeedback | undefined;
  arcadeHud: () => ArcadeHudModel | undefined;
  pool: () => EntityViewPool<CharacterView> | undefined;
  ambient: () => StageAmbient | undefined;
  audio: () => ArenaAudio | undefined;
  keyboard: () => KeyboardAgent | undefined;
  rounds: () => ((events: readonly SimEvent[]) => void) | undefined;
  clicks: () => readonly number[];
  advance: (cmds: readonly [number | undefined, number | undefined]) => void;
  /** One render frame at the given wall-clock alpha, through the same sampling and draw path as `update`. */
  drawFrame: (alpha: number) => void;
  setFxAges: (on: boolean) => void;
  cheat: (cheat: ArenaCheat) => void;
}


type StateProbeKeys = 'hash' | 'net' | 'characters' | 'setHp' | 'place' | 'actionSlots' | 'actionBarScreen' | 'actionBar2Screen' | 'clicks' | 'captureGranted' | 'bench' | 'swapReadyTick' | 'swapNotice' | 'cheat' | 'shaking';

type ViewProbeKeys = 'fx' | 'camera' | 'shockFx' | 'shockSeek' | 'superFx' | 'superBurst' | 'sheets' | 'rounds' | 'defence' | 'overlays' | 'stageAmbient' | 'weather' | 'viewsReady' | 'tag' | 'terrain' | 'traps' | 'hazard' | 'ownElement' | 'hudTextSizes' | 'heroLabels' | 'hitMarkHide' | 'idleAura' | 'idleAuraHide' | 'abilityFx' | 'dangerZones' | 'aim';

type SetterProbeKeys = 'setMeter' | 'setRoundsWon' | 'setWeatherCharge' | 'setWeather' | 'grantStatus';

type DriveProbeKeys = 'ccFx' | 'statusFx' | 'cleanse' | 'audio' | 'arcadeAudio' | 'boundCodes' | 'step' | 'ageFx' | 'sweepDrawn' | 'stepLive';

function stateProbe(c: ArenaProbeContext): Pick<ArenaProbe, StateProbeKeys> {
  const { scene, world, view } = c;
  return {
    hash: () => hash(world.state),
    net: () => {
      const ses = c.session();
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
      c.launch()?.recorder?.invalidate();
      world.state.hp[id] = hp;
    },
    place: (id, x, y, dir) => {
      c.launch()?.recorder?.invalidate();
      const st = world.state;
      st.x[id] = x;
      st.px[id] = x;
      st.y[id] = y;
      st.py[id] = y;
      st.dir[id] = dir;
    },
    actionSlots: () =>
      c.actionBar()?.currentSlots.map((s) => ({
        x: s.x, y: s.y, size: s.size, cmd: s.cmd, kind: s.kind, label: s.label, disabled: s.disabled, highlight: s.highlight,
      })) ?? [],
    actionBarScreen: () => c.actionBar()?.screenSlots() ?? [],
    actionBar2Screen: () => c.actionBar2()?.screenSlots() ?? [],
    clicks: () => [...c.clicks()],
    captureGranted: () => view.actionBar(0)?.capture !== undefined,
    bench: () => benchRows(world, 0),
    swapReadyTick: () => world.state.teams[TeamField.swapCooldownUntil] ?? 0,
    swapNotice: () => c.swapNotice()?.current ?? '',
    cheat: (ch) => {
      c.cheat(ch);
    },
    shaking: () => scene.cameras.main.shakeEffect.isRunning,
  };
}

function viewProbe(c: ArenaProbeContext): Pick<ArenaProbe, ViewProbeKeys> {
  const { scene, view } = c;
  return {
    fx: () => {
      const hud = c.arcadeHud();
      const tints: { id: number; tint: number; mode: number; wash: number }[] = [];
      view.forEachCharacter((ch) => {
        const v = c.pool()?.peek(ch.id);
        const img = v?.image;
        if (img?.visible) tints.push({ id: ch.id, tint: img.tintTopLeft, mode: img.tintMode, wash: v?.washAlpha ?? 0 });
      });
      return {
        tints,
        numbers: hud?.numbers.filter((n) => n.live).map((n) => numberLabel(n.amount, n.counter)) ?? [],
        numberBoxes: (scene.scene.get(HUD_SCENE) as unknown as { numberBoxes?(): { x: number; y: number; w: number; h: number }[] }).numberBoxes?.() ?? [],
        popBoxes: (scene.scene.get(HUD_SCENE) as unknown as { popBoxes?(): { x: number; y: number; w: number; h: number }[] }).popBoxes?.() ?? [],
        comboBoxes: (scene.scene.get(HUD_SCENE) as unknown as { comboBoxes?(): ComboProbe[] }).comboBoxes?.() ?? [],
        combo: [hud?.combos[0].hits ?? 0, hud?.combos[1].hits ?? 0],
        meter: [hud?.meters[0].value ?? 0, hud?.meters[1].value ?? 0],
      };
    },
    camera: () => import('../fx/arena-pan').then((m) => ({ ...m.panFraming(scene), camZoom: scene.cameras.main.zoom / resolutionOf(scene), scrollX: scene.cameras.main.worldView.x, centerY: scene.cameras.main.worldView.centerY, viewHeight: viewHeight(scene), floorScreenY: (LOGICAL_HEIGHT - scene.cameras.main.worldView.y) * scene.cameras.main.zoom / resolutionOf(scene) })),
    shockFx: () => Promise.resolve(shockState(scene)),
    shockSeek: (ms) => {
      shockSeek(scene, ms);
      return Promise.resolve();
    },
    superFx: () => import('../fx/super-view').then((m) => m.superState(scene)),
    superBurst: () => import('../fx/super-view').then((m) => m.superBurstState(scene)),
    sheets: () => import('../views/pose-layer').then((m) => m.sheetState(scene)),
    rounds: () => import('../hud/round-view').then((m) => m.roundState(scene.scene.get(HUD_SCENE))),
    defence: () => import('../fx/defence-view').then((m) => m.defenceState(scene)),
    overlays: () => {
      const box = (r: HudRect): { x: number; y: number; w: number; h: number } => ({ x: r.x, y: r.y, w: r.w, h: r.h });
      const from = viewOfCamera(scene.cameras.main, { x: 0, y: 0, w: 0, h: 0 });
      const frame = hudFrame(viewWidth(scene), undefined, viewHeight(scene));
      const sx = frame.w / from.w;
      const sy = frame.h / from.h;
      const corner = { x: 0, y: 0 };
      const callouts = ((scene.registry.get(CALLOUT_RECTS_KEY) as HudRect[] | undefined) ?? []).map(box);
      return {
        pops: ((scene.registry.get(POP_RECTS_KEY) as HudRect[] | undefined) ?? []).map(box),
        callouts,
        hudCallouts: callouts.map((r) => {
          const c = projectToHud(r.x, r.y, from, frame, corner);
          return { x: c.x, y: c.y, w: r.w * sx, h: r.h * sy };
        }),
        chips: ((scene.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined) ?? [[], []]).map((team) => team.map(box)),
        frame: box(frame),
      };
    },
    stageAmbient: () => c.ambient()?.state() ?? { emitters: 0, particles: 0 },
    weather: () => import('../fx/weather-view').then((m) => m.weatherState(scene)),
    viewsReady: () => (!c.arcadeHud() || c.rounds() !== undefined) && scene.scene.isActive(HUD_SCENE),
    tag: () => import('../hud/tag-view').then((m) => m.tagState(scene)),
    terrain: () => import('../fx/terrain-view').then((m) => m.terrainState(scene)),
    traps: () => import('../fx/trap-view').then((m) => m.trapState(scene)),
    hazard: () => import('../fx/hazard-view').then((m) => m.hazardState(scene)),
    ownElement: () => import('../fx/own-element-view').then((m) => m.ownElementState(scene)),
    hudTextSizes: () => (scene.scene.get(HUD_SCENE) as unknown as { textSizes(): ReturnType<ArenaProbe['hudTextSizes']> }).textSizes(),
    heroLabels: () => (scene.scene.get(HUD_SCENE) as unknown as { heroLabels(): string[] }).heroLabels(),
    hitMarkHide: (on: boolean) => {
      // Test only: hides the hit-mark layers so a test can diff the same frame with and without the mark.
      for (const n of ['hit-mark', 'hit-mark-rim']) (scene.children.getByName(n) as Phaser.GameObjects.Graphics | null)?.setVisible(!on);
    },
    idleAura: () => import('../fx/idle-aura-view').then((m) => m.idleAuraState(scene)),
    idleAuraHide: (on: boolean) => import('../fx/idle-aura-view').then((m) => { m.idleAuraHide(scene, on); }),
    abilityFx: () => import('../fx/ability-aura-view').then((m) => m.abilityFxState(scene)),
    dangerZones: () => import('../fx/danger-view').then((m) => m.dangerState(scene)),
    aim: () => {
      const g = scene.children.getByName('aim') as Phaser.GameObjects.Graphics | null;
      return g ? { visible: g.visible, x: g.x, y: g.y, angle: Math.round(g.angle) } : undefined;
    },
  };
}

function setterProbe(c: ArenaProbeContext): Pick<ArenaProbe, SetterProbeKeys> {
  const { world } = c;
  return {
    setMeter: (team, value) => {
      c.launch()?.recorder?.invalidate();
      world.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter] = value;
    },
    setRoundsWon: (won0, won1) => {
      // Dev/test only (the hook is dropped from production): lets a test reach the 2-2 draw that starts sudden death.
      c.launch()?.recorder?.invalidate();
      const a = world.state.arcade;
      a[ARCADE_TEAM_BASE + ArcadeT.roundsWon] = won0;
      a[ARCADE_TEAM_BASE + ARCADE_T + ArcadeT.roundsWon] = won1;
    },
    setWeatherCharge: (team, value) => {
      c.launch()?.recorder?.invalidate();
      world.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge] = value;
    },
    setWeather: (kind, team) => {
      // As a cast would (systems/arcade/weather.ts): the slot, then its event to the views. Arcade only.
      c.launch()?.recorder?.invalidate();
      const a = world.state.arcade;
      const w = ARCADE_WORLD_BASE;
      const prev = a[w + ArcadeW.weather] ?? 0;
      a[w + ArcadeW.weather] = kind;
      a[w + ArcadeW.weatherUntil] = (a[w + ArcadeW.gameTick] ?? 0) + WEATHER_TICKS;
      a[w + ArcadeW.weatherTeam] = team;
      const tick = world.state.world[World.tick] ?? 0;
      c.rounds()?.([{ tick, sourceId: -1, kind: SimEventKind.weatherChanged, seq: 1000, weather: kind, prev, team }]);
    },
    grantStatus: (id, status, ticks) => {
      // Dev/test only: writes a timed status as applyTimedStatus would (STATUS_SLOTS 8 x STATUS_STRIDE 5: [id, source, start, expire, mag]).
      c.launch()?.recorder?.invalidate();
      const now = world.state.world[World.tick] ?? 0;
      for (let slot = 0; slot < 8; slot++) {
        const b = (id * 8 + slot) * 5;
        if ((world.state.status[b] ?? 0) !== 0) continue;
        world.state.status.set([status, id, now, now + ticks, 0], b);
        return;
      }
    },
  };
}

function driveProbe(c: ArenaProbeContext): Pick<ArenaProbe, DriveProbeKeys> {
  const { scene, view, driver } = c;
  return {
    ccFx: () => import('../fx/cc-view').then((m) => m.ccFxState(scene)),
    statusFx: () => import('../fx/status-fx-view').then((m) => m.statusFxState(scene)),
    cleanse: () => import('../fx/cleanse-view').then((m) => m.cleanseState(scene)),
    audio: () => {
      const a = c.audio();
      return a ? { muted: a.audio.muted, unlocked: a.audio.isUnlocked } : undefined;
    },
    arcadeAudio: () => import('../audio/arcade-audio').then((m) => m.arcadeAudioState(c.audio()?.audio)),
    boundCodes: () => ({ ...(c.keyboard()?.currentBindings() ?? getBindings()) }),
    step: (n, cmds = [0, 0]) => {
      driver.pause();
      for (let k = 0; k < n; k++) c.advance(cmds);
    },
    ageFx: (on) => {
      c.setFxAges(on);
    },
    sweepDrawn: (id, n, cmds, frames) => {
      driver.pause();
      const out: { x: number; frozen: boolean }[] = [];
      for (let k = 0; k < n; k++) {
        c.advance(cmds);
        for (let f = 0; f < frames; f++) {
          c.drawFrame(f / frames);
          out.push({ x: c.pool()?.acquire(id).drawnX ?? Number.NaN, frozen: view.arcade()?.frozen ?? false });
        }
      }
      return out;
    },
    stepLive: (n) => {
      driver.pause();
      for (let k = 0; k < n; k++) c.advance([undefined, undefined]);
    },
  };
}

/** The `__TTE__.arena` probe: getters and test-only setters over the live match. */
export function createArenaProbe(c: ArenaProbeContext): ArenaProbe {
  const { view, driver } = c;
  return {
    get tick() {
      return view.tick;
    },
    get paused() {
      return driver.isPaused;
    },
    ...stateProbe(c),
    ...viewProbe(c),
    ...setterProbe(c),
    ...driveProbe(c),
  };
}
