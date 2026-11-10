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
  type SimWorld,
} from '@core/index';
import { EventFx, createPhaserFxSink } from '../fx/event-fx';
import { KeyboardAgent } from '../input/keyboard-agent';
import { FixedStepDriver, pauseOnHidden } from '../loop/fixed-step-driver';
import { counted, type ProbeCharacter } from '../platform/test-hook';
import { CharacterView } from '../views/character-view';
import { EntityViewPool } from '../views/entity-view-pool';
import { ProjectileView } from '../views/projectile-view';
import { HUD_SCENE, type HudData } from './Hud';
import type { ArenaLaunch } from './launch';

export const ARENA_SCENE = 'Arena';

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
  private pauseText: Phaser.GameObjects.Text | undefined;
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
    const world = createMatch(this.launch?.setup ?? DEMO_SETUP);
    this.world = world;
    this.view = createRenderView(world);
    this.driver = new FixedStepDriver({ tick: () => { this.advance([undefined, undefined]); }, now: () => performance.now() });
    const driver = this.driver;
    this.pool = new EntityViewPool(() => new CharacterView(this), (v) => { v.hide(); });
    this.projPool = new EntityViewPool(() => new ProjectileView(this), (v) => { v.hide(); });
    const pool = this.pool;
    this.fx = new EventFx(
      createPhaserFxSink(
        this,
        (id) => {
          const v = pool.peek(id)?.image;
          return v ? { x: v.x + v.displayWidth / 2, y: v.y + v.displayHeight / 2 } : undefined;
        },
        (id) => pool.peek(id)?.image,
      ),
      { reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches },
    );

    if (this.launch) {
      const keyboard = new KeyboardAgent({
        capturable: () => true,
        onEffect: (e) => {
          if (e === 'pause') this.togglePause();
        },
      });
      this.agents = [keyboard, this.launch.enemy];
      this.cleanups.push(keyboard.attach(counted(window)));
    }
    this.cleanups.push(pauseOnHidden(counted(document), driver));

    const { width, height } = this.scale;
    const element = this.view.heroElement();
    const bg = element && this.textures.exists(`bg:${element}`) ? element : undefined;
    if (bg) this.add.image(0, 0, `bg:${bg}`).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1);
    this.pauseText = this.add
      .text(width / 2, height / 2, 'Paused\nShift-P to resume', { fontSize: '40px', align: 'center', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(200)
      .setVisible(false);

    this.installProbe(world, driver);
    const hudData: HudData = { view: this.view };
    this.scene.launch(HUD_SCENE, hudData);

    // Game destroy (exit-to-menu) emits DESTROY rather than SHUTDOWN on a running scene; handle both once.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.onShutdown(); });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => { this.onShutdown(); });
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
        world.state.hp[id] = hp;
      },
      place: (id, x, y, dir) => {
        const st = world.state;
        st.x[id] = x;
        st.px[id] = x;
        st.y[id] = y;
        st.py[id] = y;
        st.dir[id] = dir;
      },
      captureGranted: () => view.actionBar(0)?.capture !== undefined,
      step: (n, cmds = [0, 0]) => {
        driver.pause();
        for (let k = 0; k < n; k++) this.advance(cmds);
      },
    };
  }

  /** One sim tick: agents (or the given commands) in, events out to the effects and the end check. */
  private advance(cmds: readonly [number | undefined, number | undefined]): void {
    const world = this.world;
    if (!world || this.ended) return;
    // Agents are consulted only when a side has no forced command (their RNG streams live in the sim state).
    const [f0, f1] = cmds;
    const c = f0 === undefined || f1 === undefined ? collectCommands(world, this.agents) : [0, 0];
    const events = step(world, [f0 ?? c[0] ?? 0, f1 ?? c[1] ?? 0]);
    this.fx?.consume(events);
    const over = events.find((e) => e.kind === SimEventKind.matchEnded);
    if (!over) return;
    this.ended = true;
    this.driver?.pause();
    const s = world.state;
    const end = {
      winner: over['winner'] ?? -1,
      activeSlot: s.teams[TeamField.activeSlot] ?? 0,
      capturedIndices: capturedRosterIndices(s, 1),
    };
    this.time.delayedCall(END_DELAY_MS, () => { this.launch?.onEnd(end); });
  }

  private togglePause(): void {
    const driver = this.driver;
    if (!driver || this.ended) return;
    if (driver.isPaused) driver.resume();
    else driver.pause();
    this.pauseText?.setVisible(driver.isPaused);
  }

  override update(): void {
    const { driver, view, pool, projPool } = this;
    if (!driver || !view || !pool || !projPool) return;
    const alpha = driver.frame();
    const tick = view.tick;
    pool.begin();
    view.forEachCharacter((c: RenderCharacter) => {
      pool.acquire(c.id).apply(c, tick, alpha);
    });
    pool.end();
    projPool.begin();
    view.forEachProjectile((p: RenderProjectile) => {
      projPool.acquire(p.id).apply(p, alpha);
    });
    projPool.end();
  }

  private onShutdown(): void {
    for (const off of this.cleanups.splice(0)) off();
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      const hook = window.__TTE__;
      if (hook) {
        delete hook.arena;
        delete hook.scene;
      }
    }
    this.events.removeAllListeners(Phaser.Scenes.Events.SHUTDOWN);
    this.events.removeAllListeners(Phaser.Scenes.Events.DESTROY);
    this.pool?.forEachView((v) => { v.destroy(); });
    this.pool?.clear();
    this.projPool?.forEachView((v) => { v.destroy(); });
    this.projPool?.clear();
    this.pool = undefined;
    this.projPool = undefined;
    this.fx = undefined;
    this.driver = undefined;
    this.view = undefined;
    this.world = undefined;
  }
}
