---
status: idea
added: 2026-11-18
---

# Alternative: browser on the PC, runner on the Mac

Instead of running the whole e2e suite on the GPU PC (see [e2e-on-pc](../in-progress/e2e-on-pc.md)), run only the browser there. The test
runner and the dev server stay on the Mac; Playwright connects to a browser started with `launchServer` (or the remote protocol) on the PC,
over an ssh tunnel.

## Pros

- No repo snapshot or sync: the Mac worktree is the source of truth, nothing to ship.
- Smaller PC setup: browsers and a launch script, no checkout or toolchain.
- Rendering still uses the PC GPU.

## Cons

- Latency: every Playwright command and every page request crosses the tunnel, so a suite of many small steps gets slower.
- Flakiness: a dropped tunnel or sleeping laptop kills a run mid-test; timeouts tuned for local runs no longer hold.
- The Mac still runs the test runner and the dev server, so most of the CPU, battery and fan load the idea was meant to remove stays.
- The browser must reach the Mac's dev server back through the tunnel, adding a second path to keep alive; the `__TTE__.settled()`
  teardown waits and timing-sensitive specs get less deterministic.
- Browser and Playwright versions must match exactly between the two machines.

## Why the whole-suite-on-PC design won

One snapshot copy plus one job is simpler and more reliable than thousands of round trips. Runs finish on the PC at local speed, are
independent of the Mac staying awake, and can use several workers. Only a result summary crosses the wire.

Revisit if snapshots become too slow or large, or for one-off interactive debugging where a remote browser is handy.
