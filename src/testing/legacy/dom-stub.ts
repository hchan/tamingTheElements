import type { FakeClock } from './fake-clock';

type Callback = () => void;

/** In-memory Web Storage. */
export class MemoryStorage {
  readonly data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: unknown): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

/** A 2d context whose every method is a no-op. */
function createContext2d(): object {
  return new Proxy(
    {},
    {
      get: (_t, prop) => (prop === 'then' || typeof prop === 'symbol' ? undefined : () => undefined),
    },
  );
}

export class StubImage {
  src = '';
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
}

export interface StubElement {
  tagName: string;
  width: number;
  height: number;
  style: Record<string, string>;
  getContext: (kind: string) => object;
  appendChild: (child: unknown) => unknown;
}

export interface StubWindow {
  innerWidth: number;
  innerHeight: number;
  location: { hash: string; href: string; reload: (force?: boolean) => void };
  onhashchange: (() => void) | null;
  setTimeout: (fn: Callback, ms?: number) => number;
  setInterval: (fn: Callback, ms: number) => number;
  clearTimeout: (id?: number) => void;
  clearInterval: (id?: number) => void;
}

export interface StubDocument {
  createElement: (tag: string) => StubElement;
  getElementById: (id: string) => StubElement | null;
  onkeydown: ((e: unknown) => void) | null;
  body: StubElement;
}

export interface DomStub {
  window: StubWindow;
  document: StubDocument;
  localStorage: MemoryStorage;
  Image: typeof StubImage;
}

export function createDomStub(clock: FakeClock): DomStub {
  const createElement = (tag: string): StubElement => ({
    tagName: tag.toUpperCase(),
    width: 300,
    height: 150,
    style: {},
    getContext: () => createContext2d(),
    appendChild: (child) => child,
  });
  const window: StubWindow = {
    innerWidth: 1300,
    innerHeight: 740,
    location: { hash: '', href: '', reload: () => undefined },
    onhashchange: null,
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    setInterval: (fn, ms) => clock.setInterval(fn, ms),
    clearTimeout: (id) => {
      clock.clear(id);
    },
    clearInterval: (id) => {
      clock.clear(id);
    },
  };
  const document: StubDocument = {
    createElement,
    getElementById: () => null,
    onkeydown: null,
    body: createElement('body'),
  };
  return { window, document, localStorage: new MemoryStorage(), Image: StubImage };
}
