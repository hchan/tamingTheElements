import type { FakeClock } from './fake-clock';

type Handler = (this: CraftyEntity, data?: unknown) => unknown;

/** A component definition as passed to Crafty.c (own props are copied onto entities). */
export type ComponentDef = Record<string, unknown>;

export interface RecordedCall {
  target: string;
  method: string;
  args: unknown[];
}

/** Chainable no-op entity methods (rendering, input, etc.); calls are recorded, geometry is not computed. */
const NOOP_METHODS = [
  'css', 'text', 'textColor', 'textFont', 'sprite', 'origin', 'flip', 'unflip', 'collision',
  'fourway', 'multiway', 'twoway', 'disableControl', 'enableControl', 'color', 'image', 'attach',
  'detach', 'resize', 'areaMap', 'checkHits', 'stopOnSolids', 'tween', 'unselectable', 'shift',
  'reel', 'animate', 'pauseAnimation', 'resumeAnimation', 'spriteColor',
] as const;

const KEYS: Record<string, number> = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, PAUSE: 19, CAPS: 20, ESC: 27, SPACE: 32, PAGE_UP: 33,
  PAGE_DOWN: 34, END: 35, HOME: 36, LEFT_ARROW: 37, UP_ARROW: 38, RIGHT_ARROW: 39,
  DOWN_ARROW: 40, INSERT: 45, DELETE: 46, SHIFT: 16, CTRL: 17, ALT: 18,
};
for (let i = 0; i < 26; i++) KEYS[String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i < 10; i++) KEYS[String(i)] = 48 + i;

const splitNames = (args: unknown[]): string[] =>
  args
    .flatMap((a) => (Array.isArray(a) ? (a as unknown[]) : [a]))
    .flatMap((a) => String(a).split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '');

/** Entity mixing in component props by own-property copy, like Crafty's `extend`. */
export class CraftyEntity {
  [key: string]: unknown;
  readonly id: number;
  readonly __c: Record<string, boolean> = {};
  _x = 0;
  _y = 0;
  _w = 0;
  _h = 0;
  _z = 0;
  _rotation = 0;
  _alpha = 1;
  /** Recorded `onHit` registrations; `hitResults[type]` is what `hit(type)` returns. */
  readonly hitHandlers: { type: string; cb: unknown; cbOff: unknown }[] = [];
  hitResults: Record<string, unknown> = {};
  destroyed = false;
  private handlers: Record<string, Handler[]> = {};

  constructor(
    private readonly crafty: CraftyStub,
    id: number,
  ) {
    this.id = id;
    for (const k of ['crafty', 'handlers', 'hitHandlers', 'hitResults', 'destroyed'])
      Object.defineProperty(this, k, { enumerable: false });
  }

  get x(): number { return this._x; }
  set x(v: number) { this._x = v; }
  get y(): number { return this._y; }
  set y(v: number) { this._y = v; }
  get w(): number { return this._w; }
  set w(v: number) { this._w = v; }
  get h(): number { return this._h; }
  set h(v: number) { this._h = v; }
  get z(): number { return this._z; }
  set z(v: number) { this._z = v; }
  get rotation(): number { return this._rotation; }
  set rotation(v: number) { this._rotation = v; }
  get alpha(): number { return this._alpha; }
  set alpha(v: number) { this._alpha = v; }

  addComponent(...names: unknown[]): this {
    const added: string[] = [];
    for (const name of splitNames(names)) {
      if (this.__c[name]) continue;
      this.__c[name] = true;
      added.push(name);
      const def = this.crafty.components[name];
      if (!def) continue;
      for (const key of Object.keys(def)) this[key] = def[key];
      if (typeof def['init'] === 'function') (def['init'] as () => void).call(this);
    }
    this.trigger('NewComponent', added);
    return this;
  }

  /** Adds only components not already present (same effect as addComponent here). */
  requires(list: unknown): this {
    return this.addComponent(list);
  }

  has(name: string): boolean {
    return this.__c[name] === true;
  }

