/**
 * Dev/test-only live FPS and frame-time readout (`?ff=fps`). Installed from `installTestHook`, so the whole module is dead
 * code in production builds. It reads requestAnimationFrame deltas only; it never touches the sim.
 */
const WINDOW = 120;

export function wantsFpsOverlay(search: string): boolean {
  const on = (new URLSearchParams(search).get('ff') ?? '').split(',').map((s) => s.trim());
  return on.includes('fps') || on.includes('showFps');
}

export function installFpsOverlay(): () => void {
  const box = document.createElement('div');
  box.id = 'fpsOverlay';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;top:4px;right:4px;z-index:99999;padding:2px 6px;font:12px/1.3 monospace;color:#0f0;' +
    'background:rgba(0,0,0,0.7);pointer-events:none;white-space:pre';
  document.body.append(box);
  const deltas: number[] = [];
  let last = 0;
  let raf = 0;
  const tick = (now: number): void => {
    if (last > 0) {
      deltas.push(now - last);
      if (deltas.length > WINDOW) deltas.shift();
      if (deltas.length % 10 === 0) {
        const sum = deltas.reduce((a, b) => a + b, 0);
        const worst = Math.max(...deltas);
        box.textContent = `${(1000 / (sum / deltas.length)).toFixed(0)} fps\n${(sum / deltas.length).toFixed(1)} ms avg\n${worst.toFixed(1)} ms worst`;
      }
    }
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    box.remove();
  };
}
