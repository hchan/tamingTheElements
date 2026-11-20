// pnpm relay:conformance [--json] [--timeout-ms 5000] [--settle-ms 500] [--only <group[,group]>] [--strict-text] [--advisory-close] [--no-binary]
// Runs the @tamingtheelements/relay conformance suite against the base URL in TTE_RELAY_URL (https, no path, no trailing slash).
// Exit: 0 ok, 1 a case failed, 2 bad config, 3 never connected. The logic lives in src/testing/net/ws-int/conformance-ws-adapter.ts.
import { runConformanceCli } from '../../src/testing/net/ws-int/conformance-ws-adapter';

const code = await runConformanceCli(
  process.argv.slice(2),
  process.env,
  { out: (l) => { process.stdout.write(`${l}\n`); }, err: (l) => { process.stderr.write(`${l}\n`); } },
);
process.exitCode = code;