  removeComponent(name: string): this {
    const def = this.crafty.components[name];
    if (this.has(name) && def && typeof def['remove'] === 'function')
      (def['remove'] as () => void).call(this);
    // Mirrors Crafty's hard remove: the flag goes, mixed-in props stay.
    this.__c[name] = false;
    return this;
  }

  attr(key: string | Record<string, unknown>, value?: unknown): unknown {
    if (typeof key === 'string') {
      if (arguments.length === 1) return this[key];
      this[key] = value;
    } else {
      for (const k of Object.keys(key)) this[k] = key[k];
    }
    return this;
  }

  bind(event: string, fn: Handler): this {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }

  unbind(event: string, fn?: Handler): this {
    const list = this.handlers[event];
    if (list) this.handlers[event] = fn ? list.filter((h) => h !== fn) : [];
    return this;
  }

  trigger(event: string, data?: unknown): this {
    for (const fn of [...(this.handlers[event] ?? [])]) fn.call(this, data);
    return this;
  }

  onHit(type: string, cb: unknown, cbOff?: unknown): this {
    this.hitHandlers.push({ type, cb, cbOff });
    return this;
  }

  hit(type: string): unknown {
    return this.hitResults[type] ?? false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.trigger('Remove');
    for (const name of Object.keys(this.__c)) {
      const def = this.crafty.components[name];
      if (def && typeof def['remove'] === 'function') (def['remove'] as () => void).call(this);
    }
    this.destroyed = true;
    this.handlers = {};
    this.crafty.entities.delete(this.id);
  }
}

for (const name of NOOP_METHODS) {
  Object.defineProperty(CraftyEntity.prototype, name, {
    // writable so components that define the same method (e.g. stopOnSolids) can mix in own props
    writable: true,
    configurable: true,
    value(this: CraftyEntity, ...args: unknown[]) {
      const crafty = (this as unknown as { crafty: CraftyStub }).crafty;
      crafty.calls.push({ target: `entity#${String(this.id)}`, method: name, args });
      return this;
    },
  });
}

export interface CraftySelection {
  length: number;
  each: (fn: (this: CraftyEntity, index: number) => unknown) => CraftySelection;
  get: (index: number) => CraftyEntity | undefined;
  destroy: () => void;
}

export interface CraftyStub {
  (selector: string): CraftySelection;
  components: Record<string, ComponentDef>;
  entities: Map<number, CraftyEntity>;
  scenes: Record<string, () => void>;
  currentScene: string | null;
  calls: RecordedCall[];
  keys: Record<string, number>;
  viewport: { width: number; height: number };
  canvas: { context: object };
  audio: Record<'add' | 'play' | 'mute' | 'unmute', (...args: unknown[]) => unknown>;
  c: (name: string, def?: ComponentDef) => void;
  e: (names: string) => CraftyEntity;
  scene: (name: string, fn?: () => void) => void;
  pause: () => void;
  isPaused: () => boolean;
  init: (w: number, h: number) => void;
  background: (color: unknown) => void;
  sprite: (...args: unknown[]) => void;
  load: (...args: unknown[]) => void;
  stop: () => void;
  bind: (event: string, fn: Handler) => void;
  unbind: (event: string, fn?: Handler) => void;
  trigger: (event: string, data?: unknown) => void;
}

