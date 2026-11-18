// Blank-page frame check for the Windows GPU PC (WSL Ubuntu). Run from the repo root by remote-run.sh before browser commands.
// Launches Chromium like playwright.config.ts does, counts requestAnimationFrame callbacks in 1 s on a blank page and takes a
// screenshot; exits 0 when frames >= MIN_FRAMES (default 10) and the screenshot completes, 96 on a stall.
// Background: see ideas/brainstorm/pc-e2e-failure-triage.md and docs/TESTING.md ("The GPU PC").
const { chromium } = require('@playwright/test');

const MIN = Number(process.env.MIN_FRAMES || 10);
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// Same flags as playwright.config.ts launchOptions; TTE_EXTRA_ARGS (space separated) adds more for experiments.
if (process.env.TTE_EXTRA_ARGS) args.push(...process.env.TTE_EXTRA_ARGS.split(' '));

(async () => {
  const browser = await chromium.launch({ args });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>frame check</p>');
    const frames = await page.evaluate(
      () => new Promise((done) => {
        let n = 0;
        const tick = () => { n++; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        setTimeout(() => done(n), 1000);
      }),
    );
    let shot = true;
    try { await page.screenshot({ timeout: 5000 }); } catch { shot = false; }
    console.log(`pc-frame-check: ${frames} frames in 1 s, screenshot ${shot ? 'ok' : 'TIMED OUT'}`);
    process.exitCode = frames >= MIN && shot ? 0 : 96;
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(`pc-frame-check: ${e.message}`); process.exit(96); });
