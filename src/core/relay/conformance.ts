/**
 * Wire-spec conformance suite for docs/ONLINE-PROTOCOL.md, exported as `@tamingtheelements/relay/conformance`.
 * Framework-agnostic: plain case objects that throw on failure, and a tiny runner. A backend points it at a deployed or local
 * relay through its own WebSocket glue (a `ConformanceAdapter`). No timers, clocks or test-framework imports: waiting goes
 * through `hooks.sleep`, which a remote adapter should supply (default: yield only, enough for an in-process relay).
 */
import { conformanceCases } from './conformance-cases';
import {
  ConformanceSkip,
  type CaseResult,
  type ConformanceAdapter,
  type ConformanceCase,
  type ConformanceHooks,
  type ConformanceReport,
} from './conformance-kit';

export * from './conformance-kit';
export { conformanceCases };

export interface RunOptions {
  /** Run only cases whose id starts with one of these prefixes. */
  readonly only?: readonly string[];
  readonly cases?: readonly ConformanceCase[];
  /**
   * Extra attempts for a failing case marked `orderSensitive` (default 0: none). A case that passes on a retry is reported as a pass with
   * a message saying so, so a flaky deployment stays visible. Failures of other cases are never retried.
   */
  readonly retryOrderSensitive?: number;
}

/** Runs the cases one after another (they share the relay, so never in parallel). Never throws; a failure is in the report. */
export async function runAll(
  adapter: ConformanceAdapter,
  hooks: ConformanceHooks = {},
  options: RunOptions = {},
): Promise<ConformanceReport> {
  const results: CaseResult[] = [];
  for (const c of options.cases ?? conformanceCases) {
    if (options.only !== undefined && !options.only.some((p) => c.id.startsWith(p))) continue;
    const extra = c.orderSensitive === true ? Math.max(0, options.retryOrderSensitive ?? 0) : 0;
    try {
      let attempt = 0;
      for (;;) {
        try {
          await c.run(adapter, hooks);
          break;
        } catch (e) {
          if (e instanceof ConformanceSkip || attempt >= extra) throw e;
          attempt++;
        }
      }
      results.push(attempt === 0 ? { id: c.id, spec: c.spec, status: 'pass' } : { id: c.id, spec: c.spec, status: 'pass', message: `passed on attempt ${String(attempt + 1)} (order-sensitive)` });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({
        id: c.id,
        spec: c.spec,
        status: e instanceof ConformanceSkip ? 'skip' : 'fail',
        message,
      });
    }
  }
  const n = (s: CaseResult['status']): number => results.filter((r) => r.status === s).length;
  return {
    ok: n('fail') === 0,
    passed: n('pass'),
    failed: n('fail'),
    skipped: n('skip'),
    results,
  };
}
export const runConformance = runAll;
