export type Fn = (...args: unknown[]) => unknown;

export interface JQueryCall {
  selector: unknown;
  method: string;
  args: unknown[];
}

export interface JQueryConfig {
  /** `.val()` result per selector string (Settings tests use strings, as jQuery does). */
  vals?: Record<string, unknown>;
  /** Elements iterated by `.each` per selector string. */
  elements?: Record<string, unknown[]>;
}

export interface JQueryStub {
  (selector?: unknown): unknown;
  calls: JQueryCall[];
  vals: Record<string, unknown>;
  elements: Record<string, unknown[]>;
  each: (obj: unknown, fn: Fn) => unknown;
  grep: (arr: unknown[], fn: Fn, invert?: boolean) => unknown[];
  extend: (...args: unknown[]) => unknown;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  Object.prototype.toString.call(v) === '[object Object]';

function extend(...all: unknown[]): unknown {
  let deep = false;
  let args = all;
  if (typeof args[0] === 'boolean') {
    deep = args[0];
    args = args.slice(1);
  }
  const target = args[0] as Record<string, unknown>;
  for (const src of args.slice(1)) {
    if (src === null || src === undefined) continue;
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
      if (value === undefined || value === target) continue;
      if (deep && (isPlain(value) || Array.isArray(value))) {
        const existing = target[key];
        let base: unknown = Array.isArray(value) ? [] : {};
        if (Array.isArray(value) ? Array.isArray(existing) : isPlain(existing)) base = existing;
        target[key] = extend(true, base, value);
      } else {
        target[key] = value;
      }
    }
  }
  return target;
}

function each(obj: unknown, fn: Fn): unknown {
  const entries: [string | number, unknown][] = Array.isArray(obj)
    ? obj.map((v: unknown, i) => [i, v])
    : Object.entries(obj as Record<string, unknown>);
  for (const [key, value] of entries) if (fn.call(value, key, value) === false) break;
  return obj;
}

/** Chainable no-op jQuery: any method returns the chain, calls are recorded. */
export function createJQueryStub(config: JQueryConfig = {}): JQueryStub {
  const calls: JQueryCall[] = [];
  const vals = config.vals ?? {};
  const elements = config.elements ?? {};

  const makeChain = (selector: unknown): unknown => {
    const key = typeof selector === 'string' ? selector : undefined;
    const chain: unknown = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        if (prop === 'length') return key !== undefined ? (elements[key]?.length ?? 0) : 0;
        return (...args: unknown[]) => {
          calls.push({ selector, method: prop, args });
          if (prop === 'val' && args.length === 0) {
            if (key !== undefined) return vals[key];
            return isPlain(selector) ? selector['val'] : undefined;
          }
          if (prop === 'each' && key !== undefined) {
            (elements[key] ?? []).forEach((el, i) => (args[0] as Fn).call(el, i, el));
          }
          return chain;
        };
      },
    });
    return chain;
  };

  const $ = ((selector?: unknown) => makeChain(selector)) as JQueryStub;
  $.calls = calls;
  $.vals = vals;
  $.elements = elements;
  $.each = each;
  $.grep = (arr, fn, invert = false) => arr.filter((v, i) => Boolean(fn(v, i)) !== invert);
  $.extend = extend;
  return $;
}
