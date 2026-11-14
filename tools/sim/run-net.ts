// Headless networked match (`pnpm sim:net`): two random bots play through the in-memory FakeNetwork with lockstep.
// pnpm sim:net [--ticks 3000] [--seed 24301] [--latency 3] [--jitter 2] [--loss 0.1] [--dup 0] [--reorder 0] [--delay 2] [--no-adaptive] [--json]
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import type { MatchSetup } from '../../src/core/sim/match';
import { SIM_VERSION } from '../../src/core/version';
import { botScripts, runNetMatch } from '../../src/testing/net/net-match';


export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        ticks: { type: 'string', default: '3000' },
        seed: { type: 'string', default: '24301' },
        latency: { type: 'string', default: '3' },
        jitter: { type: 'string', default: '2' },
        loss: { type: 'string', default: '0.1' },
        dup: { type: 'string', default: '0' },
        reorder: { type: 'string', default: '0' },
        delay: { type: 'string', default: '2' },
        rollback: { type: 'string', default: '0' },
        'no-adaptive': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
    });
    const num = (k: keyof typeof values): number => {
      const v = Number(values[k]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`bad --${k}`);
      return v;
    };
    const ticks = num('ticks');
    const setup: MatchSetup = {
      simVersion: SIM_VERSION,
      seed: num('seed'),
      flags: DEFAULT_SIM_FLAGS,
      chapter: 1,
      difficulty: 1,
      p1: [{ character: characterId('lavax'), xp: 20 }],
      p2: [{ character: characterId('pax'), xp: 20 }],
    };
    const r = runNetMatch({
      setup,
      script: botScripts(setup, ticks + 200),
      tickLimit: ticks,
      netSeed: num('seed'),
      conditions: {
        latency: num('latency'),
        jitter: num('jitter'),
        loss: num('loss'),
        duplicate: num('dup'),
        reorder: num('reorder'),
        reorderDelay: Math.max(2, num('jitter') * 2),
      },
      session: { inputDelay: num('delay'), adaptive: !values['no-adaptive'], rollbackWindow: num('rollback') },
    });
    const [a, b] = r.sessions;
    const out = {
      status: [a.status, b.status],
      winner: a.winner,
      simTicks: a.simTick,
      wallTicks: r.wall,
      hashesEqual: r.hashes[0] === r.hashes[1],
      finalHash: r.hashes[0],
      desync: a.desync ?? b.desync ?? null,
      inputDelay: [a.inputDelay, b.inputDelay],
      network: { sent: r.net.sent, dropped: r.net.dropped, delivered: r.net.delivered },
      stalls: [a.stats.stalls, b.stats.stalls],
      maxStallRun: Math.max(a.stats.maxStallRun, b.stats.maxStallRun),
      resentInputs: [a.stats.resentInputs, b.stats.resentInputs],
      maxLagTicks: Math.max(a.stats.maxLagTicks, b.stats.maxLagTicks),
      rollbacks: [a.stats.rollbacks, b.stats.rollbacks],
      resimTicks: [a.stats.resimTicks, b.stats.resimTicks],
      maxRollbackDepth: Math.max(a.stats.maxRollbackDepth, b.stats.maxRollbackDepth),
    };
    if (values.json) console.log(JSON.stringify(out, null, 2));
    else for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(13)} ${JSON.stringify(v)}`);
    return out.hashesEqual && out.desync === null ? 0 : 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('usage: pnpm sim:net [--ticks N] [--seed S] [--latency T] [--jitter T] [--loss P] [--dup P] [--reorder P] [--delay D] [--rollback W] [--no-adaptive] [--json]');
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
