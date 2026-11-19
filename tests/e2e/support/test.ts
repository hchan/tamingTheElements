import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { appSnapshot } from './wait';

/** Max time failure capture may take; it can never fail or hang a test. */
const CAPTURE_MS = 2_000;

export interface ConsoleLog {
  readonly name: string;
  /** Lines recorded so far. */
  readonly lines: string[];
}

/** Extra logs registered by specs with more than one page (online specs); drained by the fixture teardown. */
const extraLogs = new WeakMap<TestInfo, ConsoleLog[]>();

/** Records console messages and page errors of `page` (and pages it opens) into `log`. Never throws. */
export function recordConsole(page: Page, log: ConsoleLog): void {
  try {
    const hook = (p: Page): void => {
      p.on('console', (m) => {
        try {
          const loc = m.location();
          log.lines.push(`[console.${m.type()}] ${m.text()}${loc.url ? ` (${loc.url}:${String(loc.lineNumber)})` : ''}`);
        } catch {
          /* ignore */
        }
      });
      p.on('pageerror', (e) => {
        try {
          log.lines.push(`[pageerror] ${e.stack ?? e.message}`);
        } catch {
          /* ignore */
        }
      });
    };
    hook(page);
    page.context().on('page', hook);
  } catch {
    /* ignore */
  }
}

/** Attaches the logs (and tte-state.json for `page`, if given) to the test. Bounded by CAPTURE_MS, never throws. */
export async function attachFailureCapture(testInfo: TestInfo, logs: readonly ConsoleLog[], page?: Page): Promise<void> {
  const work = (async (): Promise<void> => {
    for (const log of logs) {
      const body = log.lines.length > 0 ? log.lines.join('\n') : '(no console output recorded)';
      await testInfo.attach(log.name, { body, contentType: 'text/plain' });
    }
    if (page && !page.isClosed()) {
      await testInfo.attach('tte-state.json', { body: await appSnapshot(page, CAPTURE_MS - 500), contentType: 'application/json' });
    }
  })().catch(() => undefined);
  const guard = new Promise<void>((resolve) => {
    setTimeout(resolve, CAPTURE_MS).unref();
  });
  await Promise.race([work, guard]);
}

/**
 * Playwright `test` with an auto fixture: records console and page errors, and on failure attaches console.txt and tte-state.json
 * so a timed-out test shows what the page said. Passing tests are untouched. Specs with extra pages call `captureConsole`.
 */
export const test = base.extend<{ failureCapture: undefined }>({
  failureCapture: [
    async ({ page }, use, testInfo) => {
      const log: ConsoleLog = { name: 'console.txt', lines: [] };
      recordConsole(page, log);
      await use(undefined);
      if (testInfo.status !== testInfo.expectedStatus) {
        await attachFailureCapture(testInfo, [log, ...(extraLogs.get(testInfo) ?? [])], page);
      }
    },
    { auto: true },
  ],
});

/** For a page of a second context (online specs): its console goes into `console-<name>.txt` if the test fails. */
export function captureConsole(page: Page, testInfo: TestInfo, name: string): void {
  const log: ConsoleLog = { name: `console-${name}.txt`, lines: [] };
  recordConsole(page, log);
  extraLogs.set(testInfo, [...(extraLogs.get(testInfo) ?? []), log]);
}

export { expect };
