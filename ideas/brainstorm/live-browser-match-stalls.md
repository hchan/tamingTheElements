---
status: idea
added: 2026-11-26
---

# Live browser match stalls (found 2026-11-26)

`pnpm online:live-browser` (two headless pages, one Chromium, real relay) now fails: the 300-tick match (6 s nominal) takes about 58 s
(measurement, one run) and ends with "Connection lost. The match ended with no winner", and the two end lines do not mirror.

- Not caused by MP-smooth: the same run on the commit before the smoothing and before the catch-up (6a91bf66^1) took about 100 s and ended the same way (measurement, one run each).
- The scripted `online:live-match` (no browser) passes on the same relay: 20 of 20 batches each way, no gaps, median RTT about 160 ms (measurement).
- The relay MATCH frame sets input delay 4 (80 ms), not the harness default 2.
- Probe fix made here: the probe waited for `#quickLink` to be visible, but the layout fix hides it during play; it now waits for it to be attached.
- Next: find out whether the stall is two pages in one Chromium (timer or rAF throttling for the second context) or the relay; try two separate browsers, and log `session.status` per second.

## Update 2026-11-26 (later)
- With the probe fixed, current main passed 2 of 4 live browser runs (measurement; the failures ended "Connection lost").
- Passing runs took 22 to 32 s for a 6 s match, with receive gaps up to 3 s, and each page sent only about 6 to 8 frames/s (measurements). A full-speed page would send about 17/s (estimate).
- The Mac load average was 51 on 14 cores (measurement) while these ran, so the two software-rendered pages were probably starved. Treat these runs as rig noise until repeated on a quiet machine or the PC.

## Real-renderer jump sampler (2026-11-26)
`online:live-browser` now samples, per animation frame, each character's raw sim x and drawn x (`__TTE__.arena.drawnXs`) and prints snaps over 30 px (estimate) raw against drawn. On the busy Mac each page rendered only about 65 frames in 30 to 90 s, about 1 to 2 fps (measurement), so one frame spans dozens of ticks and the counts are meaningless. Run it on the PC or a quiet machine before trusting it; the simulated version in `src/testing/net/view-jump.test.ts` is the number to use today.
