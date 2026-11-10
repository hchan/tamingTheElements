import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { createCraftyStub, type CraftyStub } from './crafty-stub';
import { createDomStub, type DomStub } from './dom-stub';
import { FakeClock } from './fake-clock';
import { createJQueryStub, type JQueryConfig, type JQueryStub } from './jquery-stub';
import { ORACLE_PRIVATE } from './oracle';
import { createSeededRandom } from './seeded-random';

const PRIVATE_DIR = ORACLE_PRIVATE;

/** Legacy modules exposed to tests (read from the context, so var/implicit globals both work). */
export const GLOBAL_NAMES = [
  'Global', 'Settings', 'GamePersist', 'Garrison', 'GameHelper', 'Game', 'Swap', 'Input',
  'GameMaster', 'Main',
] as const;

export type LegacyGlobals = Record<(typeof GLOBAL_NAMES)[number], Record<string, unknown>>;

export interface LoadOptions {
  seed?: number;
  jquery?: JQueryConfig;
}

export interface LegacyEnv {
  ctx: vm.Context;
  clock: FakeClock;
  globals: LegacyGlobals;
  crafty: CraftyStub;
  jquery: JQueryStub;
  dom: DomStub;
  logs: unknown[][];
  /** Evaluate an expression in the legacy context. */
  run: (code: string) => unknown;
}

/** Script paths from index.html in order; jquery, crafty and SpriteColor are stubbed instead. */
export function legacyScriptPaths(): string[] {
  const html = readFileSync(resolve(PRIVATE_DIR, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"/g)]
    .map((m) => m[1] as string)
    .filter((p) => p.startsWith('src/'));
}

export function loadLegacy(options: LoadOptions = {}): LegacyEnv {
  const clock = new FakeClock();
  const crafty = createCraftyStub(clock);
  const jquery = createJQueryStub(options.jquery);
  const dom = createDomStub(clock);
  const random = createSeededRandom(options.seed ?? 1);
  const logs: unknown[][] = [];

  const seededMath: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(Math)) {
    seededMath[name] = (Math as unknown as Record<string, unknown>)[name];
  }
  seededMath['random'] = random;

  class FakeDate extends Date {
    constructor(...args: unknown[]) {
      super(...((args.length === 0 ? [clock.now] : args) as [number]));
    }
    static override now(): number {
      return clock.now;
    }
  }

  const record = (...args: unknown[]): void => {
    logs.push(args);
  };
  const sandbox: Record<string, unknown> = {
    Crafty: crafty,
    $: jquery,
    jQuery: jquery,
    window: dom.window,
    document: dom.document,
    localStorage: dom.localStorage,
    Image: dom.Image,
    Math: seededMath,
    Date: FakeDate,
    console: { log: record, info: record, warn: record, error: record, debug: record },
    setTimeout: dom.window.setTimeout,
    setInterval: dom.window.setInterval,
    clearTimeout: dom.window.clearTimeout,
    clearInterval: dom.window.clearInterval,
  };
  const ctx = vm.createContext(sandbox);

  for (const rel of legacyScriptPaths()) {
    const filename = resolve(PRIVATE_DIR, rel);
    vm.runInContext(readFileSync(filename, 'utf8'), ctx, { filename });
  }

  const run = (code: string): unknown => vm.runInContext(code, ctx);
  const globals = run(`({ ${GLOBAL_NAMES.join(', ')} })`) as LegacyGlobals;
  return { ctx, clock, globals, crafty, jquery, dom, logs, run };
}
