// Local online-play measurement (`pnpm online:measure`): two lockstep sessions over WebSocketTransport, RelayCore, InMemoryStore and a
// loopback sender on a virtual clock. Numbers are labelled 'measurement (local harness, virtual clock)'; see docs/ONLINE-MEASURE.md.
// pnpm online:measure [--ticks 3000] [--batch-every 1] [--profile ideal|typical|bad] [--latency ms] [--jitter ms] [--dup pct]
//   [--reorder pct] [--loss pct] [--delay 2] [--rollback 6] [--seed 11] [--json]
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { formatReport, measureMatch, PROFILES, type LinkProfile } from '../src/testing/net/online-measure';

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        ticks: { type: 'string', default: '3000' },
        'batch-every': { type: 'string', default: '1' },
        profile: { type: 'string', default: 'typical' },
        latency: { type: 'string' },
        jitter: { type: 'string' },
        dup: { type: 'string' },
        reorder: { type: 'string' },
        loss: { type: 'string' },
        delay: { type: 'string' },
        rollback: { type: 'string', default: '6' },
        seed: { type: 'string', default: '11' },
        json: { type: 'boolean', default: false },
      },
    });
    const num = (k: keyof typeof values, fallback?: number): number => {
      const raw = values[k];
      if (raw === undefined && fallback !== undefined) return fallback;
      const v = Number(raw);
      if (typeof raw !== 'string' || !Number.isFinite(v) || v < 0) throw new Error(`bad --${k}`);
      return v;
    };
    const base = PROFILES[values.profile];
    if (base === undefined) throw new Error(`unknown --profile ${values.profile} (${Object.keys(PROFILES).join(', ')})`);
    const profile: LinkProfile = {
      latencyMs: num('latency', base.latencyMs),
      jitterMs: num('jitter', base.jitterMs),
      dupPct: num('dup', base.dupPct),
      reorderPct: num('reorder', base.reorderPct),
      lossPct: num('loss', base.lossPct),
    };
    const report = await measureMatch({
      ticks: num('ticks'),
      batchEvery: num('batch-every'),
      rollbackWindow: num('rollback'),
      netSeed: num('seed'),
      profile,
      ...(values.delay === undefined ? {} : { inputDelay: num('delay') }),
    });
    console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
    return report.finalHashEqual ? 0 : 1;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