export function createCraftyStub(clock: FakeClock): CraftyStub {
  let nextId = 1;
  let paused = false;
  const globalHandlers: Record<string, Handler[]> = {};
  const noThis = {} as CraftyEntity;

  const select = (selector: string): CraftySelection => {
    const wanted = splitNames([selector]);
    const all = wanted.includes('obj');
    const matches = [...crafty.entities.values()].filter(
      (e) => all || wanted.every((n) => e.has(n)),
    );
    const sel: CraftySelection = {
      length: matches.length,
      each: (fn) => {
        matches.forEach((e, i) => fn.call(e, i));
        return sel;
      },
      get: (i) => matches[i],
      destroy: () => { matches.forEach((e) => { e.destroy(); }); },
    };
    return sel;
  };

  const record = (method: string, args: unknown[]): void => {
    crafty.calls.push({ target: 'Crafty', method, args });
  };
  const audioMethod = (method: string) => (...args: unknown[]) => {
    crafty.calls.push({ target: 'audio', method, args });
    return undefined;
  };

  const crafty = Object.assign(select, {
    components: {},
    entities: new Map<number, CraftyEntity>(),
    scenes: {},
    currentScene: null as string | null,
    calls: [] as RecordedCall[],
    keys: { ...KEYS },
    viewport: { width: 0, height: 0 },
    canvas: { context: {} },
    audio: {
      add: audioMethod('add'),
      play: audioMethod('play'),
      mute: audioMethod('mute'),
      unmute: audioMethod('unmute'),
    },
    c(name: string, def?: ComponentDef): void {
      // The legacy source has one malformed call, Crafty.c('...'), {...}: registers nothing useful.
      crafty.components[name] = def ?? {};
    },
    e(names: string): CraftyEntity {
      const entity = new CraftyEntity(crafty, nextId++);
      crafty.entities.set(entity.id, entity);
      entity.addComponent(names);
      return entity;
    },
    scene(name: string, fn?: () => void): void {
      if (fn) {
        crafty.scenes[name] = fn;
        return;
      }
      crafty.currentScene = name;
      record('scene', [name]);
      crafty.scenes[name]?.();
    },
    pause(): void {
      paused = !paused;
      crafty.trigger(paused ? 'Pause' : 'Unpause');
    },
    isPaused: () => paused,
    init(w: number, h: number): void {
      crafty.viewport.width = w;
      crafty.viewport.height = h;
      record('init', [w, h]);
    },
    background: (color: unknown) => { record('background', [color]); },
    sprite: (...args: unknown[]) => { record('sprite', args); },
    load: (...args: unknown[]) => { record('load', args); },
    stop: () => { record('stop', []); },
    bind(event: string, fn: Handler): void {
      (globalHandlers[event] ??= []).push(fn);
    },
    unbind(event: string, fn?: Handler): void {
      globalHandlers[event] = fn ? (globalHandlers[event] ?? []).filter((h) => h !== fn) : [];
    },
    trigger(event: string, data?: unknown): void {
      for (const fn of [...(globalHandlers[event] ?? [])]) fn.call(noThis, data);
      for (const e of [...crafty.entities.values()]) if (!e.destroyed) e.trigger(event, data);
    },
  }) as CraftyStub;

  // Crafty's Delay (crafty.js ~11519): polled on EnterFrame, shifted by time spent paused.
  crafty.components['Delay'] = {
    init(this: CraftyEntity) {
      const items: DelayItem[] = [];
      this['_delays'] = items;
      this.bind('EnterFrame', function (this: CraftyEntity) {
        const now = clock.now;
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (!item || item.start + item.delay + item.pause >= now) continue;
          item.func.call(this);
          if (item.repeat > 0) {
            item.start = now;
            item.pause = 0;
            item.pauseBuffer = 0;
            item.repeat--;
          } else {
            items.splice(i, 1);
          }
        }
      });
      this.bind('Pause', () => {
        for (const item of items) item.pauseBuffer = clock.now;
      });
      this.bind('Unpause', () => {
        for (const item of items) item.pause += clock.now - item.pauseBuffer;
      });
    },
    delay(this: CraftyEntity, func: (this: CraftyEntity) => void, delay: number, repeat?: number) {
      (this['_delays'] as DelayItem[]).push({
        start: clock.now, delay, func, repeat: repeat ?? 0, pause: 0, pauseBuffer: 0,
      });
      return this;
    },
  };

  // EnterFrame is not delivered while paused.
  clock.onFrame(() => {
    if (!paused) crafty.trigger('EnterFrame');
  });
  return crafty;
}

interface DelayItem {
  start: number;
  delay: number;
  func: (this: CraftyEntity) => void;
  repeat: number;
  pause: number;
  pauseBuffer: number;
}
